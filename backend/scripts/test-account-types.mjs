// Integration test using a disposable PostgreSQL cluster and a local API process.
// Requires Node.js 24, .NET 10 and PostgreSQL binaries. Never uses appsettings.Local.json.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
// On Windows, PostgreSQL can inherit pg_ctl's output pipes. Wait for pg_ctl's exit
// with ignored stdio so the running database cannot keep execFile's callback open.
const control = args => new Promise((resolve, reject) => {
  const child = spawn(executable('pg_ctl'), args, { windowsHide: true, stdio: 'ignore' })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`pg_ctl exited with ${code}`)))
})
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pgBin = process.env.GSTOCK_POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/18/bin'
const executable = name => join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
const scratch = await mkdtemp(join(tmpdir(), 'gstock-account-types-'))
const data = join(scratch, 'pgdata')
const freePort = async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
const pgPort = await freePort()
const apiPort = await freePort()
const origin = `http://127.0.0.1:${apiPort}`
const psql = (...args) => run(executable('psql'), [
  '-h', '127.0.0.1', '-p', String(pgPort), '-U', 'gstock_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args,
], { windowsHide: true })
const sql = text => psql('-tA', '-c', text)
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const actors = Object.fromEntries(['staff', 'stock', 'employee', 'inactive', 'otherStaff'].map(name => [name, {
  id: randomUUID(), sessionId: randomUUID(),
  role: name === 'stock' ? 'Stock Manager' : name === 'employee' ? 'Nemployee' : 'Staff Manager',
}]))
const token = actor => {
  const now = Math.floor(Date.now() / 1000)
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'at+jwt', kid: 'account-type-test' })}.${encode({
    iss: 'gstock-account-type-test', aud: 'gstock-api', sub: actor.id, sid: actor.sessionId,
    iat: now, nbf: now, exp: now + 600, jti: randomUUID(),
  })}`
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`
}
async function request(path, expected, actor = actors.staff, body, method = body ? 'PATCH' : 'GET') {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method, headers: { ...(actor ? { Authorization: `Bearer ${token(actor)}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${text}`)
  return text ? JSON.parse(text) : null
}
let postgresStarted = false
let api
let apiLog = ''
try {
  await run('dotnet', ['build', join(backend, 'src/Gstock.Api'), '--nologo'], { windowsHide: true })
  console.log('Built backend; initializing disposable PostgreSQL cluster.')
  await run(executable('initdb'), ['-D', data, '-U', 'gstock_test', '--auth=trust', '--no-locale', '--encoding=UTF8'], { windowsHide: true })
  await control(['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-p ${pgPort} -h 127.0.0.1`, '-w', 'start'])
  postgresStarted = true
  console.log('Applying migrations and starting local API.')
  const legacy = { id: randomUUID(), departmentEdit: randomUUID(), mixedEdit: randomUUID(), passwordEdit: randomUUID() }
  for (const file of (await readdir(join(backend, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
    if (file.startsWith('006_')) {
      await sql(`INSERT INTO public.employees (id, employee_id, full_name, email, account_role, role, department)
        VALUES ('${legacy.id}', 'legacy', 'Legacy Employee', 'legacy@example.test', 'Stock Manager', 'Old job title', 'Old department');
        INSERT INTO public.employee_edits (id, target_employee_id, edited_by_id, editor_employee_id, editor_full_name, editor_role)
        VALUES ('${legacy.departmentEdit}', '${legacy.id}', '${legacy.id}', 'legacy', 'Legacy Employee', 'Old job title'),
               ('${legacy.mixedEdit}', '${legacy.id}', '${legacy.id}', 'legacy', 'Legacy Employee', 'Old job title'),
               ('${legacy.passwordEdit}', '${legacy.id}', '${legacy.id}', 'legacy', 'Legacy Employee', 'Old job title');
        INSERT INTO public.employee_edit_changes (edit_id, field, before_value, after_value)
        VALUES ('${legacy.departmentEdit}', 'department', 'Before', 'After'),
               ('${legacy.mixedEdit}', 'department', 'Before', 'After'),
               ('${legacy.mixedEdit}', 'full_name', 'Before name', 'After name');`)
    }
    await psql('--single-transaction', '-f', join(backend, 'migrations', file))
  }
  assert.equal((await sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'department';`)).stdout.trim(), '0')
  assert.equal((await sql(`SELECT udt_name || ':' || is_generated FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'role';`)).stdout.trim(), 'account_role:ALWAYS')
  assert.equal((await sql(`SELECT role::text FROM public.employees WHERE id = '${legacy.id}';`)).stdout.trim(), 'Stock Manager')
  assert.equal((await sql(`SELECT count(*) FROM public.employee_edit_changes WHERE field = 'department';`)).stdout.trim(), '0')
  assert.equal((await sql(`SELECT count(*) FROM public.employee_edits WHERE id = '${legacy.departmentEdit}';`)).stdout.trim(), '0')
  assert.equal((await sql(`SELECT count(*) FROM public.employee_edits WHERE id IN ('${legacy.mixedEdit}', '${legacy.passwordEdit}');`)).stdout.trim(), '2')
  await assert.rejects(sql(`UPDATE public.employees SET role = 'Nemployee' WHERE id = '${legacy.id}';`))
  console.log('PASS: department removed, historical values purged, other audit entries preserved, existing job titles normalized and database enum protected.')
  for (const [name, actor] of Object.entries(actors)) {
    await sql(`INSERT INTO public.employees (id, employee_id, full_name, email, account_role, is_active)
      VALUES ('${actor.id}', '${name}', '${name}', '${name}@example.test', '${actor.role}', ${name !== 'inactive'});
      INSERT INTO public.auth_sessions (id, employee_id, remember_me, absolute_expires_at, idle_expires_at)
      VALUES ('${actor.sessionId}', '${actor.id}', false, now() + interval '1 day', now() + interval '1 hour');`)
  }
  api = spawn('dotnet', [join(backend, 'src/Gstock.Api/bin/Debug/net10.0/Gstock.Api.dll')], {
    cwd: backend, windowsHide: true,
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Production', ASPNETCORE_URLS: origin,
      ConnectionStrings__DefaultConnection: `Host=127.0.0.1;Port=${pgPort};Database=postgres;Username=gstock_test;SSL Mode=Disable`,
      Auth__Issuer: 'gstock-account-type-test', Auth__SigningKeyId: 'account-type-test',
      Auth__PrivateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      'Auth__SigningKeys__account-type-test': publicKey.export({ type: 'spki', format: 'pem' }),
    }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  api.stdout.on('data', chunk => { apiLog += chunk })
  api.stderr.on('data', chunk => { apiLog += chunk })
  let ready = false
  for (let attempt = 0; attempt < 80; attempt++) {
    if (api.exitCode !== null) throw new Error(`API exited: ${apiLog}`)
    try { if ((await fetch(origin)).ok) { ready = true; break } } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(ready, `API startup timed out: ${apiLog}`)
  for (const route of ['/employees', '/employees?limit=200&offset=0', `/employees/${actors.staff.id}`,
    `/employees/${actors.staff.id}/edits`, `/employees/${actors.employee.id}`, `/employees/${randomUUID()}`]) {
    await request(route, 401, null)
    await request(route, 403, actors.employee)
  }
  for (const actor of [actors.stock, actors.staff]) {
    await request('/employees', 200, actor)
    await request(`/employees/${actors.employee.id}`, 200, actor)
    await request(`/employees/${actors.employee.id}/edits`, 200, actor)
  }
  const ownProfile = await request('/auth/me', 200, actors.employee)
  assert.equal(ownProfile.profile.id, actors.employee.id)
  assert.equal(ownProfile.permissions.canViewEmployees, false)
  console.log('PASS: normal employees cannot list, read or inspect account history; managers retain access and own profiles remain available.')
  const path = `/employees/${actors.employee.id}/account-type`
  await request(path, 401, null, { accountRole: 'StaffManager' })
  for (const actor of [actors.stock, actors.employee]) {
    await request(path, 403, actor, { accountRole: 'StaffManager' })
    await request(`/employees/${actors.staff.id}/account-type`, 403, actor, { accountRole: 'Nemployee' })
  }
  await request(path, 401, actors.inactive, { accountRole: 'StaffManager' })
  for (const accountRole of [null, 999]) await request(path, 422, actors.staff, { accountRole })
  await request(path, 422, actors.staff, {})
  await request(path, 422, actors.staff, { accountRole: 'Nemployee' })
  await request(`/employees/${randomUUID()}/account-type`, 404, actors.staff, { accountRole: 'StockManager' })
  console.log('PASS: anonymous, non-staff and inactive actors rejected; invalid, unchanged and missing targets rejected.')

  for (const actor of [actors.employee, actors.stock]) {
    await request(`/employees/${actors.employee.id}`, 403, actor, { role: 'StaffManager' })
  }
  await request(`/employees/${actors.employee.id}`, 422, actors.staff, { role: 'StaffManager' })
  await request(`/employees/${actors.employee.id}`, 400, actors.staff, { role: 'Arbitrary job title' })
  const newEmployee = { employeeId: 'new-employee', fullName: 'New Employee', email: 'new@example.test', accountRole: 'StockManager', password: 'Test-password-123' }
  const created = await request('/employees', 201, actors.staff, newEmployee, 'POST')
  assert.equal(created.role, 'StockManager')
  assert.ok(!Object.hasOwn(created, 'department'))
  await request('/employees', 422, actors.staff, { ...newEmployee, role: 'StaffManager' }, 'POST')
  await request('/employees', 400, actors.staff, { ...newEmployee, role: 'Custom title' }, 'POST')
  const login = await request('/auth/login', 200, null, { email: newEmployee.email, password: newEmployee.password }, 'POST')
  assert.ok(login.accessToken)
  assert.ok((await request('/employees?query=Stock', 200)).some(profile => profile.id === created.id))
  console.log('PASS: job title is enum-only, derives from account type on creation and cannot be independently edited.')

  for (const accountRole of ['StockManager', 'StaffManager', 'Nemployee']) {
    const updated = await request(path, 200, actors.staff, { accountRole })
    assert.equal(updated.accountRole, accountRole)
    assert.equal(updated.role, accountRole)
    assert.ok(!Object.hasOwn(updated, 'department'))
    assert.equal((await request(`/employees/${actors.employee.id}`, 200)).accountRole, accountRole)
    await request('/auth/me', 401, actors.employee)
    const { stdout } = await sql(`SELECT count(*) FROM public.auth_sessions WHERE employee_id = '${actors.employee.id}' AND revoked_at IS NULL;`)
    assert.equal(stdout.trim(), '0')
    // Simulate a fresh sign-in session, then verify the new role's actual write permissions.
    actors.employee.sessionId = randomUUID()
    await sql(`INSERT INTO public.auth_sessions (id, employee_id, remember_me, absolute_expires_at, idle_expires_at)
      VALUES ('${actors.employee.sessionId}', '${actors.employee.id}', false, now() + interval '1 day', now() + interval '1 hour');`)
    const current = await request('/auth/me', 200, actors.employee)
    assert.equal(current.profile.accountRole, accountRole)
    assert.equal(current.profile.role, accountRole)
    assert.equal(current.permissions.canManageEmployees, accountRole === 'StaffManager')
    assert.equal(current.permissions.canViewEmployees, accountRole !== 'Nemployee')
    await request('/employees', accountRole === 'Nemployee' ? 403 : 200, actors.employee)
    await request(`/employees/${actors.stock.id}/account-type`, accountRole === 'StaffManager' ? 422 : 403,
      actors.employee, { accountRole: 'StockManager' })
  }
  const history = await request(`/employees/${actors.employee.id}/edits`, 200)
  assert.equal(history.length, 3)
  assert.deepEqual(history.flatMap(edit => edit.changes.filter(change => change.field === 'account_role').map(change => change.after)).sort(), ['Nemployee', 'Staff Manager', 'Stock Manager'])
  for (const edit of history) {
    assert.equal(edit.editedBy.id, actors.staff.id)
    assert.equal(edit.changes[0].field, 'account_role')
    assert.equal(edit.changes[1].field, 'role')
    assert.equal(edit.changes[1].after, edit.changes[0].after)
    assert.notEqual(edit.changes[0].before, edit.changes[0].after)
  }
  console.log('PASS: all account types persisted; permission changes, session revocation and audit history verified.')

  const edited = await request(`/employees/${actors.employee.id}`, 200, actors.staff, { fullName: 'Updated Employee' })
  assert.equal(edited.fullName, 'Updated Employee')
  assert.equal(edited.role, 'Nemployee')
  assert.ok(!Object.hasOwn(edited, 'department'))

  await request(`/employees/${actors.stock.id}`, 403, actors.staff, { fullName: 'Must not change' })
  await request(`/employees/${actors.stock.id}/account-type`, 200, actors.staff, { accountRole: 'Nemployee', fullName: 'Ignored' })
  assert.equal((await request(`/employees/${actors.stock.id}`, 200)).fullName, 'stock')
  await request(`/employees/${actors.otherStaff.id}/account-type`, 200, actors.staff, { accountRole: 'StockManager' })
  await request('/auth/me', 401, actors.otherStaff)
  actors.otherStaff.sessionId = randomUUID()
  await sql(`INSERT INTO public.auth_sessions (id, employee_id, remember_me, absolute_expires_at, idle_expires_at)
    VALUES ('${actors.otherStaff.sessionId}', '${actors.otherStaff.id}', false, now() + interval '1 day', now() + interval '1 hour');`)
  await request(`/employees/${actors.staff.id}/account-type`, 200, actors.staff, { accountRole: 'Nemployee' })
  await request('/auth/me', 401, actors.staff)
  const selfHistory = await request(`/employees/${actors.staff.id}/edits`, 200, actors.otherStaff)
  assert.equal(selfHistory[0].editedBy.role, 'Staff Manager')
  console.log('PASS: manager targets, unchanged profile protections and self-demotion/session expiry verified.')
} catch (error) {
  if (apiLog && api?.exitCode) console.error(apiLog)
  throw error
} finally {
  if (api && api.exitCode === null) {
    const stopped = new Promise(resolve => api.once('exit', resolve))
    api.kill()
    await stopped
  }
  if (postgresStarted) await control(['-D', data, '-m', 'fast', '-w', 'stop'])
  // Check the resolved target before recursively removing this test's temporary cluster.
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()))
  assert.ok(basename(scratch).startsWith('gstock-account-types-'))
  await rm(scratch, { recursive: true, force: true })
}
