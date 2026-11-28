import { fitAugmentColumnsToLayout } from '@shared/layoutGeometry'
import { matchAugmentsFromOcrText } from '@shared/pinyin'
import type { AugmentMeta, AugmentOfferSlotIndex } from '@shared/types'

export interface ParsedOcrPass {
  matchedIds: string[]
  slotMap: Map<AugmentOfferSlotIndex, string>
  totalSlots?: 2 | 3 | 4
  rawLines: string[]
  avgConf: number
}

export interface StripGeometryHint {
  stripOriginX: number
  stripScale: number
  gameW: number
  gameH: number
}

/**
 * Groups OCR words into horizontal clusters by gap separation, matches augment names per cluster,
 * and fits the matched cluster centers against real 3-pick [-1,0,+1] vs 4-pick [-1.5,-0.5,+0.5,+1.5]
 * layouts (ref: aramhex `_layout_columns`). Works across 4:3, 16:10, 16:9, 21:9, and 4K.
 */
export function matchWordsAdaptiveColumns(
  words: Array<{ t: string; x0: number; x1: number }>,
  stripWidthHint: number,
  rawLines: string[],
  augments: Record<string, AugmentMeta>,
  geomHint?: StripGeometryHint
): ParsedOcrPass {
  const maxX = Math.max(stripWidthHint, ...words.map((w) => w.x1 || 0))
  const sortedWords = words
    .filter((w) => Boolean(w.t?.trim()))
    .sort((a, b) => a.x0 - b.x0)

  const gapThreshold = Math.max(20, maxX * 0.055)
  const clusters: Array<{ text: string; cx: number }> = []
  for (const wd of sortedWords) {
    const t = wd.t.trim()
    const prev = clusters[clusters.length - 1]
    if (!prev || wd.x0 - prev.cx > gapThreshold) {
      clusters.push({ text: t, cx: (wd.x0 + wd.x1) / 2 })
    } else {
      prev.text += t
      prev.cx = (prev.cx + (wd.x0 + wd.x1) / 2) / 2
    }
  }

  const hits: Array<{ id: string; conf: number; gameCx: number }> = []
  for (const cl of clusters) {
    const m = matchAugmentsFromOcrText([cl.text], augments, 1)
    const id = m.matchedIds[0]
    if (!id || hits.some((h) => h.id === id)) continue
    const gameCx = geomHint
      ? geomHint.stripOriginX + cl.cx / Math.max(0.01, geomHint.stripScale)
      : cl.cx
    hits.push({ id, conf: m.confidence, gameCx })
  }

  if (hits.length >= 2) {
    const gameW = geomHint?.gameW ?? maxX
    const gameH = geomHint?.gameH ?? Math.round((maxX / 1.35) * 1.0)
    const fitted = fitAugmentColumnsToLayout(
      hits.map((h) => h.gameCx),
      gameW,
      gameH
    )
    const slotMap = new Map<AugmentOfferSlotIndex, string>()
    const matchedIds: string[] = []
    let confSum = 0
    hits.forEach((h, idx) => {
      const col = fitted.slotIndices[idx]
      if (col !== undefined && !slotMap.has(col)) {
        slotMap.set(col, h.id)
        matchedIds.push(h.id)
        confSum += h.conf
      }
    })
    return {
      matchedIds,
      slotMap,
      totalSlots: fitted.totalSlots,
      rawLines,
      avgConf: matchedIds.length > 0 ? Number((confSum / matchedIds.length).toFixed(3)) : 0
    }
  }

  const segments: string[] = [...rawLines]
  for (const line of rawLines) {
    const parts = line.split(/\s{2,}/).filter((p) => p.trim().length >= 2)
    if (parts.length > 1) segments.push(...parts)
  }
  const fallback = matchAugmentsFromOcrText(segments, augments, 4)
  const slotMap = new Map<AugmentOfferSlotIndex, string>()
  fallback.matchedIds.forEach((id, idx) => {
    slotMap.set(idx as AugmentOfferSlotIndex, id)
  })
  const totalSlots: 2 | 3 | 4 =
    fallback.matchedIds.length >= 4 ? 4 : fallback.matchedIds.length === 2 ? 2 : 3
  return {
    matchedIds: fallback.matchedIds,
    slotMap,
    totalSlots,
    rawLines,
    avgConf: fallback.confidence
  }
}
