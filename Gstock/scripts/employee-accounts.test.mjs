import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
let model
let passwords
let EmployeeAccounts

before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  model = await server.ssrLoadModule('/src/data/employeeAccounts.ts')
  passwords = await server.ssrLoadModule('/src/data/employeePasswords.ts')
  EmployeeAccounts = (await server.ssrLoadModule('/src/components/EmployeeAccounts.tsx')).default
})
after(async () => { await server?.close() })
afterEach(() => { delete globalThis.window })

function scenario() {
  const accounts = model.loadEmployeeAccounts()
  const manager = accounts.find(({ profile }) => model.isManager(profile)).profile
  const employee = accounts.find(({ profile }) => !model.isManager(profile)).profile
  return { accounts, manager, employee }
}

test('all existing employee accounts can edit other accounts under the temporary policy', async () => {
  const { accounts, manager, employee } = scenario()
  const original = JSON.stringify(accounts)
  const result = await model.updateEmployeeAccount(accounts, employee.id, manager.id, { ...manager, fullName: 'Changed name' })
  assert.equal(result.ok, true)
  assert.equal(result.accounts.find(({ profile }) => profile.id === manager.id).editHistory[0].editedBy.id, employee.id)
  assert.equal(JSON.stringify(accounts), original)
  assert.equal((await model.updateEmployeeAccount(accounts, 'unknown-editor', employee.id, { ...employee, fullName: 'Changed name' })).ok, false)
})

test('edits record the current editor and exact changes without mutating previous data', async () => {
  const { accounts, manager, employee } = scenario()
  const original = JSON.stringify(accounts)
  const result = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, department: '  Dispatch  ', password: 'NEVER-PERSIST' })
  assert.equal(result.ok, true)
  const updated = result.accounts.find(({ profile }) => profile.id === employee.id)
  assert.equal(updated.profile.department, 'Dispatch')
  assert.equal(updated.editHistory.length, 1)
  assert.equal(updated.editHistory[0].editedBy.id, manager.id)
  assert.equal(updated.editHistory[0].editedBy.fullName, manager.fullName)
  assert.ok(Number.isFinite(Date.parse(updated.editHistory[0].editedAt)))
  assert.deepEqual(updated.editHistory[0].changes, [{ field: 'department', before: employee.department, after: 'Dispatch' }])
  assert.equal(JSON.stringify(accounts), original)
  assert.ok(!JSON.stringify(result.accounts).includes('NEVER-PERSIST'))
  assert.ok(!('password' in updated.profile))
})

test('required fields, malformed emails, duplicates, unknown accounts, and unchanged saves are rejected', async () => {
  const { accounts, manager, employee } = scenario()
  const update = (draft, id = employee.id) => model.updateEmployeeAccount(accounts, manager.id, id, draft)
  assert.match((await update({ ...employee, fullName: ' ' })).error, /required/)
  assert.match((await update({ ...employee, email: 'invalid-email' })).error, /valid email/)
  assert.match((await update({ ...employee, email: manager.email.toUpperCase() })).error, /already used/)
  assert.match((await update({ ...employee, employeeId: manager.employeeId.toLowerCase() })).error, /already used/)
  assert.match((await update({ ...employee, fullName: 'x'.repeat(101) })).error, /too long/)
  assert.match((await update(employee, 'missing-account')).error, /could not be found/)
  assert.match((await update(employee)).error, /No changes/)
})

test('role changes retain the original audit identity and all roles can still edit', async () => {
  const { accounts, manager, employee } = scenario()
  const demotion = await model.updateEmployeeAccount(accounts, manager.id, manager.id, { ...manager, role: 'Coordinator' })
  assert.equal(demotion.ok, true)
  const changedManager = demotion.accounts.find(({ profile }) => profile.id === manager.id)
  assert.equal(model.isManager(changedManager.profile), false)
  assert.equal(changedManager.editHistory[0].editedBy.role, 'Manager')
  assert.equal((await model.updateEmployeeAccount(demotion.accounts, manager.id, employee.id, { ...employee, department: 'Sales' })).ok, true)
})

test('edit history appends, survives a reload, and keeps prior editor names after a rename', async () => {
  const { accounts, manager, employee } = scenario()
  const first = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, role: 'Stock lead' })
  const second = await model.updateEmployeeAccount(first.accounts, manager.id, manager.id, { ...manager, fullName: 'Renamed Manager' })
  const third = await model.updateEmployeeAccount(second.accounts, manager.id, employee.id, { ...employee, role: 'Stock lead', department: 'Dispatch' })
  const json = JSON.stringify(third.accounts)
  globalThis.window = { localStorage: { getItem: () => json } }
  const restored = model.loadEmployeeAccounts()
  const history = restored.find(({ profile }) => profile.id === employee.id).editHistory
  assert.equal(history.length, 2)
  assert.equal(history[0].editedBy.fullName, manager.fullName)
  assert.equal(history[1].editedBy.fullName, 'Renamed Manager')
  assert.equal(restored.find(({ profile }) => profile.id === manager.id).profile.fullName, 'Renamed Manager')
})

test('invalid or unavailable browser storage falls back to sample accounts', () => {
  const samples = model.loadEmployeeAccounts()
  for (const invalid of ['{broken', '[]', '[{"profile":{}}]', JSON.stringify([samples[0], samples[0]])]) {
    globalThis.window = { localStorage: { getItem: () => invalid } }
    assert.deepEqual(model.loadEmployeeAccounts(), samples)
  }
  globalThis.window = { localStorage: { getItem: () => { throw new Error('Unavailable') } } }
  assert.deepEqual(model.loadEmployeeAccounts(), samples)
})

test('account links open employee cards, every role sees Edit, and audit details remain visible', async () => {
  const { accounts, manager, employee } = scenario()
  const render = (props) => renderToStaticMarkup(React.createElement(EmployeeAccounts, { accounts, viewer: employee, onSave: async () => null, ...props }))
  const list = render({})
  assert.ok(list.includes('Employee accounts'))
  for (const { profile } of accounts) assert.ok(list.includes(`#employees/${encodeURIComponent(profile.id)}`))
  const detail = render({ selectedId: employee.id })
  assert.ok(detail.includes('reflective-card'))
  assert.ok(detail.includes(employee.employeeId))
  assert.ok(detail.includes('>Edit</button>'))
  assert.ok(render({ selectedId: employee.id, viewer: manager }).includes('>Edit</button>'))
  const updated = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, department: 'Dispatch' })
  const activity = render({ accounts: updated.accounts, selectedId: employee.id })
  assert.ok(activity.includes(manager.fullName))
  assert.ok(activity.includes('Edit history (1)'))
  assert.ok(activity.includes('Dispatch'))
  assert.ok(render({ selectedId: 'unknown' }).includes('Account not found'))
})

test('any account can change a password without putting its value in profiles or audit history', async () => {
  const { accounts, manager, employee } = scenario()
  const password = 'New-test-password-42'
  const result = await model.updateEmployeeAccount(accounts, employee.id, manager.id, { ...manager, password })
  assert.equal(result.ok, true)
  const target = result.accounts.find(({ profile }) => profile.id === manager.id)
  assert.ok(target.passwordVerifier)
  assert.equal(target.editHistory[0].passwordChanged, true)
  assert.equal(target.editHistory[0].editedBy.id, employee.id)
  assert.deepEqual(target.editHistory[0].changes, [])
  assert.ok(!JSON.stringify(result.accounts).includes(password))
  assert.equal(await passwords.verifyEmployeePassword(target, password), true)
  assert.equal(await passwords.verifyEmployeePassword(target, 'Wrong-password'), false)
  const activity = renderToStaticMarkup(React.createElement(EmployeeAccounts, { accounts: result.accounts, viewer: employee, selectedId: manager.id, onSave: async () => null }))
  assert.ok(activity.includes('Password changed'))
  assert.ok(activity.includes(employee.fullName))
  assert.ok(!activity.includes(password))
  assert.ok(!activity.includes(target.passwordVerifier.hash))
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(result.accounts) } }
  const restored = model.loadEmployeeAccounts().find(({ profile }) => profile.id === manager.id)
  assert.equal(await passwords.verifyEmployeePassword(restored, password), true)
})

test('blank password edits preserve the existing password, replacements invalidate the old password', async () => {
  const { accounts, employee } = scenario()
  assert.equal(await passwords.verifyEmployeePassword(accounts[0], 'Any-preview-password'), true)
  const first = await model.updateEmployeeAccount(accounts, employee.id, employee.id, { ...employee, password: 'First-password' })
  const profileOnly = await model.updateEmployeeAccount(first.accounts, employee.id, employee.id, { ...employee, department: 'Dispatch', password: '' })
  const account = profileOnly.accounts.find(({ profile }) => profile.id === employee.id)
  assert.equal(await passwords.verifyEmployeePassword(account, 'First-password'), true)
  assert.equal(account.editHistory.at(-1).passwordChanged, undefined)
  const replacement = await model.updateEmployeeAccount(profileOnly.accounts, employee.id, employee.id, { ...account.profile, password: 'Second-password' })
  const changed = replacement.accounts.find(({ profile }) => profile.id === employee.id)
  assert.equal(await passwords.verifyEmployeePassword(changed, 'First-password'), false)
  assert.equal(await passwords.verifyEmployeePassword(changed, 'Second-password'), true)
})

test('invalid password lengths are rejected and identical passwords receive different salts', async () => {
  const { accounts, employee } = scenario()
  for (const password of ['short', 'x'.repeat(129)]) {
    const result = await model.updateEmployeeAccount(accounts, employee.id, employee.id, { ...employee, password })
    assert.equal(result.ok, false)
    assert.match(result.error, /8 and 128/)
  }
  const first = await passwords.createPasswordVerifier('Same-test-password')
  const second = await passwords.createPasswordVerifier('Same-test-password')
  assert.notEqual(first.salt, second.salt)
  assert.notEqual(first.hash, second.hash)
})
