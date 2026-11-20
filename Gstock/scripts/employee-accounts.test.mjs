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
  const manager = accounts.find(({ profile }) => profile.accountRole === 'StaffManager').profile
  const employee = accounts.find(({ profile }) => profile.accountRole === 'Nemployee').profile
  return { accounts, manager, employee }
}

test('only active staff managers can edit normal employee details', async () => {
  const { accounts, manager, employee } = scenario()
  const original = JSON.stringify(accounts)
  const result = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, fullName: 'Changed name' })
  assert.equal(result.ok, true)
  assert.equal(result.accounts.find(({ profile }) => profile.id === employee.id).editHistory[0].editedBy.id, manager.id)
  for (const { profile } of accounts.filter(account => account.profile.accountRole !== 'StaffManager')) {
    assert.equal((await model.updateEmployeeAccount(accounts, profile.id, employee.id, { ...employee, fullName: 'Denied' })).ok, false)
  }
  assert.equal(JSON.stringify(accounts), original)
  assert.equal((await model.updateEmployeeAccount(accounts, 'unknown-editor', employee.id, { ...employee, fullName: 'Changed name' })).ok, false)
})

test('edits record the current editor and exact changes without mutating previous data', async () => {
  const { accounts, manager, employee } = scenario()
  const original = JSON.stringify(accounts)
  const result = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, fullName: '  Updated Name  ', password: 'NEVER-PERSIST' })
  assert.equal(result.ok, true)
  const updated = result.accounts.find(({ profile }) => profile.id === employee.id)
  assert.equal(updated.profile.fullName, 'Updated Name')
  assert.equal(updated.editHistory.length, 1)
  assert.equal(updated.editHistory[0].editedBy.id, manager.id)
  assert.equal(updated.editHistory[0].editedBy.fullName, manager.fullName)
  assert.ok(Number.isFinite(Date.parse(updated.editHistory[0].editedAt)))
  assert.deepEqual(updated.editHistory[0].changes, [{ field: 'fullName', before: employee.fullName, after: 'Updated Name' }])
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

test('job titles cannot be independently edited, including by staff managers', async () => {
  const { accounts, manager, employee } = scenario()
  for (const role of ['Custom title', 'StockManager', 'StaffManager']) {
    const result = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, role })
    assert.equal(result.ok, false)
    assert.match(result.error, /read-only/)
  }
  assert.equal((await model.updateEmployeeAccount(accounts, manager.id, manager.id, { ...manager, fullName: 'Denied' })).ok, false)
})

test('edit history appends, survives a reload, and keeps prior editor names after a rename', async () => {
  const { accounts, manager, employee } = scenario()
  const first = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, fullName: 'Updated Name' })
  const renamedAccounts = first.accounts.map(account => account.profile.id === manager.id ? { ...account, profile: { ...account.profile, fullName: 'Renamed Manager' } } : account)
  const third = await model.updateEmployeeAccount(renamedAccounts, manager.id, employee.id, { ...employee, fullName: 'Updated Name', email: 'updated@example.test' })
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

test('account cards show read-only job titles, staff-only Edit, and audit details without departments', async () => {
  const { accounts, manager, employee } = scenario()
  const stock = accounts.find(({ profile }) => profile.accountRole === 'StockManager').profile
  const render = (props) => renderToStaticMarkup(React.createElement(EmployeeAccounts, { accounts, viewer: stock, onSave: async () => null, ...props }))
  const list = render({})
  assert.ok(list.includes('Employee accounts'))
  for (const { profile } of accounts) assert.ok(list.includes(`#employees/${encodeURIComponent(profile.id)}`))
  const detail = render({ selectedId: employee.id })
  assert.ok(detail.includes('reflective-card'))
  assert.ok(detail.includes(employee.employeeId))
  assert.ok(!detail.includes('>Edit</button>'))
  assert.ok(render({ selectedId: employee.id, viewer: manager }).includes('>Edit</button>'))
  const updated = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, fullName: 'Updated Name' })
  const activity = render({ accounts: updated.accounts, selectedId: employee.id })
  assert.ok(activity.includes(manager.fullName))
  assert.ok(activity.includes('Edit history (1)'))
  assert.ok(activity.includes('Updated Name'))
  assert.ok(detail.includes('Job title'))
  assert.ok(!detail.includes('Department'))
  assert.ok(render({ selectedId: 'unknown' }).includes('Account not found'))
})

test('staff can change employee passwords without putting values in profiles or audit history', async () => {
  const { accounts, manager, employee } = scenario()
  const password = 'New-test-password-42'
  const result = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, password })
  assert.equal(result.ok, true)
  const target = result.accounts.find(({ profile }) => profile.id === employee.id)
  assert.ok(target.passwordVerifier)
  assert.equal(target.editHistory[0].passwordChanged, true)
  assert.equal(target.editHistory[0].editedBy.id, manager.id)
  assert.deepEqual(target.editHistory[0].changes, [])
  assert.ok(!JSON.stringify(result.accounts).includes(password))
  assert.equal(await passwords.verifyEmployeePassword(target, password), true)
  assert.equal(await passwords.verifyEmployeePassword(target, 'Wrong-password'), false)
  const activity = renderToStaticMarkup(React.createElement(EmployeeAccounts, { accounts: result.accounts, viewer: manager, selectedId: employee.id, onSave: async () => null }))
  assert.ok(activity.includes('Password changed'))
  assert.ok(activity.includes(manager.fullName))
  assert.ok(!activity.includes(password))
  assert.ok(!activity.includes(target.passwordVerifier.hash))
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(result.accounts) } }
  const restored = model.loadEmployeeAccounts().find(({ profile }) => profile.id === employee.id)
  assert.equal(await passwords.verifyEmployeePassword(restored, password), true)
})

test('blank password edits preserve the existing password, replacements invalidate the old password', async () => {
  const { accounts, manager, employee } = scenario()
  assert.equal(await passwords.verifyEmployeePassword(accounts[0], 'Any-preview-password'), true)
  const first = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, password: 'First-password' })
  const profileOnly = await model.updateEmployeeAccount(first.accounts, manager.id, employee.id, { ...employee, fullName: 'Updated Name', password: '' })
  const account = profileOnly.accounts.find(({ profile }) => profile.id === employee.id)
  assert.equal(await passwords.verifyEmployeePassword(account, 'First-password'), true)
  assert.equal(account.editHistory.at(-1).passwordChanged, undefined)
  const replacement = await model.updateEmployeeAccount(profileOnly.accounts, manager.id, employee.id, { ...account.profile, password: 'Second-password' })
  const changed = replacement.accounts.find(({ profile }) => profile.id === employee.id)
  assert.equal(await passwords.verifyEmployeePassword(changed, 'First-password'), false)
  assert.equal(await passwords.verifyEmployeePassword(changed, 'Second-password'), true)
})

test('invalid password lengths are rejected and identical passwords receive different salts', async () => {
  const { accounts, manager, employee } = scenario()
  for (const password of ['short', 'x'.repeat(129)]) {
    const result = await model.updateEmployeeAccount(accounts, manager.id, employee.id, { ...employee, password })
    assert.equal(result.ok, false)
    assert.match(result.error, /8 and 128/)
  }
  const first = await passwords.createPasswordVerifier('Same-test-password')
  const second = await passwords.createPasswordVerifier('Same-test-password')
  assert.notEqual(first.salt, second.salt)
  assert.notEqual(first.hash, second.hash)
})

test('API account roles restrict editing to staff managers targeting normal employees', () => {
  const { accounts, employee, manager } = scenario()
  const normal = { ...employee, accountRole: 'Nemployee', status: 'Active' }
  const staff = { ...manager, accountRole: 'StaffManager', status: 'Active' }
  const stock = { ...manager, accountRole: 'StockManager', status: 'Active' }
  const apiAccounts = accounts.map((account) => ({ ...account, profile: account.profile.id === normal.id ? normal : { ...account.profile, accountRole: 'StaffManager', status: 'Active' } }))
  const render = (viewer, selectedId = normal.id) => renderToStaticMarkup(React.createElement(EmployeeAccounts, { accounts: apiAccounts, viewer, selectedId, onSave: async () => null }))
  assert.ok(render(staff).includes('>Edit</button>'))
  assert.ok(!render(normal).includes('>Edit</button>'))
  assert.ok(!render(stock).includes('>Edit</button>'))
  assert.ok(!render({ ...staff, status: 'InActive' }).includes('>Edit</button>'))
  assert.ok(!render(staff, manager.id).includes('>Edit</button>'))
  assert.ok(!render(staff).includes('during this preview'))
})

test('only active staff managers can open account creation', () => {
  const { accounts, manager, employee } = scenario()
  const render = (viewer) => renderToStaticMarkup(React.createElement(EmployeeAccounts, {
    accounts, viewer, onSave: async () => null, onCreate: async () => null,
  }))
  const staff = { ...manager, accountRole: 'StaffManager', status: 'Active' }
  assert.ok(render(staff).includes('>Add employee account</button>'))
  for (const viewer of [employee, { ...staff, status: 'InActive' }, { ...staff, accountRole: 'StockManager' }, { ...staff, accountRole: 'Nemployee' }]) {
    assert.ok(!render(viewer).includes('>Add employee account</button>'))
  }
})

test('account creation form offers every account type and requires confirmed new credentials', async () => {
  const CreateEmployeeDialog = (await server.ssrLoadModule('/src/components/CreateEmployeeDialog.tsx')).default
  const markup = renderToStaticMarkup(React.createElement(CreateEmployeeDialog, {
    onSave: async () => null, onClose() {}, onCreated() {},
  }))
  for (const role of ['Nemployee', 'StockManager', 'StaffManager']) assert.ok(markup.includes(`value="${role}"`))
  const input = (name) => markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? ''
  for (const name of ['password', 'confirmPassword']) {
    assert.ok(input(name).includes('required=""'))
    assert.ok(input(name).includes('minLength="8"'))
    assert.ok(input(name).includes('autoComplete="new-password"'))
  }
  assert.ok(!markup.includes('name="department"'))
  assert.ok(!markup.includes('name="role"'))
  assert.ok(markup.includes('readOnly=""'))
})

test('only active staff managers can change account types, including manager accounts', () => {
  const { accounts, manager, employee } = scenario()
  const staff = { ...manager, accountRole: 'StaffManager', status: 'Active' }
  for (const accountRole of ['Nemployee', 'StockManager', 'StaffManager']) {
    const target = { ...employee, accountRole, status: 'Active' }
    const render = viewer => renderToStaticMarkup(React.createElement(EmployeeAccounts, {
      accounts: [{ ...accounts[0], profile: target }], viewer, selectedId: target.id,
      onSave: async () => null, onChangeAccountType: async () => null,
    }))
    assert.ok(render(staff).includes('>Change job title / account type</button>'))
    for (const viewer of [employee, { ...staff, status: 'InActive' },
      { ...staff, accountRole: 'StockManager' }, { ...staff, accountRole: 'Nemployee' }]) {
      assert.ok(!render(viewer).includes('>Change job title / account type</button>'))
    }
  }
})

test('account type form offers all types only to staff managers and prevents unchanged saves', async () => {
  const ChangeAccountTypeForm = (await server.ssrLoadModule('/src/components/ChangeAccountTypeForm.tsx')).default
  const { manager, employee } = scenario()
  const staff = { ...manager, accountRole: 'StaffManager', status: 'Active' }
  const profile = { ...employee, accountRole: 'StockManager', status: 'Active' }
  const render = viewer => renderToStaticMarkup(React.createElement(ChangeAccountTypeForm, {
    profile, viewer, onSave: async () => null, onCancel() {},
  }))
  const markup = render(staff)
  for (const role of ['Nemployee', 'StockManager', 'StaffManager']) assert.ok(markup.includes(`value="${role}"`))
  assert.match(markup, /value="StockManager" selected=""/)
  assert.match(markup, /type="submit" disabled=""/)
  assert.ok(markup.includes('sign in again'))
  for (const viewer of [employee, { ...staff, status: 'InActive' }, { ...staff, accountRole: 'StockManager' }]) {
    assert.equal(render(viewer), '')
  }
})

test('account-type API sends only the selected type and maps account-type audit history', async () => {
  const workspace = await server.ssrLoadModule('/src/api/workspace.ts')
  const { api } = await server.ssrLoadModule('/src/api/client.ts')
  const originalRequest = api.request
  try {
    api.request = async (path, options) => {
      assert.equal(path, '/employees/employee%2Fid/account-type')
      assert.equal(options.method, 'PATCH')
      assert.deepEqual(JSON.parse(options.body), { accountRole: 'StaffManager' })
      return { accountRole: 'StaffManager' }
    }
    assert.equal((await workspace.changeEmployeeAccountType('employee/id', 'StaffManager')).accountRole, 'StaffManager')
    api.request = async () => [{ kind: 'profile-edited', changes: [{ field: 'account_role', before: 'Nemployee', after: 'Staff Manager' }] }]
    const history = await workspace.loadEmployeeHistory('employee/id')
    assert.equal(history[0].changes[0].field, 'accountRole')
    assert.equal(model.employeeFieldLabels[history[0].changes[0].field], 'Account type')
  } finally { api.request = originalRequest }
})

test('job titles are a frontend enum matching account types and employee requests omit removed/read-only fields', async () => {
  const { JobTitle } = await server.ssrLoadModule('/src/types/employees.ts')
  assert.deepEqual(Object.values(JobTitle), ['Nemployee', 'StockManager', 'StaffManager'])
  assert.deepEqual(Object.keys(model.accountTypeLabels), Object.values(JobTitle))
  for (const { profile } of model.loadEmployeeAccounts()) {
    assert.equal(profile.role, profile.accountRole)
    assert.ok(!Object.hasOwn(profile, 'department'))
  }
  const workspace = await server.ssrLoadModule('/src/api/workspace.ts')
  const { api } = await server.ssrLoadModule('/src/api/client.ts')
  const originalRequest = api.request
  const input = { employeeId: 'QA-1', fullName: 'Test Employee', email: 'qa@example.test',
    department: 'Must not be sent', role: 'Must not be sent', accountRole: JobTitle.Employee, password: 'Test-password' }
  try {
    api.request = async (path, options) => {
      const body = JSON.parse(options.body)
      assert.ok(!Object.hasOwn(body, 'department'))
      assert.ok(!Object.hasOwn(body, 'role'))
      if (path.endsWith('/employees')) assert.equal(body.accountRole, JobTitle.Employee)
      return {}
    }
    await workspace.createEmployee(input)
    await workspace.saveEmployee('employee-id', input)
  } finally { api.request = originalRequest }
})

test('normal employees cannot render the employee directory or a direct account link', () => {
  const { accounts, employee, manager } = scenario()
  for (const selectedId of [undefined, employee.id, manager.id]) {
    const markup = renderToStaticMarkup(React.createElement(EmployeeAccounts, {
      accounts, viewer: employee, selectedId, onSave: async () => null,
    }))
    assert.ok(markup.includes('Page unavailable'))
    assert.ok(!markup.includes(manager.email))
    assert.ok(!markup.includes(employee.email))
    assert.ok(!markup.includes('Edit history'))
    assert.ok(!markup.includes('reflective-card'))
  }
})

test('workspace loading skips employee data for normal employees and keeps manager access', async () => {
  const workspace = await server.ssrLoadModule('/src/api/workspace.ts')
  const { api } = await server.ssrLoadModule('/src/api/client.ts')
  const originalRequest = api.request
  const { employee } = scenario()
  try {
    for (const [accountRole, allowed] of [['Nemployee', false], ['StockManager', true], ['StaffManager', true]]) {
      const calls = []
      const profile = { ...employee, role: accountRole, accountRole, status: 'Active' }
      api.request = async path => {
        calls.push(path)
        if (path === '/auth/me') return { profile, permissions: { canViewEmployees: allowed } }
        if (path.startsWith('/employees')) {
          assert.ok(allowed, 'Normal employee login must not fetch the directory')
          return [profile]
        }
        return []
      }
      const result = await workspace.loadWorkspaceData()
      assert.equal(result.current.profile.id, employee.id)
      assert.equal(result.accounts.length, allowed ? 1 : 0)
      assert.equal(calls.some(path => path.startsWith('/employees')), allowed)
      assert.ok(calls.includes('/auth/me'))
    }
    api.request = async path => {
      if (path === '/auth/me') return { profile: { ...employee, accountRole: 'StaffManager' }, permissions: { canViewEmployees: false } }
      assert.ok(!path.startsWith('/employees'), 'Respect a server denial even for a manager profile')
      return []
    }
    assert.deepEqual((await workspace.loadWorkspaceData()).accounts, [])
  } finally { api.request = originalRequest }
})
