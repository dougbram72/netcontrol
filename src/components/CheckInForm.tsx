import { useRef, useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import type { AddCheckInInput } from '../hooks/useNetSession'
import { useCallsignAutofill } from '../hooks/useCallsignAutofill'
import type { CheckInStatus } from '../types'
import { LookupStatus } from './LookupStatus'

type CheckInFormProps = {
  onAdd: (
    input: AddCheckInInput,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string }
}

const STATUSES: { value: CheckInStatus; label: string }[] = [
  { value: 'checked-in', label: 'Check-in' },
  { value: 'late', label: 'Late' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'portable', label: 'Portable' },
  { value: 'echo-link', label: 'EchoLink' },
]

export function CheckInForm({ onAdd }: CheckInFormProps) {
  const callsignRef = useRef<HTMLInputElement>(null)
  const [callsign, setCallsign] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState<CheckInStatus>('checked-in')
  const [hasTraffic, setHasTraffic] = useState(false)
  const [trafficNotes, setTrafficNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    status: lookupStatus,
    sourceLabel,
    lookupNow,
    resetLookup,
    markNameEdited,
    markLocationEdited,
  } = useCallsignAutofill({
    callsign,
    name,
    location,
    setName,
    setLocation,
  })

  function resetSoft() {
    setCallsign('')
    setName('')
    setLocation('')
    setStatus('checked-in')
    setHasTraffic(false)
    setTrafficNotes('')
    setNotes('')
    setError(null)
    resetLookup()
    callsignRef.current?.focus()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const result = await onAdd({
        callsign,
        name,
        location,
        status,
        hasTraffic,
        trafficNotes,
        notes,
      })
      if (!result.ok) {
        setError(result.error)
        setFlash(null)
        return
      }
      setFlash(callsign.trim().toUpperCase())
      resetSoft()
      window.setTimeout(() => setFlash(null), 1800)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-radio-700 bg-radio-900 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-radio-100">
          <UserPlus className="h-4 w-4 text-accent" aria-hidden />
          Check-in
        </h2>
        {flash && (
          <span className="rounded-full bg-signal-dim/50 px-2.5 py-0.5 text-xs font-medium text-signal">
            Logged {flash}
          </span>
        )}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <span className="field-label">Callsign</span>
            <input
              ref={callsignRef}
              value={callsign}
              onChange={(e) => setCallsign(e.target.value.toUpperCase())}
              onBlur={lookupNow}
              className="input font-mono text-lg uppercase tracking-wide"
              placeholder="N0CALL"
              required
              autoComplete="off"
              autoFocus
            />
            <LookupStatus status={lookupStatus} sourceLabel={sourceLabel} className="mt-1" />
          </label>
          <label className="block sm:col-span-1">
            <span className="field-label">Name</span>
            <input
              value={name}
              onChange={(e) => {
                markNameEdited(e.target.value)
                setName(e.target.value)
              }}
              className="input"
              placeholder="First name"
              autoComplete="off"
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="field-label">Location</span>
            <input
              value={location}
              onChange={(e) => {
                markLocationEdited(e.target.value)
                setLocation(e.target.value)
              }}
              className="input"
              placeholder="City, ST"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="block min-w-[10rem] flex-1">
            <span className="field-label">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CheckInStatus)}
              className="input"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-5 flex cursor-pointer items-center gap-2 rounded-lg border border-radio-700 bg-radio-800/50 px-3 py-2.5 text-sm text-radio-200">
            <input
              type="checkbox"
              checked={hasTraffic}
              onChange={(e) => setHasTraffic(e.target.checked)}
              className="h-4 w-4 rounded border-radio-600 bg-radio-900 text-traffic accent-amber-500"
            />
            Has traffic
          </label>
        </div>

        {hasTraffic && (
          <label className="block">
            <span className="field-label">Traffic notes</span>
            <input
              value={trafficNotes}
              onChange={(e) => setTrafficNotes(e.target.value)}
              className="input"
              placeholder="Brief description of traffic"
              autoComplete="off"
            />
          </label>
        )}

        <label className="block">
          <span className="field-label">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            placeholder="Optional"
            autoComplete="off"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-radio-950 transition hover:bg-sky-300 disabled:opacity-60 sm:w-auto sm:min-w-[10rem]"
        >
          {submitting ? 'Logging…' : 'Log check-in'}
        </button>
      </form>
    </section>
  )
}
