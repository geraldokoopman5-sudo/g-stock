import type { InventoryActivity, InventoryCatalog } from '../types/inventory'
import type { ReportFilters, ReportInterval, ReportPeriod, ReportRange, StockReport, StockReportPoint } from '../types/reports'

export const reportTimezone = 'Africa/Johannesburg'
export const defaultReportRange: ReportRange = { amount: 1, period: 'months' }
export const reportRangeLimits: Record<ReportPeriod, number> = { days: 365, weeks: 52, months: 12, years: 1 }
const hour = 3_600_000
const day = 24 * hour
const sastOffset = 2 * hour

function calendarMonthsBefore(date: Date, months: number) {
  const local = new Date(date.getTime() + sastOffset)
  const targetMonth = local.getUTCMonth() - months
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(local.getUTCFullYear(), targetMonth, Math.min(local.getUTCDate(), lastDay), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds()) - sastOffset)
}

export function normalizeReportRange(range: ReportRange): ReportRange {
  const period = Object.hasOwn(reportRangeLimits, range.period) ? range.period : 'months'
  const amount = Number.isFinite(range.amount) ? Math.max(1, Math.min(Math.floor(range.amount), reportRangeLimits[period])) : 1
  return { amount, period }
}

export function getReportWindow(range: ReportRange, now = new Date()) {
  const normalized = normalizeReportRange(range)
  const end = new Date(now)
  const start = normalized.period === 'months' || normalized.period === 'years'
    ? calendarMonthsBefore(end, normalized.amount * (normalized.period === 'years' ? 12 : 1))
    : new Date(end.getTime() - normalized.amount * (normalized.period === 'weeks' ? 7 : 1) * day)
  const days = (end.getTime() - start.getTime()) / day
  const interval: ReportInterval = days <= 2 ? 'hour' : days <= 62 ? 'day' : days <= 180 ? 'week' : 'month'
  return { start, end, interval }
}

export function reportBucketStart(timestamp: number, interval: ReportInterval) {
  const local = new Date(timestamp + sastOffset)
  let date = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), interval === 'month' ? 1 : local.getUTCDate()) - sastOffset
  if (interval === 'hour') date += local.getUTCHours() * hour
  if (interval === 'week') date -= ((local.getUTCDay() + 6) % 7) * day
  return date
}

function nextBucket(timestamp: number, interval: ReportInterval) {
  if (interval !== 'month') return timestamp + (interval === 'hour' ? hour : interval === 'week' ? 7 * day : day)
  const local = new Date(timestamp + sastOffset)
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - sastOffset
}

function bucketLabels(timestamp: number, interval: ReportInterval) {
  const date = new Date(timestamp)
  const options: Intl.DateTimeFormatOptions = { timeZone: reportTimezone }
  const label = interval === 'hour'
    ? new Intl.DateTimeFormat('en-ZA', { ...options, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
    : new Intl.DateTimeFormat('en-ZA', { ...options, ...(interval === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }) }).format(date)
  const full = new Intl.DateTimeFormat('en-ZA', { ...options, day: 'numeric', month: 'long', year: 'numeric', ...(interval === 'hour' ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}) }).format(date)
  return { label, fullLabel: `${interval === 'week' ? 'Week of ' : interval === 'month' ? 'Month of ' : ''}${full} SAST` }
}

export function buildStockReport(catalog: InventoryCatalog, activity: readonly InventoryActivity[], range: ReportRange, filters: ReportFilters, now = new Date()): StockReport {
  const window = getReportWindow(range, now)
  const points: StockReportPoint[] = []
  const pointByTime = new Map<number, StockReportPoint>()
  const endBucket = reportBucketStart(window.end.getTime(), window.interval)
  for (let timestamp = reportBucketStart(window.start.getTime(), window.interval); timestamp <= endBucket; timestamp = nextBucket(timestamp, window.interval)) {
    const point = { timestamp, ...bucketLabels(timestamp, window.interval), newStock: 0, added: 0, subtracted: 0 }
    points.push(point)
    pointByTime.set(timestamp, point)
  }
  const summary = { newItems: 0, newStock: 0, added: 0, subtracted: 0, updates: 0 }
  const itemsById = new Map(catalog.items.map((item) => [item.id, item]))
  for (const event of activity) {
    if (event.type !== 'item-created' && event.type !== 'quantity-updated') continue
    const timestamp = Date.parse(event.occurredAt)
    if (!Number.isFinite(timestamp) || timestamp < window.start.getTime() || timestamp > window.end.getTime()) continue
    const item = itemsById.get(event.entityId)
    if ((filters.warehouseId && filters.warehouseId !== 'all' && filters.warehouseId !== event.warehouseId)
      || (filters.brandId && filters.brandId !== 'all' && filters.brandId !== (event.brandId ?? item?.brandId))
      || (event.unit ?? item?.unit) !== filters.unit) continue
    if (event.quantity === undefined || !Number.isFinite(event.quantity) || event.quantity < 0) continue
    const point = pointByTime.get(reportBucketStart(timestamp, window.interval))
    if (!point) continue
    if (event.type === 'item-created') {
      point.newStock += event.quantity
      summary.newItems++
      summary.newStock += event.quantity
    } else if (event.previousQuantity !== undefined && Number.isFinite(event.previousQuantity) && event.previousQuantity >= 0) {
      const delta = event.quantity - event.previousQuantity
      if (delta > 0) { point.added += delta; summary.added += delta; summary.updates++ }
      if (delta < 0) { point.subtracted += delta; summary.subtracted -= delta; summary.updates++ }
    }
  }
  return { ...window, points, summary }
}
