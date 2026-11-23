// Isolated integration test: never connects to the application's configured database.
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
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pgBin = process.env.GSTOCK_POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/18/bin'
const executable = name => join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
const scratch = await mkdtemp(join(tmpdir(), 'gstock-inventory-deletion-'))
const data = join(scratch, 'pgdata')
const control = args => new Promise((resolve, reject) => {
  const child = spawn(executable('pg_ctl'), args, { windowsHide: true, stdio: 'ignore' })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`pg_ctl exited with ${code}`)))
})
const freePort = async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
const pgPort = await freePort(), apiPort = await freePort()
const origin = `http://127.0.0.1:${apiPort}`
const psqlArgs = ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'gstock_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
const psql = (...args) => run(executable('psql'), [...psqlArgs, ...args], { windowsHide: true })
const sql = text => psql('-tA', '-c', text)
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const actors = Object.fromEntries(['staff', 'stock', 'employee', 'inactive'].map(name => [name, {
  id: randomUUID(), sessionId: randomUUID(),
  role: name === 'stock' ? 'Stock Manager' : name === 'staff' ? 'Staff Manager' : 'Nemployee',
}]))
const token = actor => {
  const now = Math.floor(Date.now() / 1000)
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'at+jwt', kid: 'deletion-test' })}.${encode({
    iss: 'gstock-deletion-test', aud: 'gstock-api', sub: actor.id, sid: actor.sessionId,
    iat: now, nbf: now, exp: now + 600, jti: randomUUID(),
  })}`
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`
}
async function request(path, expected, actor = actors.stock, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method, signal: AbortSignal.timeout(15000),
    headers: { ...(actor ? { Authorization: `Bearer ${token(actor)}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${text}`)
  return text ? JSON.parse(text) : null
}
const remove = (path, expected, actor) => request(path, expected, actor, undefined, 'DELETE')
const createWarehouse = name => request('/warehouses', 201, actors.stock, {
  name, streetName: name, suburbName: 'Test', city: 'Test', province: 'Test', postalCode: 1000,
})
const createBrand = (warehouse, name) => request('/brands', 201, actors.stock, { warehouseId: warehouse.id, name, description: '' })
const createItem = (brand, quantity) => request('/items', 201, actors.employee, { brandId: brand.id, name: 'Test item', quantity, unit: 'units' })
const setZero = (item, quantity = item.quantity) => request(`/items/${item.id}/adjustments`, 200, actors.employee, {
  mode: 'set', quantity: 0, expectedQuantity: quantity, reason: 'Empty stock before deletion',
})
const pause = () => new Promise(resolve => setTimeout(resolve, 25))
async function waitFor(check, message) {
  for (let attempt = 0; attempt < 200; attempt++) { if (await check()) return; await pause() }
  assert.fail(message)
}
// Hold a transaction open so a concurrent API request is known to have waited for a write.
async function holdTransaction(statement) {
  const child = spawn(executable('psql'), [...psqlArgs, '-tA'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = '', errors = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { errors += chunk })
  child.stdin.write(`BEGIN;\n${statement}\n\\echo LOCKED\n`)
  await waitFor(() => output.includes('LOCKED'), `Lock not acquired: ${errors}`)
  return async () => {
    const stopped = new Promise(resolve => child.once('exit', resolve))
    child.stdin.end('COMMIT;\n')
    assert.equal(await stopped, 0, errors)
  }
}
const waitForBlockedRequest = () => waitFor(async () => Number((await sql(
  "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND backend_type = 'client backend';"
)).stdout.trim()) > 0, 'API request never waited for the concurrent transaction')

let postgresStarted = false, api, apiLog = ''
try {
  await run('dotnet', ['build', join(backend, 'src/Gstock.Api'), '--no-restore', '--nologo'], { windowsHide: true })
  await run(executable('initdb'), ['-D', data, '-U', 'gstock_test', '--auth=trust', '--no-locale', '--encoding=UTF8'], { windowsHide: true })
  await control(['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-p ${pgPort} -h 127.0.0.1`, '-w', 'start'])
  postgresStarted = true
  for (const file of (await readdir(join(backend, 'migrations'))).filter(name => name.endsWith('.sql')).sort())
    await psql('--single-transaction', '-f', join(backend, 'migrations', file))
  for (const [name, actor] of Object.entries(actors)) {
    await sql(`INSERT INTO public.employees (id, employee_id, full_name, email, account_role, is_active)
      VALUES ('${actor.id}', '${name}', '${name}', '${name}@example.test', '${actor.role}', ${name !== 'inactive'});
      INSERT INTO public.auth_sessions (id, employee_id, remember_me, absolute_expires_at, idle_expires_at)
      VALUES ('${actor.sessionId}', '${actor.id}', false, now() + interval '1 day', now() + interval '1 hour');`)
  }
  api = spawn('dotnet', [join(backend, 'src/Gstock.Api/bin/Debug/net10.0/Gstock.Api.dll')], {
    cwd: backend, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Production', ASPNETCORE_URLS: origin,
      ConnectionStrings__DefaultConnection: `Host=127.0.0.1;Port=${pgPort};Database=postgres;Username=gstock_test;SSL Mode=Disable`,
      Auth__Issuer: 'gstock-deletion-test', Auth__SigningKeyId: 'deletion-test',
      Auth__PrivateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      'Auth__SigningKeys__deletion-test': publicKey.export({ type: 'spki', format: 'pem' }),
    },
  })
  api.stdout.on('data', chunk => { apiLog += chunk })
  api.stderr.on('data', chunk => { apiLog += chunk })
  await waitFor(async () => { try { return (await fetch(origin)).ok } catch { return false } }, 'API startup timed out')

  const warehouse = await createWarehouse('Deletion test')
  const brand = await createBrand(warehouse, 'Brand with stock')
  const empty = await createItem(brand, 0), stocked = await createItem(brand, 2)
  for (const [path, forbidden] of [
    [`/items/${empty.id}`, [actors.stock, actors.staff]],
    [`/brands/${brand.id}`, [actors.employee, actors.staff]],
    [`/warehouses/${warehouse.id}`, [actors.employee, actors.staff]],
  ]) {
    await remove(path, 401, null)
    await remove(path, 401, actors.inactive)
    for (const actor of forbidden) await remove(path, 403, actor)
  }
  await remove(`/items/${stocked.id}`, 409, actors.employee)
  await remove(`/brands/${brand.id}`, 409)
  await remove(`/warehouses/${warehouse.id}`, 409)
  assert.equal((await request(`/items/${empty.id}`, 200)).quantity, 0)
  await remove(`/items/${empty.id}`, 204, actors.employee)
  await remove(`/items/${empty.id}`, 404, actors.employee)
  await request(`/items/${empty.id}`, 404)
  console.log('PASS: role restrictions, zero-stock item rule, missing records, and positive-stock brand/warehouse protection.')

  await setZero(stocked)
  await remove(`/brands/${brand.id}`, 204)
  await request(`/brands/${brand.id}`, 404)
  await request(`/items/${stocked.id}`, 404)
  const history = await request(`/inventory/activity?brandId=${brand.id}`, 200)
  assert.equal(history.filter(event => event.type === 'brand-deleted').length, 1)
  assert.equal(history.filter(event => event.type === 'item-deleted').length, 2)
  assert.ok(history.some(event => event.type === 'item-deleted' && event.itemId === stocked.id && event.actor.id === actors.stock.id && event.quantity === 0))
  console.log('PASS: deleting a zero-stock brand archives its remaining items and records the employee in history.')

  // Match the API's lock order so the failure occurs after an earlier brand was processed.
  const [first, second] = [await createBrand(warehouse, 'Empty brand'), await createBrand(warehouse, 'Second brand')].sort((a, b) => a.id.localeCompare(b.id))
  const firstItem = await createItem(first, 0), secondItem = await createItem(second, 1)
  await remove(`/warehouses/${warehouse.id}`, 409)
  for (const value of [first, second]) await request(`/brands/${value.id}`, 200)
  for (const value of [firstItem, secondItem]) await request(`/items/${value.id}`, 200)
  assert.equal((await request(`/inventory/activity?brandId=${first.id}&type=brand-deleted`, 200)).length, 0)
  assert.equal((await request(`/inventory/activity?itemId=${firstItem.id}&type=item-deleted`, 200)).length, 0)
  assert.equal((await request(`/inventory/activity?type=warehouse-deleted`, 200)).length, 0)
  await setZero(secondItem)
  await remove(`/warehouses/${warehouse.id}`, 204)
  await request(`/warehouses/${warehouse.id}`, 404)
  await remove(`/warehouses/${warehouse.id}`, 404)
  assert.equal((await request('/warehouses', 200)).length, 0)
  assert.equal((await request('/brands', 200)).length, 0)
  assert.equal((await request('/items', 200)).length, 0)
  const warehouseHistory = await request(`/inventory/activity?warehouseId=${warehouse.id}`, 200)
  assert.equal(warehouseHistory.filter(event => event.type === 'warehouse-deleted').length, 1)
  assert.equal(warehouseHistory.filter(event => event.type === 'brand-deleted').length, 3)
  assert.equal(warehouseHistory.filter(event => event.type === 'item-deleted').length, 4)
  assert.equal((await sql(`SELECT count(*) FROM public.warehouses WHERE archived_at IS NOT NULL;`)).stdout.trim(), '1')
  await createBrand(warehouse, 'Cannot create under deleted warehouse').then(() => assert.fail('Expected 404'), error => assert.match(error.message, /404/))
  console.log('PASS: warehouse deletion archives all descendants atomically, preserves history, and rejects new brands.')

  const emptyWarehouse = await createWarehouse('No brands')
  await remove(`/warehouses/${emptyWarehouse.id}`, 204)
  const raceWarehouse = await createWarehouse('Concurrent stock')
  const raceBrand = await createBrand(raceWarehouse, 'Concurrent brand')
  const raceItem = await createItem(raceBrand, 0)
  for (const path of [`/items/${raceItem.id}`, `/brands/${raceBrand.id}`, `/warehouses/${raceWarehouse.id}`]) {
    const release = await holdTransaction(`SELECT id FROM public.brands WHERE id = '${raceBrand.id}' FOR NO KEY UPDATE;
      UPDATE public.inventory_items SET quantity = 1 WHERE id = '${raceItem.id}';`)
    const pending = remove(path, 409, path.startsWith('/items') ? actors.employee : actors.stock)
    try { await waitForBlockedRequest() } finally { await release() }
    await pending
    await request(`/items/${raceItem.id}`, 200)
    await setZero(raceItem, 1)
  }
  console.log('PASS: item, brand, and warehouse deletion recheck stock after waiting for a concurrent stock write.')

  const release = await holdTransaction(`SELECT id FROM public.warehouses WHERE id = '${raceWarehouse.id}' FOR NO KEY UPDATE;
    UPDATE public.warehouses SET archived_at = now() WHERE id = '${raceWarehouse.id}';`)
  const pendingBrand = request('/brands', 404, actors.stock, { warehouseId: raceWarehouse.id, name: 'Blocked brand', description: '' })
  try { await waitForBlockedRequest() } finally { await release() }
  await pendingBrand
  assert.equal((await sql("SELECT count(*) FROM public.brands WHERE brand_name = 'Blocked brand';")).stdout.trim(), '0')
  console.log('PASS: brand creation cannot race with warehouse deletion to leave a new active brand behind.')
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
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()))
  assert.ok(basename(scratch).startsWith('gstock-inventory-deletion-'))
  await rm(scratch, { recursive: true, force: true })
}
