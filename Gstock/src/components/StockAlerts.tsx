import { useEffect, useState } from 'react'
import { getStockAlerts } from '../data/inventory'
import WorkspaceIcon from './WorkspaceIcon'

interface StockAlertsProps {
  alerts: ReturnType<typeof getStockAlerts>
  onOpenItem: () => void
  onRefresh?: () => Promise<void>
}

export default function StockAlerts({ alerts, onOpenItem, onRefresh }: StockAlertsProps) {
  const [refreshFailed, setRefreshFailed] = useState(false)

  useEffect(() => {
    if (!onRefresh) return
    let cancelled = false
    let pending = false
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      try {
        await onRefresh()
        if (!cancelled) setRefreshFailed(false)
      } catch {
        if (!cancelled) setRefreshFailed(true)
      } finally { pending = false }
    }
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 30_000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [onRefresh])

  return (
    <section className="stock-alerts" aria-labelledby="stock-alerts-heading">
      <h2 id="stock-alerts-heading"><WorkspaceIcon name="alert" size={18} />Low-stock alerts <span>{alerts.length}</span></h2>
      <p className="stock-alerts__hint">Alerts clear when stock rises above its threshold.</p>
      {refreshFailed && <p className="stock-alerts__error" role="status">Could not refresh stock. Showing the last loaded levels. Close and reopen Explore to retry.</p>}
      {alerts.length ? <ul className="stock-alerts__list">
        {alerts.map(({ item, brand, warehouse }) => (
          <li key={item.id}>
            <a className="stock-alerts__item" href={`#inventory/${encodeURIComponent(item.brandId)}/${encodeURIComponent(item.id)}`} onClick={onOpenItem}>
              <span className="stock-alerts__item-heading"><strong>{item.name}</strong><span className="stock-alerts__status">{item.quantity === 0 ? 'Out of stock' : 'Low stock'}</span></span>
              {item.sku && <span className="stock-alerts__sku">{item.sku}</span>}
              <span>{warehouse?.name ?? 'Warehouse not assigned'} · {brand?.name ?? 'Brand not assigned'}</span>
              <span className="stock-alerts__location">Location: {item.location || 'Not recorded'}</span>
              <span><strong>{item.quantity.toLocaleString('en-ZA')} {item.unit}</strong> on hand · Threshold: {item.reorderLevel.toLocaleString('en-ZA')}</span>
              <span className="stock-alerts__view">View stock item</span>
            </a>
          </li>
        ))}
      </ul> : <p className="stock-alerts__empty">No stock alerts. All items are above their thresholds.</p>}
    </section>
  )
}
