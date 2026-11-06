import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  classifyOrder, finishOrder, isOpen, pauseOrderTimer, saveOrderNotes, startOrderTimer,
  useCategories, useTechnicians, workedSeconds, type Machine, type WorkOrder,
} from '../lib/data'
import { MAINT_TYPE, formatDuration, orderStatus, priority, useNow } from '../lib/labels'
import { formatDateTime } from '../lib/time'
import { Button, Field, Input, Modal, Pill, Select, Textarea } from './ui'

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm mt-0.5">{children}</p>
    </div>
  )
}

export function OrderDetail({ order, machine, onClose }: {
  order: WorkOrder | null; machine?: Machine; onClose: () => void
}) {
  const { profile } = useAuth()
  const isJefe = profile?.role === 'JEFE'
  const qc = useQueryClient()
  const categories = useCategories().data ?? []
  const technicians = useTechnicians(true).data ?? []

  const [diagnosis, setDiagnosis] = useState('')
  const [solution, setSolution] = useState('')
  const [parts, setParts] = useState('')
  const [cls, setCls] = useState({ maintenance_type: '', priority: '', failure_type: '', failure_subcategory: '', technician: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)

  // Load the order's values when a different order opens.
  useEffect(() => {
    if (!order) return
    setDiagnosis(order.diagnosis ?? '')
    setSolution(order.solution_notes ?? '')
    setParts(order.spare_parts_used ?? '')
    setCls({
      maintenance_type: order.maintenance_type ?? 'CORRECTIVO',
      priority: order.priority ?? 'MEDIA',
      failure_type: order.failure_type ?? 'NO_SABE',
      failure_subcategory: order.failure_subcategory ?? '',
      technician: order.assigned_technician_id ? String(order.assigned_technician_id) : '',
    })
    setError(null); setMessage(null); setConfirmFinish(false)
  }, [order?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const running = Boolean(order?.timer_started_at)
  const now = useNow(running)
  if (!order) return null

  const open = isOpen(order)
  const st = orderStatus(order.status)
  const pr = priority(order.priority)
  const tech = technicians.find(t => t.id === order.assigned_technician_id)
  const category = categories.find(c => c.code === order.failure_type)
  const clsCategory = categories.find(c => c.code === cls.failure_type)

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key); setError(null); setMessage(null)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['work_orders'] })
      await qc.invalidateQueries({ queryKey: ['machines'] })
      if (ok) setMessage(ok)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal. Inténtalo de nuevo.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const onFinish = async () => {
    const done = await run('finish', () => finishOrder(order.id, diagnosis, solution, parts))
    if (done) onClose()
  }

  return (
    <Modal
      open wide title={`Orden ${order.order_number}`} onClose={onClose}
      footer={open ? (
        confirmFinish ? (
          <>
            <span className="text-sm text-ink-soft mr-auto self-center">¿Finalizar la orden? La máquina quedará operativa.</span>
            <Button variant="secondary" onClick={() => setConfirmFinish(false)}>Cancelar</Button>
            <Button onClick={onFinish} disabled={busy === 'finish'}>{busy === 'finish' ? 'Finalizando…' : 'Sí, finalizar'}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" disabled={busy === 'notes'}
              onClick={() => run('notes', () => saveOrderNotes(order.id, { diagnosis, solution_notes: solution, spare_parts_used: parts }), 'Notas guardadas.')}>
              {busy === 'notes' ? 'Guardando…' : 'Guardar notas'}
            </Button>
            <Button onClick={() => setConfirmFinish(true)}>Finalizar orden</Button>
          </>
        )
      ) : <Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="space-y-5">
        {/* Summary */}
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={st.tone}>{st.label}</Pill>
          <Pill tone={pr.tone}>Prioridad {pr.label.toLowerCase()}</Pill>
          {order.maintenance_type && <Pill tone="gray">{MAINT_TYPE[order.maintenance_type] ?? order.maintenance_type}</Pill>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Info label="Máquina">{machine ? `${machine.name} · ${machine.code}` : `#${order.machine_id}`}</Info>
          <Info label="Reportada">{formatDateTime(order.reported_at)}</Info>
          <Info label="Reportó">{order.reporter_name}</Info>
          <Info label="Técnico">{tech?.name ?? 'Sin asignar'}</Info>
          <Info label="Falla">{category?.name ?? order.failure_type}{order.failure_subcategory ? ` · ${order.failure_subcategory}` : ''}</Info>
          {order.completed_at && <Info label="Finalizada">{formatDateTime(order.completed_at)}</Info>}
        </div>
        <div className="rounded-lg bg-stone-50 border border-line-soft px-3 py-2.5 text-sm">{order.description}</div>

        {/* Timer */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
          <div>
            <p className="text-xs text-muted">Tiempo de trabajo</p>
            <p className={`font-mono text-2xl font-semibold tabular-nums ${running ? 'text-amber-700' : ''}`}>
              {formatDuration(workedSeconds(order, now))}
            </p>
          </div>
          {open && (running ? (
            <Button variant="secondary" disabled={busy === 'timer'} onClick={() => run('timer', () => pauseOrderTimer(order.id))}>Pausar</Button>
          ) : (
            <Button disabled={busy === 'timer'} onClick={() => run('timer', () => startOrderTimer(order.id))}>
              {Number(order.repair_minutes) > 0 ? 'Reanudar' : 'Iniciar'}
            </Button>
          ))}
        </div>

        {/* Technician notes */}
        <div className="space-y-3">
          <Field label="Diagnóstico">
            <Textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} disabled={!open} className="min-h-20" />
          </Field>
          <Field label="Solución aplicada">
            <Textarea value={solution} onChange={e => setSolution(e.target.value)} disabled={!open} className="min-h-20" />
          </Field>
          <Field label="Repuestos usados" hint="Ej: Rodamiento 6204 (x2), Correa A42 (x1)">
            <Input value={parts} onChange={e => setParts(e.target.value)} disabled={!open} />
          </Field>
        </div>

        {/* Jefe classification */}
        {isJefe && open && (
          <div className="rounded-lg border border-line p-4 space-y-3">
            <p className="text-sm font-semibold">Clasificación</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Técnico">
                <Select value={cls.technician} onChange={e => setCls({ ...cls, technician: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Prioridad">
                <Select value={cls.priority} onChange={e => setCls({ ...cls, priority: e.target.value })}>
                  <option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option>
                </Select>
              </Field>
              <Field label="Tipo de mantenimiento">
                <Select value={cls.maintenance_type} onChange={e => setCls({ ...cls, maintenance_type: e.target.value })}>
                  <option value="CORRECTIVO">Correctivo</option><option value="PREVENTIVO">Preventivo</option><option value="PREDICTIVO">Predictivo</option>
                </Select>
              </Field>
              <Field label="Tipo de falla">
                <Select value={cls.failure_type} onChange={e => setCls({ ...cls, failure_type: e.target.value, failure_subcategory: '' })}>
                  {categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Síntoma">
                  <Select value={cls.failure_subcategory} onChange={e => setCls({ ...cls, failure_subcategory: e.target.value })}>
                    <option value="">General</option>
                    {cls.failure_subcategory && !clsCategory?.subcategories.includes(cls.failure_subcategory) &&
                      <option value={cls.failure_subcategory}>{cls.failure_subcategory}</option>}
                    {clsCategory?.subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" disabled={busy === 'cls'}
                onClick={() => run('cls', () => classifyOrder(order.id, {
                  maintenance_type: cls.maintenance_type, priority: cls.priority,
                  failure_type: cls.failure_type, failure_category: clsCategory?.name ?? cls.failure_type,
                  failure_subcategory: cls.failure_subcategory || 'General',
                  assigned_technician_id: cls.technician ? Number(cls.technician) : null,
                }), 'Clasificación guardada.')}>
                {busy === 'cls' ? 'Guardando…' : 'Guardar clasificación'}
              </Button>
            </div>
          </div>
        )}

        {message && <p role="status" className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{message}</p>}
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  )
}
