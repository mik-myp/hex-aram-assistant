import type { CardSlotAnchor, WindowBoundsRect } from './types'

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

// Height-proportional constants for In-Game 3-Pick Hextech Augment modal
export const GAME_CARD_STEP_BY_H = 0.3417
export const GAME_CARD_WIDTH_BY_H = 0.2869
export const GAME_CARD_FRAME_TOP_BY_H = 0.218
export const GAME_CARD_FRAME_BOTTOM_BY_H = 0.648
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
  slotIndex: 0 | 1 | 2
  centerX: number
  centerXRatio: number
  cardFrame: WindowBoundsRect
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
 * Computes aspect-ratio invariant pixel & ratio geometry for the 3 In-Game Hextech Augment Cards
 * for ANY resolution W × H (1280×720, 1920×1080, 2560×1440, 2560×1600 16:10, 3440×1440 21:9, 3840×2160 4K).
 */
export function computeGameAugmentCardBoxes(
  gameW: number,
  gameH: number,
  offsetXPercent = 0,
  offsetYPercent = 0
): [GameAugmentCardBox, GameAugmentCardBox, GameAugmentCardBox] {
  const W = Math.max(320, gameW)
  const H = Math.max(240, gameH)
  const uiScale = clamp(H / 1080, 0.64, 2.4)
  const stepPx = GAME_CARD_STEP_BY_H * H
  const cardWidth = GAME_CARD_WIDTH_BY_H * H
  const dx = (offsetXPercent / 100) * W
  const dy = (offsetYPercent / 100) * H

  const buildOne = (slotIndex: 0 | 1 | 2): GameAugmentCardBox => {
    // Notice small empirical +0.0038W slight right bias on CN client is < 4px; W/2 + (i - 1)*stepPx is exact universal center
    const centerX = W / 2 + (slotIndex - 1) * stepPx + dx
    const cardLeft = centerX - cardWidth / 2
    const frameTop = GAME_CARD_FRAME_TOP_BY_H * H + dy
    const frameBottom = GAME_CARD_FRAME_BOTTOM_BY_H * H + dy
    const titleTop = GAME_CARD_TITLE_TOP_BY_H * H + dy
    const titleBottom = GAME_CARD_TITLE_BOTTOM_BY_H * H + dy
    const rerollTop = GAME_CARD_REROLL_TOP_BY_H * H + dy
    const rerollBottom = GAME_CARD_REROLL_BOTTOM_BY_H * H + dy
    const rerollW = cardWidth * 0.46

    return {
      slotIndex,
      centerX,
      centerXRatio: centerX / W,
      cardFrame: {
        x: Math.round(cardLeft),
        y: Math.round(frameTop),
        width: Math.round(cardWidth),
        height: Math.round(frameBottom - frameTop)
      },
      titleBand: {
        x: Math.round(cardLeft),
        y: Math.round(titleTop),
        width: Math.round(cardWidth),
        height: Math.round(titleBottom - titleTop)
      },
      rerollRect: {
        x: Math.round(centerX - rerollW / 2),
        y: Math.round(rerollTop),
        width: Math.round(rerollW),
        height: Math.round(rerollBottom - rerollTop)
      },
      badgeTopModeBottomY: GAME_BADGE_TOP_MODE_BOTTOM_BY_H * H + dy,
      badgeBottomModeTopY: GAME_BADGE_BOTTOM_MODE_TOP_BY_H * H + dy,
      badgeWidth: Math.round(clamp(cardWidth * 0.94, 176, 560)),
      uiScale
    }
  }

  return [buildOne(0), buildOne(1), buildOne(2)]
}

/**
 * Builds CardSlotAnchor[] for a given resolution W × H (defaults to 16:9 1920×1080 ratios,
 * though MiniOverlay also recomputes dynamically from live viewport W × H!).
 */
export function buildResolutionAwareCardSlots(
  augmentIds: string[],
  gameW = 1920,
  gameH = 1080
): CardSlotAnchor[] {
  const boxes = computeGameAugmentCardBoxes(gameW, gameH)
  return augmentIds.slice(0, 3).map((augmentId, idx) => {
    const slotIndex = idx as 0 | 1 | 2
    const box = boxes[slotIndex]
    return {
      slotIndex,
      augmentId,
      xRatio: Number(box.centerXRatio.toFixed(4)),
      yRatio: GAME_BADGE_TOP_MODE_BOTTOM_BY_H,
      cardWidthRatio: Number((box.cardFrame.width / Math.max(1, gameW)).toFixed(4))
    }
  })
}

/**
 * Computes the narrow horizontal OCR crop rectangle covering ONLY the 3 Hextech Card Titles.
 * Ensures:
 *  - Zero overlap with HexBuddy's own HUD badges (<= 0.208*H or >= 0.742*H) -> NO OCR self-reading!
 *  - Aspect-ratio invariant horizontal bounds on 16:9, 16:10, 21:9, and 32:9!
 */
export function computeOcrTitleStripCropRect(imgW: number, imgH: number): WindowBoundsRect {
  const boxes = computeGameAugmentCardBoxes(imgW, imgH)
  const padX = Math.round(0.02 * imgH)
  const x0 = clamp(boxes[0].titleBand.x - padX, 0, imgW - 1)
  const x1 = clamp(boxes[2].titleBand.x + boxes[2].titleBand.width + padX, x0 + 1, imgW)
  const y0 = clamp(Math.round(0.372 * imgH), 0, imgH - 1)
  const y1 = clamp(Math.round(0.448 * imgH), y0 + 1, imgH)

  return {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0
  }
}

/**
 * Determines which of the 3 card columns (0 = Left, 1 = Center, 2 = Right) a cursor point `(localX, localY)`
 * is hovering over inside a game window of `(gameW, gameH)`. Works accurately on 21:9 & 32:9 ultrawide!
 */
export function resolveHoveredAugmentSlot(
  localX: number,
  localY: number,
  gameW: number,
  gameH: number
): (0 | 1 | 2) | null {
  if (gameW <= 0 || gameH <= 0) return null
  const ry = localY / gameH
  // Vertical active range covering card top down through reroll button
  if (ry < 0.18 || ry > 0.78) return null

  const boxes = computeGameAugmentCardBoxes(gameW, gameH)
  const maxHalfSpan = 0.22 * gameH
  let bestSlot: (0 | 1 | 2) | null = null
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
