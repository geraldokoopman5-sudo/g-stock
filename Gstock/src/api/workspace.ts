import { api, jsonBody } from './client'
import { canViewEmployeeAccounts } from '../data/employeeAccounts'
import type { EmployeeAccount, EmployeeAccountType, EmployeeCreate, EmployeeEdit, EmployeeField, EmployeeProfile, EmployeeUpdate } from '../types/employees'
import type { InventoryAction, InventoryActivity, InventoryBrand, InventoryCatalog, InventoryItem, InventoryState, InventoryWarehouse } from '../types/inventory'

export interface WorkspacePermissions {
  canCreateWarehouse: boolean
  canManageBrands: boolean
  canManageItems: boolean
  canManageEmployees: boolean
  canViewEmployees: boolean
}

type ApiProfile = EmployeeProfile & { accountRole: 'Nemployee' | 'StockManager' | 'StaffManager'; status: 'Active' | 'InActive' }
type ApiActivity = Omit<InventoryActivity, 'entityId'> & { itemId: string | null; brandId: string | null }
type ApiEdit = Omit<EmployeeEdit, 'changes'> & { kind: string; changes: { field: string; before: string; after: string }[] }

async function allPages<T>(path: string): Promise<T[]> {
  const entries: T[] = []
  for (let offset = 0; ; offset += 200) {
    const page = await api.request<T[]>(`${path}${path.includes('?') ? '&' : '?'}limit=200&offset=${offset}`)
    entries.push(...page)
    if (page.length < 200) return entries
  }
}

const fields: Record<string, EmployeeField> = {
  employee_id: 'employeeId', full_name: 'fullName', email: 'email', role: 'role', is_active: 'status', account_role: 'accountRole',
}

export async function loadEmployeeHistory(id: string): Promise<EmployeeEdit[]> {
  const entries = await allPages<ApiEdit>(`/employees/${encodeURIComponent(id)}/edits`)
  return entries.reverse().map((edit) => ({
    ...edit, passwordChanged: edit.kind === 'password-changed',
    changes: edit.changes.map((change) => ({ ...change, field: fields[change.field] ?? change.field as EmployeeField })),
  }))
}

export async function loadAccounts(): Promise<EmployeeAccount[]> {
  const profiles = await allPages<ApiProfile>('/employees')
  return profiles.map((profile) => ({ profile, editHistory: [] }))
}

export async function loadInventoryCatalog(): Promise<InventoryCatalog> {
  const [warehouses, brands, items] = await Promise.all([
    api.request<InventoryWarehouse[]>('/warehouses'),
    allPages<Omit<InventoryBrand, 'initials'>>('/brands'),
    allPages<InventoryItem>('/items'),
  ])
  return { warehouses, items, brands: brands.map((brand) => ({ ...brand,
    initials: brand.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(),
  })) }
}

export async function loadInventory(): Promise<InventoryState> {
  const [catalog, activity] = await Promise.all([loadInventoryCatalog(), allPages<ApiActivity>('/inventory/activity')])
  return {
    version: 2,
    catalog,
    activity: activity.reverse().map((event) => ({ ...event,
      entityId: event.itemId ?? event.brandId ?? event.warehouseId,
      brandId: event.brandId ?? undefined,
      previousQuantity: event.previousQuantity ?? undefined, quantity: event.quantity ?? undefined,
      unit: event.unit ?? undefined, reason: event.reason ?? undefined,
    })),
  }
}

export function loadCurrentEmployee() {
  return api.request<{ profile: ApiProfile; permissions: WorkspacePermissions }>('/auth/me')
}

export async function loadWorkspaceData() {
  const current = await loadCurrentEmployee()
  const [accounts, inventory] = await Promise.all([
    canViewEmployeeAccounts(current.profile) && current.permissions.canViewEmployees !== false ? loadAccounts() : Promise.resolve([]),
    loadInventory(),
  ])
  return { current, accounts, inventory }
}

export function saveEmployee(id: string, details: EmployeeUpdate) {
  const { employeeId, fullName, email, password } = details
  return api.request<ApiProfile>(`/employees/${encodeURIComponent(id)}`, {
    ...jsonBody({ employeeId, fullName, email, ...(password ? { password } : {}) }), method: 'PATCH',
  })
}

export function createEmployee(details: EmployeeCreate) {
  const { employeeId, fullName, email, accountRole, password } = details
  return api.request<ApiProfile>('/employees', jsonBody({ employeeId, fullName, email, accountRole, password }))
}

export function changeEmployeeAccountType(id: string, accountRole: EmployeeAccountType) {
  return api.request<ApiProfile>(`/employees/${encodeURIComponent(id)}/account-type`, {
    ...jsonBody({ accountRole }), method: 'PATCH',
  })
}

export async function saveInventory(action: InventoryAction) {
  switch (action.type) {
    case 'add-warehouse': return api.request<InventoryWarehouse>('/warehouses', jsonBody(action.input))
    case 'add-brand': return api.request<InventoryBrand>('/brands', jsonBody(action.input))
    case 'add-item': return api.request<InventoryItem>('/items', jsonBody(action.input))
    case 'set-brand-photo': return api.request<InventoryBrand>(`/brands/${encodeURIComponent(action.brandId)}/photo`, { ...jsonBody({ profilePhoto: action.profilePhoto }), method: 'PUT' })
    case 'set-item-photo': return api.request<InventoryItem>(`/items/${encodeURIComponent(action.itemId)}/photo`, { ...jsonBody({ profilePhoto: action.profilePhoto }), method: 'PUT' })
    case 'adjust-quantity': return api.request<InventoryItem>(`/items/${encodeURIComponent(action.itemId)}/adjustments`,
      jsonBody({ mode: action.mode, quantity: action.quantity, expectedQuantity: action.expectedQuantity, reason: action.reason }))
  }
}
