import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Public URL a machine's QR code points to (opens the report form for that machine). */
export const machineReportUrl = (code: string) =>
  `${window.location.origin}/reportar/${encodeURIComponent(code)}`

export function QrCode({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#18181b', light: '#ffffff' } })
      .then(s => active && setSvg(s))
    return () => { active = false }
  }, [value])
  return (
    <div
      className={className} style={{ width: size, height: size }}
      role="img" aria-label={`Código QR: ${value}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
