// Uses only a disposable PostgreSQL cluster; configured databases are never read.
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pgBin = process.env.GSTOCK_POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/18/bin'
const executable = name => join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
const scratch = await mkdtemp(join(tmpdir(), 'gstock-demo-seed-'))
const data = join(scratch, 'pgdata')
const server = createServer()
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await new Promise(resolve => server.close(resolve))
const control = args => new Promise((resolve, reject) => {
  const child = spawn(executable('pg_ctl'), args, { windowsHide: true, stdio: 'ignore' })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`pg_ctl exited with ${code}`)))
})
const sql = async text => (await run(executable('psql'), [
  '-h', '127.0.0.1', '-p', String(port), '-U', 'gstock_test', '-d', 'postgres',
  '-v', 'ON_ERROR_STOP=1', '-tA', '-c', text,
], { windowsHide: true })).stdout.trim()
const env = { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development',
  ConnectionStrings__DefaultConnection: `Host=127.0.0.1;Port=${port};Database=postgres;Username=gstock_test;SSL Mode=Disable` }
const command = (name, environment = env) => run('dotnet', [
  join(backend, 'src/Gstock.Api/bin/Debug/net10.0/Gstock.Api.dll'), name,
], { cwd: scratch, env: environment, windowsHide: true })
let started = false
try {
  await run('dotnet', ['build', join(backend, 'src/Gstock.Api'), '--no-restore', '--nologo'], { windowsHide: true })
  await run(executable('initdb'), ['-D', data, '-U', 'gstock_test', '--auth=trust', '--no-locale', '--encoding=UTF8'], { windowsHide: true })
  await control(['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'])
  started = true
  await command('--migrate')
  await sql(`INSERT INTO public.employees (id, employee_id, full_name, email, account_role)
    VALUES ('00000000-0000-0000-0000-000000000001', 'EXISTING', 'Existing Employee', 'existing@example.test', 'Nemployee')`)
  assert.match((await command('--seed-demo')).stdout, /48 accounts, 5 warehouses, 30 brands, 180 products/)
  assert.equal(await sql(`SELECT count(*) FROM public.employees`), '49')
  assert.equal(await sql(`SELECT count(DISTINCT password_hash) FROM public.employee_credentials WHERE password_hash LIKE '$argon2id$%'`), '48')
  assert.equal(await sql(`SELECT count(*) FROM public.brands b WHERE (SELECT count(*) FROM public.inventory_items i WHERE i.brand_id = b.id) = 6`), '30')
  assert.equal(await sql(`SELECT count(*) FROM public.warehouses w WHERE (SELECT count(*) FROM public.brands b WHERE b.warehouse_id = w.id) = 6`), '5')
  assert.equal(await sql(`SELECT count(DISTINCT CASE WHEN quantity = 0 THEN 'out' WHEN quantity <= reorder_level THEN 'low' ELSE 'healthy' END) FROM public.inventory_items`), '3')
  assert.equal(await sql(`SELECT count(*) FROM public.employees WHERE role <> account_role`), '0')
  console.log('PASS: accounts, unique Argon2id credentials, warehouse/brand relationships, products and stock states.')

  await sql(`UPDATE public.inventory_items SET quantity = 997 WHERE sku = 'DEMO-NORTHLINE-001';
    UPDATE public.employees SET full_name = 'Edited Demo Employee' WHERE employee_id = 'DEMO-0010';
    UPDATE public.brands SET archived_at = now() WHERE brand_name = 'Packwell'`)
  const snapshot = () => sql(`SELECT md5(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text))
    FROM (SELECT 'employees' AS kind, row_to_json(e)::text AS value FROM public.employees e
      UNION ALL SELECT 'credentials', row_to_json(c)::text FROM public.employee_credentials c
      UNION ALL SELECT 'warehouses', row_to_json(w)::text FROM public.warehouses w
      UNION ALL SELECT 'brands', row_to_json(b)::text FROM public.brands b
      UNION ALL SELECT 'items', row_to_json(i)::text FROM public.inventory_items i) t`)
  const before = await snapshot()
  assert.match((await command('--seed-demo')).stdout, /0 accounts, 0 warehouses, 0 brands, 0 products/)
  assert.equal(await snapshot(), before)
  console.log('PASS: repeated import preserves all rows, credentials, edits, stock quantities and archives.')

  // Cause a late SKU collision after an earlier employee would have been recreated.
  await sql(`DELETE FROM public.employee_credentials WHERE employee_id = (SELECT id FROM public.employees WHERE employee_id = 'DEMO-0001');
    DELETE FROM public.employees WHERE employee_id = 'DEMO-0001';
    UPDATE public.inventory_items SET id = '00000000-0000-0000-0000-000000000002' WHERE sku = 'DEMO-NORTHLINE-001'`)
  const beforeFailure = await snapshot()
  await assert.rejects(command('--seed-demo'), error => error.code === 1 && /rolled back/.test(error.stderr))
  assert.equal(await snapshot(), beforeFailure)
  await assert.rejects(command('--seed-demo', { ...env, ASPNETCORE_ENVIRONMENT: 'Production' }), /Run database commands in Development/)
  assert.equal(await snapshot(), beforeFailure)
  console.log('PASS: conflicts roll back the entire seed; Production refuses the command.')
} finally {
  if (started) await control(['-D', data, '-m', 'immediate', '-w', 'stop'])
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()), 'Cleanup must stay in the OS temp directory')
  assert.ok(basename(scratch).startsWith('gstock-demo-seed-'), 'Cleanup must target this test cluster')
  await rm(scratch, { recursive: true, force: true })
}
