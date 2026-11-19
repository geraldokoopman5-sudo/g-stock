import { useEffect, useId, useRef, useState } from 'react'
import type { InventoryAction, InventoryCatalog, QuantityMode, SaveInventoryAction } from '../types/inventory'
import { inventoryUnits, maxStockQuantity } from '../data/inventoryStore'
import './InventoryManagement.css'

export interface InventoryEditorSelection {
  mode: 'warehouse' | 'brand' | 'item' | 'quantity'
  warehouseId?: string
  brandId?: string
  itemId?: string
}

interface InventoryEditorProps {
  selection: InventoryEditorSelection
  catalog: InventoryCatalog
  onSave: SaveInventoryAction
  onClose: () => void
  onComplete: (id: string, action: InventoryAction) => void
  onAddBrand?: (warehouseId: string) => void
}

export default function InventoryEditor({ selection, catalog, onSave, onClose, onComplete, onAddBrand }: InventoryEditorProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const item = catalog.items.find((entry) => entry.id === selection.itemId)
  const initialBrand = catalog.brands.find((entry) => entry.id === (selection.brandId ?? item?.brandId))
  const [warehouseId, setWarehouseId] = useState(initialBrand?.warehouseId ?? selection.warehouseId ?? catalog.warehouses[0]?.id ?? '')
  const [brandId, setBrandId] = useState(initialBrand?.id ?? catalog.brands.find((entry) => entry.warehouseId === warehouseId)?.id ?? '')
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [quantity, setQuantity] = useState(selection.mode === 'item' ? '0' : '')
  const [unit, setUnit] = useState<(typeof inventoryUnits)[number]>('units')
  const [reorderLevel, setReorderLevel] = useState('0')
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('add')
  const [reason, setReason] = useState('')
  const expectedQuantity = item?.quantity ?? 0
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [address, setAddress] = useState({ streetName: '', suburbName: '', city: '', province: '', postalCode: '' })
  const availableBrands = catalog.brands.filter((entry) => entry.warehouseId === warehouseId)
  const title = { warehouse: 'Add warehouse', brand: 'Add brand', item: 'Add stock item', quantity: 'Update stock quantity' }[selection.mode]
  const previewQuantity = item && quantity !== '' ? quantityMode === 'set' ? Number(quantity) : expectedQuantity + Number(quantity) * (quantityMode === 'add' ? 1 : -1) : expectedQuantity

  useEffect(() => {
    const element = dialog.current
    if (!element?.open) element?.showModal()
    element?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')?.focus()
    return () => { if (element?.open) element.close() }
  }, [])

  return (
    <dialog ref={dialog} className="stock-dialog" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }} onClick={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}>
      <div className="stock-dialog__content">
        <header><div><p className="eyebrow">WAREHOUSE MANAGEMENT</p><h2 id={`${id}-title`}>{title}</h2></div><button className="stock-dialog__close" type="button" aria-label="Close form" disabled={saving} onClick={onClose}>×</button></header>
        <form className="stock-form" aria-busy={saving} onSubmit={async (event) => {
          event.preventDefault()
          if (savingRef.current) return
          let action: InventoryAction
          if (selection.mode === 'warehouse') action = { type: 'add-warehouse', input: { name, contactName, contactEmail, notes, ...address, postalCode: Number(address.postalCode) } }
          else if (selection.mode === 'brand') action = { type: 'add-brand', input: { warehouseId, name, description } }
          else if (selection.mode === 'item') action = { type: 'add-item', input: { brandId, name, location, quantity: Number(quantity), unit, reorderLevel: Number(reorderLevel) } }
          else action = { type: 'adjust-quantity', itemId: selection.itemId ?? '', mode: quantityMode, quantity: Number(quantity), expectedQuantity, reason }
          savingRef.current = true
          setSaving(true)
          setError('')
          try {
            const result = await onSave(action)
            if (!result.ok) setError(result.error)
            else onComplete(result.entityId, action)
          } catch {
            setError('The change could not be saved. Please try again.')
          } finally { savingRef.current = false; setSaving(false) }
        }}>
          <fieldset disabled={saving} className="stock-form__fields">
          {selection.mode === 'warehouse' && <>
            <p>Add a warehouse location to organise its brands and stock.</p>
            <div className="field"><label htmlFor={`${id}-name`}>Warehouse name</label><input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></div>
            {(['streetName', 'suburbName', 'city', 'province', 'postalCode'] as const).map((field) => <div className="field" key={field}>
              <label htmlFor={`${id}-${field}`}>{{ streetName: 'Street address', suburbName: 'Suburb', city: 'City', province: 'Province', postalCode: 'Postal code' }[field]}</label>
              <input id={`${id}-${field}`} value={address[field]} required inputMode={field === 'postalCode' ? 'numeric' : undefined} pattern={field === 'postalCode' ? '[0-9]{4}' : undefined} maxLength={field === 'postalCode' ? 4 : 200} onChange={(event) => setAddress({ ...address, [field]: event.target.value })} />
            </div>)}
            <div className="field"><label htmlFor={`${id}-contact`}>Contact name <span>(optional)</span></label><input id={`${id}-contact`} value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={100} /></div>
            <div className="field"><label htmlFor={`${id}-email`}>Contact email <span>(optional)</span></label><input id={`${id}-email`} type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} /></div>
            <div className="field"><label htmlFor={`${id}-notes`}>Warehouse notes <span>(optional)</span></label><textarea id={`${id}-notes`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} /></div>
          </>}
          {(selection.mode === 'brand' || selection.mode === 'item') && <div className="field"><label htmlFor={`${id}-warehouse`}>Warehouse</label><select id={`${id}-warehouse`} value={warehouseId} required onChange={(event) => { setWarehouseId(event.target.value); setBrandId(catalog.brands.find((entry) => entry.warehouseId === event.target.value)?.id ?? '') }}>{!catalog.warehouses.length && <option value="">Add a warehouse first</option>}{catalog.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div>}
          {selection.mode === 'brand' && <>
            <div className="field"><label htmlFor={`${id}-name`}>Brand name</label><input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></div>
            <div className="field"><label htmlFor={`${id}-description`}>Description <span>(optional)</span></label><textarea id={`${id}-description`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={250} rows={3} /></div>
          </>}
          {selection.mode === 'item' && <>
            <div className="field"><label htmlFor={`${id}-brand`}>Brand</label><select id={`${id}-brand`} value={brandId} required onChange={(event) => setBrandId(event.target.value)}>{!availableBrands.length && <option value="">No brands for this warehouse</option>}{availableBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div>
            {!availableBrands.length && warehouseId && <p className="stock-form__notice">A stock manager must add a brand before its stock can be added. {onAddBrand && <button type="button" onClick={() => onAddBrand(warehouseId)}>Add brand</button>}</p>}
            <div className="field"><label htmlFor={`${id}-name`}>Item name</label><input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></div>
            <p className="stock-form__notice">A unique SKU will be generated automatically when you save this item.</p>
            <div className="field"><label htmlFor={`${id}-location`}>Warehouse location</label><input id={`${id}-location`} placeholder="e.g. A-01-01" value={location} onChange={(event) => setLocation(event.target.value)} required maxLength={80} /></div>
            <div className="stock-form__row"><div className="field"><label htmlFor={`${id}-quantity`}>Opening quantity</label><input id={`${id}-quantity`} type="number" min={0} max={maxStockQuantity} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></div><div className="field"><label htmlFor={`${id}-unit`}>Unit</label><select id={`${id}-unit`} value={unit} onChange={(event) => setUnit(event.target.value as typeof unit)}>{inventoryUnits.map((value) => <option key={value} value={value}>{value}</option>)}</select></div></div>
            <div className="field"><label htmlFor={`${id}-reorder`}>Low-stock threshold</label><input id={`${id}-reorder`} type="number" min={0} max={maxStockQuantity} step={1} value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} required /></div>
          </>}
          {selection.mode === 'quantity' && <>
            <p><strong>{item?.name}</strong><br />{[item?.sku, item?.location].filter(Boolean).join(' · ')}</p>
            <div className="stock-form__balance"><span>Current stock</span><strong>{expectedQuantity.toLocaleString('en-ZA')} {item?.unit}</strong></div>
            <div className="field"><label htmlFor={`${id}-mode`}>Update type</label><select id={`${id}-mode`} value={quantityMode} onChange={(event) => setQuantityMode(event.target.value as QuantityMode)}><option value="add">Add stock</option><option value="remove">Remove stock</option><option value="set">Set counted quantity</option></select></div>
            <div className="field"><label htmlFor={`${id}-quantity`}>{quantityMode === 'set' ? 'New stock count' : 'Quantity to ' + quantityMode}</label><input id={`${id}-quantity`} type="number" min={quantityMode === 'set' ? 0 : 1} max={maxStockQuantity} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></div>
            <div className="stock-form__balance"><span>Stock after update</span><strong>{Number.isFinite(previewQuantity) ? previewQuantity.toLocaleString('en-ZA') : '—'} {item?.unit}</strong></div>
            <div className="field"><label htmlFor={`${id}-reason`}>Reason for update</label><textarea id={`${id}-reason`} placeholder="e.g. Stock received, stock issued, or recount correction" value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} rows={3} /></div>
          </>}
          {error && <p className="stock-form__error" role="alert">{error}</p>}
          <div className="stock-form__actions"><button className="stock-button stock-button--primary" type="submit" disabled={(selection.mode === 'brand' && !warehouseId) || (selection.mode === 'item' && !brandId)}>{selection.mode === 'quantity' ? 'Save quantity' : title}</button><button className="stock-button" type="button" onClick={onClose}>Cancel</button></div>
          </fieldset>
        </form>
      </div>
    </dialog>
  )
}
