import type { InventoryItem } from './inventory'

export type ReportPeriod = 'days' | 'weeks' | 'months' | 'years'
export interface ReportRange { amount: number; period: ReportPeriod }
export type ReportInterval = 'hour' | 'day' | 'week' | 'month'
export interface ReportFilters {
  warehouseId?: string
  brandId?: string
  unit: InventoryItem['unit']
}

export interface StockReportPoint {
  timestamp: number
  label: string
  fullLabel: string
  newStock: number
  added: number
  subtracted: number
}

export interface StockReport {
  start: Date
  end: Date
  interval: ReportInterval
  points: StockReportPoint[]
  summary: { newItems: number; newStock: number; added: number; subtracted: number; updates: number }
}
