import { useCallback, useEffect, useRef, useState } from 'react'
import LoginTransition from './components/LoginTransition'
import Workspace from './components/Workspace'
import ThemeToggle from './components/ThemeToggle'
import { demoEmployee } from './data/employees'
import { employeeStorageKey, loadEmployeeAccounts, updateEmployeeAccount } from './data/employeeAccounts'
import { verifyEmployeePassword } from './data/employeePasswords'
import type { EmployeeUpdate } from './types/employees'
import type { InventoryAction, InventorySaveResult } from './types/inventory'
import { applyInventoryAction, loadInventoryState, persistInventoryState } from './data/inventoryStore'
import './App.css'

function App() {
  const [showPassword, setShowPassword] = useState(false)
  const [accounts, setAccounts] = useState(loadEmployeeAccounts)
  const [inventory, setInventory] = useState(loadInventoryState)
  const [employeeId, setEmployeeId] = useState(demoEmployee.id)
  const [signingIn, setSigningIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [screen, setScreen] = useState<'login' | 'intro' | 'workspace' | 'logout'>('login')
  const emailRef = useRef<HTMLInputElement>(null)
  const finishIntro = useCallback(() => setScreen('workspace'), [])
  const finishLogout = useCallback(() => setScreen('login'), [])
  const employee = accounts.find((account) => account.profile.id === employeeId)?.profile ?? accounts[0].profile

  async function saveEmployee(accountId: string, details: EmployeeUpdate) {
    const result = await updateEmployeeAccount(accounts, employee.id, accountId, details)
    if (!result.ok) return result.error
    try {
      window.localStorage.setItem(employeeStorageKey, JSON.stringify(result.accounts))
    } catch {
      return 'Your browser could not save the changes. Check browser storage and try again.'
    }
    setAccounts(result.accounts)
    return null
  }

  function saveInventory(action: InventoryAction): InventorySaveResult {
    const result = applyInventoryAction(inventory, employee, action)
    if (!result.ok) return result
    try {
      persistInventoryState(result.state)
    } catch {
      return { ok: false, error: 'Your browser could not save this change. Check browser storage and try again.' }
    }
    setInventory(result.state)
    return { ok: true, entityId: result.entityId }
  }

  useEffect(() => {
    if (screen === 'login') emailRef.current?.focus()
  }, [screen])

  if (screen === 'intro' || screen === 'workspace') {
    return (
      <>
        <Workspace employee={employee} accounts={accounts} onSaveEmployee={saveEmployee} inventory={inventory} onInventoryAction={saveInventory} active={screen === 'workspace'} onSignOut={() => {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
          setShowPassword(false)
          setLoginError('')
          setScreen('logout')
        }} />
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
                <span className="brand-mark" aria-hidden="true">G</span>
                <span>G-Stock</span>
              </a>
              <ThemeToggle />
            </div>
            <div className="welcome-content">
              <p className="eyebrow">YOUR OPERATIONS, CONNECTED</p>
              <h1>Everything<br />in its place.</h1>
              <div className="monogram" aria-hidden="true">GS</div>
              <p className="welcome-description">Stay on top of stock.<br />Keep your warehouse moving.</p>
            </div>
            <footer>G-Stock <span aria-hidden="true">·</span> Staff workspace</footer>
          </section>

          <main className="login-card">
            <p className="eyebrow">WORKSPACE ACCESS</p>
            <h2>Sign in</h2>
            <p className="login-intro">Welcome back to G-Stock.</p>
            <form aria-busy={signingIn} onSubmit={async (event) => {
              event.preventDefault()
              if (signingIn) return
              const formData = new FormData(event.currentTarget)
              const email = String(formData.get('email') ?? '').trim().toLowerCase()
              const password = String(formData.get('password') ?? '')
              const account = accounts.find((entry) => entry.profile.email.toLowerCase() === email)
              setLoginError('')
              setSigningIn(true)
              try {
                if (!account || !await verifyEmployeePassword(account, password)) {
                  setLoginError('The email or password does not match an employee account.')
                  return
                }
                setEmployeeId(account.profile.id)
                window.history.replaceState(null, '', '#home')
                setScreen('intro')
              } catch {
                setLoginError('Could not check this password. Please try again.')
              } finally {
                setSigningIn(false)
              }
            }}>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input disabled={signingIn} ref={emailRef} id="email" name="email" type="email" placeholder="you@warehouse.co.za" autoComplete="username" required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="password-field">
                  <input disabled={signingIn} id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" required />
                  <button type="button" className="password-toggle" aria-controls="password" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>
              <div className="login-options">
                <label className="remember"><input type="checkbox" name="remember" /> Remember me</label>
              </div>
              <button className="sign-in" type="submit" disabled={signingIn}>{signingIn ? 'Signing in…' : <>Sign in <span aria-hidden="true">→</span></>}</button>
              {loginError && <p className="form-message" role="alert">{loginError}</p>}
              <p className="form-message">Preview: try <strong>{accounts[0].profile.email}</strong>. Any password works until you set one in Employee accounts; then use that password.</p>
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
