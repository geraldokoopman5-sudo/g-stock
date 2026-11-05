import { demoEmployees } from './employees'
import type { EmployeeAccount, EmployeeDetails, EmployeeField, EmployeeProfile, EmployeeUpdate } from '../types/employees'
import { createPasswordVerifier, isPasswordVerifier } from './employeePasswords'

export const employeeStorageKey = 'g-stock.employee-accounts.v1'
export const employeeFields = ['employeeId', 'fullName', 'department', 'role', 'email'] as const satisfies readonly EmployeeField[]
export const employeeFieldLabels: Record<EmployeeField, string> = {
  employeeId: 'Employee ID', fullName: 'Full name', department: 'Department', role: 'Role', email: 'Email address',
}

export function isManager(employee: EmployeeProfile) {
  return employee.role.trim().toLowerCase() === 'manager'
}

// Temporary preview policy. Restore this flag when manager-only editing is needed.
export const restrictEmployeeEditingToManagers = false
export function canEditEmployeeAccounts(employee: EmployeeProfile) {
  return !restrictEmployeeEditingToManagers || isManager(employee)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStoredAccount(value: unknown): value is EmployeeAccount {
  if (!isRecord(value) || !isRecord(value.profile) || !Array.isArray(value.editHistory)) return false
  const profile = value.profile
  if (typeof profile.id !== 'string' || !profile.id || !employeeFields.every((key) => typeof profile[key] === 'string' && profile[key].trim())) return false
  if ('password' in profile) return false
  if (value.passwordVerifier !== undefined && !isPasswordVerifier(value.passwordVerifier)) return false
  return value.editHistory.every((edit: unknown) => {
    if (!isRecord(edit) || typeof edit.id !== 'string' || typeof edit.editedAt !== 'string' || !Number.isFinite(Date.parse(edit.editedAt))) return false
    const editor = edit.editedBy
    if (edit.passwordChanged !== undefined && typeof edit.passwordChanged !== 'boolean') return false
    if (!isRecord(editor) || !['id', 'employeeId', 'fullName', 'role'].every((key) => typeof editor[key] === 'string')) return false
    return Array.isArray(edit.changes) && edit.changes.every((change: unknown) => isRecord(change) && employeeFields.includes(change.field as EmployeeField) && typeof change.before === 'string' && typeof change.after === 'string')
  })
}

export function loadEmployeeAccounts(): EmployeeAccount[] {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(employeeStorageKey)
    if (raw) {
      const stored: unknown = JSON.parse(raw)
      if (Array.isArray(stored) && stored.length > 0 && stored.every(isStoredAccount)) {
        const unique = (field: 'id' | 'email' | 'employeeId') => new Set(stored.map((entry) => entry.profile[field].toLowerCase())).size === stored.length
        if (unique('id') && unique('email') && unique('employeeId')) return stored
      }
    }
  } catch { /* An unavailable or invalid preview store starts with the sample accounts. */ }
  return demoEmployees.map((profile) => ({ profile: { ...profile }, editHistory: [] }))
}

type UpdateResult = { ok: true; accounts: EmployeeAccount[] } | { ok: false; error: string }

/** Local preview policy; the editor must still be an existing employee account. */
export async function updateEmployeeAccount(accounts: EmployeeAccount[], actorId: string, targetId: string, draft: EmployeeUpdate): Promise<UpdateResult> {
  const actor = accounts.find((account) => account.profile.id === actorId)?.profile
  if (!actor) return { ok: false, error: 'Sign in to edit employee accounts.' }
  if (!canEditEmployeeAccounts(actor)) return { ok: false, error: 'Only a manager can edit employee accounts.' }
  const target = accounts.find((account) => account.profile.id === targetId)
  if (!target) return { ok: false, error: 'This employee account could not be found.' }

  // Explicitly select editable profile fields; credentials and internal IDs cannot enter the record.
  const details: EmployeeDetails = {
    employeeId: draft.employeeId.trim(), fullName: draft.fullName.trim(),
    department: draft.department.trim(), role: draft.role.trim(), email: draft.email.trim(),
  }
  const limits = { employeeId: 32, fullName: 100, department: 80, role: 80, email: 254 }
  for (const field of employeeFields) {
    if (!details[field]) return { ok: false, error: `${employeeFieldLabels[field]} is required.` }
    if (details[field].length > limits[field]) return { ok: false, error: `${employeeFieldLabels[field]} is too long.` }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) return { ok: false, error: 'Enter a valid email address.' }
  for (const field of ['employeeId', 'email'] as const) {
    if (accounts.some((account) => account.profile.id !== targetId && account.profile[field].toLowerCase() === details[field].toLowerCase())) {
      return { ok: false, error: `${employeeFieldLabels[field]} is already used by another employee.` }
    }
  }
  const changes = employeeFields.filter((field) => details[field] !== target.profile[field]).map((field) => ({ field, before: target.profile[field], after: details[field] }))
  const newPassword = draft.password ?? ''
  if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) return { ok: false, error: 'Use a password between 8 and 128 characters.' }
  if (!changes.length && !newPassword) return { ok: false, error: 'No changes to save.' }
  const passwordVerifier = newPassword ? await createPasswordVerifier(newPassword) : target.passwordVerifier
  const edit = {
    id: crypto.randomUUID(), editedAt: new Date().toISOString(),
    editedBy: { id: actor.id, employeeId: actor.employeeId, fullName: actor.fullName, role: actor.role }, changes,
    ...(newPassword ? { passwordChanged: true } : {}),
  }
  return {
    ok: true,
    accounts: accounts.map((account) => account.profile.id === targetId
      ? { profile: { ...account.profile, ...details }, editHistory: [...account.editHistory, edit], ...(passwordVerifier ? { passwordVerifier } : {}) }
      : account),
  }
}
