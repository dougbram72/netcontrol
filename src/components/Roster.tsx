import { MessageSquareWarning, Trash2 } from 'lucide-react'
import type { CheckIn, CheckInStatus } from '../types'

type RosterProps = {
  checkIns: CheckIn[]
  onToggleTraffic: (id: string) => void
  onRemove: (id: string) => void
}

const statusLabel: Record<CheckInStatus, string> = {
  'checked-in': 'In',
  late: 'Late',
  mobile: 'Mobile',
  portable: 'Portable',
  'echo-link': 'Echolink',
}

const statusClass: Record<CheckInStatus, string> = {
  'checked-in': 'bg-signal-dim/40 text-signal',
  late: 'bg-amber-900/50 text-amber-300',
  mobile: 'bg-sky-900/50 text-sky-300',
  portable: 'bg-violet-900/50 text-violet-300',
  'echo-link': 'bg-fuchsia-900/50 text-fuchsia-300',
}

export function Roster({ checkIns, onToggleTraffic, onRemove }: RosterProps) {
  if (checkIns.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-radio-700 bg-radio-900/50 p-8 text-center">
        <p className="text-radio-400">No check-ins yet. Log the first station when they call.</p>
      </section>
    )
  }

  // Newest first for live ops — easier to confirm what just logged
  const rows = [...checkIns].reverse()

  return (
    <section className="overflow-hidden rounded-2xl border border-radio-700 bg-radio-900">
      <div className="flex items-center justify-between border-b border-radio-700 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-radio-100">Roster</h2>
        <span className="font-mono text-sm text-radio-400 tabular-nums">{checkIns.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-radio-800/60 text-xs uppercase tracking-wide text-radio-400">
            <tr>
              <th className="px-3 py-2.5 font-medium sm:px-4">#</th>
              <th className="px-3 py-2.5 font-medium sm:px-4">Callsign</th>
              <th className="px-3 py-2.5 font-medium sm:px-4">Name</th>
              <th className="px-3 py-2.5 font-medium sm:px-4">Location</th>
              <th className="px-3 py-2.5 font-medium sm:px-4">Status</th>
              <th className="px-3 py-2.5 font-medium sm:px-4">Traffic</th>
              <th className="px-3 py-2.5 font-medium sm:px-4">Time</th>
              <th className="px-3 py-2.5 font-medium sm:px-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-radio-800">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-radio-800/40">
                <td className="px-3 py-2.5 font-mono text-radio-400 tabular-nums sm:px-4">
                  {c.sequence}
                </td>
                <td className="px-3 py-2.5 font-mono text-base font-semibold tracking-wide text-radio-100 sm:px-4">
                  {c.callsign}
                </td>
                <td className="px-3 py-2.5 text-radio-200 sm:px-4">{c.name || '—'}</td>
                <td className="px-3 py-2.5 text-radio-300 sm:px-4">{c.location || '—'}</td>
                <td className="px-3 py-2.5 sm:px-4">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass[c.status]}`}>
                    {statusLabel[c.status]}
                  </span>
                </td>
                <td className="px-3 py-2.5 sm:px-4">
                  <button
                    type="button"
                    onClick={() => onToggleTraffic(c.id)}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition ${
                      c.hasTraffic
                        ? 'bg-traffic/20 text-traffic ring-1 ring-traffic/40'
                        : 'text-radio-500 hover:bg-radio-800 hover:text-radio-300'
                    }`}
                    title={c.hasTraffic ? c.trafficNotes || 'Has traffic' : 'Mark traffic'}
                  >
                    <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden />
                    {c.hasTraffic ? 'Yes' : '—'}
                  </button>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-radio-400 tabular-nums sm:px-4">
                  {formatTime(c.checkedInAt)}
                </td>
                <td className="px-3 py-2.5 sm:px-4">
                  <button
                    type="button"
                    onClick={() => onRemove(c.id)}
                    className="rounded-md p-1.5 text-radio-500 transition hover:bg-alert/15 hover:text-alert"
                    title={`Remove ${c.callsign}`}
                    aria-label={`Remove ${c.callsign}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '—'
  }
}
