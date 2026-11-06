import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  reportFailure, useCategories, useMachines, useTechnicians,
  type Machine, type ReportFailureResult,
} from '../lib/data'
import { bogotaParts, bogotaToIso } from '../lib/time'
import { Button, Card, Field, Input, Pill, Select, Spinner, Textarea } from './ui'

const NAME_KEY = 'sistmaint.reporterName'
const OTHER = '__other__'

function readSavedName() {
  try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' }
}
function saveName(name: string) {
  try { localStorage.setItem(NAME_KEY, name) } catch { /* private mode */ }
}

function statusPill(m: Machine) {
  if (m.status === 'PARADA') return <Pill tone="red">Parada</Pill>
  if (m.status === 'EN_MANTENIMIENTO') return <Pill tone="amber">En mantenimiento</Pill>
  return <Pill tone="green">Operativa</Pill>
}

/** Machines grouped by area for the <select>. */
function groupByLocation(machines: Machine[]) {
  const groups = new Map<string, Machine[]>()
  for (const m of machines) {
    const area = (m.location ?? 'Sin área').replace(' · Planta Gilpa', '')
    groups.set(area, [...(groups.get(area) ?? []), m])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
}

export function ReportForm({ initialMachineCode }: { initialMachineCode?: string }) {
  const { profile } = useAuth()
  const isJefe = profile?.role === 'JEFE'
  const queryClient = useQueryClient()
  const machinesQ = useMachines()
  const categoriesQ = useCategories()
  const techniciansQ = useTechnicians(isJefe)

  const now = bogotaParts()
  const [machineId, setMachineId] = useState<string>('')
  const [codeApplied, setCodeApplied] = useState(false)
  const [reporter, setReporter] = useState(() => profile?.full_name ?? readSavedName())
  const [date, setDate] = useState(now.date)
  const [time, setTime] = useState(now.time)
  const [failureType, setFailureType] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [otherSub, setOtherSub] = useState('')
  const [stopped, setStopped] = useState<boolean | null>(null)
  const [description, setDescription] = useState('')
  const [maintType, setMaintType] = useState('CORRECTIVO')
  const [priority, setPriority] = useState('')
  const [technicianId, setTechnicianId] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<ReportFailureResult | null>(null)

  const machines = machinesQ.data ?? []
  const groups = useMemo(() => groupByLocation(machines), [machines])

  // Pre-select the machine from a QR code (/reportar/:code) once machines load.
  if (!codeApplied && initialMachineCode && machines.length) {
    const m = machines.find(x => x.code.toLowerCase() === initialMachineCode.toLowerCase())
    if (m) setMachineId(String(m.id))
    setCodeApplied(true)
  }

  const machine = machines.find(m => String(m.id) === machineId)
  const category = categoriesQ.data?.find(c => c.code === failureType)
  const qrMachineMissing = Boolean(initialMachineCode && codeApplied && !machine && !machineId)

  const reset = () => {
    const n = bogotaParts()
    setResult(null)
    setMachineId('')
    setDate(n.date); setTime(n.time)
    setFailureType(''); setSubcategory(''); setOtherSub('')
    setStopped(null); setDescription('')
    setMaintType('CORRECTIVO'); setPriority(''); setTechnicianId('')
    setErrors({}); setSubmitError(null)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!machineId) errs.machine = 'Selecciona la máquina.'
    if (!reporter.trim()) errs.reporter = 'Escribe tu nombre.'
    if (!failureType) errs.failureType = 'Selecciona el tipo de falla.'
    if (stopped === null) errs.stopped = 'Indica si la máquina quedó parada.'
    if (subcategory === OTHER && !otherSub.trim()) errs.subcategory = 'Describe el síntoma.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setBusy(true)
    setSubmitError(null)
    try {
      const res = await reportFailure({
        machineId: Number(machineId),
        reporterName: reporter.trim(),
        failureType,
        failureSubcategory: subcategory === OTHER ? otherSub.trim() : subcategory,
        machineStopped: Boolean(stopped),
        description: description.trim(),
        reportedAt: bogotaToIso(date, time),
        ...(isJefe && {
          maintenanceType: maintType,
          priority: priority || undefined,
          technicianId: technicianId ? Number(technicianId) : null,
        }),
      })
      if (!profile) saveName(reporter.trim())
      setResult(res)
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['machines'] })
        queryClient.invalidateQueries({ queryKey: ['work_orders'] })
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo enviar el reporte. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (machinesQ.isLoading || categoriesQ.isLoading) return <Card><Spinner /></Card>
  if (machinesQ.isError || categoriesQ.isError) {
    return <Card><p className="p-5 text-sm text-red-700">No se pudieron cargar las máquinas. Revisa tu conexión y recarga la página.</p></Card>
  }

  /* ---------- Result screens ---------- */
  if (result?.ok) {
    return (
      <Card>
        <div className="p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-700 grid place-items-center mx-auto text-xl font-bold">✓</div>
          <h2 className="text-lg font-semibold mt-4">Falla reportada</h2>
          <p className="text-muted mt-1">
            Se creó la orden <b className="text-ink">{result.order_number}</b> para {machine?.name}. Mantenimiento ya fue notificado.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            <Button onClick={reset}>Reportar otra falla</Button>
            {profile && <Link to="/ordenes"><Button variant="secondary">Ver órdenes</Button></Link>}
          </div>
        </div>
      </Card>
    )
  }
  if (result && !result.ok) {
    return (
      <Card>
        <div className="p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 grid place-items-center mx-auto text-xl font-bold">!</div>
          <h2 className="text-lg font-semibold mt-4">Esta máquina ya tiene una orden abierta</h2>
          <p className="text-muted mt-1 max-w-md mx-auto">
            {machine?.name} ya tiene la orden <b className="text-ink">{result.existing_order_number}</b> en curso,
            así que no se creó otra. Si es una falla distinta, avísale directamente a mantenimiento.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            <Button variant="secondary" onClick={() => setResult(null)}>Volver al formulario</Button>
            {profile && <Link to="/ordenes"><Button>Ver órdenes</Button></Link>}
          </div>
        </div>
      </Card>
    )
  }

  /* ---------- Form ---------- */
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Card title="Máquina">
        <div className="p-4 space-y-3">
          {qrMachineMissing && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              No encontramos la máquina del código QR ({initialMachineCode}). Selecciónala de la lista.
            </p>
          )}
          <Field label="Máquina afectada" error={errors.machine}>
            <Select value={machineId} onChange={e => setMachineId(e.target.value)} aria-invalid={!!errors.machine}>
              <option value="">Selecciona una máquina…</option>
              {groups.map(([area, list]) => (
                <optgroup key={area} label={area}>
                  {list.map(m => <option key={m.id} value={m.id}>{m.name} · {m.code}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          {machine && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 border border-line-soft px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium truncate">{machine.name}</p>
                <p className="text-xs text-muted truncate">{machine.code} · {machine.location}</p>
              </div>
              {statusPill(machine)}
            </div>
          )}
        </div>
      </Card>

      <Card title="¿Qué pasó?">
        <div className="p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Tipo de falla" error={errors.failureType}>
              <Select value={failureType} aria-invalid={!!errors.failureType}
                onChange={e => { setFailureType(e.target.value); setSubcategory(''); setOtherSub('') }}>
                <option value="">Selecciona…</option>
                {categoriesQ.data?.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Síntoma" hint="Opcional" error={errors.subcategory}>
              <Select value={subcategory} onChange={e => setSubcategory(e.target.value)} disabled={!category}>
                <option value="">{category ? 'Selecciona…' : 'Primero elige el tipo'}</option>
                {category?.subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                {category && <option value={OTHER}>Otro…</option>}
              </Select>
            </Field>
          </div>
          {subcategory === OTHER && (
            <Field label="Describe el síntoma" error={errors.subcategory}>
              <Input value={otherSub} onChange={e => setOtherSub(e.target.value)} maxLength={80} />
            </Field>
          )}

          <fieldset>
            <legend className="text-[13px] font-medium text-ink-soft mb-1.5">¿La máquina quedó parada?</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {[
                { v: true, label: 'Sí, está parada', on: 'border-red-300 bg-red-50 text-red-800' },
                { v: false, label: 'No, sigue operando', on: 'border-brand/40 bg-brand-tint text-brand' },
              ].map(o => (
                <button
                  key={String(o.v)} type="button" role="radio" aria-checked={stopped === o.v}
                  onClick={() => setStopped(o.v)}
                  className={`h-12 rounded-lg border text-sm font-semibold cursor-pointer transition-colors ${
                    stopped === o.v ? o.on : 'border-line bg-surface text-ink-soft hover:bg-stone-50'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {errors.stopped && <p className="text-xs text-red-700 mt-1">{errors.stopped}</p>}
          </fieldset>

          <Field label="Descripción" hint="Opcional. Qué viste, oíste o qué estaba haciendo la máquina.">
            <Textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} />
          </Field>
        </div>
      </Card>

      <Card title="Quién y cuándo">
        <div className="p-4 grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <Field label="Tu nombre" error={errors.reporter}>
              <Input value={reporter} onChange={e => setReporter(e.target.value)} autoComplete="name" aria-invalid={!!errors.reporter} />
            </Field>
          </div>
          <Field label="Fecha"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></Field>
        </div>
      </Card>

      {isJefe && (
        <Card title="Clasificación (Jefe)">
          <div className="p-4 grid sm:grid-cols-3 gap-4">
            <Field label="Tipo de mantenimiento">
              <Select value={maintType} onChange={e => setMaintType(e.target.value)}>
                <option value="CORRECTIVO">Correctivo</option>
                <option value="PREVENTIVO">Preventivo</option>
                <option value="PREDICTIVO">Predictivo</option>
              </Select>
            </Field>
            <Field label="Prioridad" hint="Por defecto: Alta si está parada">
              <Select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="">Automática</option>
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAJA">Baja</option>
              </Select>
            </Field>
            <Field label="Técnico asignado">
              <Select value={technicianId} onChange={e => setTechnicianId(e.target.value)}>
                <option value="">Sin asignar</option>
                {techniciansQ.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {submitError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className="w-full sm:w-auto h-12 sm:h-10 px-6">
          {busy ? 'Enviando…' : 'Enviar reporte'}
        </Button>
      </div>
    </form>
  )
}
