import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, inventory, StockAlerts, Inventory, Workspace, loadInventoryCatalog
const originalFetch = globalThis.fetch

before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  inventory = await server.ssrLoadModule('/src/data/inventory.ts')
  StockAlerts = (await server.ssrLoadModule('/src/components/StockAlerts.tsx')).default
  Inventory = (await server.ssrLoadModule('/src/components/Inventory.tsx')).default
  Workspace = (await server.ssrLoadModule('/src/components/Workspace.tsx')).default
  ;({ loadInventoryCatalog } = await server.ssrLoadModule('/src/api/workspace.ts'))
})
after(async () => { await server?.close() })
afterEach(() => { globalThis.fetch = originalFetch })

function catalog(quantity = 4, reorderLevel = 5) {
  return {
    warehouses: [{ id: 'warehouse/one', name: 'Test Warehouse' }],
    brands: [{ id: 'brand/one', warehouseId: 'warehouse/one', name: 'Test Brand', initials: 'TB', description: '' }],
    items: [{ id: 'item/one', brandId: 'brand/one', sku: 'GST-TEST', name: 'Test Item', quantity, reorderLevel, location: 'A-12-03', unit: 'boxes' }],
  }
}
const renderAlerts = (source) => renderToStaticMarkup(React.createElement(StockAlerts, {
  alerts: inventory.getStockAlerts(source), onOpenItem() {},
}))

test('alerts survive reading, reopening, and partial restocks until strictly above the threshold', () => {
  let source = catalog()
  const original = JSON.stringify(source)
  assert.equal(inventory.getStockAlerts(source).length, 1)
  assert.equal(renderAlerts(source), renderAlerts(JSON.parse(original)))
  assert.equal(JSON.stringify(source), original)
  for (const quantity of [0, 1, 4, 5]) {
    source = catalog(quantity)
    assert.equal(inventory.getStockAlerts(source).length, 1, `quantity ${quantity} must keep the alert`)
    assert.ok(renderAlerts(JSON.parse(JSON.stringify(source))).includes('Test Item'))
  }
  assert.equal(inventory.getStockAlerts(catalog(6)).length, 0)
  assert.equal(inventory.getStockAlerts(catalog(0, 0)).length, 1)
  assert.equal(inventory.getStockAlerts(catalog(1, 0)).length, 0)
})

test('alerts put out-of-stock items first and identify duplicate names by their exact warehouse and location', () => {
  const source = catalog()
  source.warehouses.push({ id: 'two', name: 'Second Warehouse' })
  source.brands.push({ id: 'two', warehouseId: 'two', name: 'Second Brand', initials: 'SB', description: '' })
  source.items.push({ ...source.items[0], id: 'two', brandId: 'two', quantity: 0, location: 'Z-99' })
  source.items.push({ ...source.items[0], id: 'healthy', quantity: 10, name: 'Healthy Item' })
  assert.deepEqual(inventory.getStockAlerts(source).map(({ item }) => item.id), ['two', 'item/one'])
  const markup = renderAlerts(source)
  for (const text of ['Test Warehouse', 'Second Warehouse', 'Test Brand', 'Second Brand', 'A-12-03', 'Z-99', 'GST-TEST', 'Threshold: 5', 'Out of stock']) assert.ok(markup.includes(text), text)
  assert.ok(markup.includes('#inventory/brand%2Fone/item%2Fone'))
  assert.ok(!markup.includes('Healthy Item'))
  assert.ok(!markup.includes('<button'))
})

test('empty and replenished catalogs show no alerts, and Explore exposes the full alert count accessibly', () => {
  assert.ok(renderAlerts(catalog(6)).includes('No stock alerts.'))
  assert.ok(renderAlerts({ warehouses: [], brands: [], items: [] }).includes('No stock alerts.'))
  const source = catalog()
  const renderWorkspace = (source) => renderToStaticMarkup(React.createElement(Workspace, {
    employee: { id: 'viewer', employeeId: 'QA-1', fullName: 'Test Viewer', email: 'test@example.test', role: 'Nemployee', accountRole: 'Nemployee', status: 'Active' },
    accounts: [], inventory: { version: 2, catalog: source, activity: [] }, active: true,
    onInventoryAction: async () => ({ ok: false, error: 'Test only' }), onSaveEmployee: async () => null, onSignOut() {},
  }))
  assert.ok(renderWorkspace(source).includes('aria-label="Explore, 1 stock alert"'))
  assert.ok(renderWorkspace(source).includes('1 stock item needs attention.'))
  assert.ok(!renderWorkspace(catalog(6)).includes('workspace-navigation__alert-count'))
})

test('an alert opens the exact item even beyond the first table page, with the location and replenishment action', () => {
  const source = catalog()
  source.items = Array.from({ length: 25 }, (_, index) => ({ ...source.items[0], id: `item-${index}`, name: `Item ${String(index).padStart(2, '0')}` }))
  const selected = source.items[24]
  const render = (selectedItemId, canManageItems = true) => renderToStaticMarkup(React.createElement(Inventory, {
    selectedBrandId: encodeURIComponent('brand/one'), selectedItemId, catalog: source,
    onAction: async () => ({ ok: false, error: 'Test only' }),
    permissions: { canCreateWarehouse: false, canManageBrands: false, canManageItems, canManageEmployees: false },
  }))
  const markup = render(selected.id)
  const card = markup.match(/<section class="inventory__selected-item"[\s\S]*?<\/section>/)?.[0] ?? ''
  for (const text of [selected.name, 'Test Warehouse', 'A-12-03', '4 boxes', '5 boxes', 'Add stock above 5 boxes', 'Update quantity']) assert.ok(card.includes(text), text)
  assert.ok(!render(selected.id, false).match(/<section class="inventory__selected-item"[\s\S]*?<\/section>/)?.[0].includes('<button'))
  assert.ok(render('archived-item').includes('This stock item is no longer available.'))
})

test('alert refresh loads every catalog page without reloading activity history', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url)
    let body
    if (url === '/api/v1/warehouses') body = catalog().warehouses
    else if (url.startsWith('/api/v1/brands?')) body = url.includes('offset=0') ? Array.from({ length: 200 }, (_, index) => ({ ...catalog().brands[0], id: `brand-${index}` })) : []
    else if (url.startsWith('/api/v1/items?')) body = url.includes('offset=0') ? Array.from({ length: 200 }, (_, index) => ({ ...catalog().items[0], id: `item-${index}` })) : [{ ...catalog().items[0], id: 'last-item' }]
    else throw new Error(`Unexpected request ${url}`)
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const source = await loadInventoryCatalog()
  assert.equal(source.items.length, 201)
  assert.equal(source.brands.length, 200)
  assert.equal(source.brands[0].initials, 'TB')
  assert.ok(calls.some((url) => url.includes('/items?limit=200&offset=200')))
  assert.ok(!calls.some((url) => url.includes('/inventory/activity')))
})
