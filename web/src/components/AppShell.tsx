import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  CalendarDays, ClipboardList, Cog, LayoutDashboard, LogOut, Menu, Tags, TriangleAlert, Users, X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth, type Role } from '../lib/auth'

interface NavItem { to: string; label: string; icon: LucideIcon; roles: Role[] }

const MAIN: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['JEFE'] },
  { to: '/ordenes', label: 'Órdenes', icon: ClipboardList, roles: ['JEFE', 'TECNICO'] },
  { to: '/maquinas', label: 'Máquinas', icon: Cog, roles: ['JEFE', 'TECNICO'] },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays, roles: ['JEFE', 'TECNICO'] },
]
const ADMIN: NavItem[] = [
  { to: '/categorias', label: 'Categorías', icon: Tags, roles: ['JEFE'] },
  { to: '/tecnicos', label: 'Técnicos', icon: Users, roles: ['JEFE'] },
]

export function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="w-8 h-8 rounded-lg bg-brand text-white text-[12px] font-bold grid place-items-center shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(15_118_110/0.3)]">SM</span>
      <span className="leading-tight">
        <b className="block text-[14px] font-semibold tracking-tight">SistMaint</b>
        <span className="text-[11px] text-muted">Gilpa Impresores</span>
      </span>
    </div>
  )
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

export function AppShell() {
  const { profile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const role = profile?.role
  const main = MAIN.filter(i => role && i.roles.includes(role))
  const admin = ADMIN.filter(i => role && i.roles.includes(role))

  const link = (i: NavItem) => (
    <NavLink
      key={i.to} to={i.to} onClick={() => setMenuOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors ${
          isActive ? 'bg-surface text-ink font-medium shadow-card ring-1 ring-line' : 'text-ink-soft hover:bg-stone-200/50 hover:text-ink'}`}
    >
      {({ isActive }) => (<>
        <i.icon size={17} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? 'text-brand' : 'text-stone-500'} aria-hidden />
        {i.label}
      </>)}
    </NavLink>
  )

  const sidebar = (
    <div className="flex flex-col h-full">
      <Logo />
      <NavLink to="/reportar" onClick={() => setMenuOpen(false)}
        className="mt-5 mx-0.5 flex items-center justify-center gap-2 h-9 rounded-lg bg-brand text-white text-[13px] font-medium shadow-[0_1px_2px_rgb(15_118_110/0.25),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-brand-hover transition-colors">
        <TriangleAlert size={16} aria-hidden /> Reportar falla
      </NavLink>
      <nav className="flex-1 mt-5 space-y-5" aria-label="Principal">
        <div className="space-y-0.5">{main.map(link)}</div>
        {admin.length > 0 && (
          <div>
            <p className="px-2.5 mb-1.5 text-[11px] font-medium text-faint uppercase tracking-wider">Administración</p>
            <div className="space-y-0.5">{admin.map(link)}</div>
          </div>
        )}
      </nav>
      {profile && (
        <div className="flex items-center gap-2.5 px-1.5 pt-3 border-t border-line">
          <span className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 text-xs font-semibold grid place-items-center shrink-0">
            {initials(profile.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium truncate">{profile.full_name}</p>
            <p className="text-[11px] text-muted">{profile.role === 'JEFE' ? 'Jefe de Mantenimiento' : 'Técnico'}</p>
          </div>
          <button onClick={signOut} aria-label="Cerrar sesión" title="Cerrar sesión"
            className="w-8 h-8 rounded-lg grid place-items-center text-muted hover:bg-stone-200/60 hover:text-ink cursor-pointer">
            <LogOut size={16} />
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-full flex">
      <aside className="hidden md:block w-[232px] shrink-0 px-3 py-4 sticky top-0 h-screen">{sidebar}</aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-canvas/90 backdrop-blur border-b border-line px-4 h-14">
          <Logo />
          <button onClick={() => setMenuOpen(true)} aria-label="Abrir menú"
            className="w-10 h-10 rounded-lg hover:bg-stone-200/60 grid place-items-center cursor-pointer">
            <Menu size={20} />
          </button>
        </header>
        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-stone-900/25 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)}>
            <aside className="absolute left-0 top-0 bottom-0 w-[272px] bg-canvas px-3 py-4 shadow-pop" onClick={e => e.stopPropagation()}>
              <button onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"
                className="absolute right-3 top-4 w-8 h-8 rounded-lg grid place-items-center text-muted hover:bg-stone-200/60 cursor-pointer">
                <X size={18} />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        {/* Content sits on a white panel, inset from the canvas (desktop). */}
        <main className="flex-1 md:my-2 md:mr-2 md:rounded-2xl md:bg-surface/60 md:ring-1 md:ring-line/70">
          <div className="w-full max-w-[1120px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
