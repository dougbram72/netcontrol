import type {
  CheckIn,
  CheckInStatus,
  NetSession,
  NetTemplate,
  RollCallStation,
} from '../types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message || `Request failed (${res.status})`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export type StartNetPayload = {
  name: string
  frequency: string
  mode: string
  netControlCallsign: string
  script: string
  rollCall: RollCallStation[]
  templateId?: string | null
}

export type TemplatePayload = {
  name: string
  frequency: string
  mode: string
  netControlCallsign: string
  script: string
  rollCall: RollCallStation[]
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),

  listTemplates: () => request<NetTemplate[]>('/api/templates'),

  createTemplate: (body: TemplatePayload) =>
    request<NetTemplate>('/api/templates', { method: 'POST', body: JSON.stringify(body) }),

  updateTemplate: (id: string, body: TemplatePayload) =>
    request<NetTemplate>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  deleteTemplate: (id: string) =>
    request<void>(`/api/templates/${id}`, { method: 'DELETE' }),

  getActiveSession: () => request<NetSession | null>('/api/sessions/active'),

  listHistory: () => request<NetSession[]>('/api/sessions/history'),

  startSession: (body: StartNetPayload) =>
    request<NetSession>('/api/sessions', { method: 'POST', body: JSON.stringify(body) }),

  endSession: (id: string) =>
    request<NetSession>(`/api/sessions/${id}/end`, { method: 'POST' }),

  resumeSession: (id: string) =>
    request<NetSession>(`/api/sessions/${id}/resume`, { method: 'POST' }),

  updateNotes: (id: string, notes: string) =>
    request<NetSession>(`/api/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),

  saveSessionToTemplate: (id: string) =>
    request<{ session: NetSession; template: NetTemplate }>(
      `/api/sessions/${id}/save-template`,
      { method: 'POST' },
    ),

  addCheckIn: (
    sessionId: string,
    body: {
      callsign: string
      name: string
      location: string
      status: CheckInStatus
      hasTraffic: boolean
      trafficNotes: string
      notes: string
    },
  ) =>
    request<{ checkIn: CheckIn; session: NetSession }>(
      `/api/sessions/${sessionId}/check-ins`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  updateCheckIn: (
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
  ) =>
    request<{ checkIn: CheckIn; session: NetSession }>(
      `/api/sessions/${sessionId}/check-ins/${checkInId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),

  removeCheckIn: (sessionId: string, checkInId: string) =>
    request<{ session: NetSession }>(
      `/api/sessions/${sessionId}/check-ins/${checkInId}`,
      { method: 'DELETE' },
    ),

  reorderRollCall: (sessionId: string, orderedIds: string[]) =>
    request<NetSession>(`/api/sessions/${sessionId}/roll-call/order`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    }),

  addRollCallStation: (
    sessionId: string,
    body: { callsign: string; name: string; cityState: string; permanent?: boolean },
  ) =>
    request<NetSession>(`/api/sessions/${sessionId}/roll-call`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  patchRollCallStation: (
    sessionId: string,
    stationId: string,
    patch: { responded?: boolean; permanent?: boolean },
  ) =>
    request<NetSession>(`/api/sessions/${sessionId}/roll-call/${stationId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  removeRollCallStation: (sessionId: string, stationId: string) =>
    request<NetSession>(`/api/sessions/${sessionId}/roll-call/${stationId}`, {
      method: 'DELETE',
    }),
}
