import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setScheduleStatus } from '../lib/data'
import type { DayEntry } from '../lib/calendar'
import { FreqPill } from './MonthCalendar'

/** One scheduled activity with a "done" checkbox. */
export function ActivityRow({ entry }: { entry: DayEntry }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const done = entry.status === 'REALIZADO'

  const toggle = async () => {
    setBusy(true); setError(false)
    try {
      await setScheduleStatus(entry.id, !done)
      await qc.invalidateQueries({ queryKey: ['schedule'] })
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className={`flex items-start gap-3 py-2 ${busy ? 'opacity-60' : ''}`}>
      <input type="checkbox" checked={done} onChange={toggle} disabled={busy}
        className="mt-1 w-4 h-4 accent-[var(--color-brand)] cursor-pointer" aria-label={`Marcar como realizada: ${entry.activity ?? ''}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${done ? 'line-through text-muted' : ''}`}>{entry.activity || 'Actividad sin descripción'}</span>
        <span className="flex flex-wrap items-center gap-2 mt-1">
          <FreqPill frequency={entry.frequency} />
          {entry.daysTotal > 1 && <span className="text-xs text-muted">Día {entry.dayNo} de {entry.daysTotal}</span>}
          {error && <span className="text-xs text-red-700">No se pudo guardar</span>}
        </span>
      </span>
    </label>
  )
}
