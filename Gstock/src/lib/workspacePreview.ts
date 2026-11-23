import type { WorkspacePermissions } from '../api/workspace'
import type { EmployeeAccount, EmployeeProfile } from '../types/employees'
import type { InventoryCatalog, InventoryState } from '../types/inventory'

export const workspacePreviewKey = 'g-stock.workspace-preview.v1'
const maxAge = 8 * 60 * 60 * 1000

export interface WorkspacePreview {
  profile: EmployeeProfile
  permissions: WorkspacePermissions
  accounts: EmployeeAccount[]
  inventory: InventoryState
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: Record<string, unknown>, fields: string[]) => fields.every(field => typeof value[field] === 'string')
const optionalStrings = (value: Record<string, unknown>, fields: string[]) => fields.every(field => value[field] === undefined || value[field] === null || typeof value[field] === 'string')
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000
const isProfile = (value: unknown): value is EmployeeProfile => isRecord(value)
  && strings(value, ['id', 'employeeId', 'fullName', 'email'])
  && ['Nemployee', 'StockManager', 'StaffManager'].includes(String(value.role))
  && value.accountRole === value.role && (value.status === 'Active' || value.status === 'InActive')

function isCatalog(value: unknown): value is InventoryCatalog {
  if (!isRecord(value) || !Array.isArray(value.warehouses) || !Array.isArray(value.brands) || !Array.isArray(value.items)) return false
  return value.warehouses.every(entry => isRecord(entry) && strings(entry, ['id', 'name'])
    && optionalStrings(entry, ['contactName', 'contactEmail', 'notes', 'streetName', 'suburbName', 'city', 'province'])
    && (entry.postalCode === undefined || count(entry.postalCode)))
    && value.brands.every(entry => isRecord(entry) && strings(entry, ['id', 'warehouseId', 'name', 'description', 'initials']))
    && value.items.every(entry => isRecord(entry) && strings(entry, ['id', 'brandId', 'name', 'location'])
      && optionalStrings(entry, ['sku']) && count(entry.quantity) && count(entry.reorderLevel)
      && ['units', 'boxes', 'rolls', 'cases', 'pairs'].includes(String(entry.unit)))
}

function isPreview(value: unknown): value is WorkspacePreview {
  return isRecord(value) && isProfile(value.profile) && value.profile.status === 'Active' && isRecord(value.permissions)
    && ['canCreateWarehouse', 'canManageBrands', 'canManageItems', 'canManageEmployees'].every(field => typeof (value.permissions as Record<string, unknown>)[field] === 'boolean')
    && Array.isArray(value.accounts) && value.accounts.every(account => isRecord(account) && isProfile(account.profile) && Array.isArray(account.editHistory) && account.editHistory.length === 0)
    && isRecord(value.inventory) && value.inventory.version === 2 && isCatalog(value.inventory.catalog)
    && Array.isArray(value.inventory.activity) && value.inventory.activity.length === 0
}

// This is a tab-local, read-only view while reconnecting, never proof of authentication.
// No credentials, tokens, password verifiers, or employee/activity histories are stored.
function profileView({ id, employeeId, fullName, email, role, accountRole, status }: EmployeeProfile): EmployeeProfile {
  return { id, employeeId, fullName, email, role, accountRole, status }
}

export function clearWorkspacePreview() {
  try { window.sessionStorage.removeItem(workspacePreviewKey) } catch { /* Storage may be unavailable. */ }
}

export function loadWorkspacePreview(): WorkspacePreview | null {
  try {
    const raw = window.sessionStorage.getItem(workspacePreviewKey)
    if (!raw) return null
    const stored: unknown = JSON.parse(raw)
    if (isRecord(stored) && stored.version === 1 && typeof stored.savedAt === 'number'
      && stored.savedAt <= Date.now() && Date.now() - stored.savedAt < maxAge && isPreview(stored.view)) return stored.view
  } catch { /* Invalid or unavailable storage falls back to normal session restoration. */ }
  clearWorkspacePreview()
  return null
}

export function saveWorkspacePreview(view: WorkspacePreview) {
  try {
    const { warehouses, brands, items } = view.inventory.catalog
    const { canCreateWarehouse, canManageBrands, canManageItems, canManageEmployees } = view.permissions
    const preview: WorkspacePreview = {
      profile: profileView(view.profile),
      permissions: { canCreateWarehouse, canManageBrands, canManageItems, canManageEmployees },
      accounts: view.accounts.map(account => ({ profile: profileView(account.profile), editHistory: [] })),
      inventory: { version: 2, activity: [], catalog: {
        warehouses: warehouses.map(({ id, name, contactName, contactEmail, notes, streetName, suburbName, city, province, postalCode }) => ({ id, name, contactName, contactEmail, notes, streetName, suburbName, city, province, postalCode })),
        brands: brands.map(({ id, warehouseId, name, description, initials }) => ({ id, warehouseId, name, description, initials })),
        items: items.map(({ id, brandId, sku, name, location, quantity, unit, reorderLevel }) => ({ id, brandId, sku, name, location, quantity, unit, reorderLevel })),
      } },
    }
    const serialized = JSON.stringify({ version: 1, savedAt: Date.now(), view: preview })
    if (serialized.length > 2_000_000) { clearWorkspacePreview(); return }
    window.sessionStorage.setItem(workspacePreviewKey, serialized)
  } catch { clearWorkspacePreview() }
}
