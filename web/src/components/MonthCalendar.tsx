import { FREQUENCIES, MONTHS, dateKey, freqMeta, freqRank, longDate, type DayEntry } from '../lib/calendar'
import { bogotaParts } from '../lib/time'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function MonthNav({ year, month, onShift }: { year: number; month: number; onShift: (delta: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onShift(-1)} aria-label="Mes anterior" className="w-9 h-9 rounded-lg border border-line hover:bg-stone-50 cursor-pointer">‹</button>
      <span className="min-w-[140px] text-center text-sm font-semibold">{MONTHS[month]} {year}</span>
      <button onClick={() => onShift(1)} aria-label="Mes siguiente" className="w-9 h-9 rounded-lg border border-line hover:bg-stone-50 cursor-pointer">›</button>
    </div>
  )
}

export function FrequencyLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
      {FREQUENCIES.map(f => (
        <span key={f.key} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: f.color }} />{f.label}
        </span>
      ))}
    </div>
  )
}

export function FreqPill({ frequency }: { frequency: string }) {
  const f = freqMeta(frequency)
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-ink-soft whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ background: f.color }} />{f.label}
    </span>
  )
}

/** Month grid. Each day shows how many machines have activities and dots per frequency. */
export function MonthCalendar({ year, month, byDate, selected, onSelect, countLabel = 'máq.' }: {
  year: number; month: number; byDate: Map<string, DayEntry[]>
  selected: string | null; onSelect: (key: string) => void; countLabel?: string
}) {
  const first = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const today = bogotaParts().date

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-[11px] font-semibold text-faint">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: first }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1
          const key = dateKey(year, month, d)
          const entries = byDate.get(key) ?? []
          const machines = new Set(entries.map(e => e.machine_id)).size
          const freqs = [...new Set(entries.map(e => e.frequency))].sort((a, b) => freqRank(a) - freqRank(b))
          const allDone = entries.length > 0 && entries.every(e => e.status === 'REALIZADO')
          const isSel = key === selected
          return (
            <button
              key={key} disabled={!entries.length} onClick={() => onSelect(key)} aria-pressed={isSel}
              aria-label={`${longDate(key)}: ${machines ? `${machines} máquinas con actividades` : 'sin actividades'}`}
              className={`h-[60px] sm:h-[68px] rounded-lg border p-1.5 flex flex-col items-start justify-between text-left transition-colors
                ${isSel ? 'border-brand bg-brand-tint' : entries.length ? 'border-line bg-surface hover:border-stone-300 cursor-pointer' : 'border-line-soft bg-surface/50 text-faint'}`}
            >
              <span className={`text-xs font-semibold ${key === today ? 'bg-brand text-white rounded-full w-5 h-5 grid place-items-center' : ''}`}>{d}</span>
              {machines > 0 && (
                <span className="w-full flex items-end justify-between gap-1">
                  <span className="flex flex-wrap gap-0.5">
                    {freqs.map(f => <span key={f} className="w-1.5 h-1.5 rounded-full" style={{ background: freqMeta(f).color }} />)}
                  </span>
                  <span className={`text-[11px] font-semibold ${allDone ? 'text-green-700' : 'text-ink-soft'}`}>
                    {allDone ? '✓' : machines}<span className="hidden sm:inline font-normal text-muted"> {allDone ? '' : countLabel}</span>
                  </span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
