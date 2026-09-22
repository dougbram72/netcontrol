import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { migrate, pool, withClient, withTransaction } from './db.js'
import {
  getImportProgress,
  isImporting,
  runFccImport,
  startFccScheduler,
} from './fcc/import.js'
import { lookupFccCallsign } from './fcc/lookup.js'
import { getCallsignDbStatus } from './fcc/meta.js'
import * as repos from './repos.js'
import type { CheckInStatus, StartNetBody, TemplateBody } from './types.js'
import { WsHub } from './wsHub.js'
import { normalizeCallsign } from './callsign.js'

const PORT = Number(process.env.PORT || 3000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function httpError(err: unknown): { status: number; message: string } {
  if (err && typeof err === 'object' && 'status' in err && 'message' in err) {
    const e = err as { status: number; message: string }
    return { status: e.status || 500, message: e.message }
  }
  if (err instanceof Error) return { status: 500, message: err.message }
  return { status: 500, message: 'Internal server error' }
}

async function main() {
  console.log('Connecting to database…')
  await migrate()
  console.log('Database ready')

  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '2mb' }))

  const hub = new WsHub(async () => {
    // Sequential queries — a single pg client cannot run concurrent queries
    return withClient(async (c) => {
      const session = await repos.getActiveSession(c)
      const templates = await repos.listTemplates(c)
      const history = await repos.listHistory(c)
      return { session, templates, history }
    })
  })

  async function pushSession(): Promise<void> {
    const session = await withClient((c) => repos.getActiveSession(c))
    hub.broadcastSession(session)
  }

  async function pushTemplates(): Promise<void> {
    const templates = await withClient((c) => repos.listTemplates(c))
    hub.broadcastTemplates(templates)
  }

  async function pushHistory(): Promise<void> {
    const history = await withClient((c) => repos.listHistory(c))
    hub.broadcastHistory(history)
  }

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1')
      res.json({ ok: true, clients: hub.clientCount })
    } catch {
      res.status(503).json({ ok: false })
    }
  })

  // --- FCC callsign database ---
  app.get('/api/callsigns/status', async (_req, res) => {
    try {
      const status = await getCallsignDbStatus(isImporting())
      res.json({ ...status, progress: getImportProgress() })
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.get('/api/known-callsigns', async (_req, res) => {
    try {
      res.json(await withClient((c) => repos.listKnownCallsigns(c)))
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.get('/api/callsigns/:callsign', async (req, res) => {
    try {
      if (isImporting()) {
        const count = await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM callsigns`)
        if (Number(count.rows[0]?.n ?? 0) === 0) {
          res.status(503).json({ error: 'FCC callsign database is still importing' })
          return
        }
      }
      const cs = normalizeCallsign(req.params.callsign)
      const result = await lookupFccCallsign(cs)
      if (!result) {
        res.status(404).json({ error: 'Callsign not found' })
        return
      }
      res.json(result)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.post('/api/callsigns/update', async (req, res) => {
    try {
      const force = Boolean(req.body?.force)
      // Kick off in background so HTTP doesn't hang for minutes
      if (isImporting()) {
        res.status(409).json({ error: 'Import already in progress', progress: getImportProgress() })
        return
      }
      void runFccImport({ force }).catch((err) => {
        console.error('[fcc] manual update failed:', err)
      })
      res.status(202).json({
        accepted: true,
        message: force
          ? 'Forced FCC database update started'
          : 'FCC database update started if newer data is available',
        progress: getImportProgress(),
      })
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  // --- Templates ---
  app.get('/api/templates', async (_req, res) => {
    try {
      const templates = await withClient((c) => repos.listTemplates(c))
      res.json(templates)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.post('/api/templates', async (req, res) => {
    try {
      const body = req.body as TemplateBody
      const template = await withTransaction((c) => repos.upsertTemplate(c, body, null))
      await pushTemplates()
      res.status(201).json(template)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.put('/api/templates/:id', async (req, res) => {
    try {
      const body = req.body as TemplateBody
      const template = await withTransaction((c) => repos.upsertTemplate(c, body, req.params.id))
      await pushTemplates()
      res.json(template)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.delete('/api/templates/:id', async (req, res) => {
    try {
      const ok = await withClient((c) => repos.deleteTemplate(c, req.params.id))
      if (!ok) {
        res.status(404).json({ error: 'Template not found' })
        return
      }
      await pushTemplates()
      res.status(204).end()
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  // --- Sessions ---
  app.get('/api/sessions/active', async (_req, res) => {
    try {
      const session = await withClient((c) => repos.getActiveSession(c))
      res.json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.get('/api/sessions/history', async (_req, res) => {
    try {
      const history = await withClient((c) => repos.listHistory(c))
      res.json(history)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const session = await withClient((c) => repos.getSession(c, req.params.id))
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }
      res.json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.post('/api/sessions', async (req, res) => {
    try {
      const body = req.body as StartNetBody
      if (!body.netControlCallsign?.trim()) {
        res.status(400).json({ error: 'NCS callsign is required' })
        return
      }
      const session = await withTransaction((c) => repos.startSession(c, body))
      // Attendance may have pruned the template
      await pushSession()
      await pushTemplates()
      res.status(201).json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.post('/api/sessions/:id/end', async (req, res) => {
    try {
      const session = await withClient((c) => repos.endSession(c, req.params.id))
      if (!session) {
        res.status(404).json({ error: 'Active session not found' })
        return
      }
      await pushSession()
      await pushHistory()
      res.json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.patch('/api/sessions/:id', async (req, res) => {
    try {
      const notes = String(req.body?.notes ?? '')
      const session = await withClient((c) => repos.updateSessionNotes(c, req.params.id, notes))
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }
      hub.broadcastSession(session)
      res.json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.post('/api/sessions/:id/save-template', async (req, res) => {
    try {
      const result = await withTransaction((c) => repos.saveSessionToTemplate(c, req.params.id))
      await pushSession()
      await pushTemplates()
      res.json(result)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.post('/api/sessions/:id/resume', async (req, res) => {
    try {
      const session = await withTransaction(async (c) => {
        const active = await repos.getActiveSession(c)
        if (active) {
          throw Object.assign(new Error('A net is already open. Close it before resuming another.'), {
            status: 409,
          })
        }
        const updated = await c.query(
          `UPDATE sessions SET ended_at = NULL WHERE id = $1 AND ended_at IS NOT NULL RETURNING id`,
          [req.params.id],
        )
        if (updated.rows.length === 0) return null
        return repos.getSession(c, req.params.id)
      })
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }
      await pushSession()
      await pushHistory()
      res.json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  // --- Check-ins ---
  app.post('/api/sessions/:id/check-ins', async (req, res) => {
    try {
      const body = req.body as {
        callsign: string
        name?: string
        location?: string
        status?: CheckInStatus
        hasTraffic?: boolean
        trafficNotes?: string
        notes?: string
      }
      const checkIn = await withTransaction((c) =>
        repos.addCheckIn(c, req.params.id, {
          callsign: body.callsign,
          name: body.name ?? '',
          location: body.location ?? '',
          status: body.status ?? 'checked-in',
          hasTraffic: Boolean(body.hasTraffic),
          trafficNotes: body.trafficNotes ?? '',
          notes: body.notes ?? '',
        }),
      )
      const session = await withClient((c) => repos.getSession(c, req.params.id))
      if (session) hub.broadcastSession(session)
      res.status(201).json({ checkIn, session })
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.patch('/api/sessions/:id/check-ins/:cid', async (req, res) => {
    try {
      const checkIn = await withClient((c) =>
        repos.updateCheckIn(c, req.params.id, req.params.cid, req.body ?? {}),
      )
      if (!checkIn) {
        res.status(404).json({ error: 'Check-in not found' })
        return
      }
      const session = await withClient((c) => repos.getSession(c, req.params.id))
      if (session) hub.broadcastSession(session)
      res.json({ checkIn, session })
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.delete('/api/sessions/:id/check-ins/:cid', async (req, res) => {
    try {
      const ok = await withTransaction((c) => repos.removeCheckIn(c, req.params.id, req.params.cid))
      if (!ok) {
        res.status(404).json({ error: 'Check-in not found' })
        return
      }
      const session = await withClient((c) => repos.getSession(c, req.params.id))
      if (session) hub.broadcastSession(session)
      res.json({ session })
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  // --- Roll call ---
  app.put('/api/sessions/:id/roll-call/order', async (req, res) => {
    try {
      const orderedIds = (req.body?.orderedIds ?? []) as string[]
      const session = await withTransaction((c) =>
        repos.reorderRollCall(c, req.params.id, orderedIds),
      )
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }
      hub.broadcastSession(session)
      res.json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.post('/api/sessions/:id/roll-call', async (req, res) => {
    try {
      const session = await withTransaction((c) =>
        repos.addRollCallStation(c, req.params.id, {
          callsign: req.body?.callsign ?? '',
          name: req.body?.name ?? '',
          cityState: req.body?.cityState ?? '',
          permanent: Boolean(req.body?.permanent),
        }),
      )
      if (session) hub.broadcastSession(session)
      res.status(201).json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.patch('/api/sessions/:id/roll-call/:sid', async (req, res) => {
    try {
      const hasResponded = typeof req.body?.responded === 'boolean'
      const hasPermanent = typeof req.body?.permanent === 'boolean'
      if (!hasResponded && !hasPermanent) {
        res.status(400).json({ error: 'Provide responded and/or permanent' })
        return
      }
      const session = await withTransaction(async (c) => {
        let result = null
        if (hasResponded) {
          result = await repos.setRollCallResponded(
            c,
            req.params.id,
            req.params.sid,
            req.body.responded,
          )
        }
        if (hasPermanent) {
          result = await repos.setRollCallPermanent(
            c,
            req.params.id,
            req.params.sid,
            req.body.permanent,
          )
        }
        return result
      })
      if (!session) {
        res.status(404).json({ error: 'Station not found' })
        return
      }
      // permanent flag may mirror onto template
      if (hasPermanent) await pushTemplates()
      hub.broadcastSession(session)
      res.json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  app.delete('/api/sessions/:id/roll-call/:sid', async (req, res) => {
    try {
      const session = await withTransaction((c) =>
        repos.removeRollCallStation(c, req.params.id, req.params.sid),
      )
      if (!session) {
        res.status(404).json({ error: 'Station not found' })
        return
      }
      hub.broadcastSession(session)
      res.json(session)
    } catch (err) {
      const e = httpError(err)
      res.status(e.status).json({ error: e.message })
    }
  })

  // Static frontend (production / Docker)
  const distPath = path.resolve(__dirname, '../../dist')
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) res.status(404).send('Frontend not built. Run npm run build.')
    })
  })

  const server = http.createServer(app)
  hub.attach(server)

  server.listen(PORT, () => {
    console.log(`NetControl listening on http://0.0.0.0:${PORT}`)
    console.log(`WebSocket endpoint ws://0.0.0.0:${PORT}/ws`)
    // Weekly FCC complete dump (Sunday); also runs when DB is empty
    startFccScheduler()
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
