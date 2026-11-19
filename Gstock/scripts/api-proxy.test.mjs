import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { loadConfigFromFile } from 'vite'
import handler from '../api/[...path].js'

const originalFetch = globalThis.fetch
const originalTarget = process.env.API_PROXY_TARGET
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalTarget === undefined) delete process.env.API_PROXY_TARGET
  else process.env.API_PROXY_TARGET = originalTarget
})

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(body) { this.body = body },
  }
}

function request(options = {}) {
  return {
    method: 'GET',
    url: '/api/v1/items?limit=200&offset=0',
    headers: { host: 'gstock.vercel.app', 'sec-fetch-site': 'same-origin' },
    ...options,
  }
}

test('hosted proxy forwards authentication and JSON, translates a validated origin and preserves refresh cookies', async () => {
  process.env.API_PROXY_TARGET = 'https://gstock.onrender.com'
  const cookies = 'gstock_refresh=rotated; Path=/api/v1/auth; Secure; HttpOnly; SameSite=Strict'
  globalThis.fetch = async (url, options) => {
    assert.equal(url.href, 'https://gstock.onrender.com/api/v1/auth/refresh')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.get('Origin'), 'https://gstock.onrender.com')
    assert.equal(options.headers.get('Authorization'), 'Bearer access')
    assert.equal(options.headers.get('Cookie'), 'gstock_refresh=old')
    assert.equal(options.headers.get('X-CSRF-Token'), 'csrf')
    assert.equal(options.headers.get('X-Forwarded-Host'), null)
    assert.equal(options.redirect, 'manual')
    assert.equal(options.body, '{"quantity":5}')
    return new Response('{"accessToken":"next"}', {
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookies },
    })
  }
  const res = response()
  await handler(request({
    method: 'POST', url: '/api/v1/auth/refresh', body: { quantity: 5 },
    headers: {
      host: 'gstock.vercel.app', origin: 'https://gstock.vercel.app', 'sec-fetch-site': 'same-origin',
      authorization: 'Bearer access', cookie: 'gstock_refresh=old',
      'x-csrf-token': 'csrf', 'content-type': 'application/json', 'x-forwarded-host': 'untrusted.example',
    },
  }), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.headers['set-cookie'], [cookies])
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(JSON.parse(res.body).accessToken, 'next')
})

test('hosted proxy rejects foreign origins and cross-site metadata before sending credentials', async () => {
  process.env.API_PROXY_TARGET = 'https://gstock.onrender.com'
  globalThis.fetch = async () => { throw new Error('Must not call the backend') }
  for (const extra of [
    { origin: 'https://attacker.example' },
    { origin: 'https://gstock.vercel.app.attacker.example' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
  ]) {
    const res = response()
    const req = request()
    req.headers = { ...req.headers, ...extra }
    await handler(req, res)
    assert.equal(res.statusCode, 403)
  }
})

test('proxy preserves binary photos, query parameters, validation errors and no-content logout', async () => {
  process.env.API_PROXY_TARGET = 'https://gstock.onrender.com/'
  const photo = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  globalThis.fetch = async (url) => {
    assert.equal(url.search, '?limit=200&offset=0')
    return new Response(photo, { headers: { 'Content-Type': 'image/png' } })
  }
  const res = response()
  await handler(request(), res)
  assert.deepEqual(new Uint8Array(res.body), photo)
  assert.equal(res.headers['content-type'], 'image/png')
  for (const status of [401, 403, 409, 422, 429]) {
    globalThis.fetch = async () => new Response('{"detail":"API error"}', {
      status, headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '60' },
    })
    const problem = response()
    await handler(request(), problem)
    assert.equal(problem.statusCode, status)
    assert.equal(problem.headers['retry-after'], '60')
    assert.equal(JSON.parse(problem.body).detail, 'API error')
  }
  globalThis.fetch = async () => new Response(null, {
    status: 204, headers: { 'Set-Cookie': 'gstock_refresh=; Path=/api/v1/auth; Max-Age=0; Secure; HttpOnly' },
  })
  const logout = response()
  await handler(request({ method: 'POST', url: '/api/v1/auth/logout' }), logout)
  assert.equal(logout.statusCode, 204)
  assert.equal(logout.body.length, 0)
  assert.match(logout.headers['set-cookie'][0], /Max-Age=0/)
})

test('proxy reports missing configuration and unreachable backends, and limits forwarding to API routes', async () => {
  delete process.env.API_PROXY_TARGET
  let res = response()
  await handler(request(), res)
  assert.equal(res.statusCode, 503)
  for (const target of ['http://remote.example', 'https://user:password@remote.example', 'https://remote.example/path']) {
    process.env.API_PROXY_TARGET = target
    res = response()
    await handler(request(), res)
    assert.equal(res.statusCode, 503)
  }
  process.env.API_PROXY_TARGET = 'https://gstock.onrender.com'
  res = response()
  await handler(request({ url: '/other' }), res)
  assert.equal(res.statusCode, 404)
  globalThis.fetch = async () => { throw new Error('upstream unavailable') }
  res = response()
  await handler(request(), res)
  assert.equal(res.statusCode, 502)
  assert.match(JSON.parse(res.body).detail, /waking up/)
})

test('local Vite proxy targets Render for dev and preview and only translates its own browser origin', async () => {
  process.env.API_PROXY_TARGET = 'https://gstock.onrender.com'
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' })
  const proxy = loaded.config.server.proxy['/api/v1']
  assert.equal(proxy.target, 'https://gstock.onrender.com')
  assert.equal(proxy.changeOrigin, true)
  assert.equal(loaded.config.preview.proxy['/api/v1'].target, proxy.target)
  let onRequest
  proxy.configure({ on(event, callback) { assert.equal(event, 'proxyReq'); onRequest = callback } })
  const outgoing = { headers: {}, setHeader(name, value) { this.headers[name] = value } }
  onRequest(outgoing, { headers: { host: 'localhost:5173', origin: 'http://localhost:5173' } })
  assert.equal(outgoing.headers.Origin, 'https://gstock.onrender.com')
  const denied = { headers: {}, setHeader(name, value) { this.headers[name] = value } }
  onRequest(denied, { headers: { host: 'localhost:5173', origin: 'https://attacker.example' } })
  assert.deepEqual(denied.headers, {})
})
