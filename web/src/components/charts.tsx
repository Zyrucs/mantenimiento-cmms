import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/*
 * Small, dependency-free charts for the dashboard. Single series only, so no legend;
 * the card title names what is plotted. Bars: <=24px thick, 4px rounded data-end,
 * square at the baseline, 2px gap between neighbours; hairline gridlines; text in ink
 * tokens; hover/focus tooltip on every bar; a table view for every chart.
 */

export interface Datum { key: string; label: string; value: number; href?: string; hint?: string }

const fmt = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 })

export function ChartCard({ title, subtitle, data, unit, children }: {
  title: string; subtitle?: string; data: Datum[]; unit: string; children: ReactNode
}) {
  const [table, setTable] = useState(false)
  return (
    <section className="bg-surface border border-line rounded-[10px]">
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={() => setTable(t => !t)} className="text-xs text-brand font-semibold hover:underline cursor-pointer whitespace-nowrap">
          {table ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </header>
      <div className="px-4 pb-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">Sin datos en este periodo.</p>
        ) : table ? (
          <table className="w-full text-sm">
            <tbody>
              {data.map(d => (
                <tr key={d.key} className="border-b border-line-soft last:border-0">
                  <td className="py-1.5">{d.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(d.value)} {unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : children}
      </div>
    </section>
  )
}

/** Horizontal bars, sorted by the caller. Value at the bar tip. */
export function BarList({ data, unit }: { data: Datum[]; unit: string }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <ul className="space-y-2.5" role="list">
      {data.map(d => {
        const pct = (d.value / max) * 100
        const row = (
          <>
            <span className="block text-[13px] text-ink-soft truncate mb-1">{d.label}</span>
            <span className="flex items-center gap-2">
              <span className="flex-1 h-[18px]">
                <span className="block h-full rounded-r-[4px] bg-chart transition-[width]"
                  style={{ width: `max(${pct}%, 3px)` }} />
              </span>
              <span className="text-[13px] font-semibold tabular-nums w-14 text-right">{fmt(d.value)}</span>
            </span>
          </>
        )
        const tip = `${d.label}: ${fmt(d.value)} ${unit}${d.hint ? ` · ${d.hint}` : ''}`
        return (
          <li key={d.key} title={tip}>
            {d.href
              ? <Link to={d.href} aria-label={tip} className="block rounded-md -mx-1 px-1 py-0.5 hover:bg-stone-50">{row}</Link>
              : <div aria-label={tip} tabIndex={0} className="rounded-md focus-visible:bg-stone-50">{row}</div>}
          </li>
        )
      })}
    </ul>
  )
}

/** Vertical columns over time with a hover/focus tooltip. */
export function ColumnChart({ data, unit, height = 180 }: { data: Datum[]; unit: string; height?: number }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...data.map(d => d.value), 1)
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

  return (
    <div className="relative mt-4" onMouseLeave={() => setActive(null)}>
      <div className="flex gap-2">
        {/* Y axis */}
        <div className="relative w-6 shrink-0 text-[11px] text-faint tabular-nums" style={{ height }}>
          {ticks.map(t => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>{t}</span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height }}>
            {ticks.map(t => (
              <div key={t} className="absolute inset-x-0 h-px bg-grid" style={{ top: `${100 - (t / top) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {data.map((d, i) => (
                <button
                  key={d.key} type="button"
                  className="flex-1 h-full flex items-end justify-center cursor-default focus-visible:outline-none group"
                  onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                  aria-label={`${d.label}: ${fmt(d.value)} ${unit}`}
                >
                  <span
                    className={`block w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity ${active !== null && active !== i ? 'opacity-40' : ''} group-focus-visible:ring-2 group-focus-visible:ring-brand group-focus-visible:ring-offset-2`}
                    style={{ height: d.value ? `max(${(d.value / top) * 100}%, 3px)` : 0 }}
                  />
                </button>
              ))}
            </div>
            {active !== null && (
              <div
                className="absolute -top-2 -translate-x-1/2 -translate-y-full pointer-events-none bg-ink text-white text-xs rounded-md px-2 py-1 whitespace-nowrap shadow"
                style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
              >
                {data[active].label}: <b>{fmt(data[active].value)}</b> {unit}
              </div>
            )}
          </div>
          <div className="flex gap-[2px] mt-1.5">
            {data.map((d, i) => (
              <span key={d.key} className={`flex-1 text-center text-[11px] ${i === active ? 'text-ink font-semibold' : 'text-faint'}`}>
                {d.label.slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function niceStep(max: number) {
  const raw = max / 4
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}
