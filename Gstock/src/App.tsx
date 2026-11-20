import { useCallback, useEffect, useRef, useState } from 'react'
import LoginTransition from './components/LoginTransition'
import Workspace from './components/Workspace'
import ThemeToggle from './components/ThemeToggle'
import BrandLogo from './components/BrandLogo'
import { api, ApiError, errorMessage } from './api/client'
import { changeEmployeeAccountType, createEmployee as createApiEmployee, loadEmployeeHistory, loadInventory, loadInventoryCatalog, loadWorkspaceData, saveEmployee as saveApiEmployee, saveInventory as saveApiInventory } from './api/workspace'
import type { EmployeeAccount, EmployeeAccountType, EmployeeCreate, EmployeeProfile, EmployeeUpdate } from './types/employees'
import type { InventoryAction, InventoryBrand, InventoryItem, InventorySaveResult, InventoryState, InventoryWarehouse } from './types/inventory'
import type { WorkspacePermissions } from './api/workspace'
import './App.css'

function App() {
  const [showPassword, setShowPassword] = useState(false)
  const [accounts, setAccounts] = useState<EmployeeAccount[]>([])
  const [inventory, setInventory] = useState<InventoryState>({ version: 2, catalog: { warehouses: [], brands: [], items: [] }, activity: [] })
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null)
  const [permissions, setPermissions] = useState<WorkspacePermissions>()
  const [checkingSession, setCheckingSession] = useState(true)
  const [workspaceError, setWorkspaceError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [screen, setScreen] = useState<'login' | 'intro' | 'workspace' | 'logout'>('login')
  const emailRef = useRef<HTMLInputElement>(null)
  const inventoryRevision = useRef(0)
  const finishIntro = useCallback(() => setScreen('workspace'), [])
  const finishLogout = useCallback(() => setScreen('login'), [])
  async function reloadWorkspace() {
    const { current, accounts: nextAccounts, inventory: nextInventory } = await loadWorkspaceData()
    setEmployee(current.profile)
    setPermissions(current.permissions)
    setAccounts(nextAccounts)
    setInventory(nextInventory)
    setWorkspaceError('')
  }

  useEffect(() => {
    let cancelled = false
    api.onSessionExpired(() => {
      inventoryRevision.current++
      setEmployee(null)
      setAccounts([])
      setInventory({ version: 2, catalog: { warehouses: [], brands: [], items: [] }, activity: [] })
      setScreen('login')
      setLoginError('Your session has expired. Please sign in again.')
    })
    async function restore() {
      try {
        if (!await api.restore() || cancelled) return
        const { current, accounts: nextAccounts, inventory: nextInventory } = await loadWorkspaceData()
        if (cancelled) return
        setEmployee(current.profile)
        setPermissions(current.permissions)
        setAccounts(nextAccounts)
        setInventory(nextInventory)
        setScreen('workspace')
      } catch (error) {
        if (!cancelled) setLoginError(errorMessage(error))
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    }
    void restore()
    return () => { cancelled = true }
  }, [])

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
    if (revision === inventoryRevision.current) setInventory((current) => ({ ...current, catalog }))
  }, [])

  async function saveInventory(action: InventoryAction): Promise<InventorySaveResult> {
    inventoryRevision.current++
    try {
      const entity = await saveApiInventory(action)
      inventoryRevision.current++
      // Reflect a committed write immediately, even if refreshing activity later fails.
      setInventory((current) => {
        const catalog = current.catalog
        if (action.type === 'add-warehouse') return { ...current, catalog: { ...catalog, warehouses: [...catalog.warehouses, entity as InventoryWarehouse] } }
        if (action.type === 'add-brand' || action.type === 'set-brand-photo') {
          const brand = entity as InventoryBrand
          const updated = { ...brand, initials: brand.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase() }
          return { ...current, catalog: { ...catalog, brands: action.type === 'add-brand' ? [...catalog.brands, updated] : catalog.brands.map((entry) => entry.id === brand.id ? updated : entry) } }
        }
        const item = entity as InventoryItem
        return { ...current, catalog: { ...catalog, items: action.type === 'add-item' ? [...catalog.items, item] : catalog.items.map((entry) => entry.id === item.id ? item : entry) } }
      })
      try { setInventory(await loadInventory()); setWorkspaceError('') } catch (error) {
        setWorkspaceError(`Changes saved, but stock activity could not refresh. ${errorMessage(error)}`)
      }
      return { ok: true, entityId: entity.id }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try { setInventory(await loadInventory()) } catch { /* Keep the original conflict visible. */ }
      }
      return { ok: false, error: errorMessage(error) }
    }
  }

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await api.logout()
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
    if (screen === 'login' && !checkingSession) emailRef.current?.focus()
  }, [screen, checkingSession])

  if (employee && (screen === 'intro' || screen === 'workspace')) {
    return (
      <>
        {workspaceError && <div className="stock-feedback" role="alert">{workspaceError} <button type="button" onClick={() => { void reloadWorkspace().catch((error) => setWorkspaceError(errorMessage(error))) }}>Reload workspace</button></div>}
        <Workspace employee={employee} permissions={permissions} accounts={accounts} onSaveEmployee={saveEmployee} onCreateEmployee={createEmployee} onChangeAccountType={changeAccountType} onOpenEmployee={openEmployee} inventory={inventory} onInventoryAction={saveInventory} onRefreshInventory={refreshInventory} active={screen === 'workspace'} onSignOut={() => { void signOut() }} signingOut={signingOut} />
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
                window.history.replaceState(null, '', '#home')
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
