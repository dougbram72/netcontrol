import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { createId } from '../lib/id'
import { connectRealtime, type RealtimeStatus } from '../lib/realtime'
import type {
  CheckInStatus,
  DroppedStation,
  NetSession,
  NetTemplate,
  RollCallStation,
} from '../types'

export type StartNetInput = {
  name: string
  frequency: string
  mode: string
  netControlCallsign: string
  script: string
  rollCall: RollCallStation[]
  templateId?: string | null
}

export type AddCheckInInput = {
  callsign: string
  name: string
  location: string
  status: CheckInStatus
  hasTraffic: boolean
  trafficNotes: string
  notes: string
}

export type TemplateInput = {
  name: string
  frequency: string
  mode: string
  netControlCallsign: string
  script: string
  rollCall: RollCallStation[]
}

export type AddRollCallInput = {
  callsign: string
  name: string
  cityState: string
  permanent?: boolean
}

export function useNetSession() {
  const [activeSession, setActiveSession] = useState<NetSession | null>(null)
  const [history, setHistory] = useState<NetSession[]>([])
  const [templates, setTemplates] = useState<NetTemplate[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastDropped, setLastDropped] = useState<DroppedStation[]>([])
  const [busy, setBusy] = useState(false)
  const [wsStatus, setWsStatus] = useState<RealtimeStatus>('connecting')
  const [peerCount, setPeerCount] = useState(0)

  const refresh = useCallback(async () => {
    const [templatesRes, activeRes, historyRes] = await Promise.all([
      api.listTemplates(),
      api.getActiveSession(),
      api.listHistory(),
    ])
    setTemplates(templatesRes)
    setActiveSession(activeRes)
    setHistory(historyRes)
  }, [])

  // Initial HTTP load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refresh()
        if (!cancelled) setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load from server')
        }
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  // Live multi-device sync via WebSocket
  useEffect(() => {
    const dispose = connectRealtime({
      onStatus: setWsStatus,
      onClients: setPeerCount,
      onMessage: (message) => {
        switch (message.type) {
          case 'snapshot':
            setActiveSession(message.session)
            setTemplates(message.templates)
            setHistory(message.history)
            break
          case 'session':
            setActiveSession(message.session)
            // Clear drop banner when remote closes the net
            if (!message.session) setLastDropped([])
            break
          case 'templates':
            setTemplates(message.templates)
            break
          case 'history':
            setHistory(message.history)
            break
          default:
            break
        }
      },
    })
    return dispose
  }, [])

  const startNet = useCallback(async (input: StartNetInput) => {
    setBusy(true)
    setError(null)
    try {
      const session = await api.startSession({
        name: input.name,
        frequency: input.frequency,
        mode: input.mode,
        netControlCallsign: input.netControlCallsign,
        script: input.script,
        rollCall: (input.rollCall ?? []).map((s) => ({
          id: s.id || createId(),
          callsign: s.callsign,
          name: s.name,
          cityState: s.cityState,
          permanent: Boolean(s.permanent),
        })),
        templateId: input.templateId ?? null,
      })
      setLastDropped(session.droppedStations ?? [])
      setActiveSession(session)
      // templates/history will also arrive over WS; refresh templates for drop pruning
      const templatesRes = await api.listTemplates()
      setTemplates(templatesRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start net')
      throw err
    } finally {
      setBusy(false)
    }
  }, [])

  const endNet = useCallback(async () => {
    if (!activeSession) return
    setBusy(true)
    setError(null)
    try {
      await api.endSession(activeSession.id)
      setActiveSession(null)
      setLastDropped([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close net')
      throw err
    } finally {
      setBusy(false)
    }
  }, [activeSession])

  const updateNotes = useCallback(
    async (notes: string) => {
      if (!activeSession) return
      setActiveSession((s) => (s ? { ...s, notes } : s))
      try {
        const session = await api.updateNotes(activeSession.id, notes)
        setActiveSession(session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save notes')
      }
    },
    [activeSession],
  )

  const addCheckIn = useCallback(
    async (input: AddCheckInInput): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!activeSession) return { ok: false, error: 'No active net' }
      try {
        const { session } = await api.addCheckIn(activeSession.id, input)
        setActiveSession(session)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to check in' }
      }
    },
    [activeSession],
  )

  const updateCheckIn = useCallback(
    async (
      id: string,
      patch: Partial<{
        callsign: string
        name: string
        location: string
        status: CheckInStatus
        hasTraffic: boolean
        trafficNotes: string
        notes: string
      }>,
    ) => {
      if (!activeSession) return
      try {
        const { session } = await api.updateCheckIn(activeSession.id, id, patch)
        setActiveSession(session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update check-in')
      }
    },
    [activeSession],
  )

  const removeCheckIn = useCallback(
    async (id: string) => {
      if (!activeSession) return
      try {
        const { session } = await api.removeCheckIn(activeSession.id, id)
        setActiveSession(session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove check-in')
      }
    },
    [activeSession],
  )

  const reorderRollCall = useCallback(
    async (orderedIds: string[]) => {
      if (!activeSession) return
      setActiveSession((current) => {
        if (!current) return current
        const byId = new Map(current.rollCall.map((s) => [s.id, s]))
        const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as typeof current.rollCall
        for (const s of current.rollCall) {
          if (!orderedIds.includes(s.id)) next.push(s)
        }
        return { ...current, rollCall: next }
      })
      try {
        const session = await api.reorderRollCall(activeSession.id, orderedIds)
        setActiveSession(session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reorder roll call')
        void refresh()
      }
    },
    [activeSession, refresh],
  )

  const setRollCallResponded = useCallback(
    async (id: string, responded: boolean) => {
      if (!activeSession) return
      try {
        const session = await api.patchRollCallStation(activeSession.id, id, { responded })
        setActiveSession(session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update roll call')
      }
    },
    [activeSession],
  )

  const setRollCallPermanent = useCallback(
    async (id: string, permanent: boolean) => {
      if (!activeSession) return
      try {
        const session = await api.patchRollCallStation(activeSession.id, id, { permanent })
        setActiveSession(session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update permanent flag')
      }
    },
    [activeSession],
  )

  const addRollCallStation = useCallback(
    async (input: AddRollCallInput): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!activeSession) return { ok: false, error: 'No active net' }
      try {
        const session = await api.addRollCallStation(activeSession.id, input)
        setActiveSession(session)
        return { ok: true }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to add station',
        }
      }
    },
    [activeSession],
  )

  const removeRollCallStation = useCallback(
    async (id: string) => {
      if (!activeSession) return
      try {
        const session = await api.removeRollCallStation(activeSession.id, id)
        setActiveSession(session)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove station')
      }
    },
    [activeSession],
  )

  const resumeFromHistory = useCallback(async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      const session = await api.resumeSession(id)
      setActiveSession(session)
      setLastDropped([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume net')
      throw err
    } finally {
      setBusy(false)
    }
  }, [])

  const saveTemplate = useCallback(
    async (input: TemplateInput, existingId?: string | null): Promise<string> => {
      const body = {
        name: input.name,
        frequency: input.frequency,
        mode: input.mode,
        netControlCallsign: input.netControlCallsign,
        script: input.script,
        rollCall: (input.rollCall ?? []).map((s) => ({
          id: s.id || createId(),
          callsign: s.callsign,
          name: s.name,
          cityState: s.cityState,
          permanent: Boolean(s.permanent),
        })),
      }
      const template = existingId
        ? await api.updateTemplate(existingId, body)
        : await api.createTemplate(body)
      // WS will also push templates; keep local immediate
      setTemplates((prev) => {
        const rest = prev.filter((t) => t.id !== template.id)
        return [template, ...rest]
      })
      return template.id
    },
    [],
  )

  const deleteTemplate = useCallback(async (id: string) => {
    await api.deleteTemplate(id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const saveSessionScriptToTemplate = useCallback(async () => {
    if (!activeSession) return
    try {
      const { session, template } = await api.saveSessionToTemplate(activeSession.id)
      setActiveSession(session)
      setTemplates((prev) => {
        const rest = prev.filter((t) => t.id !== template.id)
        return [template, ...rest]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    }
  }, [activeSession])

  const clearDroppedNotice = useCallback(() => setLastDropped([]), [])

  const stats = useMemo(() => {
    if (!activeSession) {
      return { total: 0, withTraffic: 0, late: 0, rollCallTotal: 0, rollCallResponded: 0 }
    }
    const total = activeSession.checkIns.length
    const withTraffic = activeSession.checkIns.filter((c) => c.hasTraffic).length
    const late = activeSession.checkIns.filter((c) => c.status === 'late').length
    const rollCallTotal = activeSession.rollCall.length
    const rollCallResponded = activeSession.rollCall.filter((s) => s.responded).length
    return { total, withTraffic, late, rollCallTotal, rollCallResponded }
  }, [activeSession])

  return {
    hydrated,
    busy,
    error,
    setError,
    activeSession,
    history,
    templates,
    stats,
    lastDropped,
    clearDroppedNotice,
    wsStatus,
    peerCount,
    startNet,
    endNet,
    updateNotes,
    addCheckIn,
    updateCheckIn,
    removeCheckIn,
    reorderRollCall,
    setRollCallResponded,
    setRollCallPermanent,
    addRollCallStation,
    removeRollCallStation,
    resumeFromHistory,
    saveTemplate,
    deleteTemplate,
    saveSessionScriptToTemplate,
    refresh,
  }
}
