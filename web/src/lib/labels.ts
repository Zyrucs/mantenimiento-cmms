import { useEffect, useState } from 'react'
import type { Tone } from '../components/ui'

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDIENTE: { label: 'Pendiente', tone: 'red' },
  REPORTADA: { label: 'Pendiente', tone: 'red' },
  EN_PROCESO: { label: 'En proceso', tone: 'amber' },
  PAUSADO: { label: 'Pausada', tone: 'gray' },
  PAUSADA: { label: 'Pausada', tone: 'gray' },
  FINALIZADO: { label: 'Finalizada', tone: 'green' },
  CERRADA: { label: 'Finalizada', tone: 'green' },
}
export const orderStatus = (s: string) => ORDER_STATUS[s] ?? { label: s, tone: 'gray' as Tone }

export const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  ALTA: { label: 'Alta', tone: 'red' },
  MEDIA: { label: 'Media', tone: 'amber' },
  BAJA: { label: 'Baja', tone: 'gray' },
}
export const priority = (p: string) => PRIORITY[p] ?? { label: p, tone: 'gray' as Tone }

export const MACHINE_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPERATIVA: { label: 'Operativa', tone: 'green' },
  EN_MANTENIMIENTO: { label: 'En mantenimiento', tone: 'amber' },
  PARADA: { label: 'Parada', tone: 'red' },
}
export const machineStatus = (s: string) => MACHINE_STATUS[s] ?? { label: s, tone: 'gray' as Tone }

export const MAINT_TYPE: Record<string, string> = {
  CORRECTIVO: 'Correctivo', PREVENTIVO: 'Preventivo', PREDICTIVO: 'Predictivo', POR_DEFINIR: 'Por definir',
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** Re-renders every second while `active`; returns the current time in ms. */
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}
