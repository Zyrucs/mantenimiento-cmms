import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown, Inbox, X, type LucideIcon } from 'lucide-react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-[0_1px_2px_rgb(15_118_110/0.25),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-brand-hover',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line shadow-card hover:bg-subtle',
  ghost: 'text-ink-soft hover:bg-stone-200/50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
}

export function Button({
  variant = 'primary', icon: Icon, className, children, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 h-9 text-[13px] font-medium',
        'transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant], className,
      )}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={2} aria-hidden className="-ml-0.5" />}
      {children}
    </button>
  )
}

/* ---------- Card ---------- */
export function Card({ title, actions, children, className }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={cx('bg-surface rounded-xl ring-1 ring-line shadow-card overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line-soft">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

/* ---------- Stat tile ---------- */
export function Stat({ label, value, note, tone, icon: Icon }: {
  label: string; value: ReactNode; note?: string; tone?: 'danger' | 'default'; icon?: LucideIcon
}) {
  return (
    <div className="bg-surface rounded-xl ring-1 ring-line shadow-card p-4 h-full">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-muted font-medium">{label}</p>
        {Icon && (
          <span className={cx('w-7 h-7 rounded-lg grid place-items-center', tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-stone-100 text-stone-500')}>
            <Icon size={15} strokeWidth={2} aria-hidden />
          </span>
        )}
      </div>
      <p className={cx('text-[28px] font-semibold tracking-tight mt-2 leading-none', tone === 'danger' && 'text-red-700')}>{value}</p>
      {note && <p className="text-xs text-muted mt-2">{note}</p>}
    </div>
  )
}

/* ---------- Status pill (dot + label, never color alone) ---------- */
export type Tone = 'red' | 'amber' | 'green' | 'gray' | 'teal'
const tones: Record<Tone, { box: string; dot: string }> = {
  red: { box: 'bg-red-50 text-red-700 ring-red-600/15', dot: 'bg-red-500' },
  amber: { box: 'bg-amber-50 text-amber-800 ring-amber-600/20', dot: 'bg-amber-500' },
  green: { box: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', dot: 'bg-emerald-500' },
  gray: { box: 'bg-stone-50 text-stone-600 ring-stone-500/15', dot: 'bg-stone-400' },
  teal: { box: 'bg-brand-tint text-brand ring-brand/15', dot: 'bg-brand' },
}
export function Pill({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  const t = tones[tone]
  return (
    <span className={cx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ring-1 ring-inset', t.box)}>
      <span className={cx('w-1.5 h-1.5 rounded-full', t.dot)} aria-hidden />
      {children}
    </span>
  )
}

/* ---------- Form fields ---------- */
const fieldBase = 'w-full rounded-lg bg-surface ring-1 ring-inset ring-line shadow-card px-3 h-10 text-sm text-ink placeholder:text-faint transition-shadow focus:outline-none focus:ring-2 focus:ring-brand/60 disabled:bg-subtle disabled:text-muted'

export function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-ink-soft mb-1.5">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-700 mt-1.5">{error}</span>
        : hint && <span className="block text-xs text-muted mt-1.5">{hint}</span>}
    </label>
  )
}
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) =>
  <input className={cx(fieldBase, className)} {...p} />
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <span className="relative block">
    <select className={cx(fieldBase, 'appearance-none pr-9 cursor-pointer', className)} {...p} />
    <ChevronDown size={16} aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
  </span>
)
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) =>
  <textarea className={cx(fieldBase, 'h-auto py-2.5 min-h-24 resize-y', className)} {...p} />

/* ---------- Table ---------- */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-subtle">
          <tr>
            {head.map(h => (
              <th key={h} className="text-left px-5 py-2.5 border-b border-line-soft text-xs text-muted font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-5 [&_td]:py-3 [&_td]:border-b [&_td]:border-line-soft [&_tr:last-child_td]:border-0 [&_tr]:transition-colors">
          {children}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- Modal ---------- */
export function Modal({ open, title, onClose, children, footer, wide }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/25 backdrop-blur-[2px] p-0 sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={`bg-surface w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-pop ring-1 ring-line`}
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg text-muted hover:bg-stone-100 hover:text-ink grid place-items-center cursor-pointer">
            <X size={18} />
          </button>
        </header>
        {/* Only the body scrolls, so the action buttons stay visible. */}
        <div className="px-6 pb-5 overflow-y-auto min-h-0">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 px-6 py-4 border-t border-line-soft bg-subtle shrink-0 rounded-b-2xl">{footer}</footer>}
      </div>
    </div>
  )
}

/* ---------- Empty & loading ---------- */
export function EmptyState({ title, text, action, icon: Icon = Inbox }: { title: string; text?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="text-center py-12 px-6">
      <span className="w-10 h-10 rounded-xl bg-stone-100 text-stone-400 grid place-items-center mx-auto mb-3">
        <Icon size={20} aria-hidden />
      </span>
      <p className="font-medium">{title}</p>
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
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-1">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}

/** Segmented control (tabs). */
export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string
}) {
  return (
    <div className="inline-flex rounded-lg bg-stone-200/60 p-0.5 text-[13px]" role="tablist" aria-label={label}>
      {options.map(([k, text]) => (
        <button key={String(k)} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={cx('px-3 h-7 rounded-md cursor-pointer transition-all font-medium',
            value === k ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-muted hover:text-ink')}>
          {text}
        </button>
      ))}
    </div>
  )
}
