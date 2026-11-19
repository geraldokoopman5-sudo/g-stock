import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, photos, InventoryEditor, Inventory, workspace
const originalFetch = globalThis.fetch
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64')
const catalog = {
  warehouses: [{ id: 'warehouse', name: 'Test Warehouse' }],
  brands: [{ id: 'brand', warehouseId: 'warehouse', name: 'Test Brand', initials: 'TB', description: '' }],
  items: [{ id: 'item', brandId: 'brand', name: 'Test Item', location: 'A-01', quantity: 5, unit: 'units', reorderLevel: 2 }],
}
before(async () => {
  server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
  photos = await server.ssrLoadModule('/src/lib/inventoryPhotos.ts')
  InventoryEditor = (await server.ssrLoadModule('/src/components/InventoryEditor.tsx')).default
  Inventory = (await server.ssrLoadModule('/src/components/Inventory.tsx')).default
  workspace = await server.ssrLoadModule('/src/api/workspace.ts')
})
after(async () => { await server?.close() })
afterEach(() => { globalThis.fetch = originalFetch })

test('file selection encodes the actual image bytes for PostgreSQL and builds a matching preview', async () => {
  const result = await photos.readInventoryPhoto(new File([png], 'picture.png', { type: 'image/png' }))
  assert.equal(result.profilePhoto, png.toString('base64'))
  assert.equal(result.preview, `data:image/png;base64,${result.profilePhoto}`)
  const jpeg = new Uint8Array([255, 216, 255, 224, 0, 0])
  assert.ok((await photos.readInventoryPhoto(new File([jpeg], 'picture.jpg'))).preview.startsWith('data:image/jpeg;base64,'))
})

test('empty, oversized, and unsupported or mislabeled files are rejected before submitting', async () => {
  for (const file of [new File([], 'empty.png'), new File([new Uint8Array(photos.maxPhotoBytes + 1)], 'large.png'), new File(['<svg></svg>'], 'fake.png', { type: 'image/png' })]) {
    await assert.rejects(photos.readInventoryPhoto(file), /PNG or JPEG/)
  }
})

test('new brand and item forms offer optional image uploads, and existing records have picture editors', () => {
  const render = (mode) => renderToStaticMarkup(React.createElement(InventoryEditor, {
    selection: { mode, brandId: 'brand', itemId: 'item' }, catalog,
    onSave: async () => ({ ok: false, error: 'Test only' }), onClose() {}, onComplete() {},
  }))
  for (const mode of ['brand', 'item', 'brand-photo', 'item-photo']) {
    const markup = render(mode)
    assert.ok(markup.includes('type="file"'))
    assert.ok(markup.includes('image/png,image/jpeg'))
    assert.ok(markup.includes('up to 1 MiB'))
  }
  assert.ok(!render('quantity').includes('type="file"'))
  const renderPage = (canManageBrands, canManageItems) => renderToStaticMarkup(React.createElement(Inventory, {
    selectedBrandId: 'brand', selectedItemId: 'item', catalog,
    permissions: { canCreateWarehouse: false, canManageBrands, canManageItems, canManageEmployees: false },
    onAction: async () => ({ ok: false, error: 'Test only' }),
  }))
  assert.ok(renderPage(true, false).includes('Add brand picture'))
  assert.ok(!renderPage(false, true).includes('Add brand picture'))
  assert.ok(renderPage(false, true).includes('Add item picture'))
  assert.ok(!renderPage(false, false).includes('Add item picture'))
})

test('create and replacement requests send base64 to the appropriate API and support picture removal', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: JSON.parse(options.body) })
    return new Response(JSON.stringify({ id: 'saved', hasProfilePhoto: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const profilePhoto = png.toString('base64')
  await workspace.saveInventory({ type: 'add-brand', input: { warehouseId: 'warehouse', name: 'Brand', description: '', profilePhoto } })
  await workspace.saveInventory({ type: 'add-item', input: { ...catalog.items[0], profilePhoto } })
  await workspace.saveInventory({ type: 'set-brand-photo', brandId: 'brand/id', profilePhoto })
  await workspace.saveInventory({ type: 'set-item-photo', itemId: 'item/id', profilePhoto: null })
  assert.equal(calls[0].body.profilePhoto, profilePhoto)
  assert.equal(calls[1].body.profilePhoto, profilePhoto)
  assert.deepEqual(calls[2], { url: '/api/v1/brands/brand%2Fid/photo', method: 'PUT', body: { profilePhoto } })
  assert.deepEqual(calls[3], { url: '/api/v1/items/item%2Fid/photo', method: 'PUT', body: { profilePhoto: null } })
})
