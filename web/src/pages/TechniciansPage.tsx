import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isOpen, saveTechnician, useAllTechnicians, useOrders, type TechnicianFull } from '../lib/data'
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, Spinner, Table } from '../components/ui'

interface Draft { id: number | null; name: string; role: string; specialty: string; phone: string; active: boolean }

export function TechniciansPage() {
  const qc = useQueryClient()
  const techQ = useAllTechnicians()
  const orders = useOrders().data ?? []
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stats = (id: number) => {
    const mine = orders.filter(o => o.assigned_technician_id === id)
    return { open: mine.filter(isOpen).length, closed: mine.filter(o => !isOpen(o)).length }
  }

  const open = (t?: TechnicianFull) => {
    setError(null)
    setDraft(t
      ? { id: t.id, name: t.name, role: t.role ?? '', specialty: t.specialty ?? '', phone: t.phone ?? '', active: t.active !== false }
      : { id: null, name: '', role: '', specialty: '', phone: '', active: true })
  }

  const onSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft) return
    if (!draft.name.trim()) { setError('El nombre es obligatorio.'); return }
    setBusy(true); setError(null)
    try {
      await saveTechnician(draft.id, draft)
      await qc.invalidateQueries({ queryKey: ['technicians'] })
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally { setBusy(false) }
  }

  if (techQ.isLoading) return <Spinner />
  const list = techQ.data ?? []

  return (
    <>
      <PageHeader title="Técnicos" subtitle="Personal de mantenimiento que se asigna a las órdenes."
        actions={<Button onClick={() => open()}>+ Nuevo técnico</Button>} />

      <Card>
        {list.length === 0 ? <EmptyState title="Sin técnicos" /> : (
          <Table head={['Nombre', 'Cargo', 'Especialidad', 'Teléfono', 'Órdenes abiertas', 'Cerradas', 'Estado']}>
            {list.map(t => {
              const s = stats(t.id)
              return (
                <tr key={t.id} onClick={() => open(t)} className="cursor-pointer hover:bg-stone-50"
                  tabIndex={0} onKeyDown={e => e.key === 'Enter' && open(t)}>
                  <td className="font-medium whitespace-nowrap">{t.name}</td>
                  <td className="text-ink-soft">{t.role || '—'}</td>
                  <td className="text-ink-soft">{t.specialty || '—'}</td>
                  <td className="text-ink-soft whitespace-nowrap">{t.phone || '—'}</td>
                  <td className="tabular-nums">{s.open}</td>
                  <td className="tabular-nums">{s.closed}</td>
                  <td>{t.active === false ? <Pill tone="gray">Inactivo</Pill> : <Pill tone="green">Activo</Pill>}</td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted mt-3">
        Los técnicos inactivos no aparecen al asignar órdenes. Su historial se conserva.
      </p>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? `Editar ${draft.name}` : 'Nuevo técnico'}
        footer={<>
          <Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button>
          <Button type="submit" form="tech-form" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        </>}>
        {draft && (
          <form id="tech-form" onSubmit={onSave} className="space-y-4">
            <Field label="Nombre completo"><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Cargo"><Input value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} placeholder="Técnico mecánico" /></Field>
              <Field label="Especialidad"><Input value={draft.specialty} onChange={e => setDraft({ ...draft, specialty: e.target.value })} placeholder="Eléctrica" /></Field>
            </div>
            <Field label="Teléfono"><Input type="tel" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} className="w-4 h-4 accent-[var(--color-brand)]" />
              Activo (se puede asignar a órdenes)
            </label>
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          </form>
        )}
      </Modal>
    </>
  )
}
