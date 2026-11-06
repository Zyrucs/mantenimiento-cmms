import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  isOpen, markMachineOperational, reportFailure, useMachines, useOrders, useTechnicians,
  workedSeconds, type Machine, type WorkOrder,
} from '../lib/data'
import { formatDuration, machineStatus, orderStatus, priority, useNow } from '../lib/labels'
import { formatDateTime } from '../lib/time'
import { OrderDetail } from '../components/OrderDetail'
import { Button, Card, EmptyState, Input, PageHeader, Pill, Spinner, Stat, Table } from '../components/ui'

type Tab = 'open' | 'closed' | 'all'

export function OrdersPage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const ordersQ = useOrders()
  const machinesQ = useMachines()
  const technicians = useTechnicians(true).data ?? []

  const [tab, setTab] = useState<Tab>('open')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busyMachine, setBusyMachine] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const orders = ordersQ.data ?? []
  const machines = machinesQ.data ?? []
  const machineById = useMemo(() => new Map(machines.map(m => [m.id, m])), [machines])
  const openByMachine = useMemo(() => {
    const map = new Map<number, WorkOrder>()
    for (const o of orders) if (isOpen(o) && !map.has(o.machine_id)) map.set(o.machine_id, o)
    return map
  }, [orders])

  const anyRunning = orders.some(o => o.timer_started_at)
  const now = useNow(anyRunning)

  // Machines that need attention: not operative, or with an open order.
  const attention = machines
    .filter(m => m.status !== 'OPERATIVA' || openByMachine.has(m.id))
    .sort((a, b) => (a.status === 'PARADA' ? -1 : 0) - (b.status === 'PARADA' ? -1 : 0))

  const q = search.trim().toLowerCase()
  const list = orders.filter(o => {
    if (tab === 'open' && !isOpen(o)) return false
    if (tab === 'closed' && isOpen(o)) return false
    if (!q) return true
    const m = machineById.get(o.machine_id)
    return [o.order_number, o.description, o.reporter_name, m?.name, m?.code]
      .some(v => v?.toLowerCase().includes(q))
  })

  const openCount = orders.filter(isOpen).length
  const stopped = machines.filter(m => m.status === 'PARADA').length
  const selected = orders.find(o => o.id === selectedId) ?? null

  const attend = async (m: Machine) => {
    const existing = openByMachine.get(m.id)
    if (existing) return setSelectedId(existing.id)
    setBusyMachine(m.id); setError(null)
    try {
      const res = await reportFailure({
        machineId: m.id,
        reporterName: profile?.full_name ?? 'Mantenimiento',
        failureType: 'NO_SABE', failureSubcategory: '',
        machineStopped: m.status === 'PARADA',
        description: `Intervención directa sobre ${m.name}`,
        reportedAt: new Date().toISOString(),
      })
      await qc.invalidateQueries({ queryKey: ['work_orders'] })
      await qc.invalidateQueries({ queryKey: ['machines'] })
      setSelectedId(res.ok ? res.order_id : res.existing_order_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la orden.')
    } finally {
      setBusyMachine(null)
    }
  }

  const markOperational = async (m: Machine) => {
    setBusyMachine(m.id); setError(null)
    try {
      await markMachineOperational(m.id)
      await qc.invalidateQueries({ queryKey: ['machines'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la máquina.')
    } finally {
      setBusyMachine(null)
    }
  }

  if (ordersQ.isLoading || machinesQ.isLoading) return <Spinner />
  if (ordersQ.isError || machinesQ.isError) {
    return <Card><p className="p-5 text-sm text-red-700">No se pudieron cargar las órdenes. Revisa tu conexión y recarga.</p></Card>
  }

  return (
    <>
      <PageHeader
        title="Órdenes"
        subtitle="Máquinas que necesitan atención y órdenes de trabajo."
        actions={<Link to="/reportar"><Button>+ Reportar falla</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        <Stat label="Órdenes abiertas" value={openCount} />
        <Stat label="Máquinas paradas" value={stopped} tone={stopped ? 'danger' : 'default'} note={`de ${machines.length} máquinas`} />
        <Stat label="Con cronómetro activo" value={orders.filter(o => o.timer_started_at).length} />
        <Stat label="Finalizadas" value={orders.length - openCount} />
      </div>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}

      <h2 className="text-sm font-semibold mb-3">Máquinas que necesitan atención</h2>
      {attention.length === 0 ? (
        <Card className="mb-6"><EmptyState title="Todo en orden" text="Todas las máquinas están operativas y sin órdenes abiertas." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5 mb-6">
          {attention.map(m => {
            const o = openByMachine.get(m.id)
            // A machine marked "Operativa" that still has an open order is being worked on.
            const ms = o && m.status === 'OPERATIVA'
              ? { label: 'Con orden abierta', tone: 'amber' as const }
              : machineStatus(m.status)
            return (
              <div key={m.id} className="bg-surface border border-line rounded-[10px] p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{m.name}</p>
                    <p className="text-xs text-muted">{m.code}</p>
                  </div>
                  <Pill tone={ms.tone}>{ms.label}</Pill>
                </div>
                {o ? (
                  <div className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{o.order_number}</span>
                      <span className={`font-mono tabular-nums ${o.timer_started_at ? 'text-amber-700 font-semibold' : 'text-muted'}`}>
                        {formatDuration(workedSeconds(o, now))}
                      </span>
                    </div>
                    <p className="text-muted line-clamp-2 mt-0.5">{o.description}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Sin orden abierta.</p>
                )}
                <div className="flex gap-2 mt-auto">
                  <Button className="flex-1" disabled={busyMachine === m.id} onClick={() => attend(m)}>
                    {o ? 'Abrir orden' : 'Atender'}
                  </Button>
                  {!o && m.status !== 'OPERATIVA' && (
                    <Button variant="secondary" disabled={busyMachine === m.id} onClick={() => markOperational(m)}>Marcar operativa</Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Card
        title="Órdenes de trabajo"
        actions={
          <div className="flex rounded-lg border border-line p-0.5 text-[13px]" role="tablist">
            {([['open', 'Abiertas'], ['closed', 'Finalizadas'], ['all', 'Todas']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`px-3 h-8 rounded-md cursor-pointer ${tab === k ? 'bg-brand-tint text-brand font-semibold' : 'text-ink-soft hover:bg-stone-50'}`}>
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="px-4 pt-3">
          <Input placeholder="Buscar por máquina, número de orden o descripción…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar órdenes" />
        </div>
        {list.length === 0 ? (
          <EmptyState title="No hay órdenes" text={q ? 'Ninguna orden coincide con la búsqueda.' : 'No hay órdenes en esta vista.'} />
        ) : (
          <Table head={['Orden', 'Máquina', 'Falla', 'Técnico', 'Reportada', 'Prioridad', 'Estado']}>
            {list.map(o => {
              const m = machineById.get(o.machine_id)
              const st = orderStatus(o.status)
              const pr = priority(o.priority)
              return (
                <tr key={o.id} onClick={() => setSelectedId(o.id)} className="cursor-pointer hover:bg-stone-50"
                  tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSelectedId(o.id)}>
                  <td className="font-medium whitespace-nowrap">{o.order_number}</td>
                  <td className="whitespace-nowrap">{m?.name ?? `#${o.machine_id}`}</td>
                  <td className="max-w-[260px]"><span className="line-clamp-1">{o.description}</span></td>
                  <td className="whitespace-nowrap">{technicians.find(t => t.id === o.assigned_technician_id)?.name ?? <span className="text-muted">Sin asignar</span>}</td>
                  <td className="whitespace-nowrap text-ink-soft">{formatDateTime(o.reported_at)}</td>
                  <td><Pill tone={pr.tone}>{pr.label}</Pill></td>
                  <td><Pill tone={st.tone}>{st.label}</Pill></td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>

      <OrderDetail order={selected} machine={selected ? machineById.get(selected.machine_id) : undefined} onClose={() => setSelectedId(null)} />
    </>
  )
}
