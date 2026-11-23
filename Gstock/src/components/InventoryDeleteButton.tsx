import { useEffect, useId, useRef, useState } from 'react'
import type { InventoryDeleteAction, SaveInventoryAction } from '../types/inventory'
import './InventoryManagement.css'

interface InventoryDeleteButtonProps {
  action: InventoryDeleteAction
  name: string
  disabledReason?: string
  onSave: SaveInventoryAction
  onDeleted: () => void
}

export default function InventoryDeleteButton({ action, name, disabledReason, onSave, onDeleted }: InventoryDeleteButtonProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const id = useId()
  const kind = action.type === 'delete-item' ? 'item' : action.type === 'delete-brand' ? 'brand' : 'warehouse'
  const label = `Delete ${kind}`

  useEffect(() => {
    if (!open) return
    const element = dialog.current
    if (!element?.open) element?.showModal()
    cancel.current?.focus()
    return () => { if (element?.open) element.close() }
  }, [open])

  function close() {
    if (savingRef.current) return
    setOpen(false)
    trigger.current?.focus()
  }

  return <div className="stock-delete">
    <button ref={trigger} className="stock-button stock-button--danger stock-button--small" type="button"
      disabled={Boolean(disabledReason)} aria-label={`${label} ${name}`} aria-describedby={disabledReason ? `${id}-reason` : undefined}
      onClick={() => { setError(''); setOpen(true) }}>{label}</button>
    {disabledReason && <span id={`${id}-reason`} className="stock-delete__reason">{disabledReason}</span>}
    {open && <dialog ref={dialog} className="stock-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); close() }}>
      <div className="stock-dialog__content">
        <header><div><p className="eyebrow">G-STOCK / DELETE</p><h2 id={`${id}-title`}>{label}?</h2></div></header>
        <form className="stock-form" onSubmit={async (event) => {
          event.preventDefault()
          if (savingRef.current || disabledReason) return
          savingRef.current = true
          setSaving(true)
          setError('')
          try {
            const result = await onSave(action)
            if (!result.ok) setError(result.error)
            else { setOpen(false); onDeleted() }
          } catch {
            setError('The record could not be deleted. Please try again.')
          } finally { savingRef.current = false; setSaving(false) }
        }}>
          <p id={`${id}-description`}>Delete <strong>{name}</strong>{kind === 'brand' ? ' and all its zero-stock items' : kind === 'warehouse' ? ', all its brands, and all its zero-stock items' : ''}? {kind === 'item' ? 'It will no longer appear in inventory or activity history.' : 'It will disappear from active lists. Activity history will be kept.'}</p>
          {disabledReason && <p className="stock-form__error" role="alert">{disabledReason}</p>}
          {error && <p className="stock-form__error" role="alert">{error}</p>}
          <div className="stock-form__actions">
            <button ref={cancel} className="stock-button" type="button" disabled={saving} onClick={close}>Cancel</button>
            <button className="stock-button stock-button--danger" type="submit" disabled={saving || Boolean(disabledReason)}>{saving ? 'Deleting…' : label}</button>
          </div>
        </form>
      </div>
    </dialog>}
  </div>
}
