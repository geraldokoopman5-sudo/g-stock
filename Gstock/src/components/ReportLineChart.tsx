import { useId, useState } from 'react'
import type { StockReportPoint } from '../types/reports'

interface ReportSeries {
  key: 'newStock' | 'added' | 'subtracted'
  label: string
  secondary?: boolean
}

interface ReportLineChartProps {
  title: string
  description: string
  points: readonly StockReportPoint[]
  series: readonly ReportSeries[]
  unit: string
  hasData: boolean
  emptyText: string
  headline: string
}

const fullNumber = new Intl.NumberFormat('en-ZA')
const axisNumber = new Intl.NumberFormat('en-ZA', { notation: 'compact', maximumFractionDigits: 1 })

export default function ReportLineChart({ title, description, points, series, unit, hasData, emptyText, headline }: ReportLineChartProps) {
  const id = useId()
  const [active, setActive] = useState<number | null>(null)
  const values = points.flatMap((point) => series.map((entry) => point[entry.key]))
  const minimum = Math.min(0, ...values)
  const maximum = Math.max(0, ...values)
  const rawStep = Math.max(Math.abs(minimum), maximum, 1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = Math.max(1, ([1, 2, 5, 10].find((factor) => factor * magnitude >= rawStep) ?? 10) * magnitude)
  const low = Math.floor(minimum / step) * step
  const high = maximum === minimum ? low + step * 4 : Math.ceil(maximum / step) * step
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => low + index * step)
  const percentX = (index: number) => points.length <= 1 ? 50 : index / (points.length - 1) * 100
  const percentY = (value: number) => (high - value) / (high - low) * 100
  const pointPath = (key: ReportSeries['key']) => points.map((point, index) => `${index ? 'L' : 'M'}${(percentX(index) * 8).toFixed(2)},${(percentY(point[key]) * 2.4).toFixed(2)}`).join(' ')
  const selected = active === null ? undefined : points[Math.min(active, points.length - 1)]
  const selectedIndex = active === null ? 0 : Math.min(active, Math.max(0, points.length - 1))
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 4), Math.floor((points.length - 1) / 2), Math.floor((points.length - 1) * 3 / 4), points.length - 1])].filter((index) => index >= 0)

  return (
    <section className="report-chart" aria-labelledby={`${id}-title`}>
      <header className="report-chart__header"><div><h2 id={`${id}-title`}>{title}</h2><p>{description}</p></div><span className="report-chart__headline">{headline}</span></header>
      <ul className="report-chart__legend" aria-label="Chart legend">{series.map((entry) => <li key={entry.key}><span className={entry.secondary ? 'report-chart__legend-line report-chart__legend-line--secondary' : 'report-chart__legend-line'} aria-hidden="true" />{entry.label}</li>)}</ul>
      <p className="report-chart__axis-title">{unit}</p>
      <div className="report-chart__canvas" role="group" tabIndex={0} aria-label={`${title} interactive chart`} aria-describedby={`${id}-instructions ${id}-active`} onFocus={() => setActive(points.length ? points.length - 1 : null)} onBlur={() => setActive(null)} onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
        setActive(Math.round(position * Math.max(0, points.length - 1)))
      }} onPointerLeave={(event) => { if (document.activeElement !== event.currentTarget) setActive(null) }} onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        setActive(event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, selectedIndex + (event.key === 'ArrowRight' ? 1 : -1))))
      }}>
        {ticks.map((tick) => <span key={tick} className="report-chart__y-label" style={{ top: `${percentY(tick)}%` }}>{axisNumber.format(tick)}</span>)}
        <svg viewBox="0 0 800 240" preserveAspectRatio="none" className="report-chart__svg" role="img" aria-label={`${title}, quantities in ${unit}. Exact values are available in the chart data table.`}>
          {ticks.map((tick) => <line key={tick} x1="0" x2="800" y1={percentY(tick) * 2.4} y2={percentY(tick) * 2.4} className={tick === 0 ? 'report-chart__zero' : 'report-chart__grid'} vectorEffect="non-scaling-stroke" />)}
          {series.length === 1 && points.length > 0 && <path d={`${pointPath(series[0].key)} L800,${percentY(0) * 2.4} L0,${percentY(0) * 2.4} Z`} className="report-chart__area" />}
          {series.map((entry) => <path key={entry.key} d={pointPath(entry.key)} className={entry.secondary ? 'report-chart__line report-chart__line--secondary' : 'report-chart__line'} vectorEffect="non-scaling-stroke" />)}
          {selected && <g><line x1={percentX(selectedIndex) * 8} x2={percentX(selectedIndex) * 8} y1="0" y2="240" className="report-chart__cursor" vectorEffect="non-scaling-stroke" />{series.map((entry) => <circle key={entry.key} cx={percentX(selectedIndex) * 8} cy={percentY(selected[entry.key]) * 2.4} r="4" className={entry.secondary ? 'report-chart__point report-chart__point--secondary' : 'report-chart__point'} vectorEffect="non-scaling-stroke" />)}</g>}
        </svg>
        {!hasData && <div className="report-chart__empty"><strong>{emptyText}</strong><span>Recorded stock changes will appear here for the selected timeline and filters.</span></div>}
        {selected && <div className="report-chart__tooltip" style={{ left: `${percentX(selectedIndex)}%`, transform: `translateX(${percentX(selectedIndex) > 70 ? '-100%' : percentX(selectedIndex) > 30 ? '-50%' : '0'})` }}><strong>{selected.fullLabel}</strong>{series.map((entry) => <span key={entry.key}>{entry.label}<b>{fullNumber.format(selected[entry.key])} {unit}</b></span>)}</div>}
      </div>
      <div className="report-chart__x-axis" aria-hidden="true">{labelIndexes.map((index) => <span key={index} style={{ left: `${percentX(index)}%`, transform: `translateX(${index === 0 ? '0' : index === points.length - 1 ? '-100%' : '-50%'})` }}>{points[index].label}</span>)}</div>
      <p id={`${id}-instructions`} className="reports__sr-only">Use the left and right arrow keys to inspect dates. Home selects the first date and End selects the last date.</p>
      <p id={`${id}-active`} className="reports__sr-only" role="status">{selected ? `${selected.fullLabel}. ${series.map((entry) => `${entry.label}: ${fullNumber.format(selected[entry.key])} ${unit}`).join('. ')}` : ''}</p>
      <details className="report-chart__data"><summary>View chart data</summary><div className="report-chart__table-wrap" tabIndex={0} role="region" aria-label={`${title} data table`}><table><caption className="reports__sr-only">{title} in {unit}</caption><thead><tr><th scope="col">Date / period</th>{series.map((entry) => <th scope="col" key={entry.key}>{entry.label} ({unit})</th>)}</tr></thead><tbody>{points.map((point) => <tr key={point.timestamp}><th scope="row">{point.fullLabel}</th>{series.map((entry) => <td key={entry.key}>{fullNumber.format(point[entry.key])}</td>)}</tr>)}</tbody></table></div></details>
    </section>
  )
}
