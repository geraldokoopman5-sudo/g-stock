import { useEffect, useRef, useState } from 'react'
import type { InventoryActivity as Activity, InventoryCatalog, SaveInventoryAction } from '../types/inventory'
import { getBrandGroups } from '../data/inventory'
import InventoryEditor from './InventoryEditor'
import type { InventoryEditorSelection } from './InventoryEditor'
import InventoryActivity from './InventoryActivity'
import WorkspaceIcon from './WorkspaceIcon'
import ListPagination from './ListPagination'
import { usePagination } from '../hooks/usePagination'
import './Warehouses.css'

interface WarehousesProps {
  catalog: InventoryCatalog
  activity: readonly Activity[]
  selectedId?: string
  onAction: SaveInventoryAction
}

export default function Warehouses({ catalog, activity, selectedId, onAction }: WarehousesProps) {
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<InventoryEditorSelection | null>(null)
  const [feedback, setFeedback] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const warehouse = catalog.warehouses.find((entry) => encodeURIComponent(entry.id) === selectedId)
  const normalizedQuery = query.trim().toLowerCase()
  const warehouses = catalog.warehouses.filter((entry) => [entry.name, entry.contactName ?? '', entry.contactEmail ?? ''].some((value) => value.toLowerCase().includes(normalizedQuery))).slice().sort((a, b) => a.name.localeCompare(b.name))
  const groups = warehouse ? getBrandGroups(catalog, { warehouseId: warehouse.id }) : []
  const warehousePages = usePagination(warehouses, normalizedQuery)
  const brandPages = usePagination(groups, selectedId ?? '')
  useEffect(() => { heading.current?.focus() }, [selectedId])

  if (selectedId && !warehouse) return <section className="warehouses"><a className="warehouses__back" href="#warehouses">← All warehouses</a><h1 ref={heading} tabIndex={-1}>Warehouse not found</h1><p className="workspace__description">Choose an existing warehouse to view its stock.</p></section>

  return (
    <section className="warehouses" aria-labelledby="warehouses-heading">
      {warehouse ? <a className="warehouses__back" href="#warehouses">← All warehouses</a> : <p className="eyebrow">G-STOCK / WAREHOUSES</p>}
      <div className="warehouses__heading"><div><h1 id="warehouses-heading" ref={heading} tabIndex={-1}>{warehouse?.name ?? 'Warehouses'}</h1><p className="workspace__description">{warehouse ? 'Brands and stock held at this warehouse.' : 'Manage your warehouse locations, brands, and stock.'}</p></div>
        <div className="stock-actions">{warehouse ? <><button className="stock-button" type="button" onClick={() => setEditor({ mode: 'brand', warehouseId: warehouse.id })}>Add brand</button><button className="stock-button stock-button--primary" type="button" onClick={() => setEditor({ mode: 'item', warehouseId: warehouse.id })}>Add stock</button></> : <button className="stock-button stock-button--primary" type="button" onClick={() => setEditor({ mode: 'warehouse' })}>Add warehouse</button>}</div>
      </div>
      <p className="warehouses__local">Saved in this browser · Available to all employee accounts</p>
      {feedback && <p className="stock-feedback" role="status">{feedback}</p>}
      {warehouse ? <>
        <dl className="warehouses__contact"><div><dt>Contact name</dt><dd>{warehouse.contactName || 'Not added'}</dd></div><div><dt>Contact email</dt><dd>{warehouse.contactEmail ? <a href={`mailto:${warehouse.contactEmail}`}>{warehouse.contactEmail}</a> : 'Not added'}</dd></div><div><dt>Stock held</dt><dd>{groups.length} brands · {groups.reduce((count, group) => count + group.items.length, 0)} item lines</dd></div></dl>
        {warehouse.notes && <p className="warehouses__notes">{warehouse.notes}</p>}
        <h2 className="warehouses__section-title">Warehouse brands</h2>
        {groups.length ? <ul className="warehouses__brands">{brandPages.items.map(({ brand, items, needsAttention }) => <li key={brand.id}><a href={`#inventory/${encodeURIComponent(brand.id)}`}><span className="warehouses__monogram" aria-hidden="true">{brand.initials}</span><span><strong>{brand.name}</strong><span>{items.length} item lines{needsAttention ? ` · ${needsAttention} need attention` : ''}</span></span><WorkspaceIcon name="arrow" size={18} /></a></li>)}</ul> : <div className="warehouses__empty"><WorkspaceIcon name="inventory" size={32} /><h2>No brands for this warehouse yet.</h2><p>Add a brand, then add the stock your warehouse holds for it.</p><button className="stock-button" type="button" onClick={() => setEditor({ mode: 'brand', warehouseId: warehouse.id })}>Add first brand</button></div>}
        {groups.length > 0 && <ListPagination {...brandPages} label="brands" href={`#warehouses/${encodeURIComponent(warehouse.id)}`} />}
      </> : <>
        <div className="warehouses__search"><label htmlFor="warehouse-search">Search warehouses</label><input id="warehouse-search" type="search" value={query} placeholder="Warehouse name, contact, or email" onChange={(event) => setQuery(event.target.value)} /><p role="status">{warehouses.length} {warehouses.length === 1 ? 'warehouse' : 'warehouses'}</p></div>
        <ul className="warehouses__list">{warehousePages.items.map((entry) => {
          const brandIds = new Set(catalog.brands.filter((brand) => brand.warehouseId === entry.id).map((brand) => brand.id))
          const itemCount = catalog.items.filter((item) => brandIds.has(item.brandId)).length
          return <li key={entry.id}><a href={`#warehouses/${encodeURIComponent(entry.id)}`}><WorkspaceIcon name="warehouses" size={24} /><h2>{entry.name}</h2><p>{entry.contactName || 'Warehouse location'}</p><div><span>{brandIds.size} brands · {itemCount} item lines</span><WorkspaceIcon name="arrow" size={18} /></div></a></li>
        })}</ul>
        {!warehouses.length && <div className="warehouses__empty"><h2>{catalog.warehouses.length ? 'No warehouses match your search.' : 'Add your first warehouse.'}</h2><p>{catalog.warehouses.length ? 'Try another warehouse name or contact.' : 'Add a warehouse location, then organise its brands and stock.'}</p></div>}
        <ListPagination {...warehousePages} label="warehouses" href="#warehouses" />
      </>}
      <InventoryActivity events={warehouse ? activity.filter((event) => event.warehouseId === warehouse.id) : activity.filter((event) => event.type === 'warehouse-created')} />
      {editor && <InventoryEditor key={`${editor.mode}/${editor.warehouseId ?? ''}`} selection={editor} catalog={catalog} onSave={onAction} onClose={() => { setEditor(null); heading.current?.focus() }} onAddBrand={(warehouseId) => setEditor({ mode: 'brand', warehouseId })} onComplete={(id, action) => {
        setEditor(null); setFeedback('Warehouse details saved.'); heading.current?.focus()
        if (action.type === 'add-warehouse') { setQuery(''); window.location.hash = `warehouses/${encodeURIComponent(id)}` }
        if (action.type === 'add-brand') window.location.hash = `inventory/${encodeURIComponent(id)}`
        if (action.type === 'add-item') window.location.hash = `inventory/${encodeURIComponent(action.input.brandId)}`
      }} />}
    </section>
  )
}
