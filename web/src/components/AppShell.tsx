import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth, type Role } from '../lib/auth'

interface NavItem { to: string; label: string; roles: Role[] }

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', roles: ['JEFE'] },
  { to: '/ordenes', label: 'Órdenes', roles: ['JEFE', 'TECNICO'] },
  { to: '/maquinas', label: 'Máquinas', roles: ['JEFE', 'TECNICO'] },
  { to: '/calendario', label: 'Calendario', roles: ['JEFE', 'TECNICO'] },
  { to: '/reportar', label: 'Reportar falla', roles: ['JEFE', 'TECNICO'] },
  { to: '/categorias', label: 'Categorías', roles: ['JEFE'] },
  { to: '/tecnicos', label: 'Técnicos', roles: ['JEFE'] },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="w-7 h-7 rounded-[7px] bg-brand text-white text-[13px] font-bold grid place-items-center">SM</span>
      <span className="leading-tight">
        <b className="block text-sm">SistMaint</b>
        <span className="text-[11px] text-muted">Gilpa Impresores</span>
      </span>
    </div>
  )
}

export function AppShell() {
  const { profile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const items = NAV.filter(i => profile && i.roles.includes(profile.role))
  const current = items.find(i => location.pathname.startsWith(i.to))

  const nav = (
    <nav className="flex flex-col gap-0.5 mt-5" aria-label="Principal">
      {items.map(i => (
        <NavLink
          key={i.to} to={i.to} onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `px-2.5 py-2 rounded-md text-sm ${isActive ? 'bg-brand-tint text-brand font-semibold' : 'text-ink-soft hover:bg-stone-100'}`}
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  )

  const userBox = profile && (
    <div className="border-t border-line pt-3 mt-3 px-2">
      <p className="text-sm font-medium truncate">{profile.full_name}</p>
      <p className="text-xs text-muted">{profile.role === 'JEFE' ? 'Jefe de Mantenimiento' : 'Técnico'}</p>
      <button onClick={signOut} className="text-xs text-brand font-semibold mt-2 hover:underline cursor-pointer">Cerrar sesión</button>
    </div>
  )

  return (
    <div className="min-h-full flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[220px] shrink-0 flex-col bg-surface border-r border-line px-3 py-5 sticky top-0 h-screen">
        <Logo />
        <div className="flex-1">{nav}</div>
        {userBox}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-surface border-b border-line px-4 h-14">
          <Logo />
          <button
            onClick={() => setMenuOpen(true)} aria-label="Abrir menú"
            className="w-10 h-10 rounded-lg hover:bg-stone-100 grid place-items-center cursor-pointer"
          >
            <span className="block w-5 h-0.5 bg-ink shadow-[0_6px_0_var(--color-ink),0_-6px_0_var(--color-ink)]" />
          </button>
        </header>
        {menuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-stone-900/30" onClick={() => setMenuOpen(false)}>
            <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-surface px-3 py-5 flex flex-col" onClick={e => e.stopPropagation()}>
              <Logo />
              <div className="flex-1">{nav}</div>
              {userBox}
            </aside>
          </div>
        )}

        <main className="flex-1 w-full max-w-[1100px] px-4 sm:px-8 py-6 sm:py-7" aria-label={current?.label}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
