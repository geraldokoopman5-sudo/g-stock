import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
let model
let catalog
let store
let Reports
let ReportLineChart
const now = new Date('2026-11-05T10:00:00.000Z')
const actor = { id: 'report-employee', employeeId: 'GST-REPORT', fullName: 'Report Employee' }

before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  model = await server.ssrLoadModule('/src/data/reports.ts')
  catalog = (await server.ssrLoadModule('/src/data/inventory.ts')).sampleInventory
  store = await server.ssrLoadModule('/src/data/inventoryStore.ts')
  Reports = (await server.ssrLoadModule('/src/components/Reports.tsx')).default
  ReportLineChart = (await server.ssrLoadModule('/src/components/ReportLineChart.tsx')).default
})
after(async () => { await server?.close() })

function activity(type, extra = {}) {
  return { id: crypto.randomUUID(), type, entityId: 'nl-001', entityName: 'Shipping boxes', warehouseId: 'harbour', brandId: 'northline', occurredAt: '2026-11-03T10:00:00.000Z', actor, ...extra }
}

function report(events, filters = { unit: 'units' }, range = { amount: 1, period: 'months' }) {
  return model.buildStockReport(catalog, events, range, filters, now)
}

test('timeline defaults to one calendar month and supports bounded day, week, month, and year ranges', () => {
  assert.deepEqual(model.defaultReportRange, { amount: 1, period: 'months' })
  assert.equal(model.getReportWindow(model.defaultReportRange, now).start.toISOString(), '2026-10-05T10:00:00.000Z')
  assert.equal(model.getReportWindow({ amount: 7, period: 'days' }, now).start.toISOString(), '2026-10-29T10:00:00.000Z')
  assert.equal(model.getReportWindow({ amount: 2, period: 'weeks' }, now).start.toISOString(), '2026-10-22T10:00:00.000Z')
  assert.equal(model.getReportWindow({ amount: 1, period: 'years' }, now).start.toISOString(), '2025-11-05T10:00:00.000Z')
  for (const [period, maximum] of Object.entries(model.reportRangeLimits)) {
    assert.deepEqual(model.normalizeReportRange({ amount: 9999, period }), { amount: maximum, period })
    assert.equal(model.normalizeReportRange({ amount: 0, period }).amount, 1)
  }
  assert.equal(model.normalizeReportRange({ amount: NaN, period: 'days' }).amount, 1)
})

test('calendar month and year subtraction handles short months and leap years', () => {
  assert.equal(model.getReportWindow({ amount: 1, period: 'months' }, new Date('2026-03-31T10:00:00Z')).start.toISOString(), '2026-02-28T10:00:00.000Z')
  assert.equal(model.getReportWindow({ amount: 1, period: 'years' }, new Date('2024-02-29T10:00:00Z')).start.toISOString(), '2023-02-28T10:00:00.000Z')
  assert.equal(model.getReportWindow({ amount: 12, period: 'months' }, now).start.getTime(), model.getReportWindow({ amount: 1, period: 'years' }, now).start.getTime())
})

test('hourly, daily, weekly, and monthly buckets use South African dates and Monday week starts', () => {
  assert.equal(model.getReportWindow({ amount: 1, period: 'days' }, now).interval, 'hour')
  assert.equal(model.getReportWindow({ amount: 1, period: 'months' }, now).interval, 'day')
  assert.equal(model.getReportWindow({ amount: 3, period: 'months' }, now).interval, 'week')
  assert.equal(model.getReportWindow({ amount: 1, period: 'years' }, now).interval, 'month')
  const midnightEvent = Date.parse('2026-11-02T23:30:00Z') // 01:30 on 3 November in SAST.
  assert.equal(new Date(model.reportBucketStart(midnightEvent, 'day')).toISOString(), '2026-11-02T22:00:00.000Z')
  assert.equal(new Date(model.reportBucketStart(midnightEvent, 'week')).toISOString(), '2026-11-01T22:00:00.000Z')
  assert.equal(new Date(model.reportBucketStart(midnightEvent, 'month')).toISOString(), '2026-10-31T22:00:00.000Z')
})

test('new opening stock and positive/negative updates stay separate and missing dates are filled with zero', () => {
  const events = [
    activity('item-created', { quantity: 10 }),
    activity('quantity-updated', { previousQuantity: 10, quantity: 15 }),
    activity('quantity-updated', { previousQuantity: 15, quantity: 12 }),
    activity('quantity-updated', { previousQuantity: 12, quantity: 4, occurredAt: '2026-11-04T10:00:00Z' }),
    activity('warehouse-created', { quantity: 999 }),
  ]
  const original = JSON.stringify(events)
  const result = report(events)
  assert.deepEqual(result.summary, { newItems: 1, newStock: 10, added: 5, subtracted: 11, updates: 3 })
  assert.equal(result.points.reduce((sum, point) => sum + point.newStock, 0), 10)
  assert.equal(result.points.reduce((sum, point) => sum + point.added, 0), 5)
  assert.equal(result.points.reduce((sum, point) => sum + point.subtracted, 0), -11)
  assert.ok(result.points.some((point) => point.newStock === 0 && point.added === 0 && point.subtracted === 0))
  assert.ok(result.points.every((point, index) => index === 0 || point.timestamp > result.points[index - 1].timestamp))
  assert.equal(JSON.stringify(events), original)
})

test('events outside the selected dates, invalid timestamps, and future events are excluded', () => {
  const result = report([
    activity('item-created', { quantity: 1, occurredAt: '2026-10-05T10:00:00Z' }),
    activity('item-created', { quantity: 2, occurredAt: now.toISOString() }),
    activity('item-created', { quantity: 100, occurredAt: '2026-10-05T09:59:59.999Z' }),
    activity('item-created', { quantity: 100, occurredAt: '2026-11-05T10:00:00.001Z' }),
    activity('item-created', { quantity: 100, occurredAt: 'invalid-date' }),
  ])
  assert.equal(result.summary.newStock, 3)
  assert.equal(result.summary.newItems, 2)
})

test('warehouse, brand, and unit filters prevent adding unlike units together', () => {
  const events = [
    activity('quantity-updated', { previousQuantity: 10, quantity: 15 }),
    activity('quantity-updated', { entityId: 'fg-001', warehouseId: 'cedar', brandId: 'forge', previousQuantity: 8, quantity: 11 }),
    activity('item-created', { entityId: 'nl-002', quantity: 100 }), // Rolls, via the older history format.
  ]
  assert.equal(report(events).summary.added, 8)
  assert.equal(report(events).summary.newStock, 0)
  assert.equal(report(events, { unit: 'units', warehouseId: 'harbour' }).summary.added, 5)
  assert.equal(report(events, { unit: 'units', brandId: 'forge' }).summary.added, 3)
  assert.equal(report(events, { unit: 'rolls' }).summary.newStock, 100)
})

test('saved unit snapshots work with historical records and zero opening stock still counts as a new item', () => {
  const events = [activity('item-created', { entityId: 'historical-item', unit: 'boxes', quantity: 7 }), activity('item-created', { quantity: 0 })]
  assert.equal(report(events, { unit: 'boxes' }).summary.newStock, 7)
  const zero = report(events)
  assert.equal(zero.summary.newItems, 1)
  assert.equal(zero.summary.newStock, 0)
  const state = store.createInventoryState()
  const result = store.applyInventoryAction(state, actor, { type: 'adjust-quantity', itemId: 'nl-002', mode: 'add', quantity: 5, expectedQuantity: 12, reason: 'Received stock' })
  assert.equal(result.ok, true)
  assert.equal(result.state.activity[0].unit, 'rolls')
})

test('reports show the one-month default, all timeline units, and both requested graph titles', () => {
  const html = renderToStaticMarkup(React.createElement(Reports, { catalog, activity: [] }))
  assert.ok(html.includes('value="months" selected=""'))
  assert.ok(html.includes('aria-pressed="true">1 month'))
  for (const value of ['days', 'weeks', 'months', 'years']) assert.ok(html.includes(`value="${value}"`))
  assert.ok(html.includes('New stock added'))
  assert.ok(html.includes('Stock updated'))
  assert.ok(html.includes('Subtracted'))
  assert.ok(html.includes('No stock updates in this timeline'))
  assert.ok(html.includes('View chart data'))
})

test('empty and negative-only graphs render valid paths and accessible keyboard/data-table controls', () => {
  for (const events of [[], [activity('quantity-updated', { previousQuantity: 10, quantity: 5 })]]) {
    const data = report(events)
    const html = renderToStaticMarkup(React.createElement(ReportLineChart, {
      title: 'Stock updated', description: 'Quantity changes', headline: 'Updates', points: data.points,
      series: [{ key: 'added', label: 'Added' }, { key: 'subtracted', label: 'Subtracted', secondary: true }],
      unit: 'units', hasData: data.summary.updates > 0, emptyText: 'No updates',
    }))
    assert.ok(!html.includes('NaN'))
    assert.ok(!html.includes('Infinity'))
    assert.ok(html.includes('tabindex="0"'))
    assert.ok(html.includes('left and right arrow keys'))
    assert.ok(html.includes('Stock updated in units'))
    assert.ok(html.includes('SAST'))
  }
})
