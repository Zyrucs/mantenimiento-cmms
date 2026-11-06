import { Link, useParams } from 'react-router-dom'
import { ReportForm } from '../components/ReportForm'
import { Logo } from '../components/AppShell'

// Public page for operators (no login), also reached from machine QR codes.
export function PublicReportPage() {
  const { machineCode } = useParams()
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur border-b border-line">
        <div className="max-w-[720px] mx-auto px-4 h-16 flex items-center justify-between">
          <Logo />
          <Link to="/login" className="h-9 px-3.5 inline-flex items-center rounded-lg text-[13px] font-medium bg-surface ring-1 ring-line shadow-card hover:bg-subtle">Ingresar</Link>
        </div>
      </header>
      <main className="max-w-[720px] mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Reportar falla</h1>
        <p className="text-muted mt-1 mb-6">Mantenimiento recibe el aviso apenas lo envíes.</p>
        <ReportForm initialMachineCode={machineCode} />
      </main>
    </div>
  )
}
