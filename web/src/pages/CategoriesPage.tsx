import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { deleteCategory, saveCategory, useCategories, useOrders, type FailureCategory } from '../lib/data'
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Spinner, Textarea } from '../components/ui'

const SWATCHES = ['#2563eb', '#ca8a04', '#0891b2', '#9333ea', '#16a34a', '#db2777', '#ea580c', '#78716c']

interface Draft { code: string; name: string; color: string; subs: string; isNew: boolean }

export function CategoriesPage() {
  const qc = useQueryClient()
  const categoriesQ = useCategories()
  const orders = useOrders().data ?? []
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usage = (code: string) => orders.filter(o => o.failure_type === code).length

  const open = (c?: FailureCategory) => {
    setError(null); setConfirmDelete(false)
    setDraft(c
      ? { code: c.code, name: c.name, color: c.color ?? SWATCHES[0], subs: c.subcategories.join('\n'), isNew: false }
      : { code: '', name: '', color: SWATCHES[0], subs: '', isNew: true })
  }

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['failure_categories'] })
    setDraft(null)
  }

  const onSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft) return
    if (!draft.name.trim() || (draft.isNew && !draft.code.trim())) { setError('El código y el nombre son obligatorios.'); return }
    setBusy(true); setError(null)
    try {
      await saveCategory({
        code: draft.code, name: draft.name, color: draft.color,
        subcategories: draft.subs.split('\n').map(s => s.trim()).filter(Boolean),
      })
      await done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally { setBusy(false) }
  }

  const onDelete = async () => {
    if (!draft) return
    setBusy(true); setError(null)
    try { await deleteCategory(draft.code); await done() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo borrar.'); setConfirmDelete(false) }
    finally { setBusy(false) }
  }

  if (categoriesQ.isLoading) return <Spinner />

  return (
    <>
      <PageHeader title="Categorías de falla" subtitle="Tipos de falla y síntomas que aparecen en el reporte."
        actions={<Button onClick={() => open()}>+ Nueva categoría</Button>} />

      {(categoriesQ.data ?? []).length === 0 ? <Card><EmptyState title="Sin categorías" /></Card> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {categoriesQ.data!.map(c => (
            <button key={c.code} onClick={() => open(c)}
              className="text-left bg-surface rounded-xl ring-1 ring-line shadow-card p-4 hover:shadow-raised hover:ring-stone-300 transition-shadow cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color ?? '#78716c' }} />
                <p className="font-semibold truncate">{c.name}</p>
              </div>
              <p className="text-xs text-muted mt-0.5">{c.code} · {usage(c.code)} órdenes</p>
              <p className="text-sm text-ink-soft mt-2 line-clamp-2">{c.subcategories.join(', ') || 'Sin síntomas'}</p>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.isNew ? 'Nueva categoría' : `Editar ${draft?.name ?? ''}`}
        footer={draft && (confirmDelete ? (
          <>
            <span className="text-sm text-ink-soft mr-auto self-center">¿Borrar esta categoría?</span>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="danger" onClick={onDelete} disabled={busy}>Sí, borrar</Button>
          </>
        ) : (
          <>
            {!draft.isNew && <Button variant="ghost" className="mr-auto text-red-700" onClick={() => setConfirmDelete(true)}>Borrar</Button>}
            <Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button type="submit" form="category-form" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </>
        ))}>
        {draft && (
          <form id="category-form" onSubmit={onSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nombre"><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Código" hint={draft.isNew ? 'Ej: NEUMATICA. No se puede cambiar después.' : undefined}>
                <Input value={draft.code} disabled={!draft.isNew} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />
              </Field>
            </div>
            <fieldset>
              <legend className="text-[13px] font-medium text-ink-soft mb-1.5">Color</legend>
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map(s => (
                  <button key={s} type="button" onClick={() => setDraft({ ...draft, color: s })} aria-label={`Color ${s}`} aria-pressed={draft.color === s}
                    className={`w-8 h-8 rounded-full cursor-pointer ${draft.color === s ? 'ring-2 ring-offset-2 ring-ink' : ''}`} style={{ background: s }} />
                ))}
              </div>
            </fieldset>
            <Field label="Síntomas" hint="Uno por línea.">
              <Textarea value={draft.subs} onChange={e => setDraft({ ...draft, subs: e.target.value })} className="min-h-32" />
            </Field>
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          </form>
        )}
      </Modal>
    </>
  )
}
