import { useCallback, useEffect, useRef, useState } from 'react'
import { baseCallsignForLookup, isValidCallsign } from '../lib/callsign'
import {
  CallsignDbNotReadyError,
  lookupCallsign,
  type CallsignLookupResult,
  type CallsignLookupStatus,
} from '../lib/callsignLookup'

type UseCallsignAutofillOptions = {
  callsign: string
  name: string
  location: string
  setName: (value: string) => void
  setLocation: (value: string) => void
  /** Debounce before auto-query (ms). Default 550. */
  debounceMs?: number
  enabled?: boolean
}

/**
 * Debounced callsign database lookup that fills empty name / location fields.
 * Manual edits are preserved: only empty fields, or fields last filled by lookup, are updated.
 */
export function useCallsignAutofill({
  callsign,
  name,
  location,
  setName,
  setLocation,
  debounceMs = 550,
  enabled = true,
}: UseCallsignAutofillOptions) {
  const [status, setStatus] = useState<CallsignLookupStatus>('idle')
  const [sourceLabel, setSourceLabel] = useState<string | null>(null)
  const [lookedUpCall, setLookedUpCall] = useState<string | null>(null)

  // Track values we last wrote from a lookup so we can safely replace them
  // when the callsign changes without clobbering user typing.
  const filledFromLookup = useRef({ name: '', location: '' })
  const fieldsRef = useRef({ name, location })
  const requestId = useRef(0)

  fieldsRef.current = { name, location }

  const applyResult = useCallback(
    (result: CallsignLookupResult) => {
      const current = fieldsRef.current
      const nextName = result.name
      const nextLocation = result.cityState

      const nameIsEmpty = !current.name.trim()
      const nameFromUs = current.name === filledFromLookup.current.name
      if (nextName && (nameIsEmpty || nameFromUs)) {
        setName(nextName)
        filledFromLookup.current.name = nextName
      }

      const locIsEmpty = !current.location.trim()
      const locFromUs = current.location === filledFromLookup.current.location
      if (nextLocation && (locIsEmpty || locFromUs)) {
        setLocation(nextLocation)
        filledFromLookup.current.location = nextLocation
      }

      setSourceLabel(result.source === 'fcc' ? 'FCC' : result.source)
      setLookedUpCall(result.callsign)
      setStatus('found')
    },
    [setLocation, setName],
  )

  const runLookup = useCallback(
    async (raw: string) => {
      if (!enabled) return
      const base = baseCallsignForLookup(raw)
      if (!base || !isValidCallsign(base)) {
        setStatus('idle')
        setSourceLabel(null)
        return
      }

      const id = ++requestId.current
      setStatus('loading')
      setSourceLabel(null)

      try {
        const result = await lookupCallsign(base)
        if (id !== requestId.current) return
        if (!result) {
          setStatus('not-found')
          setLookedUpCall(base)
          setSourceLabel(null)
          return
        }
        applyResult(result)
      } catch (err) {
        if (id !== requestId.current) return
        if (err instanceof CallsignDbNotReadyError) {
          setStatus('importing')
          setSourceLabel(null)
          return
        }
        setStatus('error')
        setSourceLabel(null)
      }
    },
    [applyResult, enabled],
  )

  // Debounced lookup as the operator types a complete callsign
  useEffect(() => {
    if (!enabled) return
    const base = baseCallsignForLookup(callsign)
    if (!base || base.length < 3 || !isValidCallsign(base)) {
      return
    }
    if (lookedUpCall === base && (status === 'found' || status === 'not-found')) return

    const timer = window.setTimeout(() => {
      void runLookup(callsign)
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [callsign, debounceMs, enabled, lookedUpCall, runLookup, status])

  /** Call on blur for an immediate attempt. */
  const lookupNow = useCallback(() => {
    void runLookup(callsign)
  }, [callsign, runLookup])

  /** Reset lookup bookkeeping when the form is cleared after submit. */
  const resetLookup = useCallback(() => {
    requestId.current += 1
    filledFromLookup.current = { name: '', location: '' }
    setStatus('idle')
    setSourceLabel(null)
    setLookedUpCall(null)
  }, [])

  /** Mark name as user-edited so later lookups won't overwrite it. */
  const markNameEdited = useCallback((value: string) => {
    if (value !== filledFromLookup.current.name) {
      filledFromLookup.current.name = ''
    }
  }, [])

  const markLocationEdited = useCallback((value: string) => {
    if (value !== filledFromLookup.current.location) {
      filledFromLookup.current.location = ''
    }
  }, [])

  return {
    status,
    sourceLabel,
    lookupNow,
    resetLookup,
    markNameEdited,
    markLocationEdited,
  }
}
