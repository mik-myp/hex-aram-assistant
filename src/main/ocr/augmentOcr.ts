import { desktopCapturer, nativeImage, screen } from 'electron'
import { createWorker, type Worker } from 'tesseract.js'
import {
  buildResolutionAwareCardSlots,
  clamp,
  computeGameAugmentCardBoxes,
  computeOcrTitleStripCropRect
} from '@shared/layoutGeometry'
import { matchAugmentsFromOcrText } from '@shared/pinyin'
import type {
  AugmentMeta,
  CardSlotAnchor,
  OcrRecognizeResult,
  WindowBoundsRect
} from '@shared/types'

let ocrWorkerPromise: Promise<Worker> | null = null

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

interface ParsedOcrPass {
  matchedIds: string[]
  slotMap: Map<0 | 1 | 2, string>
  rawLines: string[]
  avgConf: number
}

async function runOcrPassOnBuffer(
  worker: Worker,
  buf: Buffer,
  stripWidthHint: number,
  augments: Record<string, AugmentMeta>
): Promise<ParsedOcrPass> {
  const ret = await worker.recognize(buf)
  const fullText = ret.data.text || ''
  const rawLines = fullText
    .split(/[\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const columnTexts: [string[], string[], string[]] = [[], [], []]
  const dataObj = ret.data as unknown as {
    words?: Array<{ text: string; bbox?: { x0: number; x1: number; y0: number; y1: number } }>
    lines?: Array<{ text: string; bbox?: { x0: number; x1: number; y0: number; y1: number } }>
  }

  // Group words per column first when bounding boxes are available (super reliable on narrow title strip!)
  if (Array.isArray(dataObj.words) && dataObj.words.length > 0) {
    const maxX = Math.max(stripWidthHint, ...dataObj.words.map((w) => w.bbox?.x1 || 0))
    const colWordJoin: [string[], string[], string[]] = [[], [], []]
    for (const wd of dataObj.words) {
      if (!wd.text?.trim() || !wd.bbox) continue
      const cx = (wd.bbox.x0 + wd.bbox.x1) / 2 / Math.max(1, maxX)
      const col: 0 | 1 | 2 = cx < 0.34 ? 0 : cx > 0.66 ? 2 : 1
      colWordJoin[col].push(wd.text.trim())
    }
    for (const c of [0, 1, 2] as const) {
      if (colWordJoin[c].length > 0) {
        columnTexts[c].push(colWordJoin[c].join(''))
      }
    }
  }

  if (Array.isArray(dataObj.lines) && dataObj.lines.length > 0) {
    const maxX = Math.max(stripWidthHint, ...dataObj.lines.map((b) => b.bbox?.x1 || 0))
    for (const ln of dataObj.lines) {
      const parts = ln.text.split(/\s{2,}/).filter((p) => p.trim().length >= 2)
      if (parts.length === 3) {
        columnTexts[0].push(parts[0])
        columnTexts[1].push(parts[1])
        columnTexts[2].push(parts[2])
      } else if (ln.bbox) {
        const cx = (ln.bbox.x0 + ln.bbox.x1) / 2 / Math.max(1, maxX)
        const col: 0 | 1 | 2 = cx < 0.35 ? 0 : cx > 0.65 ? 2 : 1
        columnTexts[col].push(ln.text)
      }
    }
  }

  const slotMap = new Map<0 | 1 | 2, string>()
  const matchedIds: string[] = []
  let confSum = 0

  for (const colIdx of [0, 1, 2] as const) {
    if (columnTexts[colIdx].length === 0) continue
    const colMatch = matchAugmentsFromOcrText(columnTexts[colIdx], augments, 1)
    const hitId = colMatch.matchedIds[0]
    if (hitId && !matchedIds.includes(hitId)) {
      matchedIds.push(hitId)
      slotMap.set(colIdx, hitId)
      confSum += colMatch.confidence
    }
  }

  if (matchedIds.length < 2) {
    const segments: string[] = [...rawLines]
    for (const line of rawLines) {
      const parts = line.split(/\s{2,}/).filter((p) => p.trim().length >= 2)
      if (parts.length > 1) segments.push(...parts)
    }
    const fallback = matchAugmentsFromOcrText(segments, augments, 3)
    if (fallback.matchedIds.length > matchedIds.length) {
      matchedIds.length = 0
      slotMap.clear()
      fallback.matchedIds.forEach((id, idx) => {
        const slotIdx = idx as 0 | 1 | 2
        matchedIds.push(id)
        slotMap.set(slotIdx, id)
      })
      confSum = fallback.confidence * matchedIds.length
    }
  }

  const avgConf = matchedIds.length > 0 ? Number((confSum / matchedIds.length).toFixed(3)) : 0
  return { matchedIds, slotMap, rawLines, avgConf }
}

/**
 * Recognizes 3-pick Hextech Augment cards from ANY full-game screenshot or cropped card image.
 *
 * Multi-resolution & Anti-Self-Reading guarantees:
 *  - Inspects true `(imgW, imgH)` via nativeImage (supports 720p, 1080p, 2K, 4K, 16:10, 21:9, 32:9).
 *  - Pass 1 crops ONLY the narrow height-scaled Card Title Strip (`0.372*H .. 0.448*H`), which:
 *      1) Never overlaps HexBuddy's own HUD badges (`<= 0.208*H` or `>= 0.742*H`) during live Reroll rescans!
 *      2) Strips ultrawide 21:9 peripheral pixels so Left/Center/Right columns are always 1/3 each!
 *      3) Upscales small 720p title strips for sharp Chinese OCR accuracy!
 *  - Pass 2 falls back to full image if user uploaded an already-cropped partial screenshot.
 */
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
    const natImg = nativeImage.createFromBuffer(imgBuf)
    const size = natImg.isEmpty() ? { width: 1920, height: 1080 } : natImg.getSize()
    const imgW = Math.max(320, size.width)
    const imgH = Math.max(240, size.height)

    let passResult: ParsedOcrPass | null = null

    // Pass 1: Narrow aspect-ratio aware Title-Strip crop (when input looks like a full game/window frame)
    if (!natImg.isEmpty() && imgW >= 800 && imgH >= 480) {
      const titleRect = computeOcrTitleStripCropRect(imgW, imgH)
      let stripped = natImg.crop(titleRect)
      let stripWidth = titleRect.width
      // Upscale low-res (e.g. 1280×720) title strips so Tesseract reads small Chinese glyphs cleanly
      if (titleRect.height < 92) {
        const scale = 104 / Math.max(1, titleRect.height)
        stripWidth = Math.round(titleRect.width * scale)
        stripped = stripped.resize({
          width: stripWidth,
          height: 104,
          quality: 'best'
        })
      }
      passResult = await runOcrPassOnBuffer(worker, stripped.toPNG(), stripWidth, augments)
    }

    // Pass 2: Fallback to full image (e.g. user uploaded a pre-cropped 3-card snippet)
    if (!passResult || passResult.matchedIds.length < 2) {
      const fullPass = await runOcrPassOnBuffer(worker, imgBuf, imgW, augments)
      if (!passResult || fullPass.matchedIds.length >= passResult.matchedIds.length) {
        passResult = fullPass
      }
    }

    // Build aspect-ratio accurate CardSlotAnchor[] for `(imgW, imgH)`
    const boxes = computeGameAugmentCardBoxes(imgW, imgH)
    const cardSlots: CardSlotAnchor[] = []
    if (passResult.slotMap.size > 0) {
      for (const colIdx of [0, 1, 2] as const) {
        const aid = passResult.slotMap.get(colIdx)
        if (!aid) continue
        const box = boxes[colIdx]
        cardSlots.push({
          slotIndex: colIdx,
          augmentId: aid,
          xRatio: Number(box.centerXRatio.toFixed(4)),
          yRatio: 0.208,
          cardWidthRatio: Number((box.cardFrame.width / imgW).toFixed(4))
        })
      }
    } else {
      cardSlots.push(...buildResolutionAwareCardSlots(passResult.matchedIds, imgW, imgH))
    }

    return {
      success: passResult.matchedIds.length > 0,
      matchedAugmentIds: passResult.matchedIds,
      cardSlots,
      rawTexts: passResult.rawLines.slice(0, 8),
      confidence: passResult.avgConf,
      elapsedMs: Date.now() - start,
      error: passResult.matchedIds.length === 0 ? '未检测到三选一海克斯卡片' : undefined
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

/**
 * Captures the active League of Legends client canvas across Borderless, Windowed, Multi-Monitor,
 * and Ultrawide setups, then runs narrow title-strip OCR.
 */
export async function captureScreenAndRecognizeAugments(
  augments: Record<string, AugmentMeta>,
  trackedGameDipBounds?: WindowBoundsRect
): Promise<OcrRecognizeResult> {
  const start = Date.now()
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 2560, height: 1440 }
    })

    // Prefer in-game window ("League of Legends (TM) Client"), NOT "League of Legends" client launcher
    const lolGameWin = sources.find(
      (s) =>
        s.id.startsWith('window:') &&
        /League of Legends \(TM\) Client|League of Legends/i.test(s.name) &&
        !/ClientUx/i.test(s.name) &&
        !s.thumbnail.isEmpty()
    )

    // Find the display containing trackedGameDipBounds (supports multi-monitor setups!)
    let targetDisplay = screen.getPrimaryDisplay()
    if (trackedGameDipBounds) {
      targetDisplay = screen.getDisplayMatching(trackedGameDipBounds)
    }
    const matchingScreen =
      sources.find(
        (s) =>
          s.id.startsWith('screen:') &&
          s.display_id === String(targetDisplay.id) &&
          !s.thumbnail.isEmpty()
      ) || sources.find((s) => s.id.startsWith('screen:') && !s.thumbnail.isEmpty())

    const chosen = lolGameWin || matchingScreen
    if (!chosen || chosen.thumbnail.isEmpty()) {
      return {
        success: false,
        matchedAugmentIds: [],
        cardSlots: [],
        rawTexts: [],
        confidence: 0,
        elapsedMs: Date.now() - start,
        error: '未获取到屏幕画面（macOS 请开启屏幕录制权限，或使用原位 HUD 演练场导入截图验证）'
      }
    }

    let gameImage = chosen.thumbnail

    // If we captured a full desktop screen while LoL is running in Windowed mode at `trackedGameDipBounds`,
    // crop the desktop screenshot down to LoL's exact inner client area first!
    if (chosen.id.startsWith('screen:') && trackedGameDipBounds) {
      const disp = targetDisplay.bounds
      const thumbSize = gameImage.getSize()
      const sx = thumbSize.width / Math.max(1, disp.width)
      const sy = thumbSize.height / Math.max(1, disp.height)
      const cx = clamp(Math.round((trackedGameDipBounds.x - disp.x) * sx), 0, thumbSize.width - 64)
      const cy = clamp(Math.round((trackedGameDipBounds.y - disp.y) * sy), 0, thumbSize.height - 64)
      const cw = clamp(Math.round(trackedGameDipBounds.width * sx), 64, thumbSize.width - cx)
      const ch = clamp(Math.round(trackedGameDipBounds.height * sy), 64, thumbSize.height - cy)
      if (cw >= 480 && ch >= 300) {
        gameImage = gameImage.crop({ x: cx, y: cy, width: cw, height: ch })
      }
    } else if (chosen.id.startsWith('window:') && trackedGameDipBounds) {
      // If Windowed-mode `window:` thumbnail includes a top Win32 title bar (~32px), align to bottom client ratio!
      const thumbSize = gameImage.getSize()
      const clientAspect = trackedGameDipBounds.width / Math.max(1, trackedGameDipBounds.height)
      const thumbAspect = thumbSize.width / Math.max(1, thumbSize.height)
      if (thumbAspect < clientAspect - 0.02) {
        const expectedClientH = clamp(Math.round(thumbSize.width / clientAspect), 240, thumbSize.height)
        const titleBarOffset = thumbSize.height - expectedClientH
        if (titleBarOffset > 4 && titleBarOffset < 80) {
          gameImage = gameImage.crop({
            x: 0,
            y: titleBarOffset,
            width: thumbSize.width,
            height: expectedClientH
          })
        }
      }
    }

    return recognizeAugmentsFromDataUrl(gameImage.toDataURL(), augments)
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
