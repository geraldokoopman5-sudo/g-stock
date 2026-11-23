import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Window } from 'happy-dom'
import { createServer } from 'vite'

let server, browser, createRoot, root, host, Inventory, Warehouses, InventoryDeleteButton, workspace
const originalFetch = globalThis.fetch
const permissions = role => ({ canCreateWarehouse: true, canManageBrands: role === 'StockManager', canManageItems: role === 'Nemployee', canManageEmployees: role === 'StaffManager' })
const catalog = (quantity = 0) => ({
  warehouses: [{ id: 'warehouse', name: 'Test Warehouse' }],
  brands: [{ id: 'brand', warehouseId: 'warehouse', name: 'Test Brand', initials: 'TB', description: '' }],
  items: [{ id: 'item', brandId: 'brand', name: 'Test Item', quantity, reorderLevel: 0, location: 'A-1', unit: 'units' }],
})
const onAction = async () => ({ ok: true, entityId: 'item' })

before(async () => {
  browser = new Window({ url: 'http://localhost/#inventory/brand' })
  globalThis.window = browser
  globalThis.document = browser.document
  globalThis.Node = browser.Node
  globalThis.HTMLElement = browser.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  ;({ createRoot } = await import('react-dom/client'))
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  Inventory = (await server.ssrLoadModule('/src/components/Inventory.tsx')).default
  Warehouses = (await server.ssrLoadModule('/src/components/Warehouses.tsx')).default
  InventoryDeleteButton = (await server.ssrLoadModule('/src/components/InventoryDeleteButton.tsx')).default
  workspace = await server.ssrLoadModule('/src/api/workspace.ts')
})
afterEach(async () => {
  globalThis.fetch = originalFetch
  if (root) await act(async () => { root.unmount() })
  root = null
  host?.remove()
  await browser.happyDOM.abort()
})
after(async () => { await server?.close(); await browser?.happyDOM.close() })

test('only normal employees see item deletion, enabled only when stock reaches zero', () => {
  for (const role of ['Nemployee', 'StockManager', 'StaffManager']) {
    for (const quantity of [0, 1]) {
      const markup = renderToStaticMarkup(React.createElement(Inventory, {
        catalog: catalog(quantity), selectedBrandId: 'brand', selectedItemId: 'item', onAction, permissions: permissions(role),
      }))
      const element = document.createElement('div')
      element.innerHTML = markup
      const controls = [...element.querySelectorAll('button')].filter(button => button.textContent === 'Delete item')
      assert.equal(controls.length, role === 'Nemployee' ? 2 : 0, 'Both the item detail and item row expose the action')
      for (const button of controls) {
        assert.equal(button.disabled, quantity !== 0)
        if (quantity !== 0) assert.ok(element.querySelector(`[id="${button.getAttribute('aria-describedby')}"]`).textContent.includes('zero'))
      }
    }
  }
})

test('only stock managers see brand and warehouse deletion, checking all items including off-page stock', () => {
  for (const role of ['Nemployee', 'StockManager', 'StaffManager']) {
    for (const quantity of [0, 1]) {
      const source = catalog()
      source.items = Array.from({ length: 25 }, (_, index) => ({ ...source.items[0], id: `item-${index}`, name: `Item ${index}`, quantity: index === 24 ? quantity : 0 }))
      for (const [Component, props, label] of [
        [Inventory, { selectedBrandId: 'brand' }, 'Delete brand'],
        [Warehouses, { selectedId: 'warehouse', activity: [] }, 'Delete warehouse'],
      ]) {
        const element = document.createElement('div')
        element.innerHTML = renderToStaticMarkup(React.createElement(Component, { catalog: source, onAction, permissions: permissions(role), ...props }))
        const button = [...element.querySelectorAll('button')].find(button => button.textContent === label)
        assert.equal(Boolean(button), role === 'StockManager')
        if (button) assert.equal(button.disabled, quantity !== 0)
      }
    }
  }
  const source = catalog()
  source.items = []
  assert.ok(renderToStaticMarkup(React.createElement(Inventory, { catalog: source, selectedBrandId: 'brand', onAction, permissions: permissions('StockManager') })).includes('Delete brand'))
})

test('DELETE requests encode record IDs and handle 204 without expecting an entity body', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method })
    return new Response(null, { status: 204 })
  }
  for (const [type, field, path] of [['delete-item', 'itemId', 'items'], ['delete-brand', 'brandId', 'brands'], ['delete-warehouse', 'warehouseId', 'warehouses']]) {
    assert.deepEqual(await workspace.saveInventory({ type, [field]: 'record/id' }), { id: 'record/id' })
    assert.deepEqual(calls.at(-1), { url: `/api/v1/${path}/record%2Fid`, method: 'DELETE' })
  }
})

async function mountDelete(overrides = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => { root.render(React.createElement(InventoryDeleteButton, {
    action: { type: 'delete-item', itemId: 'item' }, name: 'Test Item', onSave: onAction, onDeleted() {}, ...overrides,
  })) })
  return host.querySelector('button')
}
const click = async button => { await act(async () => { button.click() }) }
const submit = async () => { await act(async () => { host.querySelector('form').dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true })) }) }

test('delete requires confirmation, cancel restores focus, and the confirmation describes cascading deletion', async () => {
  let saves = 0
  const trigger = await mountDelete({ action: { type: 'delete-warehouse', warehouseId: 'warehouse' }, name: 'Test Warehouse', onSave: async () => { saves++; return { ok: true, entityId: 'warehouse' } } })
  await click(trigger)
  assert.equal(saves, 0)
  assert.ok(host.querySelector('dialog').open)
  assert.ok(host.querySelector('dialog').textContent.includes('all its brands, and all its zero-stock items'))
  const cancel = [...host.querySelectorAll('button')].find(button => button.textContent === 'Cancel')
  assert.equal(document.activeElement, cancel)
  await click(cancel)
  assert.equal(host.querySelector('dialog'), null)
  assert.equal(document.activeElement, trigger)
  assert.equal(saves, 0)
})

test('pending deletion prevents duplicate submits and cancellation, then navigates only after success', async () => {
  let resolveSave, saves = 0, completed = 0
  const trigger = await mountDelete({
    onSave: action => { assert.deepEqual(action, { type: 'delete-item', itemId: 'item' }); saves++; return new Promise(resolve => { resolveSave = resolve }) },
    onDeleted: () => { completed++ },
  })
  await click(trigger)
  await submit()
  await submit()
  assert.equal(saves, 1)
  assert.equal(completed, 0)
  assert.ok(host.querySelector('button[type="submit"]').disabled)
  await act(async () => { host.querySelector('dialog').dispatchEvent(new browser.Event('cancel', { cancelable: true })) })
  assert.ok(host.querySelector('dialog').open)
  await act(async () => { resolveSave({ ok: true, entityId: 'item' }) })
  assert.equal(completed, 1)
  assert.equal(host.querySelector('dialog'), null)
})

test('stock conflicts keep the confirmation open with the server error and allow a safe retry', async () => {
  let saves = 0, completed = 0
  const trigger = await mountDelete({
    onSave: async () => ++saves === 1 ? { ok: false, error: 'Only items with zero stock can be deleted.' } : { ok: true, entityId: 'item' },
    onDeleted: () => { completed++ },
  })
  await click(trigger)
  await submit()
  assert.ok(host.querySelector('[role="alert"]').textContent.includes('zero stock'))
  assert.equal(completed, 0)
  assert.equal(host.querySelector('button[type="submit"]').disabled, false)
  await submit()
  assert.equal(saves, 2)
  assert.equal(completed, 1)
})
