import { useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { saveMachine, type MachineDetail, type MachineInput } from '../lib/data'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'

const EMPTY: MachineInput = {
  code: '', name: '', location: '', brand: '', model: '', serial_number: '', install_date: '',
  voltage: '', power_kw: '', criticality: '', supplier: '', critical_parts: '', description: '',
  preventive_interval_days: '', next_maintenance_date: '', life_notes: '',
}

function toInput(m: MachineDetail | null): MachineInput {
  if (!m) return { ...EMPTY }
  const out: MachineInput = {}
  for (const k of Object.keys(EMPTY) as (keyof MachineInput)[]) {
    const v = m[k as keyof MachineDetail]
    out[k] = v === null || v === undefined ? '' : String(v)
  }
  return out
}

export function MachineForm({ open, machine, areas, onClose, onSaved }: {
  open: boolean; machine: MachineDetail | null; areas: string[]
  onClose: () => void; onSaved: (id: number) => void
}) {
  const qc = useQueryClient()
  const [f, setF] = useState<MachineInput>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (open) { setF(toInput(machine)); setError(null) } }, [open, machine])

  const set = (k: keyof MachineInput) => (e: { target: { value: string } }) => setF(prev => ({ ...prev, [k]: e.target.value }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.code?.trim() || !f.name?.trim()) { setError('El código y el nombre son obligatorios.'); return }
    setBusy(true); setError(null)
    try {
      const id = await saveMachine(machine?.id ?? null, f)
      await qc.invalidateQueries({ queryKey: ['machines'] })
      await qc.invalidateQueries({ queryKey: ['machine', id] })
      onSaved(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la máquina.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open} wide onClose={onClose} title={machine ? `Editar ${machine.name}` : 'Nueva máquina'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="machine-form" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </>}
    >
      <form id="machine-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Código *"><Input value={f.code} onChange={set('code')} placeholder="GIL-045" /></Field>
          <Field label="Nombre *"><Input value={f.name} onChange={set('name')} placeholder="SELLADORA 16" /></Field>
          <Field label="Área">
            <Input value={f.location} onChange={set('location')} list="machine-areas" placeholder="Sellado · Planta Gilpa" />
            <datalist id="machine-areas">{areas.map(a => <option key={a} value={a} />)}</datalist>
          </Field>
          <Field label="Criticidad">
            <Select value={f.criticality} onChange={set('criticality')}>
              <option value="">Sin definir</option><option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option>
            </Select>
          </Field>
          <Field label="Marca"><Input value={f.brand} onChange={set('brand')} /></Field>
          <Field label="Modelo"><Input value={f.model} onChange={set('model')} /></Field>
          <Field label="Número de serie"><Input value={f.serial_number} onChange={set('serial_number')} /></Field>
          <Field label="Fecha de instalación"><Input type="date" value={f.install_date} onChange={set('install_date')} /></Field>
          <Field label="Voltaje"><Input value={f.voltage} onChange={set('voltage')} placeholder="220 V" /></Field>
          <Field label="Potencia"><Input value={f.power_kw} onChange={set('power_kw')} placeholder="5.5 kW" /></Field>
          <Field label="Proveedor"><Input value={f.supplier} onChange={set('supplier')} /></Field>
          <Field label="Preventivo cada (días)"><Input type="number" min={0} value={f.preventive_interval_days} onChange={set('preventive_interval_days')} /></Field>
          <Field label="Próximo mantenimiento"><Input type="date" value={f.next_maintenance_date} onChange={set('next_maintenance_date')} /></Field>
        </div>
        <Field label="Repuestos críticos"><Textarea value={f.critical_parts} onChange={set('critical_parts')} className="min-h-16" /></Field>
        <Field label="Descripción"><Textarea value={f.description} onChange={set('description')} className="min-h-16" /></Field>
        <Field label="Notas"><Textarea value={f.life_notes} onChange={set('life_notes')} className="min-h-16" /></Field>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      </form>
    </Modal>
  )
}
