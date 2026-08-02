import { baseCallsignForLookup, isValidCallsign } from './callsign'

export type CallsignLookupResult = {
  /** Callsign that was queried (base, no portable designator). */
  callsign: string
  /** Preferred display name for nets (usually first name, or club name). */
  name: string
  /** Full name as reported by the database. */
  fullName: string
  city: string
  state: string
  /** "City, ST" when both known, otherwise whichever is available. */
  cityState: string
  source: 'fcc'
}

export type CallsignLookupStatus = 'idle' | 'loading' | 'found' | 'not-found' | 'error' | 'importing'

export type CallsignDbStatus = {
  ready: boolean
  importing: boolean
  recordCount: number
  lastImportAt: string | null
  lastModified: string | null
  lastError: string | null
  sourceUrl: string
  progress?: { phase: string; detail?: string }
}

type CacheEntry =
  | { ok: true; result: CallsignLookupResult; at: number }
  | { ok: false; at: number }

const CACHE_TTL_MS = 1000 * 60 * 60 // 1 hour session cache
const memoryCache = new Map<string, CacheEntry>()

function getCached(callsign: string): CacheEntry | null {
  const mem = memoryCache.get(callsign)
  if (mem && Date.now() - mem.at < CACHE_TTL_MS) return mem
  return null
}

function setCached(callsign: string, entry: CacheEntry): void {
  memoryCache.set(callsign, entry)
}

/** Thrown when the FCC table is empty and an import is still running. */
export class CallsignDbNotReadyError extends Error {
  constructor(message = 'FCC callsign database is still importing') {
    super(message)
    this.name = 'CallsignDbNotReadyError'
  }
}

/**
 * Look up a callsign against the local FCC database via the NetControl API.
 */
export async function lookupCallsign(
  input: string,
  options?: { signal?: AbortSignal; skipCache?: boolean },
): Promise<CallsignLookupResult | null> {
  const callsign = baseCallsignForLookup(input)
  if (!callsign || callsign.length < 3 || !isValidCallsign(callsign)) return null

  if (!options?.skipCache) {
    const cached = getCached(callsign)
    if (cached) return cached.ok ? cached.result : null
  }

  const res = await fetch(`/api/callsigns/${encodeURIComponent(callsign)}`, {
    signal: options?.signal,
    headers: { Accept: 'application/json' },
  })

  if (res.status === 404) {
    setCached(callsign, { ok: false, at: Date.now() })
    return null
  }
  if (res.status === 503) {
    throw new CallsignDbNotReadyError()
  }
  if (!res.ok) {
    throw new Error(`Callsign lookup failed (${res.status})`)
  }

  const data = (await res.json()) as CallsignLookupResult
  setCached(callsign, { ok: true, result: { ...data, source: 'fcc' }, at: Date.now() })
  return { ...data, source: 'fcc' }
}

export async function fetchCallsignDbStatus(signal?: AbortSignal): Promise<CallsignDbStatus> {
  const res = await fetch('/api/callsigns/status', {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Status failed (${res.status})`)
  return (await res.json()) as CallsignDbStatus
}
