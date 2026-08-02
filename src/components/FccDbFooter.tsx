import { useEffect, useState } from 'react'
import { fetchCallsignDbStatus, type CallsignDbStatus } from '../lib/callsignLookup'

export function FccDbFooter() {
  const [status, setStatus] = useState<CallsignDbStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const s = await fetchCallsignDbStatus()
        if (!cancelled) setStatus(s)
      } catch {
        if (!cancelled) setStatus(null)
      }
    }
    void load()
    const id = window.setInterval(() => {
      void load()
    }, status?.importing ? 5000 : 60000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [status?.importing])

  if (!status) {
    return <span className="text-radio-500">FCC DB…</span>
  }

  if (status.importing) {
    const phase = status.progress?.phase ?? 'importing'
    return (
      <span className="text-amber-300/90" title={status.progress?.detail}>
        FCC update: {phase}
      </span>
    )
  }

  if (status.recordCount === 0) {
    return (
      <span className="text-radio-500" title={status.lastError ?? undefined}>
        FCC DB empty
      </span>
    )
  }

  const when = status.lastModified
    ? new Date(status.lastModified).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : status.lastImportAt
      ? new Date(status.lastImportAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
      : null

  return (
    <span
      className="text-radio-500"
      title={
        status.lastError
          ? `Last error: ${status.lastError}`
          : `FCC amateur database · ${status.recordCount.toLocaleString()} callsigns`
      }
    >
      FCC {status.recordCount.toLocaleString()}
      {when ? ` · ${when}` : ''}
    </span>
  )
}
