import type pg from 'pg'
import { normalizeCallsign } from './callsign.js'
import type { RollCallStation } from './types.js'

export const WARN_AFTER_MISSED = 2
export const DROP_AFTER_MISSED = 4

export type AttendanceDecision = {
  keep: Array<RollCallStation & { missedStreak: number }>
  dropped: Array<{ callsign: string; name: string; missedStreak: number }>
}

/**
 * Load the last N completed sessions for the same template (preferred) or net name.
 * Returns callsign sets that were present in each prior net (most recent first).
 */
export async function loadPriorPresentSets(
  client: pg.PoolClient,
  opts: { templateId: string | null; name: string; limit: number },
): Promise<Set<string>[]> {
  let result
  if (opts.templateId) {
    result = await client.query<{ id: string }>(
      `SELECT id FROM sessions
       WHERE ended_at IS NOT NULL AND template_id = $1
       ORDER BY ended_at DESC
       LIMIT $2`,
      [opts.templateId, opts.limit],
    )
  } else {
    result = await client.query<{ id: string }>(
      `SELECT id FROM sessions
       WHERE ended_at IS NOT NULL AND lower(name) = lower($1)
       ORDER BY ended_at DESC
       LIMIT $2`,
      [opts.name, opts.limit],
    )
  }

  const sets: Set<string>[] = []
  for (const row of result.rows) {
    const present = new Set<string>()
    const checks = await client.query<{ callsign: string }>(
      `SELECT callsign FROM check_ins WHERE session_id = $1`,
      [row.id],
    )
    for (const c of checks.rows) present.add(normalizeCallsign(c.callsign))

    const responded = await client.query<{ callsign: string }>(
      `SELECT callsign FROM session_roll_call WHERE session_id = $1 AND responded = TRUE`,
      [row.id],
    )
    for (const r of responded.rows) present.add(normalizeCallsign(r.callsign))

    sets.push(present)
  }
  return sets
}

/**
 * Count consecutive absences from the most recent completed nets.
 * Stops counting at the first net where the station was present.
 */
export function consecutiveMissedStreak(callsign: string, priorPresent: Set<string>[]): number {
  const cs = normalizeCallsign(callsign)
  let missed = 0
  for (const present of priorPresent) {
    if (present.has(cs)) break
    missed += 1
  }
  return missed
}

/**
 * Apply attendance rules to a template/custom roll call:
 * - permanent stations are always kept (missedStreak still computed for info, no warn/drop)
 * - missed >= 4 → dropped from the net (and caller should prune template)
 * - missed >= 2 → kept with warning (UI uses missedStreak)
 */
export function applyAttendanceRules(
  stations: RollCallStation[],
  priorPresent: Set<string>[],
): AttendanceDecision {
  const keep: AttendanceDecision['keep'] = []
  const dropped: AttendanceDecision['dropped'] = []

  for (const station of stations) {
    const missedStreak = consecutiveMissedStreak(station.callsign, priorPresent)
    if (station.permanent) {
      keep.push({ ...station, missedStreak })
      continue
    }
    if (missedStreak >= DROP_AFTER_MISSED) {
      dropped.push({
        callsign: station.callsign,
        name: station.name,
        missedStreak,
      })
      continue
    }
    keep.push({ ...station, missedStreak })
  }

  return { keep, dropped }
}
