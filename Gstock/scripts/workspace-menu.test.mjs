import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import React, { act } from 'react'
import { Window } from 'happy-dom'
import { createServer } from 'vite'

let server, browser, createRoot, Workspace, root, host
before(async () => {
  browser = new Window({ url: 'http://localhost/#inventory' })
  globalThis.window = browser
  globalThis.document = browser.document
  globalThis.Node = browser.Node
  globalThis.HTMLElement = browser.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  ;({ createRoot } = await import('react-dom/client'))
  server = await createServer({
    server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom',
    plugins: [{
      name: 'navigation-test-without-decorative-webgl', enforce: 'pre',
      transform(_code, id) {
        if (id.replaceAll('\\', '/').endsWith('/ReflectiveCard.tsx')) {
          return 'export default function Card({ children }) { return children }'
        }
      },
    }],
  })
  Workspace = (await server.ssrLoadModule('/src/components/Workspace.tsx')).default
})
afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  root = null
  host?.remove()
  await browser.happyDOM.abort()
})
after(async () => { await server?.close(); await browser?.happyDOM.close() })

for (const [accountRole, status, allowed] of [
  ['Nemployee', 'Active', false], ['StockManager', 'Active', false],
  ['StaffManager', 'Active', true], ['StaffManager', 'InActive', false],
]) {
  test(`opened Explore menu and direct employee links: ${accountRole}, ${status}`, async () => {
    window.history.replaceState(null, '', '#inventory')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    let historyLoads = 0
    const employee = { id: 'viewer', fullName: 'Test Viewer', employeeId: 'QA-1', email: 'viewer@example.test', role: accountRole, accountRole, status }
    const target = { ...employee, id: 'target', fullName: 'Other Employee', email: 'other@example.test', role: 'Nemployee', accountRole: 'Nemployee', status: 'Active' }
    await act(async () => {
      root.render(React.createElement(Workspace, {
        employee, accounts: [{ profile: target, editHistory: [] }],
        inventory: { version: 2, catalog: { warehouses: [], brands: [], items: [] }, activity: [] },
        onSaveEmployee: async () => null, onInventoryAction: async () => ({ ok: true }),
        onOpenEmployee: async () => { historyLoads++ }, active: true, onSignOut() {},
      }))
    })
    const explore = host.querySelector('button[aria-label="Explore"]')
    assert.ok(explore)
    await act(async () => { explore.dispatchEvent(new browser.MouseEvent('click', { bubbles: true })) })
    const menu = host.querySelector('nav[aria-label="Workspace pages"]')
    assert.ok(menu, 'Test the opened menu, not just the closed initial render')
    assert.equal(Boolean(menu.querySelector('a[href="#employees"]')), allowed)
    assert.equal(menu.textContent.includes('Employee accounts'), allowed)
    await act(async () => {
      window.history.replaceState(null, '', '#employees/target')
      window.dispatchEvent(new browser.HashChangeEvent('hashchange'))
    })
    assert.equal(Boolean(host.querySelector('.employee-accounts')), allowed)
    assert.equal(historyLoads, allowed ? 1 : 0)
    if (!allowed) {
      assert.ok(!host.textContent.includes('other@example.test'))
      assert.ok(host.querySelector('section[aria-label="Your employee profile"]'))
    }
  })
}
