import {
  matchIconSlotFromBuffer,
  type CompiledIconTemplate,
  type IconSlotMatchResult
} from '@shared/iconMatcher'
import { computeGameAugmentCardBoxesForCount } from '@shared/layoutGeometry'
import type { AugmentMeta, AugmentOfferSlotIndex, AugmentRarity } from '@shared/types'
import { getCompiledIconTemplates } from './iconFingerprintStore'
import type { ParsedOcrPass } from './winrtOcrAdapter'

export interface IconBandMatchPass {
  slotMatches: Map<AugmentOfferSlotIndex, IconSlotMatchResult>
  totalSlots: 2 | 3 | 4
  confidentCount: number
  matchedIds: string[]
  avgScore: number
  elapsedMs: number
}

function matchIconsForCardCount(
  bgra: Uint8Array,
  bandW: number,
  bandH: number,
  bandOffsetX: number,
  bandOffsetY: number,
  gameW: number,
  gameH: number,
  cardCount: 3 | 4,
  templates: CompiledIconTemplate[],
  augments: Record<string, AugmentMeta>,
  isBgra: boolean
): Omit<IconBandMatchPass, 'elapsedMs'> {
  const slotMatches = new Map<AugmentOfferSlotIndex, IconSlotMatchResult>()
  const boxes = computeGameAugmentCardBoxesForCount(gameW, gameH, cardCount)

  const localRects = boxes.map((box) => ({
    slotIndex: box.slotIndex,
    rect: {
      x: box.iconRect.x - bandOffsetX,
      y: box.iconRect.y - bandOffsetY,
      width: box.iconRect.width,
      height: box.iconRect.height
    }
  }))

  for (const { slotIndex, rect } of localRects) {
    if (rect.x < -10 || rect.y < -10 || rect.x + rect.width > bandW + 10 || rect.y + rect.height > bandH + 10) {
      continue
    }
    const hit = matchIconSlotFromBuffer(bgra, bandW, bandH, rect, templates, isBgra)
    if (hit) slotMatches.set(slotIndex, hit)
  }

  // Rarity consistency refinement (cards offered in the same pick share a rarity tier)
  const rarityCounts = new Map<AugmentRarity, number>()
  for (const hit of slotMatches.values()) {
    if (!hit.confident) continue
    const rar = augments[hit.augmentId]?.rarity
    if (rar) rarityCounts.set(rar, (rarityCounts.get(rar) ?? 0) + 1)
  }
  let majorityRarity: AugmentRarity | undefined
  for (const [rar, cnt] of rarityCounts.entries()) {
    if (cnt >= 2) majorityRarity = rar
  }
  if (majorityRarity) {
    for (const { slotIndex, rect } of localRects) {
      const existing = slotMatches.get(slotIndex)
      if (existing?.confident) continue
      const refined = matchIconSlotFromBuffer(
        bgra,
        bandW,
        bandH,
        rect,
        templates,
        isBgra,
        majorityRarity
      )
      if (refined && (!existing || refined.score > existing.score)) {
        slotMatches.set(slotIndex, refined)
      }
    }
  }

  // Deduplicate identical augment IDs across slots by keeping the highest-scoring slot
  const byId = new Map<string, { col: AugmentOfferSlotIndex; score: number }>()
  for (const [col, hit] of slotMatches.entries()) {
    const prev = byId.get(hit.augmentId)
    if (!prev) {
      byId.set(hit.augmentId, { col, score: hit.score })
    } else if (hit.score > prev.score) {
      slotMatches.delete(prev.col)
      byId.set(hit.augmentId, { col, score: hit.score })
    } else {
      slotMatches.delete(col)
    }
  }

  const matchedIds: string[] = []
  let confidentCount = 0
  let scoreSum = 0
  for (let i = 0; i < cardCount; i++) {
    const hit = slotMatches.get(i as AugmentOfferSlotIndex)
    if (!hit) continue
    matchedIds.push(hit.augmentId)
    scoreSum += hit.score
    if (hit.confident) confidentCount++
  }

  return {
    slotMatches,
    totalSlots: cardCount,
    confidentCount,
    matchedIds,
    avgScore: matchedIds.length > 0 ? Number((scoreSum / matchedIds.length).toFixed(3)) : 0
  }
}

/**
 * Automatically evaluates BOTH standard 3-card and special 4-card layouts on the widened BGRA band (~3–6ms).
 */
export function runIconMatchOnCardBand(
  bgra: Uint8Array,
  bandW: number,
  bandH: number,
  bandOffsetX: number,
  bandOffsetY: number,
  gameW: number,
  gameH: number,
  augments: Record<string, AugmentMeta>,
  isBgra = true
): IconBandMatchPass {
  const start = Date.now()
  const templates = getCompiledIconTemplates(augments)
  if (templates.length === 0) {
    return {
      slotMatches: new Map(),
      totalSlots: 3,
      confidentCount: 0,
      matchedIds: [],
      avgScore: 0,
      elapsedMs: 0
    }
  }

  const pass3 = matchIconsForCardCount(
    bgra, bandW, bandH, bandOffsetX, bandOffsetY, gameW, gameH, 3, templates, augments, isBgra
  )

  // Fast exit when all 3 standard slots matched cleanly with very high confidence
  if (pass3.confidentCount === 3 && pass3.avgScore >= 0.82) {
    return { ...pass3, elapsedMs: Date.now() - start }
  }

  // Otherwise also probe 4-card layout (special 4-pick rounds in Hextech ARAM)
  const pass4 = matchIconsForCardCount(
    bgra, bandW, bandH, bandOffsetX, bandOffsetY, gameW, gameH, 4, templates, augments, isBgra
  )

  const prefer4 =
    pass4.confidentCount > pass3.confidentCount ||
    (pass4.confidentCount >= 3 && pass4.matchedIds.length > pass3.matchedIds.length) ||
    (pass4.confidentCount === pass3.confidentCount &&
      pass4.matchedIds.length > pass3.matchedIds.length &&
      pass4.avgScore >= pass3.avgScore - 0.02)

  return { ...(prefer4 ? pass4 : pass3), elapsedMs: Date.now() - start }
}

/**
 * Fuses OCR title channel + Icon Fingerprint channel per slot (0..totalSlots-1) across 2/3/4-card offers.
 * Priority rule: Exact/strong OCR Chinese title text ALWAYS wins over icon guessing so hover-glow or
 * card shimmer animations never cause A -> B -> A flickering. Non-confident icon hits are dropped to
 * prevent mid-combat false-positive popups.
 */
export function mergeIconAndOcrPasses(
  iconPass: IconBandMatchPass | null,
  ocrPass: ParsedOcrPass | null
): ParsedOcrPass {
  const ocrHasLayout = Boolean(ocrPass && ocrPass.matchedIds.length >= 2 && ocrPass.totalSlots)
  const totalSlots: 2 | 3 | 4 = ocrHasLayout
    ? ocrPass!.totalSlots!
    : iconPass && iconPass.confidentCount >= 2
      ? iconPass.totalSlots
      : ocrPass?.totalSlots || 3
  const slotMap = new Map<AugmentOfferSlotIndex, string>()
  const usedIds = new Set<string>()
  let confSum = 0

  const iconMatchesLayout = iconPass && iconPass.totalSlots === totalSlots ? iconPass : null
  const ocrMatchesLayout =
    ocrPass && (!ocrPass.totalSlots || ocrPass.totalSlots === totalSlots) ? ocrPass : null

  for (let i = 0; i < totalSlots; i++) {
    const col = i as AugmentOfferSlotIndex
    const iconHit = iconMatchesLayout?.slotMatches.get(col)
    const ocrId = ocrMatchesLayout?.slotMap.get(col)

    if (ocrId && !usedIds.has(ocrId)) {
      slotMap.set(col, ocrId)
      usedIds.add(ocrId)
      const baseOcrConf = ocrMatchesLayout?.avgConf || 0.84
      confSum += iconHit?.augmentId === ocrId ? Math.min(0.99, baseOcrConf + 0.1) : baseOcrConf
    } else if (iconHit && iconHit.confident && !usedIds.has(iconHit.augmentId)) {
      slotMap.set(col, iconHit.augmentId)
      usedIds.add(iconHit.augmentId)
      confSum += iconHit.score
    }
  }

  const matchedIds: string[] = []
  for (let i = 0; i < totalSlots; i++) {
    const aid = slotMap.get(i as AugmentOfferSlotIndex)
    if (aid) matchedIds.push(aid)
  }

  const avgConf = matchedIds.length > 0 ? Number((confSum / matchedIds.length).toFixed(3)) : 0
  return {
    matchedIds,
    slotMap,
    totalSlots,
    rawLines: ocrPass?.rawLines || [],
    avgConf
  }
}
