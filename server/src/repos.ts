import type pg from 'pg'
import { createId } from './ids.js'
import { normalizeCallsign } from './callsign.js'
import {
  mapCheckIn,
  mapSession,
  mapTemplate,
  type CheckInRow,
  type SessionRollRow,
  type SessionRow,
  type TemplateRollRow,
  type TemplateRow,
} from './mappers.js'
import type {
  CheckIn,
  CheckInStatus,
  NetSession,
  NetTemplate,
  RollCallStation,
  SessionRollCallStation,
  StartNetBody,
  TemplateBody,
} from './types.js'
import { applyAttendanceRules, loadPriorPresentSets } from './attendance.js'

export async function listTemplates(client: pg.PoolClient): Promise<NetTemplate[]> {
  const templates = await client.query<TemplateRow>(
    `SELECT * FROM templates ORDER BY updated_at DESC`,
  )
  const out: NetTemplate[] = []
  for (const row of templates.rows) {
    const roll = await client.query<TemplateRollRow>(
      `SELECT * FROM template_roll_call WHERE template_id = $1 ORDER BY position ASC`,
      [row.id],
    )
    out.push(mapTemplate(row, roll.rows))
  }
  return out
}

export async function getTemplate(
  client: pg.PoolClient,
  id: string,
): Promise<NetTemplate | null> {
  const templates = await client.query<TemplateRow>(`SELECT * FROM templates WHERE id = $1`, [id])
  if (templates.rows.length === 0) return null
  const roll = await client.query<TemplateRollRow>(
    `SELECT * FROM template_roll_call WHERE template_id = $1 ORDER BY position ASC`,
    [id],
  )
  return mapTemplate(templates.rows[0], roll.rows)
}

export async function upsertTemplate(
  client: pg.PoolClient,
  body: TemplateBody,
  existingId?: string | null,
): Promise<NetTemplate> {
  const id = existingId || createId()
  const name = body.name.trim() || 'Untitled template'
  const frequency = body.frequency.trim()
  const mode = body.mode.trim() || 'FM'
  const ncsCallsign = normalizeCallsign(body.netControlCallsign ?? '')
  const script = body.script ?? ''
  const now = new Date()

  if (existingId) {
    const updated = await client.query<TemplateRow>(
      `UPDATE templates
       SET name = $2, frequency = $3, mode = $4, ncs_callsign = $5, script = $6, updated_at = $7
       WHERE id = $1
       RETURNING *`,
      [id, name, frequency, mode, ncsCallsign, script, now],
    )
    if (updated.rows.length === 0) {
      // Create if missing
      await client.query(
        `INSERT INTO templates (id, name, frequency, mode, ncs_callsign, script, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, name, frequency, mode, ncsCallsign, script, now],
      )
    }
    await client.query(`DELETE FROM template_roll_call WHERE template_id = $1`, [id])
  } else {
    await client.query(
      `INSERT INTO templates (id, name, frequency, mode, ncs_callsign, script, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, frequency, mode, ncsCallsign, script, now],
    )
  }

  const rollCall = body.rollCall ?? []
  for (let i = 0; i < rollCall.length; i++) {
    const s = rollCall[i]
    const callsign = normalizeCallsign(s.callsign)
    if (!callsign) continue
    await client.query(
      `INSERT INTO template_roll_call
         (id, template_id, callsign, name, city_state, permanent, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (template_id, callsign) DO UPDATE SET
         name = EXCLUDED.name,
         city_state = EXCLUDED.city_state,
         permanent = EXCLUDED.permanent,
         position = EXCLUDED.position`,
      [
        s.id || createId(),
        id,
        callsign,
        (s.name ?? '').trim(),
        (s.cityState ?? '').trim(),
        Boolean(s.permanent),
        i,
      ],
    )
  }

  return (await getTemplate(client, id))!
}

export async function deleteTemplate(client: pg.PoolClient, id: string): Promise<boolean> {
  const result = await client.query(`DELETE FROM templates WHERE id = $1`, [id])
  return (result.rowCount ?? 0) > 0
}

export async function getSession(
  client: pg.PoolClient,
  id: string,
): Promise<NetSession | null> {
  const sessions = await client.query<SessionRow>(`SELECT * FROM sessions WHERE id = $1`, [id])
  if (sessions.rows.length === 0) return null
  const roll = await client.query<SessionRollRow>(
    `SELECT * FROM session_roll_call WHERE session_id = $1 ORDER BY position ASC`,
    [id],
  )
  const checks = await client.query<CheckInRow>(
    `SELECT * FROM check_ins WHERE session_id = $1 ORDER BY sequence ASC`,
    [id],
  )
  return mapSession(sessions.rows[0], roll.rows, checks.rows)
}

export async function getActiveSession(client: pg.PoolClient): Promise<NetSession | null> {
  const sessions = await client.query<SessionRow>(
    `SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
  )
  if (sessions.rows.length === 0) return null
  return getSession(client, sessions.rows[0].id)
}

export async function listHistory(client: pg.PoolClient, limit = 50): Promise<NetSession[]> {
  const sessions = await client.query<SessionRow>(
    `SELECT * FROM sessions WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT $1`,
    [limit],
  )
  const out: NetSession[] = []
  for (const row of sessions.rows) {
    const s = await getSession(client, row.id)
    if (s) out.push(s)
  }
  return out
}

export async function startSession(
  client: pg.PoolClient,
  body: StartNetBody,
): Promise<NetSession> {
  const active = await getActiveSession(client)
  if (active) {
    throw Object.assign(new Error('A net is already open. Close it before starting another.'), {
      status: 409,
    })
  }

  const templateId = body.templateId || null
  const name = body.name.trim() || 'Untitled Net'
  const prior = await loadPriorPresentSets(client, {
    templateId,
    name,
    limit: 4,
  })

  const inputRoll: RollCallStation[] = (body.rollCall ?? []).map((s) => ({
    id: s.id || createId(),
    callsign: normalizeCallsign(s.callsign),
    name: (s.name ?? '').trim(),
    cityState: (s.cityState ?? '').trim(),
    permanent: Boolean(s.permanent),
  })).filter((s) => s.callsign)

  const { keep, dropped } = applyAttendanceRules(inputRoll, prior)

  // Prune non-permanent dropouts from the linked template so they stay gone
  if (templateId && dropped.length > 0) {
    const droppedCalls = dropped.map((d) => d.callsign)
    await client.query(
      `DELETE FROM template_roll_call
       WHERE template_id = $1 AND permanent = FALSE AND callsign = ANY($2::text[])`,
      [templateId, droppedCalls],
    )
    await client.query(`UPDATE templates SET updated_at = NOW() WHERE id = $1`, [templateId])
  }

  const sessionId = createId()
  const startedAt = new Date()
  await client.query(
    `INSERT INTO sessions
       (id, template_id, name, frequency, mode, ncs_callsign, notes, started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)`,
    [
      sessionId,
      templateId,
      name,
      body.frequency.trim(),
      (body.mode || 'FM').trim() || 'FM',
      normalizeCallsign(body.netControlCallsign),
      body.script ?? '',
      startedAt,
    ],
  )

  for (let i = 0; i < keep.length; i++) {
    const s = keep[i]
    await client.query(
      `INSERT INTO session_roll_call
         (id, session_id, callsign, name, city_state, permanent, responded, missed_streak, position)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8)`,
      [
        createId(), // always new — do not reuse template station ids
        sessionId,
        s.callsign,
        s.name,
        s.cityState,
        s.permanent,
        s.missedStreak,
        i,
      ],
    )
  }

  const session = await getSession(client, sessionId)
  if (!session) throw new Error('Failed to load new session')
  return { ...session, droppedStations: dropped }
}

export async function endSession(client: pg.PoolClient, id: string): Promise<NetSession | null> {
  const updated = await client.query<SessionRow>(
    `UPDATE sessions SET ended_at = NOW() WHERE id = $1 AND ended_at IS NULL RETURNING *`,
    [id],
  )
  if (updated.rows.length === 0) return null
  return getSession(client, id)
}

export async function updateSessionNotes(
  client: pg.PoolClient,
  id: string,
  notes: string,
): Promise<NetSession | null> {
  await client.query(`UPDATE sessions SET notes = $2 WHERE id = $1`, [id, notes])
  return getSession(client, id)
}

export async function addCheckIn(
  client: pg.PoolClient,
  sessionId: string,
  input: {
    callsign: string
    name: string
    location: string
    status: CheckInStatus
    hasTraffic: boolean
    trafficNotes: string
    notes: string
  },
): Promise<CheckIn> {
  const callsign = normalizeCallsign(input.callsign)
  if (!callsign) {
    throw Object.assign(new Error('Callsign is required'), { status: 400 })
  }

  const exists = await client.query(`SELECT 1 FROM check_ins WHERE session_id = $1 AND callsign = $2`, [
    sessionId,
    callsign,
  ])
  if (exists.rows.length > 0) {
    throw Object.assign(new Error(`${callsign} is already checked in`), { status: 409 })
  }

  const seq = await client.query<{ n: string }>(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM check_ins WHERE session_id = $1`,
    [sessionId],
  )
  const sequence = Number(seq.rows[0].n)
  const id = createId()
  const checkedInAt = new Date()

  const inserted = await client.query<CheckInRow>(
    `INSERT INTO check_ins
       (id, session_id, sequence, callsign, name, location, status, has_traffic, traffic_notes, notes, checked_in_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      id,
      sessionId,
      sequence,
      callsign,
      input.name.trim(),
      input.location.trim(),
      input.status || 'checked-in',
      Boolean(input.hasTraffic),
      input.trafficNotes.trim(),
      input.notes.trim(),
      checkedInAt,
    ],
  )

  // Mark matching roll-call station as responded
  await client.query(
    `UPDATE session_roll_call SET responded = TRUE WHERE session_id = $1 AND callsign = $2`,
    [sessionId, callsign],
  )

  return mapCheckIn(inserted.rows[0])
}

export async function updateCheckIn(
  client: pg.PoolClient,
  sessionId: string,
  checkInId: string,
  patch: Partial<{
    callsign: string
    name: string
    location: string
    status: CheckInStatus
    hasTraffic: boolean
    trafficNotes: string
    notes: string
  }>,
): Promise<CheckIn | null> {
  const current = await client.query<CheckInRow>(
    `SELECT * FROM check_ins WHERE id = $1 AND session_id = $2`,
    [checkInId, sessionId],
  )
  if (current.rows.length === 0) return null
  const row = current.rows[0]

  const callsign =
    patch.callsign !== undefined ? normalizeCallsign(patch.callsign) : row.callsign
  const name = patch.name !== undefined ? patch.name.trim() : row.name
  const location = patch.location !== undefined ? patch.location.trim() : row.location
  const status = patch.status ?? row.status
  const hasTraffic = patch.hasTraffic !== undefined ? Boolean(patch.hasTraffic) : row.has_traffic
  const trafficNotes =
    patch.trafficNotes !== undefined ? patch.trafficNotes.trim() : row.traffic_notes
  const notes = patch.notes !== undefined ? patch.notes.trim() : row.notes

  const updated = await client.query<CheckInRow>(
    `UPDATE check_ins SET
       callsign = $3, name = $4, location = $5, status = $6,
       has_traffic = $7, traffic_notes = $8, notes = $9
     WHERE id = $1 AND session_id = $2
     RETURNING *`,
    [checkInId, sessionId, callsign, name, location, status, hasTraffic, trafficNotes, notes],
  )
  return mapCheckIn(updated.rows[0])
}

export async function removeCheckIn(
  client: pg.PoolClient,
  sessionId: string,
  checkInId: string,
): Promise<boolean> {
  const del = await client.query(
    `DELETE FROM check_ins WHERE id = $1 AND session_id = $2`,
    [checkInId, sessionId],
  )
  if ((del.rowCount ?? 0) === 0) return false

  // Renumber sequences
  const remaining = await client.query<CheckInRow>(
    `SELECT * FROM check_ins WHERE session_id = $1 ORDER BY sequence ASC`,
    [sessionId],
  )
  for (let i = 0; i < remaining.rows.length; i++) {
    await client.query(`UPDATE check_ins SET sequence = $2 WHERE id = $1`, [
      remaining.rows[i].id,
      i + 1,
    ])
  }
  return true
}

export async function reorderRollCall(
  client: pg.PoolClient,
  sessionId: string,
  orderedIds: string[],
): Promise<NetSession | null> {
  for (let i = 0; i < orderedIds.length; i++) {
    await client.query(
      `UPDATE session_roll_call SET position = $3 WHERE id = $1 AND session_id = $2`,
      [orderedIds[i], sessionId, i],
    )
  }
  return getSession(client, sessionId)
}

export async function setRollCallResponded(
  client: pg.PoolClient,
  sessionId: string,
  stationId: string,
  responded: boolean,
): Promise<NetSession | null> {
  const station = await client.query<SessionRollRow>(
    `SELECT * FROM session_roll_call WHERE id = $1 AND session_id = $2`,
    [stationId, sessionId],
  )
  if (station.rows.length === 0) return null

  await client.query(
    `UPDATE session_roll_call SET responded = $3 WHERE id = $1 AND session_id = $2`,
    [stationId, sessionId, responded],
  )

  if (responded) {
    const s = station.rows[0]
    const existing = await client.query(
      `SELECT 1 FROM check_ins WHERE session_id = $1 AND callsign = $2`,
      [sessionId, s.callsign],
    )
    if (existing.rows.length === 0) {
      await addCheckIn(client, sessionId, {
        callsign: s.callsign,
        name: s.name,
        location: s.city_state,
        status: 'checked-in',
        hasTraffic: false,
        trafficNotes: '',
        notes: '',
      })
    }
  }

  return getSession(client, sessionId)
}

export async function setRollCallPermanent(
  client: pg.PoolClient,
  sessionId: string,
  stationId: string,
  permanent: boolean,
): Promise<NetSession | null> {
  const station = await client.query<SessionRollRow>(
    `UPDATE session_roll_call SET permanent = $3 WHERE id = $1 AND session_id = $2 RETURNING *`,
    [stationId, sessionId, permanent],
  )
  if (station.rows.length === 0) return null

  // Mirror permanent flag onto template if linked
  const session = await client.query<SessionRow>(`SELECT * FROM sessions WHERE id = $1`, [sessionId])
  const templateId = session.rows[0]?.template_id
  if (templateId) {
    await client.query(
      `UPDATE template_roll_call SET permanent = $3
       WHERE template_id = $1 AND callsign = $2`,
      [templateId, station.rows[0].callsign, permanent],
    )
  }

  return getSession(client, sessionId)
}

export async function addRollCallStation(
  client: pg.PoolClient,
  sessionId: string,
  input: { callsign: string; name: string; cityState: string; permanent?: boolean },
): Promise<NetSession | null> {
  const callsign = normalizeCallsign(input.callsign)
  if (!callsign) {
    throw Object.assign(new Error('Callsign is required'), { status: 400 })
  }
  const exists = await client.query(
    `SELECT 1 FROM session_roll_call WHERE session_id = $1 AND callsign = $2`,
    [sessionId, callsign],
  )
  if (exists.rows.length > 0) {
    throw Object.assign(new Error(`${callsign} is already on the roll call`), { status: 409 })
  }

  const pos = await client.query<{ n: string }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM session_roll_call WHERE session_id = $1`,
    [sessionId],
  )

  await client.query(
    `INSERT INTO session_roll_call
       (id, session_id, callsign, name, city_state, permanent, responded, missed_streak, position)
     VALUES ($1,$2,$3,$4,$5,$6,FALSE,0,$7)`,
    [
      createId(),
      sessionId,
      callsign,
      input.name.trim(),
      input.cityState.trim(),
      Boolean(input.permanent),
      Number(pos.rows[0].n),
    ],
  )

  return getSession(client, sessionId)
}

export async function removeRollCallStation(
  client: pg.PoolClient,
  sessionId: string,
  stationId: string,
): Promise<NetSession | null> {
  const del = await client.query(
    `DELETE FROM session_roll_call WHERE id = $1 AND session_id = $2`,
    [stationId, sessionId],
  )
  if ((del.rowCount ?? 0) === 0) return null

  const remaining = await client.query<SessionRollRow>(
    `SELECT * FROM session_roll_call WHERE session_id = $1 ORDER BY position ASC`,
    [sessionId],
  )
  for (let i = 0; i < remaining.rows.length; i++) {
    await client.query(`UPDATE session_roll_call SET position = $2 WHERE id = $1`, [
      remaining.rows[i].id,
      i,
    ])
  }
  return getSession(client, sessionId)
}

export async function saveSessionToTemplate(
  client: pg.PoolClient,
  sessionId: string,
): Promise<{ session: NetSession; template: NetTemplate }> {
  const session = await getSession(client, sessionId)
  if (!session) {
    throw Object.assign(new Error('Session not found'), { status: 404 })
  }

  const rollCall: RollCallStation[] = session.rollCall.map((s) => ({
    id: s.id,
    callsign: s.callsign,
    name: s.name,
    cityState: s.cityState,
    permanent: s.permanent,
  }))

  const template = await upsertTemplate(
    client,
    {
      name: session.name,
      frequency: session.frequency,
      mode: session.mode,
      netControlCallsign: session.netControlCallsign,
      script: session.notes,
      rollCall,
    },
    session.templateId,
  )

  if (!session.templateId) {
    await client.query(`UPDATE sessions SET template_id = $2 WHERE id = $1`, [
      sessionId,
      template.id,
    ])
  }

  const refreshed = await getSession(client, sessionId)
  return { session: refreshed!, template }
}

export type { SessionRollCallStation }
