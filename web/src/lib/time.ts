// All dates in the app are shown and entered in Colombia time (UTC-5, no DST).
export const APP_TIME_ZONE = 'America/Bogota'

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** Date -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in Colombia time. */
export function bogotaParts(d: Date = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/** Colombia-local date + time inputs -> ISO timestamp with offset, for Supabase. */
export function bogotaToIso(date: string, time: string) {
  return `${date}T${time.length === 5 ? `${time}:00` : time}-05:00`
}

/** Supabase timestamp -> 'DD/MM/YYYY HH:MM' in Colombia time. */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return ''
  const { date, time } = bogotaParts(new Date(value))
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y} ${time}`
}
