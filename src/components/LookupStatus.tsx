import { Loader2 } from 'lucide-react'
import type { CallsignLookupStatus } from '../lib/callsignLookup'

type LookupStatusProps = {
  status: CallsignLookupStatus
  sourceLabel?: string | null
  className?: string
}

export function LookupStatus({ status, sourceLabel, className = '' }: LookupStatusProps) {
  if (status === 'idle') return null

  if (status === 'loading') {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] text-radio-400 ${className}`}
        role="status"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Looking up…
      </span>
    )
  }

  if (status === 'found') {
    return (
      <span className={`text-[11px] text-signal ${className}`} role="status">
        Filled from {sourceLabel ?? 'callsign DB'}
      </span>
    )
  }

  if (status === 'not-found') {
    return (
      <span className={`text-[11px] text-radio-500 ${className}`} role="status">
        No FCC match — enter name manually
      </span>
    )
  }

  if (status === 'importing') {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] text-amber-300/90 ${className}`}
        role="status"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        FCC database updating…
      </span>
    )
  }

  return (
    <span className={`text-[11px] text-amber-300/90 ${className}`} role="status">
      Lookup unavailable
    </span>
  )
}
