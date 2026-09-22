import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react'
import { api, type KnownCallsign } from '../lib/api'

type SortKey = 'callsign' | 'lastCheckedInAt' | 'lastNetName'

type KnownCallsignsModalProps = {
  onClose: () => void
  /** When provided (live net), rows are clickable and fill the check-in form. */
  onPick?: (row: KnownCallsign) => void
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'callsign', label: 'Callsign' },
  { key: 'lastCheckedInAt', label: 'Last check-in' },
  { key: 'lastNetName', label: 'Last net' },
]

export function KnownCallsignsModal({ onClose, onPick }: KnownCallsignsModalProps) {
  const [rows, setRows] = useState<KnownCallsign[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('lastCheckedInAt')
  const [asc, setAsc] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .listKnownCallsigns()
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load'))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (rows ?? []).filter(
      (r) => !q || r.callsign.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    )
    return filtered.sort((a, b) => {
      const cmp = a[sortKey].localeCompare(b[sortKey])
      return asc ? cmp : -cmp
    })
  }, [rows, query, sortKey, asc])

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc(!asc)
    else {
      setSortKey(key)
      setAsc(key !== 'lastCheckedInAt')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 sm:pt-16"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Past callsigns"
        className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-radio-700 bg-radio-900 p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-radio-100">
            Past callsigns
            {rows && <span className="ml-2 text-sm font-normal text-radio-400">{visible.length} of {rows.length}</span>}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-radio-400 hover:text-radio-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="relative mb-3 block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-radio-500" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input pl-9"
            placeholder="Filter by callsign or name"
            autoComplete="off"
          />
        </label>

        {error && <p className="text-sm text-red-300">{error}</p>}
        {!rows && !error && <p className="text-sm text-radio-400">Loading…</p>}
        {rows && rows.length === 0 && (
          <p className="text-sm text-radio-400">No check-ins in completed nets yet.</p>
        )}

        {rows && rows.length > 0 && (
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-radio-900 text-radio-400">
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="py-2 pr-3 font-medium">
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-radio-100">
                        {c.label}
                        {sortKey === c.key && (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.callsign}
                    onClick={onPick ? () => onPick(r) : undefined}
                    className={`border-t border-radio-800 ${onPick ? 'cursor-pointer hover:bg-radio-800' : ''}`}
                  >
                    <td className="py-2 pr-3">
                      <div className="font-mono text-radio-100">{r.callsign}</div>
                      {r.name && <div className="text-xs text-radio-400">{r.name}</div>}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-radio-300">
                      {new Date(r.lastCheckedInAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 text-radio-300">{r.lastNetName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {onPick && rows && rows.length > 0 && (
          <p className="mt-2 text-xs text-radio-500">Click a callsign to fill the check-in form.</p>
        )}
      </div>
    </div>
  )
}
