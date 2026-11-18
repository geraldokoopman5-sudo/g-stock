import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server
let createApiClient
let ApiError
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  ;({ createApiClient, ApiError } = await server.ssrLoadModule('/src/api/client.ts'))
})
after(async () => { await server?.close() })

test('login submits real credentials and remember-me; protected requests use the in-memory token', async () => {
  const calls = []
  const client = createApiClient(async (url, options) => {
    calls.push({ url, options })
    return url.endsWith('/login') ? json({ accessToken: 'access-1', expiresIn: 900 }) : json([])
  })
  await client.login('staff@example.test', 'test-password', true)
  await client.request('/warehouses')
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'staff@example.test', password: 'test-password', rememberMe: true })
  assert.equal(calls[1].url, '/api/v1/warehouses')
  assert.equal(calls[1].options.headers.get('Authorization'), 'Bearer access-1')
  assert.equal(calls[1].options.credentials, 'same-origin')
})

test('concurrent unauthorized requests share one CSRF-protected refresh and retry their original bodies', async () => {
  let refreshes = 0
  let csrfCalls = 0
  let writes = 0
  const body = JSON.stringify({ quantity: 4, expectedQuantity: 10, mode: 'remove', reason: 'Issued' })
  const client = createApiClient(async (url, options) => {
    if (url.endsWith('/login')) return json({ accessToken: 'old', expiresIn: 900 })
    if (url.endsWith('/csrf')) { csrfCalls++; return json({ csrfToken: 'csrf-1' }) }
    if (url.endsWith('/refresh')) {
      refreshes++
      assert.equal(options.headers['X-CSRF-Token'], 'csrf-1')
      await new Promise((resolve) => setTimeout(resolve, 10))
      return json({ accessToken: 'new', expiresIn: 900 })
    }
    if (options.headers.get('Authorization') === 'Bearer old') return new Response(null, { status: 401 })
    assert.equal(options.headers.get('Authorization'), 'Bearer new')
    assert.equal(options.body, body)
    writes++
    return json({ id: url, quantity: 6 })
  })
  await client.login('employee@example.test', 'test-password', false)
  await Promise.all(['/items/one/adjustments', '/items/two/adjustments'].map((path) => client.request(path, { method: 'POST', body })))
  assert.equal(refreshes, 1)
  assert.equal(csrfCalls, 1)
  assert.equal(writes, 2)
})

test('expired refresh ends the session; authorization and validation errors never replay writes', async () => {
  let expired = 0
  let protectedCalls = 0
  const client = createApiClient(async (url) => {
    if (url.endsWith('/csrf')) return new Response(null, { status: 401 })
    protectedCalls++
    return new Response(null, { status: 401 })
  })
  client.onSessionExpired(() => expired++)
  await assert.rejects(client.request('/employees'), (error) => error instanceof ApiError && error.status === 401)
  assert.equal(expired, 1)
  assert.equal(protectedCalls, 1)

  for (const status of [403, 409, 422]) {
    let calls = 0
    const denied = createApiClient(async () => {
      calls++
      return json({ errors: { quantity: ['Stock changed. Reload the item.'] } }, status)
    })
    await assert.rejects(denied.request('/items/one/adjustments', { method: 'POST' }), /Stock changed/)
    assert.equal(calls, 1)
  }
})

test('network failures preserve the session and logout sends the current CSRF token before clearing access', async () => {
  let offline = false
  let loggedOut = false
  const client = createApiClient(async (url, options) => {
    if (url.endsWith('/login')) return json({ accessToken: 'token', expiresIn: 900 })
    if (url.endsWith('/csrf')) return json({ csrfToken: 'csrf-now' })
    if (url.endsWith('/logout')) {
      assert.equal(options.headers.get('X-CSRF-Token'), 'csrf-now')
      assert.equal(options.headers.get('Authorization'), 'Bearer token')
      loggedOut = true
      return new Response(null, { status: 204 })
    }
    if (offline) throw new TypeError('offline')
    assert.equal(options.headers.get('Authorization'), loggedOut ? null : 'Bearer token')
    return json([])
  })
  await client.login('employee@example.test', 'test-password', false)
  offline = true
  await assert.rejects(client.request('/items'), /Could not connect/)
  offline = false
  await client.request('/items')
  await client.logout()
  await client.request('/items')
})

test('restore reports no session separately from an unavailable server', async () => {
  assert.equal(await createApiClient(async () => new Response(null, { status: 401 })).restore(), false)
  await assert.rejects(createApiClient(async () => { throw new Error('offline') }).restore(), /Could not connect/)
})
