import { useParams } from 'react-router-dom'
import { ReportForm } from '../components/ReportForm'
import { PageHeader } from '../components/ui'

// Report form inside the app shell (Jefe / Técnico).
export function ReportPage() {
  const { machineCode } = useParams()
  return (
    <div className="max-w-[720px]">
      <PageHeader title="Reportar falla" subtitle="Crea una orden de trabajo para una máquina." />
      <ReportForm initialMachineCode={machineCode} />
    </div>
  )
}
