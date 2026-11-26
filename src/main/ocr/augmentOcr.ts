import { desktopCapturer } from 'electron'
import { createWorker, type Worker } from 'tesseract.js'
import { matchAugmentsFromOcrText } from '@shared/pinyin'
import type { AugmentMeta, OcrRecognizeResult } from '@shared/types'

let ocrWorkerPromise: Promise<Worker> | null = null

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('chi_sim', 1, {
      langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_sim/4.0.0_best_int',
      logger: () => {
        // quiet worker progress
      }
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

    // Also split horizontal multi-card single lines by wide spaces
    const segments: string[] = [...rawLines]
    for (const line of rawLines) {
      const parts = line.split(/\s{2,}/).filter((p) => p.trim().length >= 2)
      if (parts.length > 1) segments.push(...parts)
    }

    const { matchedIds, confidence } = matchAugmentsFromOcrText(segments, augments, 3)

    return {
      success: matchedIds.length > 0,
      matchedAugmentIds: matchedIds,
      rawTexts: rawLines.slice(0, 8),
      confidence,
      elapsedMs: Date.now() - start,
      error:
        matchedIds.length === 0
          ? '未能从画面中匹配到海克斯强化卡名称，请确认三选一界面未遮挡或使用拼音首字母速查'
          : undefined
    }
  } catch (err) {
    return {
      success: false,
      matchedAugmentIds: [],
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

    const lolWin = sources.find((s) =>
      /League of Legends|英雄联盟/i.test(s.name) && !s.thumbnail.isEmpty()
    )
    const primaryScreen = sources.find((s) => s.id.startsWith('screen:') && !s.thumbnail.isEmpty())
    const chosen = lolWin || primaryScreen

    if (!chosen || chosen.thumbnail.isEmpty()) {
      return {
        success: false,
        matchedAugmentIds: [],
        rawTexts: [],
        confidence: 0,
        elapsedMs: Date.now() - start,
        error:
          '未获取到屏幕画面（macOS 请在「系统设置 -> 隐私与安全性 -> 屏幕录制」授权，或点击模拟测试卡面 / 用拼音首字母秒搜）'
      }
    }

    const size = chosen.thumbnail.getSize()
    // Crop central band where the 3 Hextech Augment cards sit to speed up OCR 3x and reduce chat/HUD noise
    const cropRect = {
      x: Math.round(size.width * 0.12),
      y: Math.round(size.height * 0.2),
      width: Math.round(size.width * 0.76),
      height: Math.round(size.height * 0.56)
    }
    const cropped = chosen.thumbnail.crop(cropRect)
    const dataUrl = cropped.toDataURL()
    return recognizeAugmentsFromDataUrl(dataUrl, augments)
  } catch (err) {
    return {
      success: false,
      matchedAugmentIds: [],
      rawTexts: [],
      confidence: 0,
      elapsedMs: Date.now() - start,
      error: err instanceof Error ? err.message : '屏幕捕获失败'
    }
  }
}
