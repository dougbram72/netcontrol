export type CheckInStatus = 'checked-in' | 'late' | 'mobile' | 'portable' | 'echo-link'

export type CheckIn = {
  id: string
  sequence: number
  callsign: string
  name: string
  location: string
  status: CheckInStatus
  hasTraffic: boolean
  trafficNotes: string
  notes: string
  checkedInAt: string // ISO
}

/** Station on a roll-call list (template / ordered roster of regulars). */
export type RollCallStation = {
  id: string
  callsign: string
  name: string
  /** City and state, e.g. "Austin, TX" */
  cityState: string
  /** Exempt from inactivity warn/drop rules. */
  permanent: boolean
}

/** Roll-call station during a live session (includes response flag). */
export type SessionRollCallStation = RollCallStation & {
  responded: boolean
  /**
   * Consecutive prior completed nets this station missed.
   * UI warns at >= 2; non-permanent stations are dropped at >= 4 on net start.
   */
  missedStreak: number
}

/** Reusable net setup including the NCS calling script and roll call. */
export type NetTemplate = {
  id: string
  name: string
  frequency: string
  mode: string
  /** Default NCS callsign when starting from this template. */
  netControlCallsign: string
  /** Full script used when calling / running the net. */
  script: string
  /** Ordered list of stations for roll call. */
  rollCall: RollCallStation[]
  updatedAt: string // ISO
}

export type DroppedStation = {
  callsign: string
  name: string
  missedStreak: number
}

export type NetSession = {
  id: string
  name: string
  frequency: string
  mode: string
  netControlCallsign: string
  startedAt: string // ISO
  endedAt: string | null
  /** Net calling script / notes for this session (seeded from template). */
  notes: string
  /** Template this session was started from, if any. */
  templateId: string | null
  /** Ordered roll call with response tracking. */
  rollCall: SessionRollCallStation[]
  checkIns: CheckIn[]
  /** Populated when a net is started and stations were auto-dropped. */
  droppedStations?: DroppedStation[]
}
