import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { EmployeeAccount, EmployeeProfile, EmployeeUpdate } from '../types/employees'
import EmployeeCard from './EmployeeCard'
import EmployeeAccounts from './EmployeeAccounts'
import Inventory from './Inventory'
import Warehouses from './Warehouses'
import ThemeToggle from './ThemeToggle'
import type { InventoryState, SaveInventoryAction } from '../types/inventory'
import WorkspaceIcon from './WorkspaceIcon'
import type { WorkspaceIconName } from './WorkspaceIcon'
import './Workspace.css'

const pages = [
  { id: 'home', label: 'Home', description: 'Your employee card', icon: 'home' },
  { id: 'inventory', label: 'Inventory', description: 'Stock, products, and quantities', icon: 'inventory' },
  { id: 'warehouses', label: 'Warehouses', description: 'Warehouse locations, brands, and stock', icon: 'warehouses' },
  { id: 'employees', label: 'Employee accounts', description: 'Your people and departments', icon: 'employees' },
] as const satisfies ReadonlyArray<{ id: string; label: string; description: string; icon: WorkspaceIconName }>

function subscribeToPage(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function currentPage() {
  return (window.location.hash || '#home').replace(/^#companies(?=\/|$)/, '#warehouses')
}

interface WorkspaceProps {
  employee: EmployeeProfile
  accounts: EmployeeAccount[]
  onSaveEmployee: (accountId: string, details: EmployeeUpdate) => Promise<string | null>
  inventory: InventoryState
  onInventoryAction: SaveInventoryAction
  active: boolean
  onSignOut: () => void
}

export default function Workspace({ employee, accounts, onSaveEmployee, inventory, onInventoryAction, active, onSignOut }: WorkspaceProps) {
  const route = useSyncExternalStore(subscribeToPage, currentPage, () => '#home')
  const [routePage, selectedId] = route.slice(1).split('/')
  const page = pages.find((entry) => entry.id === routePage) ?? pages[0]
  const pageId = page.id
  const [navigationOpen, setNavigationOpen] = useState(false)
  const navigationRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (active) {
      headingRef.current?.focus()
      window.scrollTo(0, 0)
    }
  }, [active, route])

  useEffect(() => {
    if (!navigationOpen) return
    firstLinkRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) setNavigationOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setNavigationOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [navigationOpen])

  return (
    <div className="workspace" inert={!active}>
      <header className="workspace__header">
        <a className="brand" href="#home" aria-label="G-Stock home">
          <span className="brand-mark" aria-hidden="true">G</span><span>G-Stock</span>
        </a>
        <ThemeToggle />
      </header>
      <main className="workspace__main" id="workspace-content">
        {pageId === 'home' ? (
          <div className="workspace__home">
            <section className="workspace__welcome">
              <p className="eyebrow">YOUR OPERATIONS, CONNECTED</p>
              <h1 ref={headingRef} tabIndex={-1}>Your people.<br />Your workspace.</h1>
              <p className="workspace__description">Welcome, {employee.fullName.split(' ')[0]}.<br />Everything starts with you.</p>
              <div className="workspace__hint"><span aria-hidden="true">↗</span><p>Find your way around.<br /><span>Open Explore to visit your workspace.</span></p></div>
            </section>
            <section className="workspace__card-area" aria-label="Your employee profile">
              <p className="workspace__card-label"><span>YOUR PROFILE</span><span></span></p>
              {active && <EmployeeCard employee={employee} />}
            </section>
          </div>
        ) : pageId === 'employees' ? (
          <EmployeeAccounts accounts={accounts} viewer={employee} selectedId={selectedId} onSave={onSaveEmployee} />
        ) : pageId === 'inventory' ? (
          <Inventory selectedBrandId={selectedId} catalog={inventory.catalog} activity={inventory.activity} onAction={onInventoryAction} />
        ) : (
          <Warehouses selectedId={selectedId} catalog={inventory.catalog} activity={inventory.activity} onAction={onInventoryAction} />
        )}
      </main>
      <footer className="workspace__footer"><span>G-Stock · Staff workspace</span><span>Everything in its place.</span></footer>
      <div className="workspace-navigation" ref={navigationRef}>
        {navigationOpen && (
          <nav className="workspace-navigation__panel" id="workspace-navigation" aria-label="Workspace pages">
            <p className="eyebrow">YOUR WORKSPACE</p>
            <ul>
              {pages.map((destination, index) => (
                <li key={destination.id}>
                  <a ref={index === 0 ? firstLinkRef : undefined} href={`#${destination.id}`} aria-current={pageId === destination.id ? 'page' : undefined} onClick={() => {
                    setNavigationOpen(false)
                    if (pageId === destination.id) triggerRef.current?.focus()
                  }}>
                    <WorkspaceIcon name={destination.icon} />
                    <span>{destination.label}</span>
                    <span className="workspace-navigation__arrow" aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
            <button type="button" className="workspace-navigation__signout" onClick={onSignOut}><WorkspaceIcon name="logout" />Log out</button>
          </nav>
        )}
        <button ref={triggerRef} className={`workspace-navigation__trigger${navigationOpen ? ' workspace-navigation__trigger--open' : ''}`} aria-expanded={navigationOpen} aria-controls="workspace-navigation" type="button" onClick={() => setNavigationOpen(!navigationOpen)}>
          <WorkspaceIcon name="grid" /><span>{navigationOpen ? 'Close' : 'Explore'}</span>
        </button>
      </div>
    </div>
  )
}
