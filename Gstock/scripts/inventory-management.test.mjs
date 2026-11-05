import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
let store
let inventory
let Warehouses
let Inventory
let InventoryActivity
let Workspace
let employees
const actor = { id: 'employee-test', employeeId: 'GST-TEST', fullName: 'Warehouse Employee', role: 'Stock controller' }

before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  store = await server.ssrLoadModule('/src/data/inventoryStore.ts')
  inventory = await server.ssrLoadModule('/src/data/inventory.ts')
  Warehouses = (await server.ssrLoadModule('/src/components/Warehouses.tsx')).default
  Inventory = (await server.ssrLoadModule('/src/components/Inventory.tsx')).default
  InventoryActivity = (await server.ssrLoadModule('/src/components/InventoryActivity.tsx')).default
  Workspace = (await server.ssrLoadModule('/src/components/Workspace.tsx')).default
  employees = (await server.ssrLoadModule('/src/data/employees.ts')).demoEmployees
})
after(async () => { await server?.close() })
afterEach(() => { delete globalThis.window })

function addWarehouse(state, name = 'New Stock Owner') {
  return store.applyInventoryAction(state, actor, { type: 'add-warehouse', input: { name, contactName: 'Alex Example', contactEmail: 'alex@example.com', notes: 'Warehouse client' } })
}

function createStock() {
  const warehouse = addWarehouse(store.createInventoryState())
  const brand = store.applyInventoryAction(warehouse.state, actor, { type: 'add-brand', input: { warehouseId: warehouse.entityId, name: 'New Brand', description: 'New warehouse goods' } })
  const item = store.applyInventoryAction(brand.state, actor, { type: 'add-item', input: { brandId: brand.entityId, sku: 'NEW-001', name: 'New stock item', category: 'Storage', location: 'D-01-01', quantity: 10, reorderLevel: 5, unit: 'units' } })
  assert.equal(warehouse.ok, true)
  assert.equal(brand.ok, true)
  assert.equal(item.ok, true)
  return { state: item.state, warehouseId: warehouse.entityId, brandId: brand.entityId, itemId: item.entityId }
}

test('any employee can add a warehouse, brand, and item without changing the sample catalog', () => {
  const original = JSON.stringify(inventory.sampleInventory)
  const { state, warehouseId, brandId, itemId } = createStock()
  assert.equal(state.catalog.warehouses.find((warehouse) => warehouse.id === warehouseId).contactEmail, 'alex@example.com')
  assert.equal(state.catalog.brands.find((brand) => brand.id === brandId).warehouseId, warehouseId)
  assert.equal(state.catalog.items.find((item) => item.id === itemId).quantity, 10)
  assert.equal(state.activity.length, 3)
  assert.equal(state.activity[2].actor.fullName, actor.fullName)
  assert.equal(JSON.stringify(inventory.sampleInventory), original)
})

test('warehouse names are unique and brand names and SKUs are unique within their warehouse', () => {
  const state = store.createInventoryState()
  const duplicate = addWarehouse(state, '  HARBOUR   WAREHOUSE  ')
  assert.equal(duplicate.ok, false)
  assert.match(duplicate.error, /already exists/)
  assert.equal(store.applyInventoryAction(state, actor, { type: 'add-brand', input: { warehouseId: 'harbour', name: 'NORTHLINE', description: '' } }).ok, false)
  assert.equal(store.applyInventoryAction(state, actor, { type: 'add-brand', input: { warehouseId: 'cedar', name: 'Northline', description: '' } }).ok, true)
  const originalItem = state.catalog.items[0]
  assert.equal(store.applyInventoryAction(state, actor, { type: 'add-item', input: { ...originalItem, brandId: 'packwell' } }).ok, false)
  assert.equal(store.applyInventoryAction(state, actor, { type: 'add-item', input: { ...originalItem, brandId: 'forge' } }).ok, true)
})

test('unknown owners, invalid item fields, and invalid quantities never create records', () => {
  const state = store.createInventoryState()
  assert.equal(store.applyInventoryAction(state, actor, { type: 'add-brand', input: { warehouseId: 'missing', name: 'Brand', description: '' } }).ok, false)
  for (const patch of [{ brandId: 'missing' }, { sku: '' }, { location: ' ' }, { unit: 'invalid' }, { quantity: -1 }, { quantity: .5 }, { reorderLevel: NaN }]) {
    const result = store.applyInventoryAction(state, actor, { type: 'add-item', input: { ...state.catalog.items[0], sku: 'UNIQUE-SKU', ...patch } })
    assert.equal(result.ok, false)
  }
  assert.equal(store.applyInventoryAction(state, actor, { type: 'add-warehouse', input: { name: 'Example', contactEmail: 'invalid' } }).ok, false)
  assert.equal(store.applyInventoryAction(state, { ...actor, id: '' }, { type: 'add-warehouse', input: { name: 'Example' } }).ok, false)
  assert.equal(state.activity.length, 0)
})

test('adding, removing, and setting stock updates the live counts and employee history', () => {
  const { state, itemId, brandId } = createStock()
  const update = (current, mode, quantity, expectedQuantity) => store.applyInventoryAction(current, actor, { type: 'adjust-quantity', itemId, mode, quantity, expectedQuantity, reason: 'Warehouse test movement' })
  const received = update(state, 'add', 5, 10)
  assert.equal(received.ok, true)
  assert.equal(received.state.catalog.items.find((item) => item.id === itemId).quantity, 15)
  assert.equal(state.catalog.items.find((item) => item.id === itemId).quantity, 10)
  const issued = update(received.state, 'remove', 12, 15)
  assert.equal(issued.ok, true)
  assert.equal(inventory.getStockStatus(issued.state.catalog.items.find((item) => item.id === itemId)), 'low-stock')
  const recounted = update(issued.state, 'set', 0, 3)
  assert.equal(recounted.ok, true)
  const group = inventory.getBrandGroups(recounted.state.catalog).find(({ brand }) => brand.id === brandId)
  assert.equal(group.needsAttention, 1)
  assert.equal(inventory.getStockStatus(group.items[0]), 'out-of-stock')
  const last = recounted.state.activity.at(-1)
  assert.equal(last.previousQuantity, 3)
  assert.equal(last.quantity, 0)
  assert.equal(last.actor.id, actor.id)
  assert.equal(last.reason, 'Warehouse test movement')
})

test('negative stock, overflows, stale counts, missing reasons, and no-op updates are rejected', () => {
  const { state, itemId } = createStock()
  const action = { type: 'adjust-quantity', itemId, mode: 'add', quantity: 1, expectedQuantity: 10, reason: 'Stock received' }
  for (const patch of [{ mode: 'remove', quantity: 11 }, { quantity: store.maxStockQuantity }, { expectedQuantity: 8 }, { reason: ' ' }, { quantity: 0 }, { quantity: 1.5 }, { mode: 'unknown' }, { itemId: 'missing' }]) {
    const result = store.applyInventoryAction(state, actor, { ...action, ...patch })
    assert.equal(result.ok, false)
  }
  assert.equal(state.catalog.items.find((item) => item.id === itemId).quantity, 10)
})

test('warehouses, brands, items, quantities, and history survive local browser persistence', () => {
  const created = createStock()
  const changed = store.applyInventoryAction(created.state, actor, { type: 'adjust-quantity', itemId: created.itemId, mode: 'remove', quantity: 3, expectedQuantity: 10, reason: 'Stock issued' })
  assert.equal(changed.ok, true)
  const state = changed.state
  let saved
  store.persistInventoryState(state, { setItem(key, value) { assert.equal(key, store.inventoryStorageKey); saved = value } })
  globalThis.window = { localStorage: { getItem: () => saved } }
  assert.deepEqual(store.loadInventoryState(), state)
  assert.equal(store.loadInventoryState().catalog.items.find((item) => item.id === created.itemId).quantity, 7)
  assert.ok(!saved.includes('password'))
  assert.throws(() => store.persistInventoryState(state, { setItem() { throw new Error('Storage full') } }), /Storage full/)
})

test('invalid saved references or stock counts fall back to a valid sample catalog', () => {
  for (const mutate of [
    (state) => { state.catalog.brands[0].warehouseId = 'missing' },
    (state) => { state.catalog.items[0].quantity = -1 },
    (state) => { state.catalog.items[0].sku = state.catalog.items[1].sku },
  ]) {
    const state = store.createInventoryState()
    mutate(state)
    globalThis.window = { localStorage: { getItem: () => JSON.stringify(state) } }
    assert.deepEqual(store.loadInventoryState(), store.createInventoryState())
  }
})

test('existing company records migrate to warehouses without losing stock or edit history', () => {
  const { state } = createStock()
  const legacy = {
    version: 1,
    catalog: {
      companies: state.catalog.warehouses,
      brands: state.catalog.brands.map(({ warehouseId, ...brand }) => ({ ...brand, companyId: warehouseId })),
      items: state.catalog.items,
    },
    activity: state.activity.map(({ warehouseId, type, ...event }) => ({ ...event, companyId: warehouseId, type: type === 'warehouse-created' ? 'company-created' : type })),
  }
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(legacy) } }
  const migrated = store.loadInventoryState()
  assert.deepEqual(migrated, state)
  assert.equal(migrated.version, 2)
  assert.equal(Object.hasOwn(migrated.catalog, 'companies'), false)
  assert.ok(migrated.catalog.brands.every((brand) => !Object.hasOwn(brand, 'companyId')))
  assert.equal(migrated.activity[0].type, 'warehouse-created')
  let saved
  store.persistInventoryState(migrated, { setItem(_key, value) { saved = value } })
  globalThis.window = { localStorage: { getItem: () => saved } }
  assert.deepEqual(store.loadInventoryState(), state)
})

test('warehouse pages expose ownership, brands and stock links; inventory offers stock updates', () => {
  const { state, warehouseId, brandId } = createStock()
  const onAction = () => ({ ok: false, error: 'Test only' })
  const listing = renderToStaticMarkup(React.createElement(Warehouses, { catalog: state.catalog, activity: state.activity, onAction }))
  assert.ok(listing.includes('Add warehouse'))
  assert.ok(listing.includes(`#warehouses/${warehouseId}`))
  const detail = renderToStaticMarkup(React.createElement(Warehouses, { catalog: state.catalog, activity: state.activity, onAction, selectedId: warehouseId }))
  assert.ok(detail.includes('alex@example.com'))
  assert.ok(detail.includes(`#inventory/${brandId}`))
  assert.ok(detail.includes('Add brand'))
  assert.ok(detail.includes('Add stock'))
  const stock = renderToStaticMarkup(React.createElement(Inventory, { catalog: state.catalog, activity: state.activity, onAction, selectedBrandId: brandId }))
  assert.ok(stock.includes('Update quantity for New stock item'))
  const history = renderToStaticMarkup(React.createElement(InventoryActivity, { events: state.activity }))
  assert.ok(history.includes(actor.fullName))
  assert.ok(history.includes('Opening stock: 10'))
  const home = renderToStaticMarkup(React.createElement(Workspace, { employee: employees[0], accounts: [], inventory: state, onInventoryAction: onAction, onSaveEmployee: async () => null, active: true, onSignOut() {} }))
  assert.ok(!home.includes('Orders'))
})
