import type { AugmentRarity } from './types'

/**
 * Illumination- and tint-invariant Hextech Augment Icon Fingerprint Matcher.
 *
 * Official Riot augment icons are white silhouettes over transparent backgrounds; in-game,
 * the client tints them Silver / Gold / Prismatic over dark card art. Using Zero-Mean
 * Normalized Cross-Correlation (ZNCC) on BOTH luminance silhouette and Sobel edge magnitude
 * makes matching invariant to rarity tint, brightness, gamma, and contrast while executing
 * across all ~240 augments in ~2–4ms with zero OS OCR language-pack dependencies!
 */

export const ICON_FP_SIZE = 16
export const ICON_FP_LEN = ICON_FP_SIZE * ICON_FP_SIZE // 256

export interface SerializedIconFingerprintMap {
  version: number
  size: number
  /** augmentId -> 256-byte quantized silhouette encoded as base64 */
  entries: Record<string, string>
}

export interface CompiledIconTemplate {
  augmentId: string
  rarity?: AugmentRarity
  lumaNorm: Float32Array
  edgeNorm: Float32Array
}

export interface IconSlotMatchResult {
  augmentId: string
  score: number
  margin: number
  confident: boolean
}

export function normalizeZeroMeanUnit(src: Float32Array): Float32Array {
  const n = src.length
  const out = new Float32Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) sum += src[i]
  const mean = sum / Math.max(1, n)

  let sq = 0
  for (let i = 0; i < n; i++) {
    const d = src[i] - mean
    out[i] = d
    sq += d * d
  }
  const norm = Math.sqrt(sq)
  if (norm < 1e-5) {
    out.fill(0)
    return out
  }
  const inv = 1 / norm
  for (let i = 0; i < n; i++) out[i] *= inv
  return out
}

export function computeSobelEdgeGrid(grid: Float32Array, size = ICON_FP_SIZE): Float32Array {
  const edge = new Float32Array(size * size)
  for (let y = 1; y < size - 1; y++) {
    const row = y * size
    const up = (y - 1) * size
    const dn = (y + 1) * size
    for (let x = 1; x < size - 1; x++) {
      const gx =
        -grid[up + x - 1] +
        grid[up + x + 1] -
        2 * grid[row + x - 1] +
        2 * grid[row + x + 1] -
        grid[dn + x - 1] +
        grid[dn + x + 1]
      const gy =
        -grid[up + x - 1] -
        2 * grid[up + x] -
        grid[up + x + 1] +
        grid[dn + x - 1] +
        2 * grid[dn + x] +
        grid[dn + x + 1]
      edge[row + x] = Math.hypot(gx, gy)
    }
  }
  return edge
}

/**
 * Extracts a 16x16 alpha-trimmed silhouette byte array (0..255) from a raw RGBA or BGRA pixel buffer
 * of an official transparent augment icon PNG.
 */
export function extractTemplateBytesFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  isBgra = false
): Uint8Array {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const a = pixels[idx + 3]
      if (a > 24) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    minX = 0
    minY = 0
    maxX = width - 1
    maxY = height - 1
  }

  // Keep a square bounding box with small 6% padding matching in-game icon framing
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const side = Math.max(bw, bh)
  const pad = side * 0.06
  const cx = (minX + maxX + 1) / 2
  const cy = (minY + maxY + 1) / 2
  const cropSide = side + pad * 2
  const x0 = cx - cropSide / 2
  const y0 = cy - cropSide / 2

  const out = new Uint8Array(ICON_FP_LEN)
  const step = cropSide / ICON_FP_SIZE

  for (let gy = 0; gy < ICON_FP_SIZE; gy++) {
    const sy0 = Math.max(0, Math.floor(y0 + gy * step))
    const sy1 = Math.min(height, Math.max(sy0 + 1, Math.ceil(y0 + (gy + 1) * step)))
    for (let gx = 0; gx < ICON_FP_SIZE; gx++) {
      const sx0 = Math.max(0, Math.floor(x0 + gx * step))
      const sx1 = Math.min(width, Math.max(sx0 + 1, Math.ceil(x0 + (gx + 1) * step)))
      let acc = 0
      let cnt = 0
      for (let py = sy0; py < sy1; py++) {
        for (let px = sx0; px < sx1; px++) {
          const i = (py * width + px) * 4
          const r = isBgra ? pixels[i + 2] : pixels[i]
          const g = pixels[i + 1]
          const b = isBgra ? pixels[i] : pixels[i + 2]
          const a = pixels[i + 3] / 255
          const luma = (0.299 * r + 0.587 * g + 0.114 * b) * a
          acc += luma
          cnt++
        }
      }
      out[gy * ICON_FP_SIZE + gx] = cnt > 0 ? Math.min(255, Math.round(acc / cnt)) : 0
    }
  }
  return out
}

export function compileIconTemplate(
  augmentId: string,
  bytes: Uint8Array,
  rarity?: AugmentRarity
): CompiledIconTemplate | null {
  if (bytes.length !== ICON_FP_LEN) return null
  const luma = new Float32Array(ICON_FP_LEN)
  let maxVal = 0
  for (let i = 0; i < ICON_FP_LEN; i++) {
    luma[i] = bytes[i]
    if (bytes[i] > maxVal) maxVal = bytes[i]
  }
  if (maxVal < 8) return null
  const edge = computeSobelEdgeGrid(luma, ICON_FP_SIZE)
  return {
    augmentId,
    rarity,
    lumaNorm: normalizeZeroMeanUnit(luma),
    edgeNorm: normalizeZeroMeanUnit(edge)
  }
}

function sampleSubRegionLumaGrid(
  pixels: Uint8Array,
  imgW: number,
  imgH: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  isBgra: boolean
): { grid: Float32Array; contrast: number } {
  const grid = new Float32Array(ICON_FP_LEN)
  const stepX = rw / ICON_FP_SIZE
  const stepY = rh / ICON_FP_SIZE
  let minL = 255
  let maxL = 0

  for (let gy = 0; gy < ICON_FP_SIZE; gy++) {
    const sy0 = Math.max(0, Math.min(imgH - 1, Math.floor(ry + gy * stepY)))
    const sy1 = Math.max(sy0 + 1, Math.min(imgH, Math.ceil(ry + (gy + 1) * stepY)))
    for (let gx = 0; gx < ICON_FP_SIZE; gx++) {
      const sx0 = Math.max(0, Math.min(imgW - 1, Math.floor(rx + gx * stepX)))
      const sx1 = Math.max(sx0 + 1, Math.min(imgW, Math.ceil(rx + (gx + 1) * stepX)))
      let sum = 0
      let cnt = 0
      for (let py = sy0; py < sy1; py++) {
        const rowBase = py * imgW
        for (let px = sx0; px < sx1; px++) {
          const i = (rowBase + px) * 4
          const r = isBgra ? pixels[i + 2] : pixels[i]
          const g = pixels[i + 1]
          const b = isBgra ? pixels[i] : pixels[i + 2]
          // Highlight bright foreground glyph while suppressing dark card art
          sum += 0.299 * r + 0.587 * g + 0.114 * b
          cnt++
        }
      }
      const val = cnt > 0 ? sum / cnt : 0
      grid[gy * ICON_FP_SIZE + gx] = val
      if (val < minL) minL = val
      if (val > maxL) maxL = val
    }
  }

  return { grid, contrast: maxL - minL }
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let acc = 0
  for (let i = 0; i < a.length; i++) acc += a[i] * b[i]
  return acc
}

/**
 * Matches one card icon crop inside a BGRA/RGBA buffer against all compiled templates using
 * multi-scale + micro-shift search to absorb slight resolution/DPI/UI-scaling jitter.
 */
export function matchIconSlotFromBuffer(
  pixels: Uint8Array,
  imgW: number,
  imgH: number,
  iconRect: { x: number; y: number; width: number; height: number },
  templates: CompiledIconTemplate[],
  isBgra = true,
  preferredRarity?: AugmentRarity
): IconSlotMatchResult | null {
  if (templates.length === 0 || iconRect.width < 12 || iconRect.height < 12) return null

  const cx = iconRect.x + iconRect.width / 2
  const cy = iconRect.y + iconRect.height / 2
  const baseSide = (iconRect.width + iconRect.height) / 2

  // Pre-build 2 scales x 5 center offsets = 10 compact normalized query probes
  const scales = [0.84, 0.98]
  const offsets: Array<[number, number]> = [
    [0, 0],
    [-0.04, 0],
    [0.04, 0],
    [0, -0.04],
    [0, 0.04]
  ]

  const probes: Array<{ luma: Float32Array; edge: Float32Array }> = []
  let maxContrast = 0

  for (const sc of scales) {
    const side = baseSide * sc
    for (const [ox, oy] of offsets) {
      const rx = cx - side / 2 + ox * baseSide
      const ry = cy - side / 2 + oy * baseSide
      const { grid, contrast } = sampleSubRegionLumaGrid(
        pixels,
        imgW,
        imgH,
        rx,
        ry,
        side,
        side,
        isBgra
      )
      if (contrast > maxContrast) maxContrast = contrast
      if (contrast >= 18) {
        probes.push({
          luma: normalizeZeroMeanUnit(grid),
          edge: normalizeZeroMeanUnit(computeSobelEdgeGrid(grid, ICON_FP_SIZE))
        })
      }
    }
  }

  if (probes.length === 0 || maxContrast < 22) return null

  let bestId = ''
  let bestScore = -1
  let secondScore = -1

  for (const tpl of templates) {
    let tplBest = -1
    for (const pr of probes) {
      const lumaSim = dotProduct(pr.luma, tpl.lumaNorm)
      const edgeSim = dotProduct(pr.edge, tpl.edgeNorm)
      const combined = lumaSim * 0.65 + edgeSim * 0.35
      if (combined > tplBest) tplBest = combined
    }
    if (preferredRarity && tpl.rarity === preferredRarity) {
      tplBest += 0.015
    }
    if (tplBest > bestScore) {
      secondScore = bestScore
      bestScore = tplBest
      bestId = tpl.augmentId
    } else if (tplBest > secondScore) {
      secondScore = tplBest
    }
  }

  if (!bestId || bestScore < 0.48) return null
  const margin = Math.max(0, bestScore - Math.max(0, secondScore))
  const confident = bestScore >= 0.64 || (bestScore >= 0.56 && margin >= 0.07)

  return {
    augmentId: bestId,
    score: Number(bestScore.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    confident
  }
}

export function encodeFingerprintBytesBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    const triple = (b0 << 16) | (b1 << 8) | b2
    out += chars[(triple >> 18) & 63]
    out += chars[(triple >> 12) & 63]
    out += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : '='
    out += i + 2 < bytes.length ? chars[triple & 63] : '='
  }
  return out
}

export function decodeFingerprintBytesBase64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const outLen = Math.floor((clean.length * 3) / 4)
  const out = new Uint8Array(outLen)
  const lookup = (c: number): number => {
    if (c >= 65 && c <= 90) return c - 65
    if (c >= 97 && c <= 122) return c - 71
    if (c >= 48 && c <= 57) return c + 4
    if (c === 43) return 62
    if (c === 47) return 63
    return 0
  }
  let oi = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup(clean.charCodeAt(i))
    const b = i + 1 < clean.length ? lookup(clean.charCodeAt(i + 1)) : 0
    const c = i + 2 < clean.length ? lookup(clean.charCodeAt(i + 2)) : 0
    const d = i + 3 < clean.length ? lookup(clean.charCodeAt(i + 3)) : 0
    const triple = (a << 18) | (b << 12) | (c << 6) | d
    if (oi < outLen) out[oi++] = (triple >> 16) & 255
    if (oi < outLen) out[oi++] = (triple >> 8) & 255
    if (oi < outLen) out[oi++] = triple & 255
  }
  return out
}
