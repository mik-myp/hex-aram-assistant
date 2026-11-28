import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { LocalMatchHistoryRecord, LocalMatchHistorySummary } from '@shared/types'
import { logDiag } from '../logger/diagLogger'

const MAX_HISTORY_RECORDS = 100

function getHistoryPath(): string | null {
  if (typeof app?.getPath !== 'function') return null
  return join(app.getPath('userData'), 'match-history.json')
}

export function summarizeMatchHistoryRecords(
  records: LocalMatchHistoryRecord[]
): LocalMatchHistorySummary {
  const heroStats = new Map<string, { count: number; wins: number; decided: number }>()
  const augStats = new Map<string, { count: number; wins: number; decided: number }>()
  let wins = 0
  let losses = 0

  for (const r of records) {
    const isWin = r.result === 'win'
    const isLoss = r.result === 'loss'
    const isDecided = isWin || isLoss
    if (isWin) wins++
    if (isLoss) losses++

    if (r.heroId) {
      const cur = heroStats.get(r.heroId) ?? { count: 0, wins: 0, decided: 0 }
      cur.count++
      if (isWin) cur.wins++
      if (isDecided) cur.decided++
      heroStats.set(r.heroId, cur)
    }
    for (const aid of r.pickedAugmentIds || []) {
      const cur = augStats.get(aid) ?? { count: 0, wins: 0, decided: 0 }
      cur.count++
      if (isWin) cur.wins++
      if (isDecided) cur.decided++
      augStats.set(aid, cur)
    }
  }

  const topHeroes = [...heroStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([heroId, st]) => ({ heroId, ...st }))

  const topAugments = [...augStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([augmentId, st]) => ({ augmentId, ...st }))

  return {
    totalMatches: records.length,
    wins,
    losses,
    decidedMatches: wins + losses,
    records,
    topHeroes,
    topAugments
  }
}

export async function readLocalMatchHistory(): Promise<LocalMatchHistoryRecord[]> {
  const p = getHistoryPath()
  if (!p || !existsSync(p)) return []
  try {
    const parsed = JSON.parse(await readFile(p, 'utf-8')) as unknown
    return Array.isArray(parsed) ? (parsed as LocalMatchHistoryRecord[]) : []
  } catch {
    return []
  }
}

export async function getLocalMatchHistorySummary(): Promise<LocalMatchHistorySummary> {
  const records = await readLocalMatchHistory()
  return summarizeMatchHistoryRecords(records)
}

export async function clearLocalMatchHistory(): Promise<LocalMatchHistorySummary> {
  const p = getHistoryPath()
  if (p && existsSync(p)) {
    await rm(p, { force: true }).catch(() => {})
  }
  return summarizeMatchHistoryRecords([])
}

export async function appendLocalMatchRecord(
  record: Omit<LocalMatchHistoryRecord, 'id' | 'endedAt'>
): Promise<boolean> {
  const p = getHistoryPath()
  if (!p || !record.heroId) return false
  if (
    record.durationSec < 60 &&
    record.pickedAugmentIds.length === 0 &&
    record.finalItemIds.length === 0
  ) {
    return false
  }

  try {
    const existing = await readLocalMatchHistory()
    const entry: LocalMatchHistoryRecord = {
      id: `${Date.now()}-${record.heroId}`,
      endedAt: new Date().toISOString(),
      ...record
    }
    const next = [entry, ...existing].slice(0, MAX_HISTORY_RECORDS)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, JSON.stringify(next, null, 2), 'utf-8')
    logDiag(
      'HISTORY',
      `Recorded local match: hero=${entry.heroId}, lv=${entry.finalLevel}, augs=${entry.pickedAugmentIds.length}, dur=${entry.durationSec}s`
    )
    return true
  } catch {
    return false
  }
}
