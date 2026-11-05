import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
let inventory
let Inventory

before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  inventory = await server.ssrLoadModule('/src/data/inventory.ts')
  Inventory = (await server.ssrLoadModule('/src/components/Inventory.tsx')).default
})
after(async () => { await server?.close() })

test('stock status distinguishes zero stock and the reorder boundary', () => {
  const item = inventory.sampleInventory.items[0]
  assert.equal(inventory.getStockStatus({ ...item, quantity: 0 }), 'out-of-stock')
  assert.equal(inventory.getStockStatus({ ...item, quantity: 1 }), 'low-stock')
  assert.equal(inventory.getStockStatus({ ...item, quantity: item.reorderLevel }), 'low-stock')
  assert.equal(inventory.getStockStatus({ ...item, quantity: item.reorderLevel + 1 }), 'in-stock')
})

test('brand search finds companies and nested SKUs, and combines company and stock filters', () => {
  const catalog = inventory.sampleInventory
  assert.deepEqual(inventory.getBrandGroups(catalog, { query: '  nl-002  ' }).map(({ brand }) => brand.id), ['northline'])
  assert.equal(inventory.getBrandGroups(catalog, { query: 'Harbour' }).length, 2)
  assert.deepEqual(inventory.getBrandGroups(catalog, { companyId: 'summit', status: 'out-of-stock' }).map(({ brand }) => brand.id), ['clearway'])
  assert.equal(inventory.getBrandGroups(catalog, { query: 'NL-001', status: 'low-stock' }).length, 0)
  assert.equal(inventory.getBrandGroups(catalog, { query: 'missing-item' }).length, 0)
})

test('brand item queries stay within the selected brand and preserve the source catalog', () => {
  const catalog = inventory.sampleInventory
  const original = JSON.stringify(catalog)
  const items = inventory.getBrandItems(catalog, 'northline', { status: 'low-stock' })
  assert.deepEqual(items.map((item) => item.sku), ['NL-002'])
  assert.equal(inventory.getBrandItems(catalog, 'northline', { query: 'Forge' }).length, 0)
  assert.equal(inventory.getBrandItems(catalog, 'northline', { query: 'a-01-01' })[0].sku, 'NL-001')
  assert.equal(inventory.getBrandItems(catalog, 'northline', { query: 'Harbour' }).length, 2)
  assert.equal(JSON.stringify(catalog), original)
})

test('warehouse summaries count distinct item lines and stock alerts without adding unlike units', () => {
  assert.deepEqual(inventory.getInventorySummary(inventory.sampleInventory), {
    brands: 6, itemLines: 12, lowStock: 3, outOfStock: 1, needsAttention: 4,
  })
})

test('inventory starts with clickable brands and each brand opens only its warehouse items', () => {
  const root = renderToStaticMarkup(React.createElement(Inventory))
  assert.ok(root.includes('Browse brands'))
  assert.ok(root.includes('Sample inventory'))
  for (const brand of inventory.sampleInventory.brands) assert.ok(root.includes(`#inventory/${brand.id}`))
  const detail = renderToStaticMarkup(React.createElement(Inventory, { selectedBrandId: 'northline' }))
  assert.ok(detail.includes('NL-001'))
  assert.ok(detail.includes('A-01-01'))
  assert.ok(detail.includes('Low stock'))
  assert.ok(detail.includes('Reorder at'))
  assert.ok(!detail.includes('FG-001'))
  assert.ok(detail.includes('href="#inventory"'))
})

test('empty catalogs, empty brands, and invalid brand links have useful recovery states', () => {
  const catalog = { companies: [], brands: [], items: [] }
  assert.ok(renderToStaticMarkup(React.createElement(Inventory, { catalog })).includes('No brands added yet'))
  const emptyBrand = { ...inventory.sampleInventory, items: [] }
  assert.ok(renderToStaticMarkup(React.createElement(Inventory, { catalog: emptyBrand, selectedBrandId: 'northline' })).includes('No items in this brand yet'))
  assert.ok(renderToStaticMarkup(React.createElement(Inventory, { selectedBrandId: 'unknown' })).includes('Brand not found'))
})
