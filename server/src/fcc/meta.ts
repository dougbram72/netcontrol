import type pg from 'pg'
import { pool } from '../db.js'

export async function getMeta(key: string, client?: pg.PoolClient): Promise<string | null> {
  const q = client ?? pool
  const res = await q.query<{ value: string }>(
    `SELECT value FROM callsign_db_meta WHERE key = $1`,
    [key],
  )
  return res.rows[0]?.value ?? null
}

export async function setMeta(
  key: string,
  value: string,
  client?: pg.PoolClient,
): Promise<void> {
  const q = client ?? pool
  await q.query(
    `INSERT INTO callsign_db_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  )
}

export type CallsignDbStatus = {
  ready: boolean
  importing: boolean
  recordCount: number
  lastImportAt: string | null
  lastModified: string | null
  lastError: string | null
  sourceUrl: string
}

export async function getCallsignDbStatus(importing: boolean): Promise<CallsignDbStatus> {
  const [countRes, lastImportAt, lastModified, lastError, sourceUrl] = await Promise.all([
    pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM callsigns`),
    getMeta('last_import_at'),
    getMeta('source_last_modified'),
    getMeta('last_error'),
    getMeta('source_url'),
  ])
  const recordCount = Number(countRes.rows[0]?.n ?? 0)
  return {
    ready: recordCount > 0 && !importing,
    importing,
    recordCount,
    lastImportAt,
    lastModified,
    lastError,
    sourceUrl: sourceUrl ?? FCC_COMPLETE_URL,
  }
}

export const FCC_COMPLETE_URL =
  process.env.FCC_AMAT_URL ?? 'https://data.fcc.gov/download/pub/uls/complete/l_amat.zip'
