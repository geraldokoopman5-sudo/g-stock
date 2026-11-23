import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import React, { act } from 'react'
import { Window } from 'happy-dom'
import { createServer } from 'vite'

let server, browser, createRoot, root, host
const originalFetch = globalThis.fetch
const originalFormData = globalThis.FormData
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const profile = { id: 'viewer', employeeId: 'QA-1', fullName: 'Test Employee', email: 'employee@example.test', role: 'Nemployee', accountRole: 'Nemployee', status: 'Active' }
const catalog = {
  warehouses: [{ id: 'warehouse/one', name: 'Test Warehouse' }],
  brands: [{ id: 'brand/one', warehouseId: 'warehouse/one', name: 'Test Brand', description: '' }],
  items: [{ id: 'item/one', brandId: 'brand/one', name: 'Test Item', quantity: 0, reorderLevel: 0, location: 'A-1', unit: 'units' }],
}
before(async () => {
  browser = new Window({ url: 'http://localhost/' })
  globalThis.window = browser
  globalThis.document = browser.document
  globalThis.Node = browser.Node
  globalThis.HTMLElement = browser.HTMLElement
  globalThis.FormData = browser.FormData
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  ;({ createRoot } = await import('react-dom/client'))
  server = await createServer({
    server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom',
    plugins: [{
      name: 'session-tests-without-decorative-webgl', enforce: 'pre',
      transform(_code, id) {
        if (id.replaceAll('\\', '/').endsWith('/ReflectiveCard.tsx')) return 'export default function Card({ children }) { return children }'
        if (id.replaceAll('\\', '/').endsWith('/LoginTransition.tsx')) return 'import React from "react"; export default function Transition({ onComplete }) { return React.createElement("button", { onClick: onComplete }, "Finish transition") }'
      },
    }],
  })
})
async function unmount() {
  if (root) await act(async () => { root.unmount() })
  root = null
  host?.remove()
  await browser.happyDOM.abort()
}
afterEach(async () => { await unmount(); globalThis.fetch = originalFetch; window.sessionStorage.clear() })
after(async () => { globalThis.FormData = originalFormData; await server?.close(); await browser?.happyDOM.close() })

function backend({ csrf, inventory, refresh } = {}) {
  let rotations = 0
  return async (url, options = {}) => {
    assert.equal(options.credentials, 'same-origin')
    if (url.endsWith('/auth/csrf')) return csrf ? csrf() : json({ csrfToken: 'cookie-csrf' })
    if (url.endsWith('/auth/refresh')) {
      assert.equal(options.headers['X-CSRF-Token'], 'cookie-csrf')
      if (refresh) return refresh()
      return json({ accessToken: `restored-${++rotations}`, expiresIn: 900 })
    }
    if (url.endsWith('/auth/login')) return json({ accessToken: 'signed-in', expiresIn: 900 })
    if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 })
    assert.match(options.headers.get('Authorization'), /^Bearer (restored-\d+|signed-in)$/)
    if (url.endsWith('/auth/me')) return json({ profile, permissions: { canCreateWarehouse: true, canManageItems: true, canManageBrands: false, canManageEmployees: false } })
    if (url.endsWith('/warehouses')) return inventory ? inventory() : json(catalog.warehouses)
    if (url.includes('/brands?')) return json(catalog.brands)
    if (url.includes('/items?')) return json(catalog.items)
    if (url.includes('/inventory/activity?')) return json([])
    throw new Error(`Unexpected request: ${url}`)
  }
}
async function mount(hash = '#inventory/brand%2Fone/item%2Fone') {
  window.history.replaceState(null, '', hash)
  // A reload creates a new JS runtime: invalidate the app/client modules so no access token survives.
  server.moduleGraph.invalidateAll()
  const App = (await server.ssrLoadModule('/src/App.tsx')).default
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(App))) })
}
const click = async button => { assert.ok(button); await act(async () => { button.click() }) }

test('reload waits for the saved session without displaying the login form, then restores the exact item URL', async () => {
  let resolveRefresh, refreshes = 0
  globalThis.fetch = backend({ refresh: () => { refreshes++; return new Promise(resolve => { resolveRefresh = resolve }) } })
  const hash = '#inventory/brand%2Fone/item%2Fone'
  await mount(hash)
  try {
    assert.equal(host.querySelector('#email'), null, 'Do not flash the sign-in form while the session is still being checked')
    assert.ok(host.textContent.includes('Restoring your workspace'))
    assert.equal(window.location.hash, hash)
  } finally {
    // Release the shared refresh lock even if a regression makes an assertion fail.
    await act(async () => { resolveRefresh(json({ accessToken: 'restored-1', expiresIn: 900 })) })
  }
  assert.equal(refreshes, 1, 'Strict Mode must share a single cookie rotation')
  assert.equal(host.querySelector('#email'), null)
  assert.ok(host.querySelector('#selected-item-heading').textContent.includes('Test Item'))
  assert.equal(window.location.hash, hash)
})

test('a temporary workspace failure offers retry without requiring another password or changing page', async () => {
  let unavailable = true, loginRequests = 0
  const fetcher = backend({ inventory: () => unavailable ? json({ detail: 'Backend waking up.' }, 503) : json(catalog.warehouses) })
  globalThis.fetch = (url, options) => { if (url.endsWith('/auth/login')) loginRequests++; return fetcher(url, options) }
  const hash = '#warehouses/warehouse%2Fone'
  await mount(hash)
  assert.equal(host.querySelector('#email'), null)
  assert.ok(host.querySelector('[role="alert"]').textContent.includes('Backend waking up.'))
  assert.equal(window.location.hash, hash)
  unavailable = false
  await click([...host.querySelectorAll('button')].find(button => button.textContent === 'Try again'))
  assert.equal(loginRequests, 0)
  assert.ok(host.querySelector('#warehouses-heading').textContent.includes('Test Warehouse'))
  assert.equal(window.location.hash, hash)
})

test('an unavailable session server is retryable, while a confirmed missing session shows login', async () => {
  let state = 'offline'
  globalThis.fetch = backend({ csrf: () => {
    if (state === 'offline') throw new TypeError('offline')
    return new Response(null, { status: 401 })
  } })
  await mount('#inventory')
  assert.equal(host.querySelector('#email'), null)
  assert.ok(host.querySelector('[role="alert"]').textContent.includes('Could not connect'))
  state = 'expired'
  await click([...host.querySelectorAll('button')].find(button => button.textContent === 'Try again'))
  assert.ok(host.querySelector('#email'))
  assert.equal(window.location.hash, '#inventory')
})

test('successful cookie restoration survives repeated full app reloads on the same page', async () => {
  globalThis.fetch = backend()
  const hash = '#warehouses/warehouse%2Fone'
  for (let reload = 0; reload < 3; reload++) {
    await mount(hash)
    assert.equal(host.querySelector('#email'), null)
    assert.ok(host.querySelector('#warehouses-heading').textContent.includes('Test Warehouse'))
    assert.equal(window.location.hash, hash)
    await unmount()
  }
})

test('signing in after a genuinely expired session resumes the requested page', async () => {
  globalThis.fetch = backend({ csrf: () => new Response(null, { status: 401 }) })
  const hash = '#inventory/brand%2Fone/item%2Fone'
  await mount(hash)
  host.querySelector('#email').value = profile.email
  host.querySelector('#password').value = 'test-password'
  await act(async () => { host.querySelector('form').dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true })) })
  assert.equal(window.location.hash, hash)
  await click([...host.querySelectorAll('button')].find(button => button.textContent === 'Finish transition'))
  assert.ok(host.querySelector('#selected-item-heading').textContent.includes('Test Item'))
})

test('reloading a loaded item page shows it immediately while reconnecting, with no replacement screen', async () => {
  const hash = '#inventory/brand%2Fone/item%2Fone'
  globalThis.fetch = backend()
  await mount(hash)
  assert.ok(host.querySelector('#selected-item-heading'))
  await unmount()
  let resolveRefresh
  const reconnect = backend({ refresh: () => new Promise(resolve => { resolveRefresh = resolve }) })
  globalThis.fetch = (url, options) => url.includes('/items?') ? Promise.resolve(json([{ ...catalog.items[0], quantity: 7 }])) : reconnect(url, options)
  await mount(hash)
  try {
    assert.equal(host.querySelector('#email'), null)
    assert.equal(host.querySelector('.session-page'), null)
    assert.ok(host.querySelector('#selected-item-heading').textContent.includes('Test Item'))
    assert.ok(host.querySelector('.inventory__selected-item').textContent.includes('0 units'))
    assert.equal(window.location.hash, hash)
    assert.ok(host.querySelector('.workspace').hasAttribute('inert'), 'Cached controls must wait for the real session check')
    assert.equal(host.querySelector('.workspace').getAttribute('aria-busy'), 'true')
    assert.ok(host.textContent.includes('Reconnecting'))
  } finally {
    await act(async () => { resolveRefresh(json({ accessToken: 'restored-1', expiresIn: 900 })) })
  }
  assert.equal(host.querySelector('.workspace').hasAttribute('inert'), false)
  assert.ok(host.querySelector('#selected-item-heading').textContent.includes('Test Item'))
  assert.ok(host.querySelector('.inventory__selected-item').textContent.includes('7 units'), 'Fresh server stock replaces the saved view')
  assert.equal(host.querySelector('.workspace-reconnecting'), null)
})

test('a temporary reconnect error leaves the warehouse page visible and can retry in place', async () => {
  const hash = '#warehouses/warehouse%2Fone'
  globalThis.fetch = backend()
  await mount(hash)
  await unmount()
  let offline = true
  globalThis.fetch = backend({ csrf: () => {
    if (offline) throw new TypeError('offline')
    return json({ csrfToken: 'cookie-csrf' })
  } })
  await mount(hash)
  assert.equal(host.querySelector('.session-page'), null)
  assert.equal(host.querySelector('#email'), null)
  assert.ok(host.querySelector('#warehouses-heading').textContent.includes('Test Warehouse'))
  assert.ok(host.querySelector('[role="alert"]').textContent.includes('Could not connect'))
  assert.ok(host.querySelector('.workspace').hasAttribute('inert'))
  offline = false
  await click([...host.querySelectorAll('button')].find(button => button.textContent === 'Try again'))
  assert.ok(host.querySelector('#warehouses-heading').textContent.includes('Test Warehouse'))
  assert.equal(host.querySelector('.workspace').hasAttribute('inert'), false)
  assert.equal(window.location.hash, hash)
})

test('a cached page is removed if the server confirms that the session has expired', async () => {
  globalThis.fetch = backend()
  await mount()
  await unmount()
  assert.ok(window.sessionStorage.getItem('g-stock.workspace-preview.v1'))
  globalThis.fetch = backend({ csrf: () => new Response(null, { status: 401 }) })
  await mount()
  assert.ok(host.querySelector('#email'))
  assert.equal(host.querySelector('.workspace'), null)
  assert.equal(window.sessionStorage.getItem('g-stock.workspace-preview.v1'), null)
})

test('logout removes the saved page before another reload', async () => {
  globalThis.fetch = backend()
  await mount()
  await click(host.querySelector('button[aria-label^="Explore"]'))
  await click(host.querySelector('.workspace-navigation__signout'))
  assert.equal(window.sessionStorage.getItem('g-stock.workspace-preview.v1'), null)
  assert.equal(window.location.hash, '')
})
