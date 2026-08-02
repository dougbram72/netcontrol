import { pool } from '../db.js'
import { normalizeCallsign } from '../callsign.js'

export type FccLookupResult = {
  callsign: string
  name: string
  fullName: string
  city: string
  state: string
  cityState: string
  source: 'fcc'
  status: string
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function displayName(row: {
  first_name: string
  last_name: string
  entity_name: string
}): { name: string; fullName: string } {
  const first = titleCase((row.first_name ?? '').trim())
  const last = titleCase((row.last_name ?? '').trim())
  const entity = titleCase((row.entity_name ?? '').trim())

  if (first) {
    const fullName = [first, last].filter(Boolean).join(' ')
    return { name: first, fullName: fullName || first }
  }
  if (entity) {
    return { name: entity, fullName: entity }
  }
  if (last) {
    return { name: last, fullName: last }
  }
  return { name: '', fullName: '' }
}

export async function lookupFccCallsign(input: string): Promise<FccLookupResult | null> {
  const callsign = normalizeCallsign(input)
  if (!callsign) return null

  const res = await pool.query<{
    callsign: string
    first_name: string
    last_name: string
    entity_name: string
    city: string
    state: string
    status: string
  }>(
    `SELECT callsign, first_name, last_name, entity_name, city, state, status
     FROM callsigns
     WHERE callsign = $1`,
    [callsign],
  )

  const row = res.rows[0]
  if (!row) return null

  const { name, fullName } = displayName(row)
  const city = titleCase((row.city ?? '').trim())
  const state = (row.state ?? '').trim().toUpperCase()
  const cityState = city && state ? `${city}, ${state}` : city || state || ''

  if (!name && !cityState) return null

  return {
    callsign: row.callsign,
    name,
    fullName,
    city,
    state,
    cityState,
    source: 'fcc',
    status: row.status,
  }
}
