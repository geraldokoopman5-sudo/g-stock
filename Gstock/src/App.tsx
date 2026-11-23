import { useCallback, useEffect, useRef, useState } from 'react'
import LoginTransition from './components/LoginTransition'
import Workspace from './components/Workspace'
import ThemeToggle from './components/ThemeToggle'
import BrandLogo from './components/BrandLogo'
import { api, ApiError, errorMessage } from './api/client'
import { changeEmployeeAccountType, createEmployee as createApiEmployee, loadEmployeeHistory, loadInventory, loadInventoryCatalog, loadWorkspaceData, saveEmployee as saveApiEmployee, saveInventory as saveApiInventory } from './api/workspace'
import type { EmployeeAccount, EmployeeAccountType, EmployeeCreate, EmployeeProfile, EmployeeUpdate } from './types/employees'
import type { InventoryAction, InventoryBrand, InventoryCatalog, InventoryItem, InventorySaveResult, InventoryState, InventoryWarehouse } from './types/inventory'
import type { WorkspacePermissions } from './api/workspace'
import { clearWorkspacePreview, loadWorkspacePreview, saveWorkspacePreview } from './lib/workspacePreview'
import './App.css'

function App() {
  const [preview] = useState(loadWorkspacePreview)
  const [showPassword, setShowPassword] = useState(false)
  const [accounts, setAccounts] = useState<EmployeeAccount[]>(preview?.accounts ?? [])
  const [inventory, setInventory] = useState<InventoryState>(preview?.inventory ?? { version: 2, catalog: { warehouses: [], brands: [], items: [] }, activity: [] })
  const [employee, setEmployee] = useState<EmployeeProfile | null>(preview?.profile ?? null)
  const [permissions, setPermissions] = useState<WorkspacePermissions | undefined>(preview?.permissions)
  const [checkingSession, setCheckingSession] = useState(true)
  const [restoreError, setRestoreError] = useState('')
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const [workspaceError, setWorkspaceError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [screen, setScreen] = useState<'login' | 'intro' | 'workspace' | 'logout'>(preview ? 'workspace' : 'login')
  const emailRef = useRef<HTMLInputElement>(null)
  const inventoryRevision = useRef(0)
  const deletedInventory = useRef({ items: new Set<string>(), brands: new Set<string>(), warehouses: new Set<string>() })
  const visibleCatalog = useCallback((catalog: InventoryCatalog): InventoryCatalog => {
    const deleted = deletedInventory.current
    if (!deleted.items.size && !deleted.brands.size && !deleted.warehouses.size) return catalog
    const removedBrands = new Set(deleted.brands)
    for (const brand of catalog.brands) if (deleted.warehouses.has(brand.warehouseId)) removedBrands.add(brand.id)
    return {
      warehouses: catalog.warehouses.filter(warehouse => !deleted.warehouses.has(warehouse.id)),
      brands: catalog.brands.filter(brand => !removedBrands.has(brand.id)),
      items: catalog.items.filter(item => !deleted.items.has(item.id) && !removedBrands.has(item.brandId)),
    }
  }, [])
  const finishIntro = useCallback(() => setScreen('workspace'), [])
  const finishLogout = useCallback(() => setScreen('login'), [])
  async function reloadWorkspace() {
    const revision = ++inventoryRevision.current
    const { current, accounts: nextAccounts, inventory: nextInventory } = await loadWorkspaceData()
    if (revision !== inventoryRevision.current) return
    setEmployee(current.profile)
    setPermissions(current.permissions)
    setAccounts(nextAccounts)
    setInventory({ ...nextInventory, catalog: visibleCatalog(nextInventory.catalog) })
    setWorkspaceError('')
  }

  useEffect(() => {
    let cancelled = false
    api.onSessionExpired(() => {
      clearWorkspacePreview()
      inventoryRevision.current++
      setEmployee(null)
      setPermissions(undefined)
      setAccounts([])
      setInventory({ version: 2, catalog: { warehouses: [], brands: [], items: [] }, activity: [] })
      setScreen('login')
      setRestoreError('')
      setLoginError('Your session has expired. Please sign in again.')
    })
    async function restore() {
      try {
        const restored = await api.restore()
        if (cancelled) return
        if (!restored) {
          clearWorkspacePreview()
          setEmployee(null)
          setPermissions(undefined)
          setAccounts([])
          setInventory({ version: 2, catalog: { warehouses: [], brands: [], items: [] }, activity: [] })
          setScreen('login')
          return
        }
        const { current, accounts: nextAccounts, inventory: nextInventory } = await loadWorkspaceData()
        if (cancelled) return
        setEmployee(current.profile)
        setPermissions(current.permissions)
        setAccounts(nextAccounts)
        setInventory({ ...nextInventory, catalog: visibleCatalog(nextInventory.catalog) })
        setScreen('workspace')
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 401) setLoginError(errorMessage(error))
          else setRestoreError(errorMessage(error))
        }
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    }
    void restore()
    return () => { cancelled = true }
  }, [restoreAttempt, visibleCatalog])

  useEffect(() => {
    if (employee && permissions && screen === 'workspace' && !checkingSession && !restoreError)
      saveWorkspacePreview({ profile: employee, permissions, accounts, inventory })
  }, [employee, permissions, accounts, inventory, screen, checkingSession, restoreError])

  async function saveEmployee(accountId: string, details: EmployeeUpdate) {
    try {
      const profile = await saveApiEmployee(accountId, details)
      setAccounts((current) => current.map((account) => account.profile.id === accountId ? { ...account, profile } : account))
      try {
        const editHistory = await loadEmployeeHistory(accountId)
        setAccounts((current) => current.map((account) => account.profile.id === accountId ? { ...account, editHistory } : account))
      } catch (error) {
        setWorkspaceError(`Changes saved, but account activity could not refresh. ${errorMessage(error)}`)
      }
      return null
    } catch (error) { return errorMessage(error) }
  }

  async function createEmployee(details: EmployeeCreate) {
    try {
      const profile = await createApiEmployee(details)
      setAccounts((current) => [{ profile, editHistory: [] }, ...current])
      return null
    } catch (error) { return errorMessage(error) }
  }

  async function changeAccountType(accountId: string, accountRole: EmployeeAccountType) {
    try {
      const profile = await changeEmployeeAccountType(accountId, accountRole)
      if (accountId === employee?.id) {
        clearWorkspacePreview()
        inventoryRevision.current++
        setEmployee(null)
        setPermissions(undefined)
        setAccounts([])
        setInventory({ version: 2, catalog: { warehouses: [], brands: [], items: [] }, activity: [] })
        setScreen('login')
        setLoginError('Your account type changed. Please sign in again.')
        return null
      }
      setAccounts(current => current.map(account => account.profile.id === accountId ? { ...account, profile } : account))
      try {
        const editHistory = await loadEmployeeHistory(accountId)
        setAccounts(current => current.map(account => account.profile.id === accountId ? { ...account, editHistory } : account))
      } catch (error) {
        setWorkspaceError(`Account type saved, but account activity could not refresh. ${errorMessage(error)}`)
      }
      return null
    } catch (error) { return errorMessage(error) }
  }

  const openEmployee = useCallback(async (accountId: string) => {
    const editHistory = await loadEmployeeHistory(accountId)
    setAccounts((current) => current.map((account) => account.profile.id === accountId ? { ...account, editHistory } : account))
  }, [])

  const refreshInventory = useCallback(async () => {
    const revision = ++inventoryRevision.current
    const catalog = await loadInventoryCatalog()
    // Older refreshes must not replace a newer refresh, a stock write, or a signed-out state.
    if (revision === inventoryRevision.current) setInventory((current) => ({ ...current, catalog: visibleCatalog(catalog) }))
  }, [visibleCatalog])

  async function saveInventory(action: InventoryAction): Promise<InventorySaveResult> {
    inventoryRevision.current++
    try {
      const entity = await saveApiInventory(action)
      const revision = ++inventoryRevision.current
      const deleting = action.type === 'delete-item' || action.type === 'delete-brand' || action.type === 'delete-warehouse'
      if (action.type === 'delete-item') deletedInventory.current.items.add(action.itemId)
      if (action.type === 'delete-brand') deletedInventory.current.brands.add(action.brandId)
      if (action.type === 'delete-warehouse') {
        deletedInventory.current.warehouses.add(action.warehouseId)
        for (const brand of inventory.catalog.brands)
          if (brand.warehouseId === action.warehouseId) deletedInventory.current.brands.add(brand.id)
      }
      if (deleting) {
        // Prune the reload preview synchronously once DELETE succeeds, before any history request.
        const saved = loadWorkspacePreview()
        if (saved) saveWorkspacePreview({ ...saved, inventory: { ...saved.inventory, catalog: visibleCatalog(saved.inventory.catalog) } })
      }
      // Reflect a committed write immediately, even if refreshing activity later fails.
      setInventory((current) => {
        const catalog = current.catalog
        if (deleting) return { ...current, catalog: visibleCatalog(catalog) }
        if (action.type === 'add-warehouse') return { ...current, catalog: { ...catalog, warehouses: [...catalog.warehouses, entity as InventoryWarehouse] } }
        if (action.type === 'add-brand' || action.type === 'set-brand-photo') {
          const brand = entity as InventoryBrand
          const updated = { ...brand, initials: brand.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase() }
          return { ...current, catalog: { ...catalog, brands: action.type === 'add-brand' ? [...catalog.brands, updated] : catalog.brands.map((entry) => entry.id === brand.id ? updated : entry) } }
        }
        const item = entity as InventoryItem
        return { ...current, catalog: { ...catalog, items: action.type === 'add-item' ? [...catalog.items, item] : catalog.items.map((entry) => entry.id === item.id ? item : entry) } }
      })
      async function refreshAfterSave() {
        try {
          const next = await loadInventory()
          if (revision !== inventoryRevision.current) return
          setInventory({ ...next, catalog: visibleCatalog(next.catalog) })
          setWorkspaceError('')
        } catch (error) {
          if (revision === inventoryRevision.current)
            setWorkspaceError(`Changes saved, but stock activity could not refresh. ${errorMessage(error)}`)
        }
      }
      // Close the delete confirmation and leave a deleted detail page immediately.
      if (deleting) void refreshAfterSave()
      else await refreshAfterSave()
      return { ok: true, entityId: entity.id }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const revision = inventoryRevision.current
        try {
          const next = await loadInventory()
          if (revision === inventoryRevision.current) setInventory({ ...next, catalog: visibleCatalog(next.catalog) })
        } catch { /* Keep the original conflict visible. */ }
      }
      return { ok: false, error: errorMessage(error) }
    }
  }

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await api.logout()
      clearWorkspacePreview()
      inventoryRevision.current++
      setEmployee(null)
      setAccounts([])
      setInventory({ version: 2, catalog: { warehouses: [], brands: [], items: [] }, activity: [] })
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      setShowPassword(false)
      setLoginError('')
      setWorkspaceError('')
      setScreen('logout')
    } catch (error) { setWorkspaceError(errorMessage(error)) }
    finally { setSigningOut(false) }
  }

  useEffect(() => {
    if (screen === 'login' && !checkingSession && !restoreError) emailRef.current?.focus()
  }, [screen, checkingSession, restoreError])

  function retryRestore() {
    setCheckingSession(true)
    setRestoreError('')
    setRestoreAttempt(attempt => attempt + 1)
  }

  if ((checkingSession || restoreError) && !employee) {
    return <main className="session-page" aria-busy={checkingSession}>
      <section className="session-card" aria-labelledby="session-heading">
        <BrandLogo />
        <h1 id="session-heading">{restoreError ? 'Could not restore your workspace' : 'Restoring your workspace'}</h1>
        {restoreError ? <>
          <p role="alert">{restoreError}</p>
          <button className="sign-in" type="button" onClick={retryRestore}>Try again</button>
        </> : <p role="status">Checking your saved session. Your page will open automatically.</p>}
      </section>
    </main>
  }

  if (employee && (screen === 'intro' || screen === 'workspace')) {
    return (
      <>
        {restoreError && <div className="stock-feedback" role="alert">{restoreError} <button type="button" onClick={retryRestore}>Try again</button></div>}
        {checkingSession && <p className="workspace-reconnecting" role="status">Reconnecting…</p>}
        {workspaceError && <div className="stock-feedback" role="alert">{workspaceError} <button type="button" onClick={() => { void reloadWorkspace().catch((error) => setWorkspaceError(errorMessage(error))) }}>Reload workspace</button></div>}
        <Workspace employee={employee} permissions={permissions} accounts={accounts} onSaveEmployee={saveEmployee} onCreateEmployee={createEmployee} onChangeAccountType={changeAccountType} onOpenEmployee={checkingSession || restoreError ? undefined : openEmployee} inventory={inventory} onInventoryAction={saveInventory} onRefreshInventory={checkingSession || restoreError ? undefined : refreshInventory} active={screen === 'workspace'} reconnecting={checkingSession || Boolean(restoreError)} onSignOut={() => { void signOut() }} signingOut={signingOut} />
        {screen === 'intro' && <LoginTransition onComplete={finishIntro} />}
      </>
    )
  }

  return (
    <>
      <div className="login-page" inert={screen === 'logout'}>
        <div className="login-layout">
          <section className="welcome" aria-label="G-Stock workspace">
            <div className="welcome__header">
              <a className="brand" href="./" aria-label="G-Stock home">
                <BrandLogo decorative />
              </a>
              <ThemeToggle />
            </div>
            <div className="welcome-content">
              <p className="eyebrow">YOUR OPERATIONS, CONNECTED</p>
              <h1>Everything<br />in its place.</h1>
              <BrandLogo markOnly decorative className="brand-logo--hero" />
              <p className="welcome-description">Stay on top of stock.<br />Keep your warehouse moving.</p>
            </div>
            <footer><BrandLogo className="brand-logo--footer" /><span>Staff workspace</span></footer>
          </section>

          <main className="login-card">
            <p className="eyebrow">WORKSPACE ACCESS</p>
            <h2>Sign in</h2>
            <p className="login-intro">Welcome back to G-Stock.</p>
            <form aria-busy={signingIn || checkingSession} onSubmit={async (event) => {
              event.preventDefault()
              if (signingIn || checkingSession) return
              const formData = new FormData(event.currentTarget)
              const email = String(formData.get('email') ?? '').trim().toLowerCase()
              const password = String(formData.get('password') ?? '')
              setLoginError('')
              setSigningIn(true)
              try {
                await api.login(email, password, formData.get('remember') === 'on')
                await reloadWorkspace()
                if (!window.location.hash) window.history.replaceState(null, '', '#home')
                setScreen('intro')
              } catch (error) {
                setLoginError(errorMessage(error))
              } finally {
                setSigningIn(false)
              }
            }}>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input disabled={signingIn || checkingSession} ref={emailRef} id="email" name="email" type="email" placeholder="you@warehouse.co.za" autoComplete="username" required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="password-field">
                  <input disabled={signingIn || checkingSession} id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" required />
                  <button type="button" className="password-toggle" aria-controls="password" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <div className="login-options">
                <label className="remember"><input type="checkbox" name="remember" /> Remember me</label>
              </div>
              <button className="sign-in" type="submit" disabled={signingIn || checkingSession}>{checkingSession ? 'Checking session...' : signingIn ? 'Signing in…' : <>Sign in <span aria-hidden="true">→</span></>}</button>
              {loginError && <p className="form-message" role="alert">{loginError}</p>}
            </form>
            <p className="staff-note">Staff access only <span aria-hidden="true">·</span> Contact your administrator</p>
          </main>
        </div>
      </div>
      {screen === 'logout' && <LoginTransition mode="logout" onComplete={finishLogout} />}
    </>
  )
}

export default App
