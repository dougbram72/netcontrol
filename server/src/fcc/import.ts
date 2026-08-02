import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { createReadStream } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pool, withClient } from '../db.js'
import { normalizeCallsign } from '../callsign.js'
import { FCC_COMPLETE_URL, getMeta, setMeta } from './meta.js'

const execFileAsync = promisify(execFile)

const DATA_DIR = process.env.FCC_DATA_DIR ?? path.resolve(process.cwd(), 'data', 'fcc')

export type ImportProgress = {
  phase: string
  detail?: string
}

type LicenseRow = {
  callsign: string
  firstName: string
  lastName: string
  entityName: string
  city: string
  state: string
  zip: string
  status: string
  licenseId: string
}

let importing = false
let lastProgress: ImportProgress = { phase: 'idle' }

export function isImporting(): boolean {
  return importing
}

export function getImportProgress(): ImportProgress {
  return lastProgress
}

function setProgress(phase: string, detail?: string): void {
  lastProgress = { phase, detail }
  console.log(`[fcc] ${phase}${detail ? ` — ${detail}` : ''}`)
}

/**
 * HEAD the remote complete dump and return Last-Modified / ETag if present.
 */
export async function fetchRemoteMeta(): Promise<{
  lastModified: string | null
  etag: string | null
  contentLength: number | null
}> {
  const res = await fetch(FCC_COMPLETE_URL, { method: 'HEAD' })
  if (!res.ok) {
    throw new Error(`FCC HEAD failed: HTTP ${res.status}`)
  }
  const lastModified = res.headers.get('last-modified')
  const etag = res.headers.get('etag')
  const cl = res.headers.get('content-length')
  return {
    lastModified,
    etag,
    contentLength: cl ? Number(cl) : null,
  }
}

/**
 * True when we should download a new complete dump:
 * - no local data, or
 * - remote Last-Modified newer than stored, or
 * - never imported, or
 * - force=true
 */
export async function needsUpdate(force = false): Promise<{
  needed: boolean
  reason: string
  remoteLastModified: string | null
}> {
  if (force) {
    const remote = await fetchRemoteMeta().catch(() => ({ lastModified: null, etag: null, contentLength: null }))
    return { needed: true, reason: 'forced', remoteLastModified: remote.lastModified }
  }

  const countRes = await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM callsigns`)
  const count = Number(countRes.rows[0]?.n ?? 0)
  if (count === 0) {
    const remote = await fetchRemoteMeta().catch(() => ({ lastModified: null, etag: null, contentLength: null }))
    return { needed: true, reason: 'empty database', remoteLastModified: remote.lastModified }
  }

  let remote
  try {
    remote = await fetchRemoteMeta()
  } catch (err) {
    return {
      needed: false,
      reason: `cannot reach FCC (${err instanceof Error ? err.message : 'error'})`,
      remoteLastModified: null,
    }
  }

  const storedLm = await getMeta('source_last_modified')
  if (remote.lastModified && storedLm && remote.lastModified !== storedLm) {
    const remoteDate = Date.parse(remote.lastModified)
    const storedDate = Date.parse(storedLm)
    if (!Number.isNaN(remoteDate) && !Number.isNaN(storedDate) && remoteDate > storedDate) {
      return {
        needed: true,
        reason: 'newer FCC dump available',
        remoteLastModified: remote.lastModified,
      }
    }
    if (remote.lastModified !== storedLm) {
      return {
        needed: true,
        reason: 'FCC Last-Modified changed',
        remoteLastModified: remote.lastModified,
      }
    }
  }

  if (remote.etag) {
    const storedEtag = await getMeta('source_etag')
    if (storedEtag && remote.etag !== storedEtag) {
      return {
        needed: true,
        reason: 'FCC ETag changed',
        remoteLastModified: remote.lastModified,
      }
    }
  }

  // Sunday catch-up: if last import was before the most recent Sunday 00:00 UTC
  // and remote is newer than last import, update (handles missing Last-Modified).
  const lastImport = await getMeta('last_import_at')
  if (lastImport) {
    const lastImportMs = Date.parse(lastImport)
    const lastSunday = mostRecentSundayUtc().getTime()
    if (!Number.isNaN(lastImportMs) && lastImportMs < lastSunday) {
      return {
        needed: true,
        reason: 'weekly Sunday refresh due',
        remoteLastModified: remote.lastModified,
      }
    }
  } else {
    return { needed: true, reason: 'no prior import timestamp', remoteLastModified: remote.lastModified }
  }

  return {
    needed: false,
    reason: 'up to date',
    remoteLastModified: remote.lastModified,
  }
}

function mostRecentSundayUtc(): Date {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = d.getUTCDay() // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - day)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

async function downloadZip(destPath: string): Promise<void> {
  setProgress('downloading', FCC_COMPLETE_URL)
  const res = await fetch(FCC_COMPLETE_URL)
  if (!res.ok || !res.body) {
    throw new Error(`FCC download failed: HTTP ${res.status}`)
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  const tmp = `${destPath}.partial`
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(tmp))
  await fs.rename(tmp, destPath)
}

async function extractDatFiles(zipPath: string, outDir: string): Promise<{ hd: string; en: string }> {
  setProgress('extracting', path.basename(zipPath))
  await fs.mkdir(outDir, { recursive: true })
  // Prefer system unzip (streams to disk); fall back to adm-zip
  try {
    await execFileAsync('unzip', ['-o', zipPath, '-d', outDir], { maxBuffer: 10 * 1024 * 1024 })
  } catch {
    const AdmZip = (await import('adm-zip')).default
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(outDir, true)
  }

  const files = await fs.readdir(outDir)
  const hdName = files.find((f) => f.toUpperCase() === 'HD.DAT')
  const enName = files.find((f) => f.toUpperCase() === 'EN.DAT')
  if (!hdName || !enName) {
    throw new Error(`HD.dat / EN.dat not found in FCC zip (found: ${files.slice(0, 20).join(', ')})`)
  }
  return { hd: path.join(outDir, hdName), en: path.join(outDir, enName) }
}

/**
 * Parse HD.dat: map unique system id → { callsign, status } for active-ish licenses.
 * Field layout (0-based): 0=HD, 1=uls_id, 4=callsign, 5=status
 */
async function parseHd(hdPath: string): Promise<Map<string, { callsign: string; status: string }>> {
  setProgress('parsing', 'HD.dat (licenses)')
  const map = new Map<string, { callsign: string; status: string }>()
  const rl = readline.createInterface({
    input: createReadStream(hdPath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })

  let lineNo = 0
  for await (const line of rl) {
    lineNo++
    if (!line || line.charAt(0) !== 'H') continue
    const f = line.split('|')
    if (f[0] !== 'HD') continue
    const ulsId = (f[1] ?? '').trim()
    const callsign = normalizeCallsign(f[4] ?? '')
    const status = (f[5] ?? '').trim().toUpperCase()
    if (!ulsId || !callsign) continue
    // Keep Active licenses primarily; also keep Expired briefly visible? User asked for callsign DB — prefer Active only.
    if (status !== 'A') continue
    map.set(ulsId, { callsign, status })
    if (lineNo % 200000 === 0) setProgress('parsing', `HD.dat ${lineNo} lines, ${map.size} active`)
  }
  setProgress('parsing', `HD.dat done — ${map.size} active licenses`)
  return map
}

/**
 * Parse EN.dat for licensee entities and attach city/state/name.
 * Field layout: 0=EN, 1=uls_id, 4=callsign, 5=entity_type,
 * 7=entity_name, 8=first, 9=mi, 10=last, 16=city, 17=state, 18=zip
 */
async function parseEn(
  enPath: string,
  licenses: Map<string, { callsign: string; status: string }>,
): Promise<Map<string, LicenseRow>> {
  setProgress('parsing', 'EN.dat (entities)')
  const byCall = new Map<string, LicenseRow>()
  const rl = readline.createInterface({
    input: createReadStream(enPath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })

  let lineNo = 0
  for await (const line of rl) {
    lineNo++
    if (!line || line.charAt(0) !== 'E') continue
    const f = line.split('|')
    if (f[0] !== 'EN') continue
    const ulsId = (f[1] ?? '').trim()
    const lic = licenses.get(ulsId)
    if (!lic) continue

    const entityType = (f[5] ?? '').trim().toUpperCase()
    // Prefer licensee records; fall back to any if none later
    if (entityType && entityType !== 'L') {
      // Only skip if we already have a licensee row for this call
      if (byCall.has(lic.callsign)) continue
    }

    const firstName = (f[8] ?? '').trim()
    const lastName = (f[10] ?? '').trim()
    const entityName = (f[7] ?? '').trim()
    const city = (f[16] ?? '').trim()
    const state = (f[17] ?? '').trim().toUpperCase()
    const zip = (f[18] ?? '').trim()

    const existing = byCall.get(lic.callsign)
    // Prefer L entity type over others
    if (existing && entityType !== 'L') continue

    byCall.set(lic.callsign, {
      callsign: lic.callsign,
      firstName,
      lastName,
      entityName,
      city,
      state,
      zip,
      status: lic.status,
      licenseId: ulsId,
    })

    if (lineNo % 200000 === 0) {
      setProgress('parsing', `EN.dat ${lineNo} lines, ${byCall.size} stations`)
    }
  }
  setProgress('parsing', `EN.dat done — ${byCall.size} stations`)
  return byCall
}

async function bulkLoad(rows: Map<string, LicenseRow>): Promise<number> {
  setProgress('loading', `${rows.size} records into PostgreSQL`)
  const BATCH = 1000
  let loaded = 0

  await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      await client.query('TRUNCATE callsigns')

      let batch: LicenseRow[] = []
      const flush = async () => {
        if (batch.length === 0) return
        const callsigns = batch.map((r) => r.callsign)
        const firsts = batch.map((r) => r.firstName)
        const lasts = batch.map((r) => r.lastName)
        const entities = batch.map((r) => r.entityName)
        const cities = batch.map((r) => r.city)
        const states = batch.map((r) => r.state)
        const zips = batch.map((r) => r.zip)
        const statuses = batch.map((r) => r.status)
        const lids = batch.map((r) => r.licenseId)

        await client.query(
          `INSERT INTO callsigns
             (callsign, first_name, last_name, entity_name, city, state, zip, status, license_id)
           SELECT * FROM UNNEST(
             $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
             $6::text[], $7::text[], $8::text[], $9::text[]
           )`,
          [callsigns, firsts, lasts, entities, cities, states, zips, statuses, lids],
        )
        loaded += batch.length
        batch = []
        if (loaded % 50000 === 0) setProgress('loading', `${loaded} / ${rows.size}`)
      }

      for (const row of rows.values()) {
        batch.push(row)
        if (batch.length >= BATCH) await flush()
      }
      await flush()
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  })

  return loaded
}

/**
 * Download the complete FCC amateur dump, parse HD+EN, replace local callsigns table.
 */
export async function runFccImport(options?: { force?: boolean }): Promise<{
  imported: number
  lastModified: string | null
}> {
  if (importing) {
    throw Object.assign(new Error('FCC import already in progress'), { status: 409 })
  }

  importing = true
  try {
    const check = await needsUpdate(options?.force ?? false)
    if (!check.needed && !options?.force) {
      setProgress('idle', check.reason)
      const countRes = await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM callsigns`)
      return {
        imported: Number(countRes.rows[0]?.n ?? 0),
        lastModified: check.remoteLastModified,
      }
    }

    setProgress('starting', check.reason)
    await setMeta('last_error', '')

    const remote = await fetchRemoteMeta()
    await fs.mkdir(DATA_DIR, { recursive: true })
    const zipPath = path.join(DATA_DIR, 'l_amat.zip')
    const extractDir = path.join(DATA_DIR, 'extract')

    // Clean prior extract
    await fs.rm(extractDir, { recursive: true, force: true })

    await downloadZip(zipPath)
    const { hd, en } = await extractDatFiles(zipPath, extractDir)
    const licenses = await parseHd(hd)
    const stations = await parseEn(en, licenses)
    const imported = await bulkLoad(stations)

    const now = new Date().toISOString()
    await setMeta('last_import_at', now)
    await setMeta('source_url', FCC_COMPLETE_URL)
    if (remote.lastModified) await setMeta('source_last_modified', remote.lastModified)
    if (remote.etag) await setMeta('source_etag', remote.etag)
    await setMeta('record_count', String(imported))
    await setMeta('last_error', '')

    // Free disk: keep zip for etag comparison optional; remove extract
    await fs.rm(extractDir, { recursive: true, force: true })

    setProgress('ready', `${imported} callsigns`)
    return { imported, lastModified: remote.lastModified }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await setMeta('last_error', msg).catch(() => {})
    setProgress('error', msg)
    throw err
  } finally {
    importing = false
  }
}

/**
 * Background scheduler: check hourly; import when Sunday dump is newer or DB empty.
 */
export function startFccScheduler(): void {
  const HOUR = 60 * 60 * 1000
  const tick = async () => {
    if (importing) return
    try {
      const check = await needsUpdate(false)
      if (check.needed) {
        console.log(`[fcc] update needed: ${check.reason}`)
        await runFccImport({ force: false })
      } else {
        console.log(`[fcc] ${check.reason}`)
      }
    } catch (err) {
      console.error('[fcc] scheduled update failed:', err)
    }
  }

  // Initial check shortly after boot (don't block listen)
  setTimeout(() => {
    void tick()
  }, 5000)

  setInterval(() => {
    void tick()
  }, HOUR)
}
