import { desktopCapturer } from 'electron'
import { createWorker, type Worker } from 'tesseract.js'
import { matchAugmentsFromOcrText } from '@shared/pinyin'
import type { AugmentMeta, CardSlotAnchor, OcrRecognizeResult } from '@shared/types'

let ocrWorkerPromise: Promise<Worker> | null = null

const DEFAULT_SLOT_X_RATIOS: [number, number, number] = [0.285, 0.5, 0.715]
const DEFAULT_SLOT_Y_RATIO = 0.255

async function getOcrWorker(): Promise<Worker> {
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

export async function terminateOcrWorker(): Promise<void> {
  if (ocrWorkerPromise) {
    try {
      const w = await ocrWorkerPromise
      await w.terminate()
    } catch {
      // ignore
    }
    ocrWorkerPromise = null
  }
}

export async function recognizeAugmentsFromDataUrl(
  imageDataUrl: string,
  augments: Record<string, AugmentMeta>
): Promise<OcrRecognizeResult> {
  const start = Date.now()
  try {
    const base64Match = imageDataUrl.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/)
    const imgBuf = base64Match
      ? Buffer.from(base64Match[1], 'base64')
      : Buffer.from(imageDataUrl, 'base64')

    const worker = await getOcrWorker()
    const ret = await worker.recognize(imgBuf)
    const fullText = ret.data.text || ''
    const rawLines = fullText
      .split(/[\r\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    // Try column-based recognition from horizontal text splits first so Left/Center/Right card order is preserved!
    const columnTexts: [string[], string[], string[]] = [[], [], []]
    const blocks = (ret.data as unknown as {
      lines?: Array<{ text: string; bbox?: { x0: number; x1: number; y0: number; y1: number } }>
    }).lines

    if (Array.isArray(blocks) && blocks.length > 0) {
      const maxX = Math.max(1000, ...blocks.map((b) => b.bbox?.x1 || 0))
      for (const ln of blocks) {
        const parts = ln.text.split(/\s{2,}/).filter((p) => p.trim().length >= 2)
        if (parts.length === 3) {
          columnTexts[0].push(parts[0])
          columnTexts[1].push(parts[1])
          columnTexts[2].push(parts[2])
        } else if (ln.bbox) {
          const cx = (ln.bbox.x0 + ln.bbox.x1) / 2 / maxX
          const col: 0 | 1 | 2 = cx < 0.36 ? 0 : cx > 0.64 ? 2 : 1
          columnTexts[col].push(ln.text)
        }
      }
    }

    const cardSlots: CardSlotAnchor[] = []
    const matchedIds: string[] = []
    let confSum = 0

    for (const colIdx of [0, 1, 2] as const) {
      if (columnTexts[colIdx].length === 0) continue
      const colMatch = matchAugmentsFromOcrText(columnTexts[colIdx], augments, 1)
      const hitId = colMatch.matchedIds[0]
      if (hitId && !matchedIds.includes(hitId)) {
        matchedIds.push(hitId)
        confSum += colMatch.confidence
        cardSlots.push({
          slotIndex: colIdx,
          augmentId: hitId,
          xRatio: DEFAULT_SLOT_X_RATIOS[colIdx],
          yRatio: DEFAULT_SLOT_Y_RATIO
        })
      }
    }

    // Fallback to whole-image segment scan if column split missed
    if (matchedIds.length < 2) {
      const segments: string[] = [...rawLines]
      for (const line of rawLines) {
        const parts = line.split(/\s{2,}/).filter((p) => p.trim().length >= 2)
        if (parts.length > 1) segments.push(...parts)
      }
      const fallback = matchAugmentsFromOcrText(segments, augments, 3)
      matchedIds.length = 0
      cardSlots.length = 0
      fallback.matchedIds.forEach((id, idx) => {
        const slotIdx = (idx as 0 | 1 | 2)
        matchedIds.push(id)
        cardSlots.push({
          slotIndex: slotIdx,
          augmentId: id,
          xRatio: DEFAULT_SLOT_X_RATIOS[slotIdx],
          yRatio: DEFAULT_SLOT_Y_RATIO
        })
      })
      confSum = fallback.confidence * matchedIds.length
    }

    const avgConf = matchedIds.length > 0 ? Number((confSum / matchedIds.length).toFixed(3)) : 0

    return {
      success: matchedIds.length > 0,
      matchedAugmentIds: matchedIds,
      cardSlots,
      rawTexts: rawLines.slice(0, 8),
      confidence: avgConf,
      elapsedMs: Date.now() - start,
      error:
        matchedIds.length === 0
          ? '未检测到三选一海克斯卡片'
          : undefined
    }
  } catch (err) {
    return {
      success: false,
      matchedAugmentIds: [],
      cardSlots: [],
      rawTexts: [],
      confidence: 0,
      elapsedMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'OCR 识别异常'
    }
  }
}

export async function captureScreenAndRecognizeAugments(
  augments: Record<string, AugmentMeta>
): Promise<OcrRecognizeResult> {
  const start = Date.now()
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    })

    const lolWin = sources.find(
      (s) => /League of Legends|英雄联盟/i.test(s.name) && !s.thumbnail.isEmpty()
    )
    const primaryScreen = sources.find((s) => s.id.startsWith('screen:') && !s.thumbnail.isEmpty())
    const chosen = lolWin || primaryScreen

    if (!chosen || chosen.thumbnail.isEmpty()) {
      return {
        success: false,
        matchedAugmentIds: [],
        cardSlots: [],
        rawTexts: [],
        confidence: 0,
        elapsedMs: Date.now() - start,
        error: '未获取到屏幕画面（macOS 请开启屏幕录制权限，或使用 HUD 演练模式预览）'
      }
    }

    const size = chosen.thumbnail.getSize()
    const cropRect = {
      x: Math.round(size.width * 0.12),
      y: Math.round(size.height * 0.2),
      width: Math.round(size.width * 0.76),
      height: Math.round(size.height * 0.54)
    }
    const cropped = chosen.thumbnail.crop(cropRect)
    return recognizeAugmentsFromDataUrl(cropped.toDataURL(), augments)
  } catch (err) {
    return {
      success: false,
      matchedAugmentIds: [],
      cardSlots: [],
      rawTexts: [],
      confidence: 0,
      elapsedMs: Date.now() - start,
      error: err instanceof Error ? err.message : '屏幕捕获失败'
    }
  }
}
