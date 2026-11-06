import { useMemo, useState } from 'react'
import { nextScheduledDate, useSchedule } from '../lib/data'
import { indexByDate, longDate, monthRange } from '../lib/calendar'
import { bogotaParts } from '../lib/time'
import { ActivityRow } from './ActivityRow'
import { MonthCalendar, MonthNav } from './MonthCalendar'
import { Button, Card, Spinner } from './ui'

/** Preventive schedule for one machine (used on the machine page). */
export function MachineSchedule({ machineId }: { machineId: number }) {
  const today = bogotaParts().date
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [selected, setSelected] = useState<string | null>(null)
  const { from, to } = monthRange(ym.y, ym.m)
  const q = useSchedule(from, to, machineId)
  const byDate = useMemo(() => indexByDate(q.data ?? []), [q.data])
  const hasItems = [...byDate.keys()].some(k => k >= from && k <= to)

  const shift = (d: number) => {
    const x = new Date(Date.UTC(ym.y, ym.m + d, 1))
    setYm({ y: x.getUTCFullYear(), m: x.getUTCMonth() }); setSelected(null)
  }
  const jump = async () => {
    const next = await nextScheduledDate(from, machineId)
    if (next) { setYm({ y: Number(next.slice(0, 4)), m: Number(next.slice(5, 7)) - 1 }); setSelected(next) }
  }

  return (
    <Card title="Mantenimiento programado" actions={<MonthNav year={ym.y} month={ym.m} onShift={shift} />}>
      <div className="p-4">
        {q.isLoading ? <Spinner /> : (
          <>
            <MonthCalendar year={ym.y} month={ym.m} byDate={byDate} selected={selected} onSelect={setSelected} countLabel="" />
            {!hasItems && (
              <div className="text-center mt-4">
                <p className="text-sm text-muted">Sin actividades este mes.</p>
                <Button variant="secondary" className="mt-2" onClick={jump}>Ir a la próxima actividad</Button>
              </div>
            )}
            {selected && (
              <div className="mt-4 pt-3 border-t border-line-soft">
                <p className="text-sm font-semibold mb-1">{longDate(selected)}</p>
                {(byDate.get(selected) ?? []).map(e => <ActivityRow key={`${e.id}-${e.dayNo}`} entry={e} />)}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
