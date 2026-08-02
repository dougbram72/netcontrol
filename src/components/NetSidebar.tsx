import { useEffect, useState } from 'react'
import { BookmarkPlus, Download, Square } from 'lucide-react'
import type { NetSession } from '../types'

type NetSidebarProps = {
  session: NetSession
  stats: {
    total: number
    withTraffic: number
    late: number
    rollCallTotal: number
    rollCallResponded: number
  }
  onNotesChange: (notes: string) => void
  onSaveToTemplate: () => void
  onExport: () => void
  onEnd: () => void
}

export function NetSidebar({
  session,
  stats,
  onNotesChange,
  onSaveToTemplate,
  onExport,
  onEnd,
}: NetSidebarProps) {
  const [notes, setNotes] = useState(session.notes)

  // Sync from server / other devices via WebSocket-driven session updates
  useEffect(() => {
    setNotes(session.notes)
  }, [session.id, session.notes])

  // Debounce writes so typing stays smooth
  useEffect(() => {
    if (notes === session.notes) return
    const timer = window.setTimeout(() => {
      onNotesChange(notes)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [notes, onNotesChange, session.notes])

  return (
    <aside className="flex flex-col gap-4">
      <div className="rounded-2xl border border-radio-700 bg-radio-900 p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-radio-400">Session</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Net" value={session.name} />
          <Row label="Freq" value={session.frequency || '—'} mono />
          <Row label="Mode" value={session.mode} />
          <Row label="NCS" value={session.netControlCallsign} mono />
          <Row label="Opened" value={formatDateTime(session.startedAt)} />
        </dl>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat
            label="Roll call"
            value={`${stats.rollCallResponded}/${stats.rollCallTotal}`}
            accent="signal"
          />
          <Stat label="Check-ins" value={String(stats.total)} />
          <Stat label="Traffic" value={String(stats.withTraffic)} accent="traffic" />
          <Stat label="Late" value={String(stats.late)} accent="late" />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onExport}
            className="flex items-center justify-center gap-2 rounded-xl border border-radio-600 bg-radio-800 px-3 py-2.5 text-sm font-medium text-radio-100 transition hover:bg-radio-700"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="flex items-center justify-center gap-2 rounded-xl border border-alert/40 bg-alert/10 px-3 py-2.5 text-sm font-medium text-red-300 transition hover:bg-alert/20"
          >
            <Square className="h-4 w-4" aria-hidden />
            Close net
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-radio-700 bg-radio-900 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <label htmlFor="net-script" className="text-sm font-semibold uppercase tracking-wide text-radio-400">
            Net script
          </label>
          <button
            type="button"
            onClick={onSaveToTemplate}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-radio-600 px-2 py-1 text-[11px] font-medium text-radio-300 transition hover:bg-radio-800 hover:text-radio-100"
            title={
              session.templateId
                ? 'Write script and roll call back to the linked template'
                : 'Save script and roll call as a new template'
            }
          >
            <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            {session.templateId ? 'Update template' : 'Save template'}
          </button>
        </div>
        <textarea
          id="net-script"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={14}
          className="input mt-2 min-h-[16rem] resize-y font-mono text-xs leading-relaxed"
          placeholder="Preamble, check-ins, traffic, closing script…"
          spellCheck
        />
        <p className="mt-1.5 text-[11px] text-radio-500">
          Shared via the database. Script and roll call save to the template when you update it.
        </p>
      </div>
    </aside>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-radio-500">{label}</dt>
      <dd className={`text-right text-radio-100 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: 'traffic' | 'late' | 'signal'
}) {
  const valueClass =
    accent === 'traffic'
      ? 'text-traffic'
      : accent === 'late'
        ? 'text-amber-300'
        : accent === 'signal'
          ? 'text-signal'
          : 'text-radio-100'
  return (
    <div className="rounded-lg bg-radio-800/70 px-2 py-2 text-center">
      <div className={`font-mono text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-radio-500">{label}</div>
    </div>
  )
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
