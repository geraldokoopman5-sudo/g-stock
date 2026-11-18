import { sampleInventory } from './inventory'
import type { InventoryAction, InventoryActivity, InventoryActor, InventoryMutationResult, InventoryState } from '../types/inventory'

// Keep the storage key stable so the previous company records can migrate in place.
export const inventoryStorageKey = 'g-stock.inventory.v1'
export const inventoryUnits = ['units', 'boxes', 'rolls', 'cases', 'pairs'] as const
export const maxStockQuantity = 1_000_000_000
const keyOf = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
const isQuantity = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maxStockQuantity
const validText = (value: unknown, limit = 100): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= limit
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function createInventoryState(): InventoryState {
  return { version: 2, catalog: structuredClone(sampleInventory), activity: [] }
}

function isInventoryState(value: unknown): value is InventoryState {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.catalog) || !Array.isArray(value.activity)) return false
  const { warehouses, brands, items } = value.catalog
  if (!Array.isArray(warehouses) || !Array.isArray(brands) || !Array.isArray(items)) return false
  if (!warehouses.every((warehouse: unknown) => isRecord(warehouse) && validText(warehouse.id) && validText(warehouse.name)
    && ['contactName', 'contactEmail', 'notes'].every((field) => warehouse[field] === undefined || (typeof warehouse[field] === 'string' && warehouse[field].length <= (field === 'notes' ? 1000 : 254))))) return false
  if (!brands.every((brand: unknown) => isRecord(brand) && validText(brand.id) && validText(brand.name) && validText(brand.warehouseId)
    && warehouses.some((warehouse) => warehouse.id === brand.warehouseId) && typeof brand.description === 'string' && brand.description.length <= 250 && validText(brand.initials, 3))) return false
  if (!items.every((item: unknown) => isRecord(item) && validText(item.id) && (item.sku === undefined || (typeof item.sku === 'string' && item.sku.length <= 40)) && validText(item.name)
    && validText(item.location, 80) && validText(item.brandId) && brands.some((brand) => brand.id === item.brandId)
    && inventoryUnits.some((unit) => unit === item.unit) && isQuantity(item.quantity) && isQuantity(item.reorderLevel))) return false
  const unique = (entries: Record<string, unknown>[], field: string) => new Set(entries.map((entry) => keyOf(String(entry[field])))).size === entries.length
  if (!unique(warehouses, 'id') || !unique(warehouses, 'name') || !unique(brands, 'id') || !unique(items, 'id')) return false
  if (new Set(brands.map((brand) => `${brand.warehouseId}/${keyOf(brand.name)}`)).size !== brands.length) return false
  const itemsWithSku = items.filter((item) => typeof item.sku === 'string' && item.sku.trim())
  if (new Set(itemsWithSku.map((item) => `${brands.find((brand) => brand.id === item.brandId)?.warehouseId}/${keyOf(item.sku)}`)).size !== itemsWithSku.length) return false
  return value.activity.every((event: unknown) => isRecord(event) && validText(event.id) && ['warehouse-created', 'brand-created', 'item-created', 'quantity-updated'].includes(String(event.type))
    && validText(event.entityId) && validText(event.entityName) && warehouses.some((warehouse) => warehouse.id === event.warehouseId)
    && typeof event.occurredAt === 'string' && Number.isFinite(Date.parse(event.occurredAt))
    && isRecord(event.actor) && validText(event.actor.id) && validText(event.actor.employeeId) && validText(event.actor.fullName)
    && (event.reason === undefined || (typeof event.reason === 'string' && event.reason.length <= 500))
    && (event.previousQuantity === undefined || isQuantity(event.previousQuantity)) && (event.quantity === undefined || isQuantity(event.quantity))
    && (event.unit === undefined || inventoryUnits.some((unit) => unit === event.unit)))
}

function migrateLegacyInventory(value: unknown): unknown {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.catalog)) return value
  const { companies, brands, items } = value.catalog
  if (!Array.isArray(companies) || !Array.isArray(brands) || !Array.isArray(items) || !Array.isArray(value.activity)) return value
  const renameOwner = (entry: unknown) => {
    if (!isRecord(entry)) return entry
    const { companyId, ...rest } = entry
    return { ...rest, warehouseId: companyId }
  }
  return {
    version: 2,
    catalog: { warehouses: companies, brands: brands.map(renameOwner), items },
    activity: value.activity.map((entry: unknown) => {
      const migrated = renameOwner(entry)
      if (!isRecord(migrated)) return migrated
      return { ...migrated, type: migrated.type === 'company-created' ? 'warehouse-created' : migrated.type }
    }),
  }
}

/** Persistence adapter for the local preview. Replace these reads/writes with API calls later. */
export function loadInventoryState(): InventoryState {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(inventoryStorageKey)
    if (raw) {
      const value = migrateLegacyInventory(JSON.parse(raw))
      if (isInventoryState(value)) return value
    }
  } catch { /* Start with the sample catalog if this browser has no usable preview store. */ }
  return createInventoryState()
}

export function persistInventoryState(state: InventoryState, storage: Pick<Storage, 'setItem'> = window.localStorage) {
  storage.setItem(inventoryStorageKey, JSON.stringify(state))
}

/** Pure inventory mutations. Employee identity comes from the current signed-in preview account. */
export function applyInventoryAction(state: InventoryState, actor: InventoryActor, action: InventoryAction): InventoryMutationResult {
  if (!validText(actor.id) || !validText(actor.fullName) || !validText(actor.employeeId)) return { ok: false, error: 'Sign in before updating warehouse stock.' }
  const { catalog } = state
  const record = (event: Omit<InventoryActivity, 'id' | 'actor' | 'occurredAt'>, nextCatalog = catalog): InventoryMutationResult => ({
    ok: true, entityId: event.entityId,
    state: { version: 2, catalog: nextCatalog, activity: [...state.activity, { ...event, id: crypto.randomUUID(), actor: { id: actor.id, employeeId: actor.employeeId, fullName: actor.fullName }, occurredAt: new Date().toISOString() }] },
  })

  if (action.type === 'add-warehouse') {
    const name = action.input.name.trim().replace(/\s+/g, ' ')
    const contactName = action.input.contactName?.trim() ?? ''
    const contactEmail = action.input.contactEmail?.trim() ?? ''
    const notes = action.input.notes?.trim() ?? ''
    if (!validText(name) || contactName.length > 100 || notes.length > 1000) return { ok: false, error: 'Enter a warehouse name (up to 100 characters) and keep contact details within the field limits.' }
    if (catalog.warehouses.some((warehouse) => keyOf(warehouse.name) === keyOf(name))) return { ok: false, error: 'A warehouse with this name already exists.' }
    if (contactEmail && (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) return { ok: false, error: 'Enter a valid warehouse contact email.' }
    const warehouse = { id: crypto.randomUUID(), name, contactName, contactEmail, notes }
    return record({ type: 'warehouse-created', entityId: warehouse.id, entityName: name, warehouseId: warehouse.id }, { ...catalog, warehouses: [...catalog.warehouses, warehouse] })
  }

  if (action.type === 'add-brand') {
    const { warehouseId } = action.input
    const name = action.input.name.trim().replace(/\s+/g, ' ')
    const description = action.input.description.trim()
    if (!catalog.warehouses.some((warehouse) => warehouse.id === warehouseId)) return { ok: false, error: 'Choose an existing warehouse for this brand.' }
    if (!validText(name) || description.length > 250) return { ok: false, error: 'Enter a brand name up to 100 characters and a description up to 250 characters.' }
    if (catalog.brands.some((brand) => brand.warehouseId === warehouseId && keyOf(brand.name) === keyOf(name))) return { ok: false, error: 'This warehouse already has a brand with this name.' }
    const initials = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
    const brand = { id: crypto.randomUUID(), warehouseId, name, description, initials }
    return record({ type: 'brand-created', entityId: brand.id, entityName: name, warehouseId, brandId: brand.id }, { ...catalog, brands: [...catalog.brands, brand] })
  }

  if (action.type === 'add-item') {
    const input = action.input
    const brand = catalog.brands.find((entry) => entry.id === input.brandId)
    if (!brand) return { ok: false, error: 'Choose an existing brand for this stock item.' }
    const sku = input.sku?.trim() ?? ''
    const item = { id: crypto.randomUUID(), brandId: brand.id, ...(sku ? { sku } : {}), name: input.name.trim(), location: input.location.trim(), quantity: input.quantity, unit: input.unit, reorderLevel: input.reorderLevel }
    if (!validText(item.name) || !validText(item.location, 80) || sku.length > 40) return { ok: false, error: 'Enter an item name and warehouse location within the field limits. An optional SKU can be up to 40 characters.' }
    if (!inventoryUnits.includes(item.unit) || !isQuantity(item.quantity) || !isQuantity(item.reorderLevel)) return { ok: false, error: `Choose a unit and use whole-number quantities between 0 and ${maxStockQuantity.toLocaleString('en-ZA')}.` }
    const warehouseBrandIds = new Set(catalog.brands.filter((entry) => entry.warehouseId === brand.warehouseId).map((entry) => entry.id))
    if (sku && catalog.items.some((entry) => warehouseBrandIds.has(entry.brandId) && keyOf(entry.sku ?? '') === keyOf(sku))) return { ok: false, error: 'This SKU is already used by another item for this warehouse.' }
    return record({ type: 'item-created', entityId: item.id, entityName: item.name, warehouseId: brand.warehouseId, brandId: brand.id, quantity: item.quantity, unit: item.unit, reason: 'Opening stock' }, { ...catalog, items: [...catalog.items, item] })
  }

  const item = catalog.items.find((entry) => entry.id === action.itemId)
  if (!item) return { ok: false, error: 'This stock item could not be found.' }
  if (!['add', 'remove', 'set'].includes(action.mode) || !isQuantity(action.quantity)) return { ok: false, error: 'Choose an update type and enter a valid whole-number quantity.' }
  if (item.quantity !== action.expectedQuantity) return { ok: false, error: 'The stock quantity has changed. Close this form and reopen it to use the latest count.' }
  const reason = action.reason.trim()
  if (!validText(reason, 500)) return { ok: false, error: 'Add a reason for this quantity update (up to 500 characters).' }
  const quantity = action.mode === 'set' ? action.quantity : item.quantity + action.quantity * (action.mode === 'add' ? 1 : -1)
  if (!isQuantity(quantity)) return { ok: false, error: 'This update would make the stock negative or exceed the quantity limit.' }
  if (quantity === item.quantity) return { ok: false, error: 'The quantity has not changed.' }
  const brand = catalog.brands.find((entry) => entry.id === item.brandId)!
  return record({ type: 'quantity-updated', entityId: item.id, entityName: item.name, warehouseId: brand.warehouseId, brandId: brand.id, previousQuantity: item.quantity, quantity, unit: item.unit, reason }, { ...catalog, items: catalog.items.map((entry) => entry.id === item.id ? { ...entry, quantity } : entry) })
}
