import type { InventoryActivity as Activity } from '../types/inventory'
import './InventoryManagement.css'

const dateFormat = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' })
const labels: Record<Activity['type'], string> = { 'warehouse-created': 'Warehouse added', 'warehouse-deleted': 'Warehouse deleted', 'brand-created': 'Brand added', 'item-created': 'Stock item added', 'quantity-updated': 'Stock quantity updated', 'brand-deleted': 'Brand archived', 'item-deleted': 'Stock item archived' }

export default function InventoryActivity({ events, activeItemIds }: { events: readonly Activity[]; activeItemIds?: ReadonlySet<string> }) {
  const deletedItems = new Set(events.filter(event => event.type === 'item-deleted').map(event => event.entityId))
  const visibleEvents = events.filter(event => {
    const itemEvent = event.type === 'item-created' || event.type === 'quantity-updated' || event.type === 'item-deleted'
    return !itemEvent || (!deletedItems.has(event.entityId) && (!activeItemIds || activeItemIds.has(event.entityId)))
  })
  if (!visibleEvents.length) return null
  return (
    <details className="stock-activity">
      <summary>Warehouse activity ({visibleEvents.length})</summary>
      <ol>{[...visibleEvents].reverse().map((event) => <li key={event.id}>
        <div><strong>{labels[event.type]} · {event.entityName}</strong><time dateTime={event.occurredAt}>{dateFormat.format(new Date(event.occurredAt))} SAST</time></div>
        <p>By {event.actor.fullName} · {event.actor.employeeId}</p>
        {event.quantity !== undefined && <p>{event.previousQuantity !== undefined ? `${event.previousQuantity} → ${event.quantity}` : `Opening stock: ${event.quantity}`}</p>}
        {event.reason && <p className="stock-activity__reason">{event.reason}</p>}
      </li>)}</ol>
    </details>
  )
}
