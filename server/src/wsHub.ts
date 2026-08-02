import type { Server as HttpServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { NetSession, NetTemplate } from './types.js'

export type WsServerMessage =
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

type SnapshotLoader = () => Promise<{
  session: NetSession | null
  templates: NetTemplate[]
  history: NetSession[]
}>

export class WsHub {
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
  private loadSnapshot: SnapshotLoader

  constructor(loadSnapshot: SnapshotLoader) {
    this.loadSnapshot = loadSnapshot
  }

  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' })

    this.wss.on('connection', (socket) => {
      this.clients.add(socket)
      void this.sendSnapshot(socket)
      this.broadcastPresence()

      socket.on('close', () => {
        this.clients.delete(socket)
        this.broadcastPresence()
      })

      socket.on('error', () => {
        this.clients.delete(socket)
      })

      // Clients may send a ping JSON for keepalive
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as { type?: string }
          if (msg.type === 'ping') {
            this.send(socket, { type: 'presence', clients: this.clients.size })
          }
        } catch {
          // ignore non-JSON
        }
      })
    })
  }

  get clientCount(): number {
    return this.clients.size
  }

  private send(socket: WebSocket, message: WsServerMessage): void {
    if (socket.readyState !== socket.OPEN) return
    socket.send(JSON.stringify(message))
  }

  broadcast(message: WsServerMessage): void {
    const payload = JSON.stringify(message)
    for (const socket of this.clients) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload)
      }
    }
  }

  broadcastSession(session: NetSession | null): void {
    this.broadcast({ type: 'session', session })
  }

  broadcastTemplates(templates: NetTemplate[]): void {
    this.broadcast({ type: 'templates', templates })
  }

  broadcastHistory(history: NetSession[]): void {
    this.broadcast({ type: 'history', history })
  }

  private broadcastPresence(): void {
    this.broadcast({ type: 'presence', clients: this.clients.size })
  }

  private async sendSnapshot(socket: WebSocket): Promise<void> {
    try {
      const snap = await this.loadSnapshot()
      this.send(socket, {
        type: 'snapshot',
        session: snap.session,
        templates: snap.templates,
        history: snap.history,
        clients: this.clients.size,
      })
    } catch (err) {
      console.error('Failed to send WS snapshot:', err)
    }
  }
}
