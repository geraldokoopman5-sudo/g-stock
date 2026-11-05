import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
let paginate
let getPageNumbers
let usePagination
let ListPagination
let EmployeeAccounts
let Warehouses
let Inventory

before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  ;({ paginate, getPageNumbers } = await server.ssrLoadModule('/src/lib/pagination.ts'))
  ;({ usePagination } = await server.ssrLoadModule('/src/hooks/usePagination.ts'))
  ListPagination = (await server.ssrLoadModule('/src/components/ListPagination.tsx')).default
  EmployeeAccounts = (await server.ssrLoadModule('/src/components/EmployeeAccounts.tsx')).default
  Warehouses = (await server.ssrLoadModule('/src/components/Warehouses.tsx')).default
  Inventory = (await server.ssrLoadModule('/src/components/Inventory.tsx')).default
})
after(async () => { await server?.close() })

test('pages cover every record once, clamp invalid pages, and handle empty or short results', () => {
  const items = Array.from({ length: 45 }, (_, index) => index + 1)
  const snapshot = [...items]
  assert.deepEqual([1, 2, 3].flatMap((page) => paginate(items, page, 20).items), items)
  assert.deepEqual(paginate(items, 3, 20).items, [41, 42, 43, 44, 45])
  assert.equal(paginate(items, 999, 20).page, 3)
  assert.equal(paginate(items, -3, 20).page, 1)
  assert.equal(paginate(items, NaN, 20).page, 1)
  assert.equal(paginate(items, 1, 0).pageSize, 20)
  assert.deepEqual(paginate([], 4, 20), { page: 1, pageSize: 20, pageCount: 1, total: 0, start: 0, end: 0, items: [] })
  assert.deepEqual(items, snapshot)
})

test('large page ranges keep the current page, first/last pages, and compact ellipses', () => {
  assert.deepEqual(getPageNumbers(1, 3), [1, 2, 3])
  assert.deepEqual(getPageNumbers(1, 20), [1, 2, 3, 4, 5, 'ellipsis', 20])
  assert.deepEqual(getPageNumbers(10, 20), [1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])
  assert.deepEqual(getPageNumbers(20, 20), [1, 'ellipsis', 16, 17, 18, 19, 20])
})

function runHookSequence(frames) {
  let result
  function Scenario() {
    const [step, setStep] = React.useState(0)
    const frame = frames[step]
    const pagination = usePagination(frame.items, frame.scope)
    result = pagination
    frame.check?.(pagination)
    if (frame.action) { frame.action(pagination); setStep(step + 1) }
    return null
  }
  renderToStaticMarkup(React.createElement(Scenario))
  return result
}

test('changing filters resets to page one, and shrinking results cannot leave an empty stale page', () => {
  const all = Array.from({ length: 60 }, (_, index) => index)
  const result = runHookSequence([
    { items: all, scope: 'all', action: (page) => page.onPageChange(3) },
    { items: all, scope: 'all', check: (page) => assert.equal(page.page, 3), action: () => {} },
    { items: all.slice(0, 30), scope: 'filtered', check: (page) => assert.equal(page.page, 1), action: (page) => page.onPageChange(2) },
    { items: all.slice(0, 30), scope: 'filtered', check: (page) => assert.equal(page.page, 2), action: () => {} },
    { items: all.slice(0, 5), scope: 'filtered', check: (page) => assert.equal(page.page, 1), action: () => {} },
    { items: all, scope: 'filtered' },
  ])
  assert.equal(result.page, 1)
  assert.deepEqual(result.items, all.slice(0, 20))
})

test('changing the per-page selector starts at the first page with the selected limit', () => {
  const items = Array.from({ length: 60 }, (_, index) => index)
  const result = runHookSequence([
    { items, scope: 'all', action: (page) => page.onPageChange(3) },
    { items, scope: 'all', action: (page) => page.onPageSizeChange(10) },
    { items, scope: 'all' },
  ])
  assert.equal(result.page, 1)
  assert.equal(result.pageSize, 10)
  assert.equal(result.items.length, 10)
})

test('pagination exposes the active page, disabled boundary links, and exact visible record counts', () => {
  const items = Array.from({ length: 45 }, (_, index) => index)
  const render = (page) => renderToStaticMarkup(React.createElement(ListPagination, { ...paginate(items, page, 20), label: 'items', href: '#inventory', onPageChange() {}, onPageSizeChange() {} }))
  const first = render(1)
  assert.ok(first.includes('aria-current="page"'))
  assert.ok(first.includes('Showing 1–20 of 45 items'))
  assert.match(first, /aria-label="Go to previous page"[^>]*aria-disabled="true"/)
  assert.match(first, /aria-label="Go to next page"[^>]*aria-disabled="false"/)
  const last = render(3)
  assert.ok(last.includes('Showing 41–45 of 45 items'))
  assert.match(last, /aria-label="Go to next page"[^>]*aria-disabled="true"/)
})

function catalogFixture() {
  return {
    warehouses: Array.from({ length: 25 }, (_, index) => ({ id: `warehouse-${index}`, name: `Warehouse ${String(index + 1).padStart(2, '0')}` })),
    brands: Array.from({ length: 25 }, (_, index) => ({ id: `brand-${index}`, warehouseId: 'warehouse-0', name: `Brand ${String(index + 1).padStart(2, '0')}`, initials: 'B', description: '' })),
    items: Array.from({ length: 45 }, (_, index) => ({ id: `item-${index}`, brandId: 'brand-0', sku: `SKU-${String(index + 1).padStart(2, '0')}`, name: `Item ${String(index + 1).padStart(2, '0')}`, category: 'Storage', location: 'A-01', quantity: 10, reorderLevel: 2, unit: 'units' })),
  }
}

test('employees and warehouses render the first twenty records rather than the full collection', () => {
  const accounts = Array.from({ length: 45 }, (_, index) => ({ profile: { id: `employee-${index}`, employeeId: `EMP-${index}`, fullName: `Employee ${index + 1}`, department: 'Warehouse', role: 'Employee', email: `employee${index}@example.com` }, editHistory: [] }))
  const employees = renderToStaticMarkup(React.createElement(EmployeeAccounts, { accounts, viewer: accounts[0].profile, onSave: async () => null }))
  assert.ok(employees.includes('#employees/employee-19'))
  assert.ok(!employees.includes('#employees/employee-20'))
  assert.ok(employees.includes('Showing 1–20 of 45 employee accounts'))
  const warehouses = renderToStaticMarkup(React.createElement(Warehouses, { catalog: catalogFixture(), activity: [], onAction: () => ({ ok: false, error: 'Test only' }) }))
  assert.ok(warehouses.includes('#warehouses/warehouse-19'))
  assert.ok(!warehouses.includes('#warehouses/warehouse-20'))
  assert.ok(warehouses.includes('Showing 1–20 of 25 warehouses'))
})

test('inventory brand cards, item rows, and warehouse brand lists are all paginated', () => {
  const catalog = catalogFixture()
  const brands = renderToStaticMarkup(React.createElement(Inventory, { catalog }))
  assert.ok(brands.includes('#inventory/brand-19'))
  assert.ok(!brands.includes('#inventory/brand-20'))
  assert.ok(brands.includes('Showing 1–20 of 25 brands'))
  const items = renderToStaticMarkup(React.createElement(Inventory, { catalog, selectedBrandId: 'brand-0' }))
  assert.ok(items.includes('SKU-20'))
  assert.ok(!items.includes('SKU-21'))
  assert.ok(items.includes('Showing 1–20 of 45 items'))
  const warehouse = renderToStaticMarkup(React.createElement(Warehouses, { catalog, selectedId: 'warehouse-0', activity: [], onAction: () => ({ ok: false, error: 'Test only' }) }))
  assert.ok(warehouse.includes('#inventory/brand-19'))
  assert.ok(!warehouse.includes('#inventory/brand-20'))
  assert.ok(warehouse.includes('Showing 1–20 of 25 brands'))
})
