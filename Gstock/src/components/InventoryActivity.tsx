import type { InventoryActivity as Activity } from '../types/inventory'
import './InventoryManagement.css'

const dateFormat = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' })
const labels: Record<Activity['type'], string> = { 'warehouse-created': 'Warehouse added', 'brand-created': 'Brand added', 'item-created': 'Stock item added', 'quantity-updated': 'Stock quantity updated' }

export default function InventoryActivity({ events }: { events: readonly Activity[] }) {
  if (!events.length) return null
  return (
    <details className="stock-activity">
      <summary>Warehouse activity ({events.length})</summary>
      <ol>{[...events].reverse().map((event) => <li key={event.id}>
        <div><strong>{labels[event.type]} · {event.entityName}</strong><time dateTime={event.occurredAt}>{dateFormat.format(new Date(event.occurredAt))} SAST</time></div>
        <p>By {event.actor.fullName} · {event.actor.employeeId}</p>
        {event.quantity !== undefined && <p>{event.previousQuantity !== undefined ? `${event.previousQuantity} → ${event.quantity}` : `Opening stock: ${event.quantity}`}</p>}
        {event.reason && <p className="stock-activity__reason">{event.reason}</p>}
      </li>)}</ol>
    </details>
  )
}
