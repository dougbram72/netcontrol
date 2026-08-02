export type CheckInStatus = 'checked-in' | 'late' | 'mobile' | 'portable' | 'echo-link'

export type RollCallStation = {
  id: string
  callsign: string
  name: string
  cityState: string
  permanent: boolean
}

export type SessionRollCallStation = RollCallStation & {
  responded: boolean
  /** Consecutive prior completed nets this station missed (for UI). */
  missedStreak: number
}

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
  checkedInAt: string
}

export type NetTemplate = {
  id: string
  name: string
  frequency: string
  mode: string
  /** Default NCS callsign when starting from this template. */
  netControlCallsign: string
  script: string
  rollCall: RollCallStation[]
  updatedAt: string
}

export type NetSession = {
  id: string
  name: string
  frequency: string
  mode: string
  netControlCallsign: string
  startedAt: string
  endedAt: string | null
  notes: string
  templateId: string | null
  rollCall: SessionRollCallStation[]
  checkIns: CheckIn[]
  /** Stations dropped at start for missing 4 prior nets (non-permanent). */
  droppedStations?: { callsign: string; name: string; missedStreak: number }[]
}

export type StartNetBody = {
  name: string
  frequency: string
  mode: string
  netControlCallsign: string
  script: string
  rollCall: RollCallStation[]
  templateId?: string | null
}

export type TemplateBody = {
  name: string
  frequency: string
  mode: string
  netControlCallsign: string
  script: string
  rollCall: RollCallStation[]
}
