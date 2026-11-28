import type { NativeImage } from 'electron'
import { createWorker, type Worker } from 'tesseract.js'
import type { AugmentMeta } from '@shared/types'
import { matchWordsAdaptiveColumns, type ParsedOcrPass } from './winrtOcrAdapter'

const OCR_IDLE_RELEASE_MS = 18_000

let ocrWorkerPromise: Promise<Worker> | null = null
let ocrIdleTimer: NodeJS.Timeout | null = null

export function touchTesseractIdleTimer(onIdle?: () => void): void {
  if (ocrIdleTimer) clearTimeout(ocrIdleTimer)
  ocrIdleTimer = setTimeout(() => {
    ocrIdleTimer = null
    terminateTesseractWorker().catch(() => {})
    onIdle?.()
  }, OCR_IDLE_RELEASE_MS)
}

async function getOcrWorker(): Promise<Worker> {
  touchTesseractIdleTimer()
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('chi_sim', 1, {
      langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_sim/4.0.0_best_int',
      logger: () => {}
    }).catch((err) => {
      ocrWorkerPromise = null
      throw err
    })
  }
  return ocrWorkerPromise
}

export async function terminateTesseractWorker(): Promise<void> {
  if (ocrIdleTimer) {
    clearTimeout(ocrIdleTimer)
    ocrIdleTimer = null
  }
  if (ocrWorkerPromise) {
    const p = ocrWorkerPromise
    ocrWorkerPromise = null
    try {
      const w = await p
      await w.terminate()
    } catch {
      // ignore
    }
  }
}

export function computeStripVisualSignature(stripImg: NativeImage): {
  sig: Uint8Array
  contrastSpan: number
} {
  const tiny = stripImg.resize({ width: 24, height: 6, quality: 'good' })
  const bmp = tiny.toBitmap()
  const pixelCount = Math.min(24 * 6, Math.floor(bmp.length / 4))
  const sig = new Uint8Array(pixelCount)
  let minL = 255
  let maxL = 0
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4
    const luma = (bmp[base] * 114 + bmp[base + 1] * 587 + bmp[base + 2] * 299) / 1000
    const v = Math.round(luma)
    sig[i] = v
    if (v < minL) minL = v
    if (v > maxL) maxL = v
  }
  return { sig, contrastSpan: maxL - minL }
}

export function computeSignatureDiff(a: Uint8Array | null, b: Uint8Array): number {
  if (!a || a.length !== b.length || a.length === 0) return 255
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i])
  }
  return sum / a.length
}

/**
 * Local-peak + mean frame change gate (ref: aramhex `fp_changed`):
 * When a player rerolls only 1 out of 3/4 cards, the whole-strip mean barely moves (~2-3),
 * so checking max cell delta (>24) guarantees single-card rerolls are never missed!
 */
export function hasVisualFrameChanged(a: Uint8Array | null, b: Uint8Array): boolean {
  if (!a || a.length !== b.length || a.length === 0) return true
  let sum = 0
  let maxDiff = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    sum += d
    if (d > maxDiff) maxDiff = d
  }
  return maxDiff > 24 || sum / a.length > 3.5
}

/**
 * Direct BGRA buffer visual signature (<0.15ms, zero NativeImage allocation).
 */
export function computeBgraVisualSignature(
  bgra: Uint8Array,
  imgW: number,
  imgH: number
): { sig: Uint8Array; contrastSpan: number } {
  const gw = 24
  const gh = 6
  const sig = new Uint8Array(gw * gh)
  let minL = 255
  let maxL = 0
  const stepX = imgW / gw
  const stepY = imgH / gh

  for (let gy = 0; gy < gh; gy++) {
    const py = Math.min(imgH - 1, Math.floor((gy + 0.5) * stepY))
    const rowOff = py * imgW
    for (let gx = 0; gx < gw; gx++) {
      const px = Math.min(imgW - 1, Math.floor((gx + 0.5) * stepX))
      const i = (rowOff + px) * 4
      const v = Math.round((bgra[i] * 114 + bgra[i + 1] * 587 + bgra[i + 2] * 299) / 1000)
      sig[gy * gw + gx] = v
      if (v < minL) minL = v
      if (v > maxL) maxL = v
    }
  }
  return { sig, contrastSpan: maxL - minL }
}

export async function runTesseractPassOnBuffer(
  buf: Buffer,
  stripWidthHint: number,
  augments: Record<string, AugmentMeta>,
  geomHint?: { stripOriginX: number; stripScale: number; gameW: number; gameH: number }
): Promise<ParsedOcrPass> {
  const worker = await getOcrWorker()
  const ret = await worker.recognize(buf)
  const fullText = ret.data.text || ''
  const rawLines = fullText
    .split(/[\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const dataObj = ret.data as unknown as {
    words?: Array<{ text: string; bbox?: { x0: number; x1: number; y0: number; y1: number } }>
  }
  const normWords = Array.isArray(dataObj.words)
    ? dataObj.words
        .filter((w) => Boolean(w.text?.trim() && w.bbox))
        .map((w) => ({ t: w.text.trim(), x0: w.bbox!.x0, x1: w.bbox!.x1 }))
    : []

  return matchWordsAdaptiveColumns(normWords, stripWidthHint, rawLines, augments, geomHint)
}
