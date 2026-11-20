import { useEffect, useRef, useState } from 'react'
import type { EmployeeAccount, EmployeeAccountType, EmployeeCreate, EmployeeDetails, EmployeeProfile, EmployeeUpdate } from '../types/employees'
import { accountTypeLabels, canChangeAccountType, canEditEmployeeAccounts, employeeFieldLabels, employeeFields, jobTitleLabel } from '../data/employeeAccounts'
import EmployeeCard from './EmployeeCard'
import CreateEmployeeDialog from './CreateEmployeeDialog'
import ChangeAccountTypeForm from './ChangeAccountTypeForm'
import { errorMessage } from '../api/client'
import WorkspaceIcon from './WorkspaceIcon'
import ListPagination from './ListPagination'
import { usePagination } from '../hooks/usePagination'
import './EmployeeAccounts.css'

interface EmployeeAccountsProps {
  onOpen?: (id: string) => Promise<void>
  accounts: EmployeeAccount[]
  viewer: EmployeeProfile
  selectedId?: string
  onSave: (accountId: string, details: EmployeeUpdate) => Promise<string | null>
  onCreate?: (details: EmployeeCreate) => Promise<string | null>
  onChangeAccountType?: (accountId: string, accountRole: EmployeeAccountType) => Promise<string | null>
}

const dateFormat = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg',
})

function EditEmployeeForm({ account, onSave, onCancel }: {
  account: EmployeeAccount
  onSave: (details: EmployeeUpdate) => Promise<string | null>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<EmployeeDetails>(() => ({
    employeeId: account.profile.employeeId, fullName: account.profile.fullName,
    email: account.profile.email,
  }))
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => { firstField.current?.focus() }, [])

  return (
    <form className="employee-editor" aria-busy={saving} onSubmit={async (event) => {
      event.preventDefault()
      if (saving) return
      if (password !== confirmPassword) { setError('The new passwords do not match.'); return }
      setSaving(true)
      setError('')
      try {
        const error = await onSave({ ...draft, ...(password ? { password } : {}) })
        if (error) setError(error)
      } catch {
        setError('The changes could not be saved. Please try again.')
      } finally {
        setSaving(false)
      }
    }}>
      <h2>Edit account</h2>
      <p>Update the employee's details. Your name will be recorded with the changes.</p>
      {employeeFields.map((field, index) => (
        <div className="field" key={field}>
          <label htmlFor={`edit-${field}`}>{employeeFieldLabels[field]}</label>
          <input disabled={saving} ref={index === 0 ? firstField : undefined} id={`edit-${field}`} type={field === 'email' ? 'email' : 'text'} value={draft[field]} required maxLength={field === 'email' ? 254 : field === 'employeeId' ? 32 : field === 'fullName' ? 100 : 80} onChange={(event) => {
            setDraft({ ...draft, [field]: event.target.value })
            setError('')
          }} />
        </div>
      ))}
      <div className="field">
        <label htmlFor="edit-job-title">Job title</label>
        <input id="edit-job-title" value={jobTitleLabel(account.profile.role)} readOnly aria-describedby="edit-job-title-hint" />
        <p id="edit-job-title-hint" className="employee-editor__password-hint">Use Change job title / account type to update this value.</p>
      </div>
      <div className="field">
        <label htmlFor="edit-password">New password</label>
        <input id="edit-password" type="password" autoComplete="new-password" value={password} minLength={8} maxLength={128} disabled={saving} aria-describedby="edit-password-hint" onChange={(event) => { setPassword(event.target.value); setError('') }} />
        <p id="edit-password-hint" className="employee-editor__password-hint">Leave blank to keep the current password. Use at least 8 characters.</p>
      </div>
      <div className="field">
        <label htmlFor="edit-confirm-password">Confirm new password</label>
        <input id="edit-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} required={password.length > 0} maxLength={128} disabled={saving} onChange={(event) => { setConfirmPassword(event.target.value); setError('') }} />
      </div>
      {error && <p className="employee-editor__error" role="alert">{error}</p>}
      <div className="employee-editor__actions">
        <button className="account-button account-button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        <button className="account-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  )
}

function EmployeeAccountDetail({ account, viewer, onSave, onChangeAccountType }: {
  account: EmployeeAccount
  viewer: EmployeeProfile
  onSave: EmployeeAccountsProps['onSave']
  onChangeAccountType: EmployeeAccountsProps['onChangeAccountType']
}) {
  const [editing, setEditing] = useState(false)
  const [changingType, setChangingType] = useState(false)
  const [saved, setSaved] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const canEdit = canEditEmployeeAccounts(viewer) && (!account.profile.accountRole || account.profile.accountRole === 'Nemployee')
  const canChangeType = canChangeAccountType(viewer) && Boolean(account.profile.accountRole && onChangeAccountType)
  const latestEdit = account.editHistory.at(-1)

  useEffect(() => {
    if (!editing && !changingType) heading.current?.focus()
  }, [editing, changingType])

  return (
    <section className="employee-accounts" aria-labelledby="employee-account-heading">
      <a className="employee-accounts__back" href="#employees">← Employee accounts</a>
      <div className="employee-accounts__title">
        <div><p className="eyebrow">EMPLOYEE ACCOUNT</p><h1 ref={heading} id="employee-account-heading" tabIndex={-1}>{account.profile.fullName}</h1></div>
        <div className="employee-accounts__actions">
          {canEdit && !editing && !changingType && <button className="account-button" type="button" onClick={() => { setEditing(true); setSaved(false) }}>Edit</button>}
          {canChangeType && !editing && !changingType && <button className="account-button" type="button" onClick={() => { setChangingType(true); setSaved(false) }}>Change job title / account type</button>}
        </div>
      </div>
      {saved && <p className="employee-accounts__saved" role="status">Changes saved. Edited by {latestEdit?.editedBy.fullName}.</p>}
      <div className="employee-accounts__detail">
        <div className="employee-accounts__card"><EmployeeCard employee={account.profile} /></div>
        <div className="employee-accounts__information">
          {account.profile.accountRole && <p className="employee-accounts__type">Account type: <strong>{accountTypeLabels[account.profile.accountRole]}</strong></p>}
          {changingType && canChangeType && onChangeAccountType ? (
            <ChangeAccountTypeForm profile={account.profile} viewer={viewer} onCancel={() => setChangingType(false)} onSave={async accountRole => {
              const error = await onChangeAccountType(account.profile.id, accountRole)
              if (!error) { setChangingType(false); setSaved(true) }
              return error
            }} />
          ) : editing && canEdit ? (
            <EditEmployeeForm account={account} onCancel={() => setEditing(false)} onSave={async (details) => {
              const error = await onSave(account.profile.id, details)
              if (!error) { setEditing(false); setSaved(true) }
              return error
            }} />
          ) : (
            <section className="employee-accounts__activity" aria-label="Account activity">
              <p className="eyebrow">ACCOUNT ACTIVITY</p>
              <h2>{latestEdit ? 'Last edited' : 'No edits yet'}</h2>
              {latestEdit ? (
                <p className="employee-accounts__last-edit">By <strong>{latestEdit.editedBy.fullName}</strong> · {latestEdit.editedBy.employeeId}<br /><time dateTime={latestEdit.editedAt}>{dateFormat.format(new Date(latestEdit.editedAt))} SAST</time></p>
              ) : <p>Changes to this account will appear here, along with the employee who made them.</p>}
              {!canEdit && <p className="employee-accounts__permission">Staff managers can change account types and edit normal employee details.</p>}
              {account.editHistory.length > 0 && (
                <details className="employee-accounts__history">
                  <summary>Edit history ({account.editHistory.length})</summary>
                  <ol>
                    {[...account.editHistory].reverse().map((edit) => (
                      <li key={edit.id}>
                        <strong>{edit.editedBy.fullName}</strong><span>{jobTitleLabel(edit.editedBy.role)} · {edit.editedBy.employeeId}</span>
                        <time dateTime={edit.editedAt}>{dateFormat.format(new Date(edit.editedAt))} SAST</time>
                        <dl>{edit.changes.map((change) => (
                          <div key={change.field}><dt>{employeeFieldLabels[change.field]}</dt><dd><span>{change.field === 'role' || change.field === 'accountRole' ? jobTitleLabel(change.before) : change.before}</span><span aria-hidden="true"> → </span><span className="employee-accounts__sr-only"> changed to </span><strong>{change.field === 'role' || change.field === 'accountRole' ? jobTitleLabel(change.after) : change.after}</strong></dd></div>
                        ))}{edit.passwordChanged && <div><dt>Password</dt><dd>Password changed</dd></div>}</dl>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  )
}

export default function EmployeeAccounts({ accounts, viewer, selectedId, onSave, onCreate, onOpen, onChangeAccountType }: EmployeeAccountsProps) {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdName, setCreatedName] = useState('')
  const createButton = useRef<HTMLButtonElement>(null)
  const canCreate = viewer.accountRole === 'StaffManager' && viewer.status === 'Active' && Boolean(onCreate)
  const [historyResult, setHistoryResult] = useState({ id: '', error: '' })
  const historyError = historyResult.id === selectedId ? historyResult.error : ''
  const loadingHistory = Boolean(onOpen && selectedId && historyResult.id !== selectedId)
  useEffect(() => {
    if (!selectedId || !onOpen) return
    let cancelled = false
    void onOpen(decodeURIComponent(selectedId)).then(() => {
      if (!cancelled) setHistoryResult({ id: selectedId, error: '' })
    }).catch((error) => {
      if (!cancelled) setHistoryResult({ id: selectedId, error: errorMessage(error) })
    })
    return () => { cancelled = true }
  }, [selectedId, onOpen])
  const heading = useRef<HTMLHeadingElement>(null)
  const query = search.trim().toLowerCase()
  const filtered = accounts.filter(({ profile }) => [...employeeFields.map(field => profile[field]), jobTitleLabel(profile.role)].some(value => value.toLowerCase().includes(query)))
  const accountPages = usePagination(filtered, query)
  useEffect(() => { heading.current?.focus() }, [selectedId])

  if (selectedId) {
    const account = accounts.find((entry) => encodeURIComponent(entry.profile.id) === selectedId)
    if (account) return <>
      {loadingHistory && <p role="status">Loading account activity...</p>}
      {historyError && <p role="alert">{historyError} <button type="button" onClick={() => { if (onOpen) void onOpen(account.profile.id).then(() => setHistoryResult({ id: selectedId, error: '' })).catch((error) => setHistoryResult({ id: selectedId, error: errorMessage(error) })) }}>Retry</button></p>}
      <EmployeeAccountDetail key={account.profile.id} account={account} viewer={viewer} onSave={onSave} onChangeAccountType={onChangeAccountType} />
    </>
    return <section className="employee-accounts"><h1 ref={heading} tabIndex={-1}>Account not found</h1><a className="employee-accounts__back" href="#employees">Back to employee accounts</a></section>
  }

  return (
    <section className="employee-accounts" aria-labelledby="employee-accounts-heading">
      <p className="eyebrow">G-STOCK / YOUR PEOPLE</p>
      <div className="employee-accounts__heading">
        <h1 id="employee-accounts-heading" ref={heading} tabIndex={-1}>Employee accounts</h1>
        {canCreate && <button ref={createButton} className="account-button account-button--primary" type="button" onClick={() => { setCreating(true); setCreatedName('') }}>Add employee account</button>}
      </div>
      <p className="workspace__description">Find an employee and open their card.</p>
      {createdName && <p className="employee-accounts__saved" role="status">Account created for {createdName}. They can now sign in.</p>}
      <p className="employee-accounts__viewer">Viewing as <strong>{viewer.fullName}</strong> · {jobTitleLabel(viewer.role)}</p>
      <div className="employee-accounts__toolbar">
        <div><label htmlFor="employee-search">Search employee accounts</label><input id="employee-search" type="search" placeholder="Name, ID, email, or job title" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <p role="status">{filtered.length} {filtered.length === 1 ? 'account' : 'accounts'}</p>
      </div>
      <div className="employee-accounts__columns" aria-hidden="true"><span>Employee</span><span>Job title</span><span /></div>
      <ul className="employee-accounts__list">
        {accountPages.items.map(({ profile }) => (
          <li key={profile.id}>
            <a href={`#employees/${encodeURIComponent(profile.id)}`}>
              <span className="employee-accounts__name"><strong>{profile.fullName}</strong><span>{profile.employeeId} · {profile.email}</span></span>
              <span className="employee-accounts__role">{jobTitleLabel(profile.role)}</span>
              <WorkspaceIcon name="arrow" size={18} />
            </a>
          </li>
        ))}
      </ul>
      {!filtered.length && <p className="employee-accounts__empty">No employee accounts match your search.</p>}
      <ListPagination {...accountPages} label="employee accounts" href="#employees" />
      {creating && canCreate && onCreate && <CreateEmployeeDialog onSave={onCreate} onClose={() => { setCreating(false); createButton.current?.focus() }} onCreated={(name) => {
        setCreating(false)
        setCreatedName(name)
        setSearch('')
        accountPages.onPageChange(1)
        createButton.current?.focus()
      }} />}
    </section>
  )
}
