import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'bg-surface text-ink border border-line hover:bg-stone-50',
  ghost: 'text-ink-soft hover:bg-stone-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

export function Button({
  variant = 'primary', className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 h-10 text-[13px] font-semibold',
        'transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant], className,
      )}
      {...props}
    />
  )
}

/* ---------- Card ---------- */
export function Card({ title, actions, children, className }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={cx('bg-surface border border-line rounded-[10px] overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-line">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

/* ---------- Stat tile ---------- */
export function Stat({ label, value, note, tone }: {
  label: string; value: ReactNode; note?: string; tone?: 'danger' | 'default'
}) {
  return (
    <div className="bg-surface border border-line rounded-[10px] p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cx('text-[26px] font-semibold mt-1.5 leading-none', tone === 'danger' && 'text-red-700')}>{value}</p>
      {note && <p className="text-xs text-muted mt-2">{note}</p>}
    </div>
  )
}

/* ---------- Status pill ---------- */
export type Tone = 'red' | 'amber' | 'green' | 'gray' | 'teal'
const tones: Record<Tone, string> = {
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-green-50 text-green-700',
  gray: 'bg-stone-100 text-stone-600',
  teal: 'bg-brand-tint text-brand',
}
export function Pill({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap', tones[tone])}>{children}</span>
}

/* ---------- Form fields ---------- */
const fieldBase = 'w-full rounded-lg border border-line bg-surface px-3 h-10 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15'

export function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-ink-soft mb-1.5">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-700 mt-1">{error}</span>
        : hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  )
}
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) =>
  <input className={cx(fieldBase, className)} {...p} />
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) =>
  <select className={cx(fieldBase, 'pr-8', className)} {...p} />
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) =>
  <textarea className={cx(fieldBase, 'h-auto py-2.5 min-h-24', className)} {...p} />

/* ---------- Table ---------- */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map(h => (
              <th key={h} className="text-left px-4 py-2.5 border-b border-line text-[11px] uppercase tracking-wide text-faint font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-4 [&_td]:py-3 [&_td]:border-b [&_td]:border-line-soft [&_tr:last-child_td]:border-0">
          {children}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- Modal ---------- */
export function Modal({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/30 p-0 sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-xl shadow-xl"
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-lg text-muted hover:bg-stone-100 text-lg cursor-pointer">×</button>
        </header>
        <div className="p-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 px-5 py-4 border-t border-line bg-stone-50/60">{footer}</footer>}
      </div>
    </div>
  )
}

/* ---------- Empty & loading ---------- */
export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6">
      <p className="font-semibold">{title}</p>
      {text && <p className="text-muted text-sm mt-1 max-w-sm mx-auto">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm" role="status">
      <span className="w-4 h-4 rounded-full border-2 border-line border-t-brand animate-spin" />
      {label}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}
