import { useEffect, useMemo, useRef, useState } from 'react'
import type { InventoryActivity, InventoryCatalog, InventoryItem } from '../types/inventory'
import type { ReportPeriod } from '../types/reports'
import { buildStockReport, defaultReportRange, normalizeReportRange, reportRangeLimits, reportTimezone } from '../data/reports'
import { inventoryUnits } from '../data/inventoryStore'
import ReportLineChart from './ReportLineChart'
import './Reports.css'

interface ReportsProps { catalog: InventoryCatalog; activity: readonly InventoryActivity[] }
const periodLabels = { days: ['Day', 'Days'], weeks: ['Week', 'Weeks'], months: ['Month', 'Months'], years: ['Year', 'Years'] }
const groupingLabels = { hour: 'hourly', day: 'daily', week: 'weekly', month: 'monthly' }
const dateFormat = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: reportTimezone })
const formatNumber = new Intl.NumberFormat('en-ZA')
const presets = [{ amount: 7, period: 'days', label: '7 days' }, { amount: 1, period: 'months', label: '1 month' }, { amount: 3, period: 'months', label: '3 months' }, { amount: 1, period: 'years', label: '1 year' }] as const

export default function Reports({ catalog, activity }: ReportsProps) {
  const [amount, setAmount] = useState(String(defaultReportRange.amount))
  const [period, setPeriod] = useState<ReportPeriod>(defaultReportRange.period)
  const [warehouseId, setWarehouseId] = useState('all')
  const [brandId, setBrandId] = useState('all')
  const [unit, setUnit] = useState<InventoryItem['unit']>('units')
  const [now, setNow] = useState(() => new Date())
  const heading = useRef<HTMLHeadingElement>(null)
  const range = normalizeReportRange({ amount: Number(amount), period })
  const report = useMemo(() => buildStockReport(catalog, activity, { amount: Number(amount), period }, { warehouseId, brandId, unit }, now), [catalog, activity, amount, period, warehouseId, brandId, unit, now])
  const brands = catalog.brands.filter((brand) => warehouseId === 'all' || brand.warehouseId === warehouseId)
  const net = report.summary.added - report.summary.subtracted

  useEffect(() => {
    heading.current?.focus()
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <section className="reports" aria-labelledby="reports-heading">
      <p className="eyebrow">G-STOCK / STOCK INSIGHTS</p>
      <div className="reports__heading"><div><h1 ref={heading} id="reports-heading" tabIndex={-1}>Reports</h1><p className="workspace__description">New stock and stock movements, over time.</p></div><span className="reports__source">From saved warehouse activity</span></div>
      <div className="reports__controls">
        <div className="reports__timeline"><span className="reports__control-label" id="report-timeline-label">Timeline</span><div className="reports__range" role="group" aria-labelledby="report-timeline-label"><label className="reports__sr-only" htmlFor="report-amount">Number of {period}</label><input id="report-amount" type="number" min={1} max={reportRangeLimits[period]} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} onBlur={() => setAmount(String(range.amount))} /><label className="reports__sr-only" htmlFor="report-period">Timeline period</label><select id="report-period" value={period} onChange={(event) => { const next = event.target.value as ReportPeriod; setPeriod(next); setAmount(String(normalizeReportRange({ amount: Number(amount), period: next }).amount)) }}>{(Object.keys(periodLabels) as ReportPeriod[]).map((value) => <option key={value} value={value}>{periodLabels[value][range.amount === 1 ? 0 : 1]}</option>)}</select></div><span className="reports__range-hint">Up to one year</span></div>
        <div><label htmlFor="report-warehouse">Warehouse</label><select id="report-warehouse" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setBrandId('all') }}><option value="all">All warehouses</option>{catalog.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></div>
        <div><label htmlFor="report-brand">Brand</label><select id="report-brand" value={brandId} onChange={(event) => setBrandId(event.target.value)}><option value="all">All brands</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div>
        <div><label htmlFor="report-unit">Stock unit</label><select id="report-unit" value={unit} onChange={(event) => setUnit(event.target.value as InventoryItem['unit'])}>{inventoryUnits.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
      </div>
      <div className="reports__period-row"><div className="reports__presets" role="group" aria-label="Quick timeline selection">{presets.map((preset) => <button key={preset.label} type="button" aria-pressed={period === preset.period && range.amount === preset.amount} onClick={() => { setPeriod(preset.period); setAmount(String(preset.amount)) }}>{preset.label}</button>)}</div><p role="status">{dateFormat.format(report.start)} – {dateFormat.format(report.end)} · {groupingLabels[report.interval]} · SAST</p></div>
      <dl className="reports__summary"><div><dt>New stock added</dt><dd>{formatNumber.format(report.summary.newStock)}<span>{unit}</span><small>{report.summary.newItems} new item {report.summary.newItems === 1 ? 'line' : 'lines'}</small></dd></div><div><dt>Stock added to existing items</dt><dd>+{formatNumber.format(report.summary.added)}<span>{unit}</span><small>Quantity increases in this timeline</small></dd></div><div><dt>Stock subtracted</dt><dd>−{formatNumber.format(report.summary.subtracted)}<span>{unit}</span><small>Quantity decreases in this timeline</small></dd></div></dl>
      <ReportLineChart title="New stock added" description={`Opening quantities for new item lines, in ${unit}.`} headline={`${report.summary.newItems} new item ${report.summary.newItems === 1 ? 'line' : 'lines'}`} points={report.points} series={[{ key: 'newStock', label: 'New stock added' }]} unit={unit} hasData={report.summary.newItems > 0} emptyText="No new stock added in this timeline." />
      <ReportLineChart title="Stock updated" description={`Quantity increases are above zero; subtractions are below zero. Values in ${unit}.`} headline={`${report.summary.updates} updates · net ${net >= 0 ? '+' : ''}${formatNumber.format(net)} ${unit}`} points={report.points} series={[{ key: 'added', label: 'Added' }, { key: 'subtracted', label: 'Subtracted', secondary: true }]} unit={unit} hasData={report.summary.updates > 0} emptyText="No stock updates in this timeline." />
      <p className="reports__note">Timelines use rolling days, weeks, calendar months, or a calendar year. Only recorded stock activity is included. Each chart uses the selected stock unit.</p>
    </section>
  )
}
