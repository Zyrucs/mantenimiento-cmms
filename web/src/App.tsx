import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { homePathFor, useAuth, type Role } from './lib/auth'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { LoginPage } from './pages/LoginPage'
import { PublicReportPage } from './pages/PublicReportPage'
import { Placeholder } from './pages/Placeholder'
import { ReportPage } from './pages/ReportPage'

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { loading, profile } = useAuth()
  if (loading) return <Spinner />
  if (!profile) return <Navigate to="/login" replace />
  if (!roles.includes(profile.role)) return <Navigate to={homePathFor(profile.role)} replace />
  return <>{children}</>
}

function Home() {
  const { loading, profile } = useAuth()
  if (loading) return <Spinner />
  // Operators (no login) land on the public report form.
  return <Navigate to={profile ? homePathFor(profile.role) : '/reportar'} replace />
}

const BOTH: Role[] = ['JEFE', 'TECNICO']
const JEFE: Role[] = ['JEFE']

export default function App() {
  const { profile } = useAuth()
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Logged-out users get the public form; logged-in users get it inside the app shell. */}
      {!profile && <Route path="/reportar/:machineCode?" element={<PublicReportPage />} />}

      <Route element={<RequireRole roles={BOTH}><AppShell /></RequireRole>}>
        <Route path="/reportar/:machineCode?" element={<ReportPage />} />
        <Route path="/ordenes" element={<Placeholder title="Órdenes" phase={3} />} />
        <Route path="/maquinas" element={<Placeholder title="Máquinas" phase={4} />} />
        <Route path="/calendario" element={<Placeholder title="Calendario" phase={5} />} />
        <Route path="/dashboard" element={<RequireRole roles={JEFE}><Placeholder title="Dashboard" phase={6} /></RequireRole>} />
        <Route path="/categorias" element={<RequireRole roles={JEFE}><Placeholder title="Categorías" phase={6} /></RequireRole>} />
        <Route path="/tecnicos" element={<RequireRole roles={JEFE}><Placeholder title="Técnicos" phase={6} /></RequireRole>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
