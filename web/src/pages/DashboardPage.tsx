import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isOpen, useCategories, useMachines, useOrders } from '../lib/data'
import { MONTHS } from '../lib/calendar'
import { bogotaParts } from '../lib/time'
import { BarList, ChartCard, ColumnChart, type Datum } from '../components/charts'
import { Card, PageHeader, Spinner, Stat } from '../components/ui'

const PERIODS = [
  { key: 30, label: '30 días' },
  { key: 90, label: '90 días' },
  { key: 365, label: '12 meses' },
] as const

const fmtMin = (min: number) => min >= 120 ? `${(min / 60).toLocaleString('es-CO', { maximumFractionDigits: 1 })} h` : `${Math.round(min)} min`

export function DashboardPage() {
  const ordersQ = useOrders()
  const machines = useMachines().data ?? []
  const categories = useCategories().data ?? []
  const [days, setDays] = useState<number>(90)

  const orders = ordersQ.data ?? []
  const since = Date.now() - days * 86_400_000
  const inPeriod = useMemo(() => orders.filter(o => new Date(o.reported_at).getTime() >= since), [orders, since])
  const finished = inPeriod.filter(o => !isOpen(o))

  const openCount = orders.filter(isOpen).length
  const stopped = machines.filter(m => m.status === 'PARADA').length
  const mttr = finished.length ? finished.reduce((s, o) => s + (Number(o.repair_minutes) || 0), 0) / finished.length : 0
  const downtime = finished.reduce((s, o) => s + (Number(o.downtime_minutes) || 0), 0)

  // Orders per month, last 12 months (Colombia time).
  const monthly: Datum[] = useMemo(() => {
    const now = bogotaParts().date
    let y = Number(now.slice(0, 4)), m = Number(now.slice(5, 7)) - 1
    const buckets: Datum[] = []
    for (let i = 0; i < 12; i++) {
      buckets.unshift({ key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTHS[m]} ${y}`, value: 0 })
      m--; if (m < 0) { m = 11; y-- }
    }
    for (const o of orders) {
      const k = bogotaParts(new Date(o.reported_at)).date.slice(0, 7)
      const b = buckets.find(x => x.key === k)
      if (b) b.value++
    }
    return buckets
  }, [orders])

  const byType: Datum[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of inPeriod) counts.set(o.failure_type ?? 'NO_SABE', (counts.get(o.failure_type ?? 'NO_SABE') ?? 0) + 1)
    return [...counts.entries()]
      .map(([code, value]) => ({ key: code, label: categories.find(c => c.code === code)?.name ?? code, value }))
      .sort((a, b) => b.value - a.value)
  }, [inPeriod, categories])

  const topMachines: Datum[] = useMemo(() => {
    const counts = new Map<number, { n: number; min: number }>()
    for (const o of inPeriod) {
      const c = counts.get(o.machine_id) ?? { n: 0, min: 0 }
      c.n++; c.min += Number(o.downtime_minutes) || 0
      counts.set(o.machine_id, c)
    }
    return [...counts.entries()]
      .map(([id, c]) => ({
        key: String(id), label: machines.find(m => m.id === id)?.name ?? `Máquina ${id}`,
        value: c.n, href: `/maquinas/${id}`, hint: `paro ${fmtMin(c.min)}`,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [inPeriod, machines])

  if (ordersQ.isLoading) return <Spinner />
  if (ordersQ.isError) return <Card><p className="p-5 text-sm text-red-700">No se pudieron cargar los datos.</p></Card>

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Estado de la planta y fallas registradas."
        actions={
          <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[13px]" role="tablist" aria-label="Periodo">
            {PERIODS.map(p => (
              <button key={p.key} role="tab" aria-selected={days === p.key} onClick={() => setDays(p.key)}
                className={`px-3 h-8 rounded-md cursor-pointer ${days === p.key ? 'bg-brand-tint text-brand font-semibold' : 'text-ink-soft hover:bg-stone-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <Link to="/ordenes" className="block"><Stat label="Órdenes abiertas" value={openCount} note="ahora" /></Link>
        <Stat label="Máquinas paradas" value={stopped} tone={stopped ? 'danger' : 'default'} note={`de ${machines.length} máquinas`} />
        <Stat label="Tiempo medio de reparación" value={finished.length ? fmtMin(mttr) : '—'} note={`${finished.length} órdenes cerradas`} />
        <Stat label="Tiempo de paro" value={fmtMin(downtime)} note={`${inPeriod.length} fallas reportadas`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="lg:col-span-2">
          <ChartCard title="Órdenes por mes" subtitle="Últimos 12 meses" data={monthly} unit="órdenes">
            <ColumnChart data={monthly} unit="órdenes" />
          </ChartCard>
        </div>
        <ChartCard title="Fallas por tipo" subtitle={`Últimos ${PERIODS.find(p => p.key === days)?.label}`} data={byType} unit="fallas">
          <BarList data={byType} unit="fallas" />
        </ChartCard>
        <ChartCard title="Máquinas con más fallas" subtitle="Toca una máquina para ver su historial" data={topMachines} unit="fallas">
          <BarList data={topMachines} unit="fallas" />
        </ChartCard>
      </div>
    </>
  )
}
