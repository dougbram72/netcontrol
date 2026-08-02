import type { NetSession } from '../types'

export function sessionToCsv(session: NetSession): string {
  const header = [
    'sequence',
    'callsign',
    'name',
    'location',
    'status',
    'has_traffic',
    'traffic_notes',
    'notes',
    'checked_in_at',
  ]
  const rows = session.checkIns.map((c) =>
    [
      c.sequence,
      c.callsign,
      csvEscape(c.name),
      csvEscape(c.location),
      c.status,
      c.hasTraffic ? 'yes' : 'no',
      csvEscape(c.trafficNotes),
      csvEscape(c.notes),
      c.checkedInAt,
    ].join(','),
  )
  const rollHeader = [
    'order',
    'callsign',
    'name',
    'city_state',
    'permanent',
    'responded',
    'missed_streak',
  ]
  const rollRows = session.rollCall.map((s, i) =>
    [
      i + 1,
      s.callsign,
      csvEscape(s.name),
      csvEscape(s.cityState),
      s.permanent ? 'yes' : 'no',
      s.responded ? 'yes' : 'no',
      s.missedStreak,
    ].join(','),
  )
  const meta = [
    `# Net: ${session.name}`,
    `# Frequency: ${session.frequency}`,
    `# Mode: ${session.mode}`,
    `# NCS: ${session.netControlCallsign}`,
    `# Started: ${session.startedAt}`,
    `# Ended: ${session.endedAt ?? ''}`,
    `# Check-ins: ${session.checkIns.length}`,
    `# Roll call: ${session.rollCall.filter((s) => s.responded).length}/${session.rollCall.length}`,
    '',
    '# --- Check-ins ---',
  ]
  return [
    ...meta,
    header.join(','),
    ...rows,
    '',
    '# --- Roll call ---',
    rollHeader.join(','),
    ...rollRows,
  ].join('\n')
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function downloadText(filename: string, content: string, mime = 'text/csv'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
