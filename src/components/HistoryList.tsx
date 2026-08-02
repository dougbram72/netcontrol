import { History, RotateCcw } from 'lucide-react'
import type { NetSession } from '../types'

type HistoryListProps = {
  history: NetSession[]
  onResume: (id: string) => void
}

export function HistoryList({ history, onResume }: HistoryListProps) {
  if (history.length === 0) return null

  return (
    <section className="mx-auto mt-10 w-full max-w-lg">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-radio-400">
        <History className="h-4 w-4" aria-hidden />
        Recent nets
      </h2>
      <ul className="space-y-2">
        {history.slice(0, 8).map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-radio-700 bg-radio-900/80 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-radio-100">{s.name}</div>
              <div className="mt-0.5 text-xs text-radio-400">
                <span className="font-mono">{s.frequency || '—'}</span>
                {' · '}
                {s.checkIns.length} stations
                {' · '}
                {formatShort(s.startedAt)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onResume(s.id)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-radio-600 px-2.5 py-1.5 text-xs font-medium text-radio-200 transition hover:bg-radio-800"
              title="Re-open this session"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Resume
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function formatShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
