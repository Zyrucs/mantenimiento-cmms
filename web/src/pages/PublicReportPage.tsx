import { Link } from 'react-router-dom'
import { Card, EmptyState } from '../components/ui'

// Public page for operators (no login). The real form arrives in Phase 2.
export function PublicReportPage() {
  return (
    <div className="min-h-full">
      <header className="bg-surface border-b border-line">
        <div className="max-w-[720px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-[7px] bg-brand text-white text-[13px] font-bold grid place-items-center">SM</span>
            <b className="text-sm">SistMaint</b>
          </div>
          <Link to="/login" className="text-sm text-brand font-semibold hover:underline">Ingresar</Link>
        </div>
      </header>
      <main className="max-w-[720px] mx-auto px-4 py-7">
        <h1 className="text-[22px] font-semibold tracking-tight mb-6">Reportar falla</h1>
        <Card>
          <EmptyState title="Formulario en construcción" text="El formulario de reporte se reconstruye en la Fase 2." />
        </Card>
      </main>
    </div>
  )
}
