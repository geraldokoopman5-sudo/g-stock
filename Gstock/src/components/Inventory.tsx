import { useEffect, useRef, useState } from 'react'
import type { InventoryCatalog, StockFilter } from '../types/inventory'
import { getBrandGroups, getBrandItems, getInventorySummary, getStockStatus, sampleInventory, stockStatusLabels } from '../data/inventory'
import WorkspaceIcon from './WorkspaceIcon'
import './Inventory.css'

interface InventoryProps {
  selectedBrandId?: string
  catalog?: InventoryCatalog
}

export default function Inventory({ selectedBrandId, catalog = sampleInventory }: InventoryProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StockFilter>('all')
  const [companyId, setCompanyId] = useState('all')
  const heading = useRef<HTMLHeadingElement>(null)
  const brand = catalog.brands.find((entry) => encodeURIComponent(entry.id) === selectedBrandId)
  const company = catalog.companies.find((entry) => entry.id === brand?.companyId)
  const allBrandItems = brand ? catalog.items.filter((item) => item.brandId === brand.id) : []
  const summary = getInventorySummary(brand ? { ...catalog, brands: [brand], items: allBrandItems } : catalog)
  const groups = getBrandGroups(catalog, { query, status, companyId })
  const items = brand ? getBrandItems(catalog, brand.id, { query, status }) : []
  const hasFilters = Boolean(query.trim()) || status !== 'all' || (!brand && companyId !== 'all')

  useEffect(() => { heading.current?.focus() }, [selectedBrandId])

  function clearFilters() { setQuery(''); setStatus('all'); setCompanyId('all') }

  if (selectedBrandId && !brand) {
    return (
      <section className="inventory">
        <a className="inventory__back" href="#inventory">← All brands</a>
        <h1 ref={heading} tabIndex={-1}>Brand not found</h1>
        <p className="workspace__description">Choose a brand from the inventory to view its items.</p>
      </section>
    )
  }

  return (
    <section className="inventory" aria-labelledby="inventory-heading">
      {brand ? (
        <nav className="inventory__breadcrumbs" aria-label="Inventory breadcrumb">
          <a href="#inventory">All brands</a><span aria-hidden="true">/</span><span aria-current="page">{brand.name}</span>
        </nav>
      ) : <p className="eyebrow inventory__eyebrow">G-STOCK / WAREHOUSE</p>}
      <div className="inventory__heading-row">
        <div>
          <h1 id="inventory-heading" ref={heading} tabIndex={-1}>{brand?.name ?? 'Inventory'}</h1>
          <p className="inventory__intro">{brand ? <><span>{company?.name}</span>{brand.description}</> : 'Start with a brand. Find what’s in your warehouse.'}</p>
        </div>
        <span className="inventory__sample"><span aria-hidden="true" />Sample inventory</span>
      </div>

      <dl className="inventory__overview" aria-label={brand ? 'Brand stock overview' : 'Warehouse stock overview'}>
        <div><dt>{brand ? 'Storage locations' : 'Brands'}</dt><dd>{brand ? new Set(allBrandItems.map((item) => item.location)).size : summary.brands}</dd></div>
        <div><dt>Item lines</dt><dd>{summary.itemLines}<span>distinct SKUs</span></dd></div>
        <div><dt>Need attention</dt><dd>{summary.needsAttention}<span>{summary.lowStock} low · {summary.outOfStock} out of stock</span></dd></div>
      </dl>

      <div className="inventory__section-heading"><h2>{brand ? 'Brand items' : 'Browse brands'}</h2><span>{brand ? 'Stock & storage' : `${catalog.companies.length} companies represented`}</span></div>
      <div className="inventory__filters">
        <div className="inventory__search"><label htmlFor="inventory-search">{brand ? 'Search items' : 'Search inventory'}</label><input id="inventory-search" type="search" placeholder={brand ? 'Item, SKU, category, or location' : 'Brand, company, item, or SKU'} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {!brand && <div><label htmlFor="inventory-company">Company</label><select id="inventory-company" value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="all">All companies</option>{catalog.companies.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></div>}
        <div><label htmlFor="inventory-status">Stock status</label><select id="inventory-status" value={status} onChange={(event) => setStatus(event.target.value as StockFilter)}><option value="all">All stock</option><option value="in-stock">In stock</option><option value="low-stock">Low stock</option><option value="out-of-stock">Out of stock</option></select></div>
      </div>
      <div className="inventory__results"><p role="status">{brand ? `${items.length} of ${allBrandItems.length} item lines` : `${groups.length} ${groups.length === 1 ? 'brand' : 'brands'}`}{hasFilters ? ' matching your filters' : ''}</p>{hasFilters && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>

      {brand ? (
        items.length ? (
          <div className="inventory__table-wrap" role="region" aria-label={`${brand.name} inventory items`} tabIndex={0}>
            <table className="inventory__table">
              <caption className="inventory__sr-only">{brand.name} items, quantities, warehouse locations, and stock status</caption>
              <thead><tr><th scope="col">Item / SKU</th><th scope="col">Category</th><th scope="col">Location</th><th scope="col">On hand</th><th scope="col">Reorder at</th><th scope="col">Status</th></tr></thead>
              <tbody>{items.map((item) => {
                const itemStatus = getStockStatus(item)
                return <tr key={item.id}><th scope="row"><span className="inventory__item-name">{item.name}</span><span className="inventory__sku">{item.sku}</span></th><td>{item.category}</td><td><span className="inventory__location">{item.location}</span></td><td className="inventory__quantity">{item.quantity.toLocaleString('en-ZA')}<span>{item.unit}</span></td><td>{item.reorderLevel}<span className="inventory__unit"> {item.unit}</span></td><td><span className={`inventory__stock inventory__stock--${itemStatus}`}><i aria-hidden="true" />{stockStatusLabels[itemStatus]}</span></td></tr>
              })}</tbody>
            </table>
          </div>
        ) : <div className="inventory__empty"><WorkspaceIcon name="inventory" size={32} /><h3>{allBrandItems.length ? 'No items match your filters.' : 'No items in this brand yet.'}</h3><p>{allBrandItems.length ? 'Try a different item, SKU, location, or stock status.' : 'Items will appear here when this brand has warehouse stock.'}</p>{hasFilters && <button className="inventory__empty-action" type="button" onClick={clearFilters}>Show all brand items</button>}</div>
      ) : (
        groups.length ? <ul className="inventory__brands">{groups.map(({ brand: entry, company: owner, items: brandItems, needsAttention }, index) => (
          <li key={entry.id}><a href={`#inventory/${encodeURIComponent(entry.id)}`} className="inventory-brand">
            <div className="inventory-brand__top"><span className="inventory-brand__monogram" aria-hidden="true">{entry.initials}</span><span className="inventory-brand__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></div>
            <p className="inventory-brand__company">{owner?.name ?? 'Company not assigned'}</p>
            <h3>{entry.name}</h3><p className="inventory-brand__description">{entry.description}</p>
            <div className="inventory-brand__counts"><span>{brandItems.length} {brandItems.length === 1 ? 'item line' : 'item lines'}</span><span className={needsAttention ? 'inventory-brand__attention' : ''}>{needsAttention ? `${needsAttention} need attention` : brandItems.length ? 'Stock levels healthy' : 'No stock listed'}</span></div>
            <div className="inventory-brand__footer"><span>View items</span><WorkspaceIcon name="arrow" size={18} /></div>
          </a></li>
        ))}</ul> : <div className="inventory__empty"><WorkspaceIcon name="inventory" size={32} /><h3>{catalog.brands.length ? 'No brands match your filters.' : 'No brands added yet.'}</h3><p>{catalog.brands.length ? 'Try another brand, company, item name, or SKU.' : 'Warehouse brands and their items will appear here.'}</p>{hasFilters && <button className="inventory__empty-action" type="button" onClick={clearFilters}>Show all brands</button>}</div>
      )}
    </section>
  )
}
