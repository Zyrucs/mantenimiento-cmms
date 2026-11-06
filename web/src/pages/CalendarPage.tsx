import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { nextScheduledDate, useMachines, useSchedule } from '../lib/data'
import { indexByDate, longDate, monthRange, freqRank, type DayEntry } from '../lib/calendar'
import { bogotaParts } from '../lib/time'
import { ActivityRow } from '../components/ActivityRow'
import { FreqPill, FrequencyLegend, MonthCalendar, MonthNav } from '../components/MonthCalendar'
import { Button, Card, EmptyState, PageHeader, Select, Spinner } from '../components/ui'

export function CalendarPage() {
  const today = bogotaParts().date
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [area, setArea] = useState('')
  const [machineId, setMachineId] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [openMachine, setOpenMachine] = useState<number | null>(null)
  const [jumping, setJumping] = useState(false)

  const { from, to } = monthRange(ym.y, ym.m)
  const scheduleQ = useSchedule(from, to, machineId ? Number(machineId) : undefined)
  const machines = useMachines().data ?? []
  const machineById = useMemo(() => new Map(machines.map(m => [m.id, m])), [machines])

  const items = useMemo(() => (scheduleQ.data ?? []).filter(i => !area || i.area === area), [scheduleQ.data, area])
  const byDate = useMemo(() => indexByDate(items), [items])
  const areas = useMemo(() => [...new Set(machines.map(m => (m.location ?? '').replace(' · Planta Gilpa', '')).filter(Boolean))].sort(), [machines])
  const monthHasItems = [...byDate.keys()].some(k => k >= from && k <= to)

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(ym.y, ym.m + delta, 1))
    setYm({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
    setSelected(null); setOpenMachine(null)
  }

  const jumpToNext = async () => {
    setJumping(true)
    const next = await nextScheduledDate(from, machineId ? Number(machineId) : undefined)
    setJumping(false)
    if (next) {
      setYm({ y: Number(next.slice(0, 4)), m: Number(next.slice(5, 7)) - 1 })
      setSelected(next); setOpenMachine(null)
    }
  }

  // Selected day: activities grouped by machine.
  const dayGroups = useMemo(() => {
    if (!selected) return []
    const groups = new Map<number, DayEntry[]>()
    for (const e of byDate.get(selected) ?? []) groups.set(e.machine_id, [...(groups.get(e.machine_id) ?? []), e])
    return [...groups.entries()]
      .map(([id, list]) => ({ id, machine: machineById.get(id), list }))
      .sort((a, b) => (a.machine?.name ?? '').localeCompare(b.machine?.name ?? '', 'es'))
  }, [selected, byDate, machineById])

  return (
    <>
      <PageHeader title="Calendario" subtitle="Plan de mantenimiento preventivo por día y máquina." />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <Select value={area} onChange={e => { setArea(e.target.value); setSelected(null) }} aria-label="Área" className="w-auto min-w-[170px]">
            <option value="">Todas las áreas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </Select>
          <Select value={machineId} onChange={e => { setMachineId(e.target.value); setSelected(null) }} aria-label="Máquina" className="w-auto min-w-[190px]">
            <option value="">Todas las máquinas</option>
            {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </div>
        <MonthNav year={ym.y} month={ym.m} onShift={shift} />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        <Card>
          <div className="p-4">
            {scheduleQ.isLoading ? <Spinner /> : scheduleQ.isError ? (
              <p className="text-sm text-red-700">No se pudo cargar el cronograma.</p>
            ) : (
              <>
                <MonthCalendar year={ym.y} month={ym.m} byDate={byDate} selected={selected}
                  onSelect={k => { setSelected(k); setOpenMachine(null) }} />
                {!monthHasItems && (
                  <div className="text-center mt-4">
                    <p className="text-sm text-muted">No hay actividades programadas este mes.</p>
                    <Button variant="secondary" className="mt-2" onClick={jumpToNext} disabled={jumping}>
                      {jumping ? 'Buscando…' : 'Ir a la próxima actividad'}
                    </Button>
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-line-soft"><FrequencyLegend /></div>
              </>
            )}
          </div>
        </Card>

        <Card title={selected ? longDate(selected) : 'Día'}>
          {!selected ? (
            <EmptyState title="Selecciona un día" text="Verás las máquinas con actividades ese día." />
          ) : dayGroups.length === 0 ? (
            <EmptyState title="Sin actividades" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {dayGroups.map(g => {
                const freqs = [...new Set(g.list.map(e => e.frequency))].sort((a, b) => freqRank(b) - freqRank(a))
                const done = g.list.filter(e => e.status === 'REALIZADO').length
                const expanded = openMachine === g.id
                return (
                  <li key={g.id}>
                    <button onClick={() => setOpenMachine(expanded ? null : g.id)} aria-expanded={expanded}
                      className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-stone-50 cursor-pointer">
                      <span className="min-w-0">
                        <span className="block font-medium truncate">{g.machine?.name ?? `Máquina ${g.id}`}</span>
                        <span className="flex flex-wrap gap-1.5 mt-1">{freqs.map(f => <FreqPill key={f} frequency={f} />)}</span>
                      </span>
                      <span className={`text-xs whitespace-nowrap ${done === g.list.length ? 'text-green-700 font-semibold' : 'text-muted'}`}>
                        {done}/{g.list.length}
                      </span>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-3">
                        {g.list.map(e => <ActivityRow key={`${e.id}-${e.dayNo}`} entry={e} />)}
                        <Link to={`/maquinas/${g.id}`} className="inline-block text-sm text-brand font-semibold hover:underline mt-1">Ver máquina →</Link>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
