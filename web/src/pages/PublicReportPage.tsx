import { Link, useParams } from 'react-router-dom'
import { ReportForm } from '../components/ReportForm'

// Public page for operators (no login), also reached from machine QR codes.
export function PublicReportPage() {
  const { machineCode } = useParams()
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
        <h1 className="text-[22px] font-semibold tracking-tight">Reportar falla</h1>
        <p className="text-muted mt-0.5 mb-6">Mantenimiento recibe el aviso apenas lo envíes.</p>
        <ReportForm initialMachineCode={machineCode} />
      </main>
    </div>
  )
}
