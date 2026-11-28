import type { AugmentOfferSlotIndex, CardSlotAnchor, WindowBoundsRect } from './types'

/**
 * Empirically calibrated spatial geometry for League of Legends CN/Global Client & Game.
 *
 * 1. LeagueClientUx ("RCLIENT") — Always 16:9 inner client area (1024×576, 1280×720, 1600×900, 1920×1080):
 *    - 10 ARAM Bench Portrait Slots (i = 0..9) measured at 1920×1080:
 *      x0 = 528 + 88 * i, y0 = 16, width = 72, height = 72 (pitch = 88px, center = 564 + 88 * i)
 *    - 5 Left-Side My-Team Portrait Slots (i = 0..4) measured at 1920×1080:
 *      x0 = 85, y0 = 160 + 120 * i, width = 86, height = 86
 *
 * 2. League of Legends In-Game ("RiotWindowClass") — Arbitrary resolution & aspect ratio (16:9, 16:10, 21:9, 32:9, 4:3):
 *    - Centered Hextech Augment modal scales strictly by client HEIGHT (H) and anchors horizontally around W / 2!
 *    - Card center horizontal spacing = 0.3417 * H (369px @ 1080p)
 *    - Card frame width = 0.2869 * H (310px @ 1080p)
 *    - Card frame vertical span = 0.218 * H .. 0.648 * H
 *    - Card icon zone = 0.255 * H .. 0.365 * H
 *    - Card title OCR band = 0.3869 * H .. 0.4335 * H (center Y = 0.4102 * H)
 *    - Card description body = 0.440 * H .. 0.625 * H
 *    - Card reroll button = 0.665 * H .. 0.725 * H
 */

export const CLIENT_BASE_W = 1920
export const CLIENT_BASE_H = 1080
export const CLIENT_BENCH_MAX_SLOTS = 10

// Empirically verified height-proportional constants (both 3-pick and 4-pick share identical card step & width!)
export const GAME_CARD_STEP_BY_H = 0.3417
export const GAME_CARD_WIDTH_BY_H = 0.2869
export const GAME_CARD_FRAME_TOP_BY_H = 0.218
export const GAME_CARD_FRAME_BOTTOM_BY_H = 0.648
export const GAME_CARD_ICON_TOP_BY_H = 0.252
export const GAME_CARD_ICON_BOTTOM_BY_H = 0.368
export const GAME_CARD_TITLE_TOP_BY_H = 0.3869
export const GAME_CARD_TITLE_BOTTOM_BY_H = 0.4335
export const GAME_CARD_REROLL_TOP_BY_H = 0.665
export const GAME_CARD_REROLL_BOTTOM_BY_H = 0.725

// Safe non-occluding HUD badge anchors (zero overlap with Card Title OCR band or Reroll dice!)
export const GAME_BADGE_TOP_MODE_BOTTOM_BY_H = 0.208
export const GAME_BADGE_BOTTOM_MODE_TOP_BY_H = 0.742

export interface ClientBenchSlotLayout {
  slotIndex: number
  /** Portrait box in pixels within client viewport */
  portrait: WindowBoundsRect
  /** Center X in pixels within client viewport */
  centerX: number
  /** Top Y in pixels where our spatial badge begins (just below portrait) */
  badgeTopY: number
  /** Max safe badge width in pixels so 10 adjacent slots never overlap */
  badgeWidth: number
  /** Uniform scale factor relative to 1920×1080 client */
  uiScale: number
}

export interface ClientTeamSlotLayout {
  slotIndex: number
  portrait: WindowBoundsRect
}

export interface GameAugmentCardBox {
  slotIndex: AugmentOfferSlotIndex
  centerX: number
  centerXRatio: number
  cardFrame: WindowBoundsRect
  iconRect: WindowBoundsRect
  titleBand: WindowBoundsRect
  rerollRect: WindowBoundsRect
  badgeTopModeBottomY: number
  badgeBottomModeTopY: number
  badgeWidth: number
  uiScale: number
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

/**
 * Computes the effective 16:9 LeagueClientUx ("RCLIENT") sub-rect inside a given viewport.
 * When windowTracker locks onto RCLIENT directly, viewport is already 16:9 and returns (0, 0, W, H).
 * If fallback full-screen bounds are on a 21:9 or 16:10 monitor, inscribes a centered 16:9 rect.
 */
export function resolveClientEffectiveRect(viewportW: number, viewportH: number): WindowBoundsRect {
  const safeW = Math.max(320, viewportW)
  const safeH = Math.max(240, viewportH)
  const aspect = safeW / safeH
  const targetAspect = 16 / 9

  if (Math.abs(aspect - targetAspect) <= 0.05) {
    return { x: 0, y: 0, width: safeW, height: safeH }
  }

  if (aspect > targetAspect) {
    // Wider than 16:9 (e.g. 21:9 monitor fallback): center 16:9 horizontally
    const w = Math.round(safeH * targetAspect)
    return { x: Math.round((safeW - w) / 2), y: 0, width: w, height: safeH }
  }

  // Taller than 16:9 (e.g. 16:10 monitor fallback): center 16:9 vertically
  const h = Math.round(safeW / targetAspect)
  return { x: 0, y: Math.round((safeH - h) / 2), width: safeW, height: h }
}

/**
 * Computes exact pixel geometry for ARAM Bench slot `slotIndex` (0..9) inside a viewport.
 */
export function computeClientBenchSlotLayout(
  viewportW: number,
  viewportH: number,
  slotIndex: number,
  offsetXPercent = 0,
  offsetYPercent = 0
): ClientBenchSlotLayout {
  const client = resolveClientEffectiveRect(viewportW, viewportH)
  const idx = clamp(Math.floor(slotIndex), 0, CLIENT_BENCH_MAX_SLOTS - 1)
  const sx = client.width / CLIENT_BASE_W
  const sy = client.height / CLIENT_BASE_H
  const dx = (offsetXPercent / 100) * client.width
  const dy = (offsetYPercent / 100) * client.height

  const portraitX = client.x + (528 + 88 * idx) * sx + dx
  const portraitY = client.y + 16 * sy + dy
  const portraitW = 72 * sx
  const portraitH = 72 * sy
  const centerX = portraitX + portraitW / 2
  const badgeTopY = portraitY + portraitH + Math.max(3, 5 * sy)
  // Pitch between centers is 88 * sx; 84 * sx leaves clean 4px @ 1080p gap between all 10 slots!
  const badgeWidth = Math.max(48, Math.round(84 * sx))
  const uiScale = clamp(sy, 0.62, 1.8)

  return {
    slotIndex: idx,
    portrait: {
      x: Math.round(portraitX),
      y: Math.round(portraitY),
      width: Math.round(portraitW),
      height: Math.round(portraitH)
    },
    centerX,
    badgeTopY,
    badgeWidth,
    uiScale
  }
}

/**
 * Computes exact pixel geometry for the 5 left-side My-Team portraits (0..4) in LeagueClientUx.
 */
export function computeClientTeamSlotLayouts(
  viewportW: number,
  viewportH: number
): ClientTeamSlotLayout[] {
  const client = resolveClientEffectiveRect(viewportW, viewportH)
  const sx = client.width / CLIENT_BASE_W
  const sy = client.height / CLIENT_BASE_H

  return [0, 1, 2, 3, 4].map((slotIndex) => ({
    slotIndex,
    portrait: {
      x: Math.round(client.x + 85 * sx),
      y: Math.round(client.y + (160 + 120 * slotIndex) * sy),
      width: Math.round(86 * sx),
      height: Math.round(86 * sy)
    }
  }))
}

/**
 * Computes aspect-ratio invariant geometry for 2, 3, or 4 In-Game Hextech Augment Cards.
 * Empirically verified against CN client captures (ref: czgreat/aramhex v1.2.0):
 *  - 3-pick and 4-pick use the EXACT SAME card spacing (0.3417 * H) and width (0.2869 * H).
 *  - 3-pick centers sit at W/2 + (-1.0, 0.0, +1.0) * spacing.
 *  - 4-pick centers sit at W/2 + (-1.5, -0.5, +0.5, +1.5) * spacing (clamping outer width on narrow 4:3 screens).
 */
export function computeGameAugmentCardBoxesForCount(
  gameW: number,
  gameH: number,
  cardCount: 2 | 3 | 4 = 3,
  offsetXPercent = 0,
  offsetYPercent = 0
): GameAugmentCardBox[] {
  const W = Math.max(320, gameW)
  const H = Math.max(240, gameH)
  const uiScale = clamp(H / 1080, 0.64, 2.4)
  const stepPx = GAME_CARD_STEP_BY_H * H
  const halfSpanIdx = (cardCount - 1) / 2
  const dx = (offsetXPercent / 100) * W
  const dy = (offsetYPercent / 100) * H

  // Clamp half-width on narrow (e.g. 4:3) 4-card layouts so outer cards stay within viewport without shifting centers
  const outerMargin = Math.max(4, W / 2 - halfSpanIdx * stepPx)
  const cardWidth = Math.min(GAME_CARD_WIDTH_BY_H * H, stepPx * 0.96, outerMargin * 2)

  const boxes: GameAugmentCardBox[] = []
  for (let i = 0; i < cardCount; i++) {
    const slotIndex = i as AugmentOfferSlotIndex
    const centerX = W / 2 + (i - halfSpanIdx) * stepPx + dx
    const cardLeft = clamp(centerX - cardWidth / 2, 0, Math.max(0, W - cardWidth))
    const frameTop = GAME_CARD_FRAME_TOP_BY_H * H + dy
    const frameBottom = GAME_CARD_FRAME_BOTTOM_BY_H * H + dy
    const iconTop = GAME_CARD_ICON_TOP_BY_H * H + dy
    const iconSize = (GAME_CARD_ICON_BOTTOM_BY_H - GAME_CARD_ICON_TOP_BY_H) * H
    const titleTop = GAME_CARD_TITLE_TOP_BY_H * H + dy
    const titleBottom = GAME_CARD_TITLE_BOTTOM_BY_H * H + dy
    const rerollTop = GAME_CARD_REROLL_TOP_BY_H * H + dy
    const rerollBottom = GAME_CARD_REROLL_BOTTOM_BY_H * H + dy
    const rerollW = cardWidth * 0.46

    boxes.push({
      slotIndex,
      centerX,
      centerXRatio: centerX / W,
      cardFrame: { x: Math.round(cardLeft), y: Math.round(frameTop), width: Math.round(cardWidth), height: Math.round(frameBottom - frameTop) },
      iconRect: { x: Math.round(centerX - iconSize / 2), y: Math.round(iconTop), width: Math.round(iconSize), height: Math.round(iconSize) },
      titleBand: { x: Math.round(cardLeft), y: Math.round(titleTop), width: Math.round(cardWidth), height: Math.round(titleBottom - titleTop) },
      rerollRect: { x: Math.round(centerX - rerollW / 2), y: Math.round(rerollTop), width: Math.round(rerollW), height: Math.round(rerollBottom - rerollTop) },
      badgeTopModeBottomY: GAME_BADGE_TOP_MODE_BOTTOM_BY_H * H + dy,
      badgeBottomModeTopY: GAME_BADGE_BOTTOM_MODE_TOP_BY_H * H + dy,
      badgeWidth: Math.round(clamp(cardWidth * 0.94, 176, 560)),
      uiScale
    })
  }
  return boxes
}

/**
 * Fits detected card horizontal centers against real 3-pick [-1, 0, +1] vs 4-pick [-1.5, -0.5, +0.5, +1.5]
 * spacing offsets (ref: aramhex `_layout_columns`). Even when only 2 or 3 cards out of a 4-pick screen
 * are recognized, the half-card phase shift reliably distinguishes 4-pick and assigns exact slot indices!
 */
export function fitAugmentColumnsToLayout(
  centersX: number[],
  gameW: number,
  gameH: number
): { totalSlots: 3 | 4; slotIndices: AugmentOfferSlotIndex[] } {
  if (centersX.length >= 4) {
    return { totalSlots: 4, slotIndices: [0, 1, 2, 3].slice(0, centersX.length) as AugmentOfferSlotIndex[] }
  }
  const spacing = GAME_CARD_STEP_BY_H * Math.max(240, gameH)
  const offsets = centersX.map((cx) => (cx - gameW / 2) / spacing)

  const fit = (slots: number[]): { cols: AugmentOfferSlotIndex[] | null; err: number } => {
    const cols: AugmentOfferSlotIndex[] = []
    let worst = 0
    for (const u of offsets) {
      let bestIdx = 0
      let bestDist = Infinity
      for (let j = 0; j < slots.length; j++) {
        const d = Math.abs(u - slots[j])
        if (d < bestDist) {
          bestDist = d
          bestIdx = j
        }
      }
      cols.push(bestIdx as AugmentOfferSlotIndex)
      if (bestDist > worst) worst = bestDist
    }
    if (new Set(cols).size !== cols.length) return { cols: null, err: Infinity }
    return { cols, err: worst }
  }

  const fit3 = fit([-1.0, 0.0, 1.0])
  const fit4 = fit([-1.5, -0.5, 0.5, 1.5])
  if (fit4.cols && fit4.err < 0.25 && fit4.err < fit3.err) {
    return { totalSlots: 4, slotIndices: fit4.cols }
  }
  if (fit3.cols) {
    return { totalSlots: 3, slotIndices: fit3.cols }
  }
  return {
    totalSlots: 3,
    slotIndices: centersX.map((_, idx) => Math.min(2, idx) as AugmentOfferSlotIndex)
  }
}

export function computeGameAugmentCardBoxes(
  gameW: number,
  gameH: number,
  offsetXPercent = 0,
  offsetYPercent = 0
): [GameAugmentCardBox, GameAugmentCardBox, GameAugmentCardBox] {
  const b = computeGameAugmentCardBoxesForCount(gameW, gameH, 3, offsetXPercent, offsetYPercent)
  return [b[0], b[1], b[2]]
}

export function buildResolutionAwareCardSlots(
  augmentIds: string[],
  gameW = 1920,
  gameH = 1080,
  totalSlotsOverride?: 2 | 3 | 4
): CardSlotAnchor[] {
  const capped = augmentIds.slice(0, 4)
  const totalSlots: 2 | 3 | 4 =
    totalSlotsOverride ?? (capped.length >= 4 ? 4 : capped.length === 2 ? 2 : 3)
  const boxes = computeGameAugmentCardBoxesForCount(gameW, gameH, totalSlots)
  return capped.map((augmentId, idx) => {
    const slotIndex = idx as AugmentOfferSlotIndex
    const box = boxes[slotIndex] || boxes[boxes.length - 1]
    return {
      slotIndex,
      totalSlots,
      augmentId,
      xRatio: Number(box.centerXRatio.toFixed(4)),
      yRatio: GAME_BADGE_TOP_MODE_BOTTOM_BY_H,
      cardWidthRatio: Number((box.cardFrame.width / Math.max(1, gameW)).toFixed(4))
    }
  })
}

export function computeOcrTitleStripCropRect(imgW: number, imgH: number): WindowBoundsRect {
  const boxes4 = computeGameAugmentCardBoxesForCount(imgW, imgH, 4)
  const padX = Math.round(0.02 * imgH)
  const x0 = clamp(boxes4[0].titleBand.x - padX, 0, imgW - 1)
  const x1 = clamp(boxes4[3].titleBand.x + boxes4[3].titleBand.width + padX, x0 + 1, imgW)
  const y0 = clamp(Math.round(0.372 * imgH), 0, imgH - 1)
  const y1 = clamp(Math.round(0.448 * imgH), y0 + 1, imgH)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function computeOcrCardBandCropRect(imgW: number, imgH: number): WindowBoundsRect {
  const boxes4 = computeGameAugmentCardBoxesForCount(imgW, imgH, 4)
  const padX = Math.round(0.02 * imgH)
  const x0 = clamp(boxes4[0].titleBand.x - padX, 0, imgW - 1)
  const x1 = clamp(boxes4[3].titleBand.x + boxes4[3].titleBand.width + padX, x0 + 1, imgW)
  const y0 = clamp(Math.round(0.24 * imgH), 0, imgH - 1)
  const y1 = clamp(Math.round(0.452 * imgH), y0 + 1, imgH)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function resolveHoveredAugmentSlot(
  localX: number,
  localY: number,
  gameW: number,
  gameH: number,
  cardCount: 2 | 3 | 4 = 3
): AugmentOfferSlotIndex | null {
  if (gameW <= 0 || gameH <= 0) return null
  const ry = localY / gameH
  if (ry < 0.18 || ry > 0.78) return null

  const boxes = computeGameAugmentCardBoxesForCount(gameW, gameH, cardCount)
  const maxHalfSpan = (GAME_CARD_STEP_BY_H / 2) * gameH
  let bestSlot: AugmentOfferSlotIndex | null = null
  let bestDist = Infinity

  for (const box of boxes) {
    const dist = Math.abs(localX - box.centerX)
    if (dist <= maxHalfSpan && dist < bestDist) {
      bestDist = dist
      bestSlot = box.slotIndex
    }
  }
  return bestSlot
}

export interface ResolutionPreset {
  id: string
  label: string
  shortLabel: string
  width: number
  height: number
  aspectTag: string
  recommendedFor: 'both' | 'client' | 'game'
}

export const SIMULATOR_RESOLUTION_PRESETS: ResolutionPreset[] = [
  {
    id: '1280x720',
    label: '1280×720 · 客户端标准小窗 / 720P',
    shortLabel: '1280×720 (小窗)',
    width: 1280,
    height: 720,
    aspectTag: '16:9',
    recommendedFor: 'both'
  },
  {
    id: '1600x900',
    label: '1600×900 · 客户端大窗 / 常见窗口化',
    shortLabel: '1600×900 (窗口)',
    width: 1600,
    height: 900,
    aspectTag: '16:9',
    recommendedFor: 'both'
  },
  {
    id: '1920x1080',
    label: '1920×1080 · 主流 1080P 全高清',
    shortLabel: '1920×1080 (16:9)',
    width: 1920,
    height: 1080,
    aspectTag: '16:9',
    recommendedFor: 'both'
  },
  {
    id: '2560x1440',
    label: '2560×1440 · 主流 2K 电竞屏',
    shortLabel: '2560×1440 (2K)',
    width: 2560,
    height: 1440,
    aspectTag: '16:9',
    recommendedFor: 'game'
  },
  {
    id: '2560x1600',
    label: '2560×1600 · 游戏本全屏 16:10',
    shortLabel: '2560×1600 (16:10)',
    width: 2560,
    height: 1600,
    aspectTag: '16:10',
    recommendedFor: 'game'
  },
  {
    id: '3440x1440',
    label: '3440×1440 · 超宽带鱼屏 21:9',
    shortLabel: '3440×1440 (21:9)',
    width: 3440,
    height: 1440,
    aspectTag: '21:9',
    recommendedFor: 'game'
  }
]
