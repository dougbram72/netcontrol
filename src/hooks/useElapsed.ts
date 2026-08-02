import { useEffect, useState } from 'react'

export function useElapsed(startedAt: string | null | undefined): string {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  if (!startedAt) return '00:00:00'

  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return '00:00:00'

  const totalSec = Math.max(0, Math.floor((now - start) / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}
