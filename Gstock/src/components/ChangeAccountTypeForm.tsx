import { useEffect, useRef, useState } from 'react'
import type { EmployeeAccountType, EmployeeProfile } from '../types/employees'
import { accountTypeLabels, canChangeAccountType } from '../data/employeeAccounts'
import { errorMessage } from '../api/client'

export default function ChangeAccountTypeForm({ profile, viewer, onSave, onCancel }: {
  profile: EmployeeProfile
  viewer: EmployeeProfile
  onSave: (accountRole: EmployeeAccountType) => Promise<string | null>
  onCancel: () => void
}) {
  const [accountRole, setAccountRole] = useState<EmployeeAccountType>(profile.accountRole ?? 'Nemployee')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const select = useRef<HTMLSelectElement>(null)
  useEffect(() => { select.current?.focus() }, [])

  if (!canChangeAccountType(viewer) || !profile.accountRole) return null
  return (
    <form className="employee-editor" aria-busy={saving} onSubmit={async event => {
      event.preventDefault()
      if (saving || accountRole === profile.accountRole) return
      setSaving(true)
      setError('')
      try {
        const message = await onSave(accountRole)
        if (message) setError(message)
      } catch (error) {
        setError(errorMessage(error))
      } finally { setSaving(false) }
    }}>
      <h2>Change job title / account type</h2>
      <p>Job title and account type stay the same. Choose the access this account should have. The account will need to sign in again after the change.</p>
      <div className="field">
        <label htmlFor="change-account-type">Job title / account type</label>
        <select ref={select} id="change-account-type" name="accountRole" value={accountRole} disabled={saving}
          onChange={event => { setAccountRole(event.target.value as EmployeeAccountType); setError('') }}>
          {(Object.entries(accountTypeLabels) as [EmployeeAccountType, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      {error && <p className="employee-editor__error" role="alert">{error}</p>}
      <div className="employee-editor__actions">
        <button className="account-button account-button--primary" type="submit" disabled={saving || accountRole === profile.accountRole}>
          {saving ? 'Saving...' : 'Save account type'}
        </button>
        <button className="account-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  )
}
