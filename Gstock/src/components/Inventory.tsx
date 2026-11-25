import ActionIconButton from './ActionIconButton'
import { useEffect, useRef, useState } from 'react'
import type { InventoryActivity as Activity, InventoryCatalog, SaveInventoryAction, StockFilter } from '../types/inventory'
import { getBrandGroups, getBrandItems, getInventorySummary, getStockStatus, stockStatusLabels } from '../data/inventory'
import WorkspaceIcon from './WorkspaceIcon'
import type { WorkspacePermissions } from '../api/workspace'
import InventoryEditor from './InventoryEditor'
import InventoryPhoto from './InventoryPhoto'
import InventoryDeleteButton from './InventoryDeleteButton'
import type { InventoryEditorSelection } from './InventoryEditor'
import InventoryActivity from './InventoryActivity'
import ListPagination from './ListPagination'
import { usePagination } from '../hooks/usePagination'
import './Inventory.css'

interface InventoryProps {
  permissions?: WorkspacePermissions
  selectedBrandId?: string
  selectedItemId?: string
  catalog?: InventoryCatalog
  activity?: readonly Activity[]
  onAction?: SaveInventoryAction
}

const emptyCatalog: InventoryCatalog = { warehouses: [], brands: [], items: [] }

export default function Inventory({ selectedBrandId, selectedItemId, catalog = emptyCatalog, activity = [], onAction, permissions }: InventoryProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StockFilter>('all')
  const [warehouseId, setWarehouseId] = useState('all')
  const [editor, setEditor] = useState<InventoryEditorSelection | null>(null)
  const [feedback, setFeedback] = useState('')
  const [updatedItemId, setUpdatedItemId] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const brand = catalog.brands.find((entry) => encodeURIComponent(entry.id) === selectedBrandId)
  const warehouse = catalog.warehouses.find((entry) => entry.id === brand?.warehouseId)
  const allBrandItems = brand ? catalog.items.filter((item) => item.brandId === brand.id) : []
  const selectedItem = allBrandItems.find((item) => encodeURIComponent(item.id) === selectedItemId)
  const updatedItem = catalog.items.find((item) => item.id === updatedItemId && item.quantity === 0)
  const selectedItemHeading = useRef<HTMLHeadingElement>(null)
  const summary = getInventorySummary(brand ? { ...catalog, brands: [brand], items: allBrandItems } : catalog)
  const groups = getBrandGroups(catalog, { query, status, warehouseId })
  const items = brand ? getBrandItems(catalog, brand.id, { query, status }) : []
  const brandPages = usePagination(groups, JSON.stringify([query.trim().toLowerCase(), status, warehouseId]))
  const itemPages = usePagination(items, JSON.stringify([selectedBrandId, query.trim().toLowerCase(), status]))
  const hasFilters = Boolean(query.trim()) || status !== 'all' || (!brand && warehouseId !== 'all')

  useEffect(() => {
    if (selectedItemId && selectedItemHeading.current) selectedItemHeading.current.focus()
    else heading.current?.focus()
  }, [selectedBrandId, selectedItemId])

  function clearFilters() { setQuery(''); setStatus('all'); setWarehouseId('all') }

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
          <p className="inventory__intro">{brand ? <><span>{onAction && warehouse ? <a href={`#warehouses/${encodeURIComponent(warehouse.id)}`}>{warehouse.name}</a> : warehouse?.name}</span>{brand.description}</> : 'Stock across your warehouses, organised by brand.'}</p>
        </div>
        <span className="inventory__sample"><span aria-hidden="true" />{onAction ? 'Live inventory' : 'Sample inventory'}</span>
      </div>
      {onAction && <div className="stock-actions inventory__actions">
        {brand && permissions?.canManageBrands !== false && <ActionIconButton icon="gallery" label={brand.hasProfilePhoto ? 'Change brand picture' : 'Add brand picture'} className="stock-button" type="button" onClick={() => setEditor({ mode: 'brand-photo', brandId: brand.id })} />}
        {brand && permissions?.canManageBrands === true && <InventoryDeleteButton action={{ type: 'delete-brand', brandId: brand.id }} name={brand.name}
          disabledReason={allBrandItems.some((item) => item.quantity !== 0) ? 'All items must be at zero stock.' : undefined} onSave={onAction}
          onDeleted={() => { setFeedback('Brand and its zero-stock items deleted.'); window.location.hash = 'inventory' }} />}
        {!brand && <><ActionIconButton icon="pen" label="Add warehouse" className="stock-button" type="button" disabled={permissions?.canCreateWarehouse === false} onClick={() => setEditor({ mode: 'warehouse' })} /><ActionIconButton icon="pen" label="Add brand" className="stock-button" type="button" disabled={!catalog.warehouses.length || permissions?.canManageBrands === false} onClick={() => setEditor({ mode: 'brand', warehouseId: warehouseId === 'all' ? undefined : warehouseId })} /></>}
        <ActionIconButton icon="pen" label="Add stock" className="stock-button stock-button--primary" type="button" disabled={!catalog.brands.length || permissions?.canManageItems === false} onClick={() => setEditor({ mode: 'item', brandId: brand?.id, warehouseId: brand?.warehouseId ?? (warehouseId === 'all' ? undefined : warehouseId) })} />
        {!brand && <a className="stock-button" href="#warehouses">View warehouses</a>}
      </div>}
      {feedback && <p className="stock-feedback" role="status">{feedback}</p>}
      {updatedItem && onAction && permissions?.canManageItems === true && <div className="inventory__delete-ready" aria-label="Zero-stock item ready to delete">
        <p><strong>{updatedItem.name}</strong> now has zero stock and can be deleted.</p>
        <InventoryDeleteButton action={{ type: 'delete-item', itemId: updatedItem.id }} name={updatedItem.name} onSave={onAction}
          onDeleted={() => { setUpdatedItemId(''); setFeedback('Stock item deleted.'); if (selectedItemId === encodeURIComponent(updatedItem.id)) window.location.hash = `inventory/${encodeURIComponent(updatedItem.brandId)}` }} />
      </div>}
      {brand?.hasProfilePhoto && <InventoryPhoto resource="brands" id={brand.id} hasPhoto version={brand.photoUpdatedAt} alt={`${brand.name} brand picture`} className="inventory-photo--detail" />}

      {selectedItem && <section className="inventory__selected-item" aria-labelledby="selected-item-heading">
        {selectedItem.hasProfilePhoto && <InventoryPhoto resource="items" id={selectedItem.id} hasPhoto version={selectedItem.photoUpdatedAt} alt={selectedItem.name} className="inventory-photo--detail" />}
        <div className="inventory__selected-item-heading">
          <div><p className="eyebrow">SELECTED STOCK ITEM</p><h2 id="selected-item-heading" ref={selectedItemHeading} tabIndex={-1}>{selectedItem.name}</h2>{selectedItem.sku && <p className="inventory__selected-sku">{selectedItem.sku}</p>}</div>
          <span className={`inventory__stock inventory__stock--${getStockStatus(selectedItem)}`}>{stockStatusLabels[getStockStatus(selectedItem)]}</span>
        </div>
        <dl>
          <div><dt>Warehouse</dt><dd>{warehouse?.name ?? 'Not assigned'}</dd></div>
          <div><dt>Storage location</dt><dd>{selectedItem.location || 'Not recorded'}</dd></div>
          <div><dt>On hand</dt><dd>{selectedItem.quantity.toLocaleString('en-ZA')} {selectedItem.unit}</dd></div>
          <div><dt>Low-stock threshold</dt><dd>{selectedItem.reorderLevel.toLocaleString('en-ZA')} {selectedItem.unit}</dd></div>
        </dl>
        {getStockStatus(selectedItem) !== 'in-stock' && <p className="inventory__selected-hint">Add stock above {selectedItem.reorderLevel.toLocaleString('en-ZA')} {selectedItem.unit} to clear this alert.</p>}
        <div className="stock-actions">
          {onAction && permissions?.canManageItems !== false && <ActionIconButton icon="pen" label="Update quantity" className="stock-button stock-button--primary" type="button" onClick={() => setEditor({ mode: 'quantity', itemId: selectedItem.id })} />}
          {onAction && permissions?.canManageItems !== false && <ActionIconButton icon="gallery" label={selectedItem.hasProfilePhoto ? 'Change item picture' : 'Add item picture'} className="stock-button" type="button" onClick={() => setEditor({ mode: 'item-photo', itemId: selectedItem.id })} />}
          {onAction && permissions?.canManageItems === true && <InventoryDeleteButton action={{ type: 'delete-item', itemId: selectedItem.id }} name={selectedItem.name}
            disabledReason={selectedItem.quantity !== 0 ? 'Stock must be zero before deletion.' : undefined} onSave={onAction}
            onDeleted={() => { setFeedback('Stock item deleted.'); window.location.hash = `inventory/${encodeURIComponent(selectedItem.brandId)}` }} />}
          <a className="stock-button" href={`#inventory/${encodeURIComponent(selectedItem.brandId)}`}>Back to brand items</a>
        </div>
      </section>}
      {brand && selectedItemId && !selectedItem && <p className="stock-feedback" role="status">This stock item is no longer available. The brand's current items are listed below.</p>}

      <dl className="inventory__overview" aria-label={brand ? 'Brand stock overview' : 'Warehouse stock overview'}>
        <div><dt>{brand ? 'Storage locations' : 'Brands'}</dt><dd>{brand ? new Set(allBrandItems.map((item) => item.location)).size : summary.brands}</dd></div>
        <div><dt>Item lines</dt><dd>{summary.itemLines}<span>stock items</span></dd></div>
        <div><dt>Need attention</dt><dd>{summary.needsAttention}<span>{summary.lowStock} low · {summary.outOfStock} out of stock</span></dd></div>
      </dl>

      <div className="inventory__section-heading"><h2>{brand ? 'Brand items' : 'Browse brands'}</h2><span>{brand ? 'Stock & storage' : `${catalog.warehouses.length} warehouses represented`}</span></div>
      <div className="inventory__filters">
        <div className="inventory__search"><label htmlFor="inventory-search">{brand ? 'Search items' : 'Search inventory'}</label><input id="inventory-search" type="search" placeholder={brand ? 'Item, SKU, or location' : 'Brand, warehouse, item, or SKU'} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {!brand && <div><label htmlFor="inventory-warehouse">Warehouse</label><select id="inventory-warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="all">All warehouses</option>{catalog.warehouses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></div>}
        <div><label htmlFor="inventory-status">Stock status</label><select id="inventory-status" value={status} onChange={(event) => setStatus(event.target.value as StockFilter)}><option value="all">All stock</option><option value="in-stock">In stock</option><option value="low-stock">Low stock</option><option value="out-of-stock">Out of stock</option></select></div>
      </div>
      <div className="inventory__results"><p role="status">{brand ? `${items.length} of ${allBrandItems.length} item lines` : `${groups.length} ${groups.length === 1 ? 'brand' : 'brands'}`}{hasFilters ? ' matching your filters' : ''}</p>{hasFilters && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>

      {brand ? (
        items.length ? (
          <div className="inventory__table-wrap" role="region" aria-label={`${brand.name} inventory items`} tabIndex={0}>
            <table className="inventory__table">
              <caption className="inventory__sr-only">{brand.name} items, quantities, warehouse locations, and stock status</caption>
              <thead><tr><th scope="col">Item</th><th scope="col">Location</th><th scope="col">On hand</th><th scope="col">Reorder at</th><th scope="col">Status</th>{onAction && <th scope="col">Actions</th>}</tr></thead>
              <tbody>{itemPages.items.map((item) => {
                const itemStatus = getStockStatus(item)
                return <tr key={item.id}><th scope="row"><div className="inventory__item-identity">
                  {item.hasProfilePhoto && <InventoryPhoto resource="items" id={item.id} hasPhoto version={item.photoUpdatedAt} alt={item.name} className="inventory-photo--thumbnail" />}
                  <div><a className="inventory__item-name" href={`#inventory/${encodeURIComponent(item.brandId)}/${encodeURIComponent(item.id)}`}>{item.name}</a>{item.sku && <span className="inventory__sku">{item.sku}</span>}
                    {onAction && permissions?.canManageItems === true && item.quantity === 0 && <div className="inventory__item-delete"><InventoryDeleteButton action={{ type: 'delete-item', itemId: item.id }} name={item.name} onSave={onAction}
                      onDeleted={() => { setFeedback('Stock item deleted.'); if (selectedItemId === encodeURIComponent(item.id)) window.location.hash = `inventory/${encodeURIComponent(item.brandId)}` }} /></div>}
                  </div>
                </div></th><td><span className="inventory__location">{item.location}</span></td><td className="inventory__quantity">{item.quantity.toLocaleString('en-ZA')}<span>{item.unit}</span></td><td>{item.reorderLevel}<span className="inventory__unit"> {item.unit}</span></td><td><span className={`inventory__stock inventory__stock--${itemStatus}`}><i aria-hidden="true" />{stockStatusLabels[itemStatus]}</span></td>{onAction && <td><div className="stock-actions"><ActionIconButton icon="pen" label="Update quantity" type="button" className="stock-button stock-button--small" disabled={permissions?.canManageItems === false} aria-label={`Update quantity for ${item.name}`} onClick={() => setEditor({ mode: 'quantity', itemId: item.id })} /><ActionIconButton icon="gallery" label={item.hasProfilePhoto ? 'Change picture' : 'Add picture'} type="button" className="stock-button stock-button--small" disabled={permissions?.canManageItems === false} aria-label={`Update picture for ${item.name}`} onClick={() => setEditor({ mode: 'item-photo', itemId: item.id })} />
                  {permissions?.canManageItems === true && item.quantity !== 0 && <InventoryDeleteButton action={{ type: 'delete-item', itemId: item.id }} name={item.name}
                    disabledReason="Stock must be zero before deletion." onSave={onAction}
                    onDeleted={() => { setFeedback('Stock item deleted.'); if (selectedItemId === encodeURIComponent(item.id)) window.location.hash = `inventory/${encodeURIComponent(item.brandId)}` }} />}
                </div></td>}</tr>
              })}</tbody>
            </table>
          </div>
        ) : <div className="inventory__empty"><WorkspaceIcon name="inventory" size={32} /><h3>{allBrandItems.length ? 'No items match your filters.' : 'No items in this brand yet.'}</h3><p>{allBrandItems.length ? 'Try a different item, SKU, location, or stock status.' : 'Items will appear here when this brand has warehouse stock.'}</p>{hasFilters && <button className="inventory__empty-action" type="button" onClick={clearFilters}>Show all brand items</button>}</div>
      ) : (
        groups.length ? <ul className="inventory__brands">{brandPages.items.map(({ brand: entry, warehouse: owner, items: brandItems, needsAttention }, index) => (
          <li key={entry.id}><a href={`#inventory/${encodeURIComponent(entry.id)}`} className="inventory-brand">
            <div className="inventory-brand__top"><InventoryPhoto resource="brands" id={entry.id} hasPhoto={entry.hasProfilePhoto} version={entry.photoUpdatedAt} alt={`${entry.name} brand picture`} className="inventory-brand__monogram" fallback={<span aria-hidden="true">{entry.initials}</span>} /><span className="inventory-brand__number" aria-hidden="true">{String(brandPages.start + index).padStart(2, '0')}</span></div>
            <p className="inventory-brand__warehouse">{owner?.name ?? 'Warehouse not assigned'}</p>
            <h3>{entry.name}</h3><p className="inventory-brand__description">{entry.description}</p>
            <div className="inventory-brand__counts"><span>{brandItems.length} {brandItems.length === 1 ? 'item line' : 'item lines'}</span><span className={needsAttention ? 'inventory-brand__attention' : ''}>{needsAttention ? `${needsAttention} need attention` : brandItems.length ? 'Stock levels healthy' : 'No stock listed'}</span></div>
            <div className="inventory-brand__footer"><span>View items</span><WorkspaceIcon name="arrow" size={18} /></div>
          </a></li>
        ))}</ul> : <div className="inventory__empty"><WorkspaceIcon name="inventory" size={32} /><h3>{catalog.brands.length ? 'No brands match your filters.' : 'No brands added yet.'}</h3><p>{catalog.brands.length ? 'Try another brand, warehouse, item name, or SKU.' : 'Warehouse brands and their items will appear here.'}</p>{hasFilters && <button className="inventory__empty-action" type="button" onClick={clearFilters}>Show all brands</button>}</div>
      )}
      {brand ? <ListPagination {...itemPages} label="items" href={`#inventory/${encodeURIComponent(brand.id)}`} /> : <ListPagination {...brandPages} label="brands" href="#inventory" />}
      <InventoryActivity events={brand ? activity.filter((event) => event.brandId === brand.id) : activity} activeItemIds={new Set(catalog.items.map(item => item.id))} />
      {editor && onAction && <InventoryEditor key={`${editor.mode}/${editor.warehouseId ?? ''}/${editor.brandId ?? ''}/${editor.itemId ?? ''}`} selection={editor} catalog={catalog} onSave={onAction} onClose={() => { setEditor(null); heading.current?.focus() }} onAddBrand={permissions?.canManageBrands === false ? undefined : (id) => setEditor({ mode: 'brand', warehouseId: id })} onComplete={(id, action) => {
        setUpdatedItemId(action.type === 'adjust-quantity' ? action.itemId : '')
        setEditor(null); setFeedback(action.type === 'set-brand-photo' || action.type === 'set-item-photo' ? 'Picture saved.' : action.type === 'adjust-quantity' ? 'Stock quantity updated. The employee and reason are recorded in warehouse activity.' : 'Warehouse details saved.'); heading.current?.focus()
        if (action.type === 'add-warehouse' || action.type === 'add-brand' || action.type === 'add-item') clearFilters()
        if (action.type === 'add-warehouse') window.location.hash = `warehouses/${encodeURIComponent(id)}`
        if (action.type === 'add-brand') window.location.hash = `inventory/${encodeURIComponent(id)}`
        if (action.type === 'add-item') window.location.hash = `inventory/${encodeURIComponent(action.input.brandId)}`
      }} />}
    </section>
  )
}
