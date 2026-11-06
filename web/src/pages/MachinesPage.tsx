import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isOpen, useMachines, useOrders } from '../lib/data'
import { machineStatus } from '../lib/labels'
import { MachineForm } from '../components/MachineForm'
import { Button, Card, EmptyState, Input, PageHeader, Pill, Select, Spinner } from '../components/ui'

export const areaOf = (location: string | null) => (location ?? 'Sin área').replace(' · Planta Gilpa', '')

export function MachinesPage() {
  const { profile } = useAuth()
  const isJefe = profile?.role === 'JEFE'
  const navigate = useNavigate()
  const machinesQ = useMachines()
  const orders = useOrders().data ?? []

  const [search, setSearch] = useState('')
  const [area, setArea] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)

  const machines = machinesQ.data ?? []
  const areas = useMemo(() => [...new Set(machines.map(m => areaOf(m.location)))].sort((a, b) => a.localeCompare(b, 'es')), [machines])
  const locations = useMemo(() => [...new Set(machines.map(m => m.location).filter(Boolean) as string[])].sort(), [machines])
  const openOrderMachines = useMemo(() => new Set(orders.filter(isOpen).map(o => o.machine_id)), [orders])

  const q = search.trim().toLowerCase()
  const list = machines.filter(m =>
    (!area || areaOf(m.location) === area) &&
    (!status || m.status === status) &&
    (!q || [m.name, m.code, m.brand, m.model].some(v => v?.toLowerCase().includes(q))))

  if (machinesQ.isLoading) return <Spinner />
  if (machinesQ.isError) return <Card><p className="p-5 text-sm text-red-700">No se pudieron cargar las máquinas.</p></Card>

  const qrHref = `/etiquetas${area ? `?area=${encodeURIComponent(area)}` : ''}`

  return (
    <>
      <PageHeader
        title="Máquinas"
        subtitle={`${machines.length} máquinas en ${areas.length} áreas`}
        actions={
          <div className="flex gap-2">
            <Link to={qrHref} target="_blank"><Button variant="secondary">Imprimir QR</Button></Link>
            {isJefe && <Button onClick={() => setCreating(true)}>+ Nueva máquina</Button>}
          </div>
        }
      />

      <div className="grid sm:grid-cols-[1fr_200px_180px] gap-3 mb-5">
        <Input placeholder="Buscar por nombre, código, marca…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar máquinas" />
        <Select value={area} onChange={e => setArea(e.target.value)} aria-label="Área">
          <option value="">Todas las áreas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select value={status} onChange={e => setStatus(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="OPERATIVA">Operativa</option>
          <option value="EN_MANTENIMIENTO">En mantenimiento</option>
          <option value="PARADA">Parada</option>
        </Select>
      </div>

      {list.length === 0 ? (
        <Card><EmptyState title="No hay máquinas" text="Ninguna máquina coincide con los filtros." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {list.map(m => {
            const st = machineStatus(m.status)
            return (
              <Link key={m.id} to={`/maquinas/${m.id}`}
                className="bg-surface rounded-xl ring-1 ring-line shadow-card p-4 hover:shadow-raised hover:ring-stone-300 transition-shadow block">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{m.name}</p>
                    <p className="text-xs text-muted">{m.code} · {areaOf(m.location)}</p>
                  </div>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs text-muted">
                  <span className="truncate">{[m.brand, m.model].filter(Boolean).join(' ') || 'Sin marca registrada'}</span>
                  {openOrderMachines.has(m.id) && <span className="text-amber-700 font-semibold whitespace-nowrap">Orden abierta</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <MachineForm open={creating} machine={null} areas={locations}
        onClose={() => setCreating(false)} onSaved={id => { setCreating(false); navigate(`/maquinas/${id}`) }} />
    </>
  )
}
