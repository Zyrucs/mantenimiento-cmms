import type { ScheduleItem } from './data'

// Frequencies from least to most demanding. Colors are muted for the light theme.
export const FREQUENCIES = [
  { key: 'Inspección', label: 'Inspección', color: '#16a34a' },
  { key: 'Quincenal', label: 'Quincenal', color: '#2563eb' },
  { key: 'Mensual', label: 'Mensual', color: '#ca8a04' },
  { key: 'Trimestral', label: 'Trimestral', color: '#ea580c' },
  { key: 'Semestral', label: 'Semestral', color: '#dc2626' },
  { key: 'Anual', label: 'Anual', color: '#9333ea' },
]
export const freqMeta = (k: string) => FREQUENCIES.find(f => f.key === k) ?? { key: k, label: k, color: '#78716c' }
export const freqRank = (k: string) => FREQUENCIES.findIndex(f => f.key === k)

export const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const dateKey = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function addDays(key: string, n: number) {
  const dt = new Date(`${key}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export function longDate(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return `${d} de ${MONTHS[m - 1].toLowerCase()} de ${y}`
}

export function monthRange(y: number, m: number) {
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return { from: dateKey(y, m, 1), to: dateKey(y, m, last) }
}

export interface DayEntry extends ScheduleItem { dayNo: number; daysTotal: number }

/** Expand multi-day activities into one entry per day, indexed by date. */
export function indexByDate(items: ScheduleItem[]) {
  const byDate = new Map<string, DayEntry[]>()
  for (const it of items) {
    const n = Math.max(1, Number(it.days) || 1)
    for (let i = 0; i < n; i++) {
      const k = addDays(it.scheduled_date.slice(0, 10), i)
      const list = byDate.get(k) ?? []
      list.push({ ...it, dayNo: i + 1, daysTotal: n })
      byDate.set(k, list)
    }
  }
  return byDate
}
