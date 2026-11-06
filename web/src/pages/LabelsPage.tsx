import { useSearchParams } from 'react-router-dom'
import { useMachines } from '../lib/data'
import { QrCode, machineReportUrl } from '../components/QrCode'
import { Button, Spinner } from '../components/ui'
import { areaOf } from './MachinesPage'

// Printable QR labels. ?area=<area> or ?ids=1,2,3 to limit; otherwise all machines.
export function LabelsPage() {
  const [params] = useSearchParams()
  const machinesQ = useMachines()
  if (machinesQ.isLoading) return <Spinner />

  const ids = params.get('ids')?.split(',').map(Number).filter(Boolean)
  const area = params.get('area')
  const list = (machinesQ.data ?? []).filter(m =>
    (!ids?.length || ids.includes(m.id)) && (!area || areaOf(m.location) === area))

  return (
    <div className="bg-white min-h-full">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line">
        <div>
          <h1 className="text-lg font-semibold">Etiquetas QR</h1>
          <p className="text-sm text-muted">{list.length} etiquetas{area ? ` · ${area}` : ''}. Al escanearlas se abre el reporte de falla de la máquina.</p>
        </div>
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 gap-4 p-6 print:p-0">
        {list.map(m => (
          <div key={m.id} className="border border-line rounded-lg p-4 flex flex-col items-center text-center break-inside-avoid">
            <QrCode value={machineReportUrl(m.code)} size={140} />
            <p className="font-semibold mt-2 leading-tight">{m.name}</p>
            <p className="text-xs text-muted">{m.code}</p>
            <p className="text-[11px] text-muted mt-1">Escanee para reportar una falla</p>
          </div>
        ))}
      </div>
    </div>
  )
}
