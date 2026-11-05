import type { InventoryCatalog, InventoryFilters, InventoryItem, StockStatus } from '../types/inventory'

// Fictional warehouse stock for the first inventory preview.
// Replace this catalog when the warehouse's actual brands and products are defined.
export const sampleInventory: InventoryCatalog = {
  companies: [
    { id: 'harbour', name: 'Harbour Supply Co.' },
    { id: 'cedar', name: 'Cedar Industrial' },
    { id: 'summit', name: 'Summit Warehouse Supply' },
  ],
  brands: [
    { id: 'northline', companyId: 'harbour', name: 'Northline', description: 'Packaging for every dispatch.', initials: 'NL' },
    { id: 'packwell', companyId: 'harbour', name: 'Packwell', description: 'Storage that keeps things in place.', initials: 'PW' },
    { id: 'forge', companyId: 'cedar', name: 'Forge', description: 'Tools for the warehouse floor.', initials: 'FG' },
    { id: 'voltline', companyId: 'cedar', name: 'Voltline', description: 'Electrical supplies and essentials.', initials: 'VL' },
    { id: 'clearway', companyId: 'summit', name: 'Clearway', description: 'Cleaning and daily maintenance.', initials: 'CW' },
    { id: 'fieldwork', companyId: 'summit', name: 'Fieldwork', description: 'Safety gear for your team.', initials: 'FW' },
  ],
  items: [
    { id: 'nl-001', brandId: 'northline', sku: 'NL-001', name: 'Medium shipping boxes', category: 'Packaging', location: 'A-01-01', quantity: 240, unit: 'units', reorderLevel: 50 },
    { id: 'nl-002', brandId: 'northline', sku: 'NL-002', name: 'Clear packing tape', category: 'Packaging', location: 'A-01-02', quantity: 12, unit: 'rolls', reorderLevel: 20 },
    { id: 'pw-001', brandId: 'packwell', sku: 'PW-001', name: 'Stackable storage bins', category: 'Storage', location: 'A-02-01', quantity: 64, unit: 'units', reorderLevel: 15 },
    { id: 'pw-002', brandId: 'packwell', sku: 'PW-002', name: 'Pallet stretch wrap', category: 'Packaging', location: 'A-02-02', quantity: 38, unit: 'rolls', reorderLevel: 10 },
    { id: 'fg-001', brandId: 'forge', sku: 'FG-001', name: 'Heavy-duty utility knives', category: 'Tools', location: 'B-01-01', quantity: 8, unit: 'units', reorderLevel: 10 },
    { id: 'fg-002', brandId: 'forge', sku: 'FG-002', name: 'Replacement blade packs', category: 'Tools', location: 'B-01-02', quantity: 45, unit: 'boxes', reorderLevel: 12 },
    { id: 'vl-001', brandId: 'voltline', sku: 'VL-001', name: 'Extension leads, 10 m', category: 'Electrical', location: 'B-02-01', quantity: 28, unit: 'units', reorderLevel: 8 },
    { id: 'vl-002', brandId: 'voltline', sku: 'VL-002', name: 'Cable ties, assorted', category: 'Electrical', location: 'B-02-02', quantity: 16, unit: 'boxes', reorderLevel: 5 },
    { id: 'cw-001', brandId: 'clearway', sku: 'CW-001', name: 'Floor cleaner, 5 L', category: 'Cleaning', location: 'C-01-01', quantity: 0, unit: 'units', reorderLevel: 6 },
    { id: 'cw-002', brandId: 'clearway', sku: 'CW-002', name: 'Industrial cleaning cloths', category: 'Cleaning', location: 'C-01-02', quantity: 24, unit: 'boxes', reorderLevel: 8 },
    { id: 'fw-001', brandId: 'fieldwork', sku: 'FW-001', name: 'Protective work gloves', category: 'Safety', location: 'C-02-01', quantity: 20, unit: 'pairs', reorderLevel: 20 },
    { id: 'fw-002', brandId: 'fieldwork', sku: 'FW-002', name: 'High-visibility vests', category: 'Safety', location: 'C-02-02', quantity: 54, unit: 'units', reorderLevel: 12 },
  ],
}

export const stockStatusLabels: Record<StockStatus, string> = {
  'in-stock': 'In stock', 'low-stock': 'Low stock', 'out-of-stock': 'Out of stock',
}

export function getStockStatus(item: InventoryItem): StockStatus {
  if (item.quantity === 0) return 'out-of-stock'
  return item.quantity <= item.reorderLevel ? 'low-stock' : 'in-stock'
}

function matchesItem(catalog: InventoryCatalog, item: InventoryItem, filters: InventoryFilters) {
  const brand = catalog.brands.find((entry) => entry.id === item.brandId)
  const company = catalog.companies.find((entry) => entry.id === brand?.companyId)
  const query = filters.query?.trim().toLowerCase() ?? ''
  return (!filters.status || filters.status === 'all' || getStockStatus(item) === filters.status)
    && [item.name, item.sku, item.category, item.location, brand?.name ?? '', brand?.description ?? '', company?.name ?? ''].some((value) => value.toLowerCase().includes(query))
}

export function getBrandItems(catalog: InventoryCatalog, brandId: string, filters: InventoryFilters = {}) {
  return catalog.items.filter((item) => item.brandId === brandId && matchesItem(catalog, item, filters))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getInventorySummary(catalog: InventoryCatalog) {
  const lowStock = catalog.items.filter((item) => getStockStatus(item) === 'low-stock').length
  const outOfStock = catalog.items.filter((item) => getStockStatus(item) === 'out-of-stock').length
  return { brands: catalog.brands.length, itemLines: catalog.items.length, lowStock, outOfStock, needsAttention: lowStock + outOfStock }
}

export function getBrandGroups(catalog: InventoryCatalog, filters: InventoryFilters = {}) {
  const query = filters.query?.trim().toLowerCase() ?? ''
  return catalog.brands.map((brand) => {
    const company = catalog.companies.find((entry) => entry.id === brand.companyId)
    const items = catalog.items.filter((item) => item.brandId === brand.id)
    return { brand, company, items, needsAttention: items.filter((item) => getStockStatus(item) !== 'in-stock').length }
  }).filter(({ brand, company, items }) => {
    if (filters.companyId && filters.companyId !== 'all' && brand.companyId !== filters.companyId) return false
    const brandMatches = [brand.name, brand.description, company?.name ?? ''].some((value) => value.toLowerCase().includes(query))
    const statusMatches = !filters.status || filters.status === 'all' || items.some((item) => getStockStatus(item) === filters.status)
    return statusMatches && (brandMatches || items.some((item) => matchesItem(catalog, item, filters)))
  }).sort((a, b) => a.brand.name.localeCompare(b.brand.name))
}
