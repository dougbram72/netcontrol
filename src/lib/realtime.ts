import type { NetSession, NetTemplate } from '../types'

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected'

export type RealtimeMessage =
  | {
      type: 'snapshot'
      session: NetSession | null
      templates: NetTemplate[]
      history: NetSession[]
      clients: number
    }
  | { type: 'session'; session: NetSession | null }
  | { type: 'templates'; templates: NetTemplate[] }
  | { type: 'history'; history: NetSession[] }
  | { type: 'presence'; clients: number }

export type RealtimeHandlers = {
  onStatus?: (status: RealtimeStatus) => void
  onClients?: (count: number) => void
  onMessage?: (message: RealtimeMessage) => void
}

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

/**
 * Maintain a reconnecting WebSocket to the NetControl hub.
 * Returns a dispose function.
 */
export function connectRealtime(handlers: RealtimeHandlers): () => void {
  let disposed = false
  let socket: WebSocket | null = null
  let retryMs = 500
  let retryTimer: number | null = null
  let pingTimer: number | null = null

  const setStatus = (status: RealtimeStatus) => handlers.onStatus?.(status)

  const clearTimers = () => {
    if (retryTimer != null) {
      window.clearTimeout(retryTimer)
      retryTimer = null
    }
    if (pingTimer != null) {
      window.clearInterval(pingTimer)
      pingTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (disposed) return
    clearTimers()
    retryTimer = window.setTimeout(() => {
      retryMs = Math.min(retryMs * 1.6, 8000)
      open()
    }, retryMs)
  }

  const open = () => {
    if (disposed) return
    clearTimers()
    setStatus('connecting')

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl())
    } catch {
      setStatus('disconnected')
      scheduleReconnect()
      return
    }

    socket = ws

    ws.onopen = () => {
      retryMs = 500
      setStatus('connected')
      // Lightweight keepalive so proxies don't idle-drop the socket
      pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 25000)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as RealtimeMessage
        if (message.type === 'snapshot' || message.type === 'presence') {
          handlers.onClients?.(message.clients)
        }
        handlers.onMessage?.(message)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => {
      // onclose will handle reconnect
    }

    ws.onclose = () => {
      if (socket === ws) socket = null
      clearTimers()
      if (!disposed) {
        setStatus('disconnected')
        scheduleReconnect()
      }
    }
  }

  open()

  return () => {
    disposed = true
    clearTimers()
    if (socket) {
      socket.onclose = null
      socket.close()
      socket = null
    }
  }
}
