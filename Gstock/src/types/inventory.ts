export interface InventoryCompany {
  id: string
  name: string
}

export interface InventoryBrand {
  id: string
  companyId: string
  name: string
  description: string
  initials: string
}

export interface InventoryItem {
  id: string
  brandId: string
  sku: string
  name: string
  category: string
  location: string
  quantity: number
  unit: 'units' | 'boxes' | 'rolls' | 'cases' | 'pairs'
  reorderLevel: number
}

export interface InventoryCatalog {
  companies: readonly InventoryCompany[]
  brands: readonly InventoryBrand[]
  items: readonly InventoryItem[]
}

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock'
export type StockFilter = StockStatus | 'all'

export interface InventoryFilters {
  query?: string
  status?: StockFilter
  companyId?: string
}
