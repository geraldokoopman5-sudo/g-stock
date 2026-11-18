export interface InventoryWarehouse {
  id: string
  name: string
  contactName?: string
  contactEmail?: string
  notes?: string
}

export interface InventoryBrand {
  id: string
  warehouseId: string
  name: string
  description: string
  initials: string
}

export interface InventoryItem {
  id: string
  brandId: string
  sku?: string
  name: string
  location: string
  quantity: number
  unit: 'units' | 'boxes' | 'rolls' | 'cases' | 'pairs'
  reorderLevel: number
}

export interface InventoryCatalog {
  warehouses: readonly InventoryWarehouse[]
  brands: readonly InventoryBrand[]
  items: readonly InventoryItem[]
}

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock'
export type StockFilter = StockStatus | 'all'

export interface InventoryFilters {
  query?: string
  status?: StockFilter
  warehouseId?: string
}

export interface InventoryActor {
  id: string
  employeeId: string
  fullName: string
}

export interface InventoryActivity {
  id: string
  type: 'warehouse-created' | 'brand-created' | 'item-created' | 'quantity-updated'
  entityId: string
  entityName: string
  warehouseId: string
  brandId?: string
  occurredAt: string
  actor: InventoryActor
  reason?: string
  previousQuantity?: number
  quantity?: number
  unit?: InventoryItem['unit']
}

export interface InventoryState {
  version: 2
  catalog: InventoryCatalog
  activity: readonly InventoryActivity[]
}

export type NewWarehouse = Omit<InventoryWarehouse, 'id'>
export type NewBrand = Pick<InventoryBrand, 'warehouseId' | 'name' | 'description'>
export type NewStockItem = Omit<InventoryItem, 'id'>
export type QuantityMode = 'add' | 'remove' | 'set'
export type InventoryAction =
  | { type: 'add-warehouse'; input: NewWarehouse }
  | { type: 'add-brand'; input: NewBrand }
  | { type: 'add-item'; input: NewStockItem }
  | { type: 'adjust-quantity'; itemId: string; mode: QuantityMode; quantity: number; expectedQuantity: number; reason: string }

export type InventorySaveResult = { ok: true; entityId: string } | { ok: false; error: string }
export type InventoryMutationResult = { ok: true; entityId: string; state: InventoryState } | { ok: false; error: string }
export type SaveInventoryAction = (action: InventoryAction) => InventorySaveResult
