import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  addLifeEvent, isOpen, useLifeEvents, useMachine, useMachineOrders, useMachines,
} from '../lib/data'
import { hojaVidaUrl } from '../lib/hojaVida'
import { machineStatus, orderStatus } from '../lib/labels'
import { formatDateTime } from '../lib/time'
import { MachineForm } from '../components/MachineForm'
import { OrderDetail } from '../components/OrderDetail'
import { MachineSchedule } from '../components/MachineSchedule'
import { QrCode, machineReportUrl } from '../components/QrCode'
import { Button, Card, EmptyState, Field, Input, Pill, Spinner, Table, Textarea } from '../components/ui'
import { areaOf } from './MachinesPage'

const EVENT_LABEL: Record<string, string> = {
  REPARACION_CERRADA: 'Reparación', ESTADO: 'Cambio de estado', NOTA: 'Nota', INSPECCION: 'Inspección', CAMBIO_REPUESTO: 'Repuesto',
}

function Spec({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm mt-0.5">{value || <span className="text-faint">—</span>}</dd>
    </div>
  )
}

export function MachineDetailPage() {
  const id = Number(useParams().id)
  const { profile } = useAuth()
  const isJefe = profile?.role === 'JEFE'
  const qc = useQueryClient()
  const machineQ = useMachine(id)
  const ordersQ = useMachineOrders(id)
  const eventsQ = useLifeEvents(id)
  const allMachines = useMachines().data ?? []

  const [editing, setEditing] = useState(false)
  const [orderId, setOrderId] = useState<number | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState({ title: '', description: '', parts: '', type: 'NOTA' })
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const locations = useMemo(() => [...new Set(allMachines.map(m => m.location).filter(Boolean) as string[])].sort(), [allMachines])

  if (machineQ.isLoading) return <Spinner />
  const m = machineQ.data
  if (!m) {
    return <Card><EmptyState title="Máquina no encontrada" action={<Link to="/maquinas"><Button variant="secondary">Volver a máquinas</Button></Link>} /></Card>
  }

  const orders = ordersQ.data ?? []
  const openOrder = orders.find(isOpen)
  const st = machineStatus(m.status)
  const selectedOrder = orders.find(o => o.id === orderId) ?? null
  const finished = orders.filter(o => !isOpen(o))
  const totalRepairMin = finished.reduce((s, o) => s + (Number(o.repair_minutes) || 0), 0)

  const submitNote = async (e: FormEvent) => {
    e.preventDefault()
    if (!note.title.trim()) { setNoteError('Escribe un título.'); return }
    setNoteBusy(true); setNoteError(null)
    try {
      await addLifeEvent(m.id, note.type, note.title, note.description, note.parts)
      await qc.invalidateQueries({ queryKey: ['life_events', m.id] })
      setNote({ title: '', description: '', parts: '', type: 'NOTA' })
      setNoteOpen(false)
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setNoteBusy(false)
    }
  }

  return (
    <>
      <Link to="/maquinas" className="text-sm text-muted hover:text-ink">← Máquinas</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[22px] font-semibold tracking-tight">{m.name}</h1>
            <Pill tone={st.tone}>{st.label}</Pill>
          </div>
          <p className="text-muted mt-0.5">{m.code} · {areaOf(m.location)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={hojaVidaUrl(m.name)} target="_blank" rel="noopener noreferrer"><Button variant="secondary">Hoja de vida (Sheets)</Button></a>
          {isJefe && <Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button>}
          {openOrder
            ? <Button onClick={() => setOrderId(openOrder.id)}>Abrir orden {openOrder.order_number}</Button>
            : <Link to={`/reportar/${encodeURIComponent(m.code)}`}><Button>Reportar falla</Button></Link>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_260px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <Card title="Ficha técnica">
            <dl className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Spec label="Marca" value={m.brand} />
              <Spec label="Modelo" value={m.model} />
              <Spec label="Serie" value={m.serial_number} />
              <Spec label="Instalación" value={m.install_date} />
              <Spec label="Voltaje" value={m.voltage} />
              <Spec label="Potencia" value={m.power_kw} />
              <Spec label="Criticidad" value={m.criticality} />
              <Spec label="Proveedor" value={m.supplier} />
              <Spec label="Preventivo cada" value={m.preventive_interval_days && `${m.preventive_interval_days} días`} />
              <Spec label="Último mantenimiento" value={m.last_maintenance_date} />
              <Spec label="Próximo mantenimiento" value={m.next_maintenance_date} />
              <Spec label="Tiempo total de reparación" value={`${Math.round(totalRepairMin)} min en ${finished.length} órdenes`} />
            </dl>
            {(m.critical_parts || m.description || m.life_notes) && (
              <dl className="px-4 pb-4 grid gap-4 border-t border-line-soft pt-4">
                {m.critical_parts && <Spec label="Repuestos críticos" value={m.critical_parts} />}
                {m.description && <Spec label="Descripción" value={m.description} />}
                {m.life_notes && <Spec label="Notas" value={m.life_notes} />}
              </dl>
            )}
          </Card>

          <MachineSchedule machineId={m.id} />

          <Card title={`Órdenes (${orders.length})`}>
            {orders.length === 0 ? <EmptyState title="Sin órdenes" text="Esta máquina no tiene órdenes registradas." /> : (
              <Table head={['Orden', 'Falla', 'Reportada', 'Tiempo', 'Estado']}>
                {orders.map(o => {
                  const os = orderStatus(o.status)
                  return (
                    <tr key={o.id} onClick={() => setOrderId(o.id)} className="cursor-pointer hover:bg-stone-50"
                      tabIndex={0} onKeyDown={e => e.key === 'Enter' && setOrderId(o.id)}>
                      <td className="font-medium whitespace-nowrap">{o.order_number}</td>
                      <td className="max-w-[240px]"><span className="line-clamp-1">{o.description}</span></td>
                      <td className="whitespace-nowrap text-ink-soft">{formatDateTime(o.reported_at)}</td>
                      <td className="whitespace-nowrap">{Math.round(Number(o.repair_minutes) || 0)} min</td>
                      <td><Pill tone={os.tone}>{os.label}</Pill></td>
                    </tr>
                  )
                })}
              </Table>
            )}
          </Card>

          <Card title="Historial (hoja de vida)" actions={!noteOpen && <Button variant="secondary" className="h-8" onClick={() => setNoteOpen(true)}>+ Agregar nota</Button>}>
            {noteOpen && (
              <form onSubmit={submitNote} className="p-4 space-y-3 border-b border-line bg-stone-50/60">
                <div className="grid sm:grid-cols-[1fr_180px] gap-3">
                  <Field label="Título"><Input value={note.title} onChange={e => setNote({ ...note, title: e.target.value })} placeholder="Cambio de correa principal" /></Field>
                  <Field label="Tipo">
                    <select value={note.type} onChange={e => setNote({ ...note, type: e.target.value })}
                      className="w-full rounded-lg border border-line bg-surface px-3 h-10 text-sm">
                      <option value="NOTA">Nota</option><option value="INSPECCION">Inspección</option><option value="CAMBIO_REPUESTO">Cambio de repuesto</option>
                    </select>
                  </Field>
                </div>
                <Field label="Detalle"><Textarea value={note.description} onChange={e => setNote({ ...note, description: e.target.value })} className="min-h-16" /></Field>
                <Field label="Repuestos" hint="Opcional"><Input value={note.parts} onChange={e => setNote({ ...note, parts: e.target.value })} /></Field>
                {noteError && <p role="alert" className="text-sm text-red-700">{noteError}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => { setNoteOpen(false); setNoteError(null) }}>Cancelar</Button>
                  <Button type="submit" disabled={noteBusy}>{noteBusy ? 'Guardando…' : 'Guardar nota'}</Button>
                </div>
              </form>
            )}
            {(eventsQ.data ?? []).length === 0 ? <EmptyState title="Sin registros" text="Aquí aparecen las reparaciones cerradas y las notas." /> : (
              <ol className="p-4 space-y-4">
                {eventsQ.data!.map(ev => (
                  <li key={ev.id} className="flex gap-3">
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-brand shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ev.title}</p>
                      <p className="text-xs text-muted">
                        {EVENT_LABEL[ev.event_type] ?? ev.event_type} · {formatDateTime(ev.created_at)}{ev.created_by ? ` · ${ev.created_by}` : ''}
                      </p>
                      {ev.description && <p className="text-sm text-ink-soft mt-1">{ev.description}</p>}
                      {ev.parts_replaced && <p className="text-xs text-muted mt-1">Repuestos: {ev.parts_replaced}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <Card title="Código QR">
          <div className="p-4 flex flex-col items-center text-center gap-2">
            <QrCode value={machineReportUrl(m.code)} size={180} />
            <p className="text-xs text-muted">Escanéalo para reportar una falla en esta máquina.</p>
            <Link to={`/etiquetas?ids=${m.id}`} target="_blank" className="text-sm text-brand font-semibold hover:underline">Imprimir etiqueta</Link>
          </div>
        </Card>
      </div>

      <MachineForm open={editing} machine={m} areas={locations} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      <OrderDetail order={selectedOrder} machine={m} onClose={() => setOrderId(null)} />
    </>
  )
}
