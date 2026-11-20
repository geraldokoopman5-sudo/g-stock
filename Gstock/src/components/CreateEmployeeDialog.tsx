import { useEffect, useId, useRef, useState } from 'react'
import type { EmployeeCreate } from '../types/employees'
import { employeeFieldLabels, employeeFields } from '../data/employeeAccounts'
import './InventoryManagement.css'

interface CreateEmployeeDialogProps {
  onSave: (details: EmployeeCreate) => Promise<string | null>
  onClose: () => void
  onCreated: (name: string) => void
}

const accountTypes = [
  { value: 'Nemployee', label: 'Employee', description: 'Create warehouses, add stock items, and update stock quantities.' },
  { value: 'StockManager', label: 'Stock Manager', description: 'Create warehouses and manage brands.' },
  { value: 'StaffManager', label: 'Staff Manager', description: 'Create accounts, change account types, and edit normal employee details. Cannot create warehouses.' },
] as const

export default function CreateEmployeeDialog({ onSave, onClose, onCreated }: CreateEmployeeDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const savingRef = useRef(false)
  const id = useId()
  const [accountRole, setAccountRole] = useState<EmployeeCreate['accountRole']>('Nemployee')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    element?.querySelector<HTMLInputElement>('input')?.focus()
    return () => { if (element?.open) element.close() }
  }, [])

  return (
    <dialog ref={dialog} className="stock-dialog employee-create-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); if (!savingRef.current) onClose() }}>
      <div className="stock-dialog__content">
        <header>
          <div><p className="eyebrow">EMPLOYEE ACCOUNTS</p><h2 id={`${id}-title`}>Add employee account</h2></div>
          <button className="stock-dialog__close" type="button" aria-label="Close account form" disabled={saving} onClick={onClose}>&times;</button>
        </header>
        <p id={`${id}-description`}>Create a sign-in account and choose what this person can manage.</p>
        <form className="stock-form" aria-busy={saving} onSubmit={async (event) => {
          event.preventDefault()
          if (savingRef.current) return
          const data = new FormData(event.currentTarget)
          const password = String(data.get('password') ?? '')
          if (password !== data.get('confirmPassword')) { setError('The passwords do not match.'); return }
          const details: EmployeeCreate = {
            employeeId: String(data.get('employeeId') ?? '').trim(),
            fullName: String(data.get('fullName') ?? '').trim(),
            department: String(data.get('department') ?? '').trim(),
            role: String(data.get('role') ?? '').trim(),
            email: String(data.get('email') ?? '').trim(),
            accountRole, password,
          }
          savingRef.current = true
          setSaving(true)
          setError('')
          try {
            const failure = await onSave(details)
            if (failure) setError(failure)
            else onCreated(details.fullName)
          } catch {
            setError('The account could not be created. Please try again.')
          } finally { savingRef.current = false; setSaving(false) }
        }}>
          <fieldset className="stock-form__fields" disabled={saving}>
            {employeeFields.map((field) => (
              <div className="field" key={field}>
                <label htmlFor={`${id}-${field}`}>{field === 'role' ? 'Job title' : employeeFieldLabels[field]}{field === 'department' && <span> (optional)</span>}</label>
                <input id={`${id}-${field}`} name={field} type={field === 'email' ? 'email' : 'text'} required={field !== 'department'}
                  autoComplete={field === 'email' ? 'off' : undefined}
                  maxLength={field === 'email' ? 254 : field === 'employeeId' ? 32 : field === 'fullName' ? 100 : 80} />
              </div>
            ))}
            <div className="field">
              <label htmlFor={`${id}-account-type`}>Account type</label>
              <select id={`${id}-account-type`} name="accountRole" value={accountRole} aria-describedby={`${id}-permissions`} onChange={(event) => setAccountRole(event.target.value as EmployeeCreate['accountRole'])}>
                {accountTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
              <p className="employee-create-dialog__hint" id={`${id}-permissions`}>{accountTypes.find((type) => type.value === accountRole)?.description}</p>
            </div>
            <div className="field">
              <label htmlFor={`${id}-password`}>Password</label>
              <input id={`${id}-password`} name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-describedby={`${id}-password-hint`} />
              <p className="employee-create-dialog__hint" id={`${id}-password-hint`}>Use between 8 and 128 characters.</p>
            </div>
            <div className="field">
              <label htmlFor={`${id}-confirm-password`}>Confirm password</label>
              <input id={`${id}-confirm-password`} name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
            </div>
            {error && <p className="stock-form__error" role="alert">{error}</p>}
            <div className="stock-form__actions">
              <button className="stock-button stock-button--primary" type="submit">{saving ? 'Creating account...' : 'Create account'}</button>
              <button className="stock-button" type="button" onClick={onClose}>Cancel</button>
            </div>
          </fieldset>
        </form>
      </div>
    </dialog>
  )
}
