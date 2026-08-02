import type {
  CheckIn,
  CheckInStatus,
  NetSession,
  NetTemplate,
  RollCallStation,
  SessionRollCallStation,
} from './types.js'

export type TemplateRow = {
  id: string
  name: string
  frequency: string
  mode: string
  ncs_callsign: string
  script: string
  updated_at: Date | string
}

export type TemplateRollRow = {
  id: string
  template_id: string
  callsign: string
  name: string
  city_state: string
  permanent: boolean
  position: number
}

export type SessionRow = {
  id: string
  template_id: string | null
  name: string
  frequency: string
  mode: string
  ncs_callsign: string
  notes: string
  started_at: Date | string
  ended_at: Date | string | null
}

export type SessionRollRow = {
  id: string
  session_id: string
  callsign: string
  name: string
  city_state: string
  permanent: boolean
  responded: boolean
  missed_streak: number
  position: number
}

export type CheckInRow = {
  id: string
  session_id: string
  sequence: number
  callsign: string
  name: string
  location: string
  status: string
  has_traffic: boolean
  traffic_notes: string
  notes: string
  checked_in_at: Date | string
}

export function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}

export function mapTemplate(row: TemplateRow, rollCall: TemplateRollRow[]): NetTemplate {
  return {
    id: row.id,
    name: row.name,
    frequency: row.frequency,
    mode: row.mode,
    netControlCallsign: row.ncs_callsign ?? '',
    script: row.script,
    updatedAt: iso(row.updated_at)!,
    rollCall: rollCall
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(mapTemplateRoll),
  }
}

export function mapTemplateRoll(row: TemplateRollRow): RollCallStation {
  return {
    id: row.id,
    callsign: row.callsign,
    name: row.name,
    cityState: row.city_state,
    permanent: Boolean(row.permanent),
  }
}

export function mapSessionRoll(row: SessionRollRow): SessionRollCallStation {
  return {
    id: row.id,
    callsign: row.callsign,
    name: row.name,
    cityState: row.city_state,
    permanent: Boolean(row.permanent),
    responded: Boolean(row.responded),
    missedStreak: row.missed_streak ?? 0,
  }
}

export function mapCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    sequence: row.sequence,
    callsign: row.callsign,
    name: row.name,
    location: row.location,
    status: row.status as CheckInStatus,
    hasTraffic: Boolean(row.has_traffic),
    trafficNotes: row.traffic_notes,
    notes: row.notes,
    checkedInAt: iso(row.checked_in_at)!,
  }
}

export function mapSession(
  row: SessionRow,
  rollCall: SessionRollRow[],
  checkIns: CheckInRow[],
  droppedStations?: NetSession['droppedStations'],
): NetSession {
  return {
    id: row.id,
    name: row.name,
    frequency: row.frequency,
    mode: row.mode,
    netControlCallsign: row.ncs_callsign,
    startedAt: iso(row.started_at)!,
    endedAt: iso(row.ended_at),
    notes: row.notes,
    templateId: row.template_id,
    rollCall: rollCall
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(mapSessionRoll),
    checkIns: checkIns
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(mapCheckIn),
    droppedStations,
  }
}
