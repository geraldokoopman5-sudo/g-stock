import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server, preview, values
const profile = { id: 'viewer', employeeId: 'QA-1', fullName: 'Test Employee', email: 'employee@example.test', role: 'Nemployee', accountRole: 'Nemployee', status: 'Active' }
const view = () => ({
  profile,
  permissions: { canCreateWarehouse: true, canManageBrands: false, canManageItems: true, canManageEmployees: false },
  accounts: [],
  inventory: { version: 2, activity: [], catalog: {
    warehouses: [{ id: 'warehouse', name: 'Test Warehouse' }],
    brands: [{ id: 'brand', warehouseId: 'warehouse', name: 'Test Brand', description: '', initials: 'TB' }],
    items: [{ id: 'item', brandId: 'brand', name: 'Test Item', quantity: 0, unit: 'units', location: 'A-1', reorderLevel: 0 }],
  } },
})
before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  preview = await server.ssrLoadModule('/src/lib/workspacePreview.ts')
})
beforeEach(() => {
  values = new Map()
  globalThis.window = { sessionStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } }
})
after(async () => { delete globalThis.window; await server?.close() })

test('only display data is saved: credentials, tokens, verifiers and histories are excluded', () => {
  const source = view()
  source.profile = { ...source.profile, password: 'secret-password', accessToken: 'secret-token', refreshToken: 'secret-refresh' }
  source.accounts = [{ profile: { ...profile, id: 'inactive', status: 'InActive', password: 'other-secret' }, passwordVerifier: { hash: 'secret-hash' }, editHistory: [{ secret: 'history-secret' }] }]
  source.inventory.activity = [{ secret: 'activity-secret' }]
  source.inventory.catalog.items[0].accessToken = 'unexpected-token'
  const original = JSON.stringify(source)
  preview.saveWorkspacePreview(source)
  const serialized = values.get(preview.workspacePreviewKey)
  for (const text of ['secret', 'accessToken', 'refreshToken', 'password', 'unexpected-token']) assert.ok(!serialized.includes(text), text)
  const restored = preview.loadWorkspacePreview()
  assert.equal(restored.profile.fullName, profile.fullName)
  assert.equal(restored.inventory.catalog.items[0].name, 'Test Item')
  assert.equal(restored.accounts[0].profile.status, 'InActive')
  assert.deepEqual(restored.accounts[0].editHistory, [])
  assert.deepEqual(restored.inventory.activity, [])
  assert.equal(JSON.stringify(source), original)
})

test('invalid, expired, future-dated, or incompatible saved views are discarded', () => {
  preview.saveWorkspacePreview(view())
  const valid = JSON.parse(values.get(preview.workspacePreviewKey))
  const missingName = structuredClone(valid)
  delete missingName.view.inventory.catalog.items[0].name
  for (const value of [null, {}, { ...valid, version: 99 }, { ...valid, savedAt: Date.now() - 9 * 60 * 60 * 1000 }, { ...valid, savedAt: Date.now() + 60_000 }, missingName]) {
    values.set(preview.workspacePreviewKey, JSON.stringify(value))
    assert.equal(preview.loadWorkspacePreview(), null)
    assert.equal(values.has(preview.workspacePreviewKey), false)
  }
  values.set(preview.workspacePreviewKey, '{invalid')
  assert.equal(preview.loadWorkspacePreview(), null)
})

test('unavailable storage and oversized data cannot break startup or leave an old view behind', () => {
  preview.saveWorkspacePreview(view())
  const oversized = view()
  oversized.inventory.catalog.brands[0].description = 'x'.repeat(2_000_000)
  preview.saveWorkspacePreview(oversized)
  assert.equal(values.has(preview.workspacePreviewKey), false)
  Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked') } })
  assert.equal(preview.loadWorkspacePreview(), null)
  assert.doesNotThrow(() => preview.saveWorkspacePreview(view()))
  assert.doesNotThrow(() => preview.clearWorkspacePreview())
})
