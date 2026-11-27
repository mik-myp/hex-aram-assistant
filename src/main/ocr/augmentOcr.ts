import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app, desktopCapturer, nativeImage, screen } from 'electron'
import { createWorker, type Worker } from 'tesseract.js'
import {
  buildResolutionAwareCardSlots,
  clamp,
  computeGameAugmentCardBoxes,
  computeOcrTitleStripCropRect
} from '@shared/layoutGeometry'
import type {
  AugmentMeta,
  CardSlotAnchor,
  OcrEngineMode,
  OcrRecognizeResult,
  WindowBoundsRect
} from '@shared/types'
import {
  getWinNativeOcrSupportState,
  matchColumnsAndFallback,
  tryWindowsNativeOcrOnBuffer,
  type ParsedOcrPass
} from './winrtOcrAdapter'

const OCR_IDLE_RELEASE_MS = 15_000

let ocrWorkerPromise: Promise<Worker> | null = null
let ocrIdleTimer: NodeJS.Timeout | null = null
let lastOcrStatsSummary = '尚未触发选卡识屏'

export function getOcrDiagnosticStatus(preferredMode: OcrEngineMode = 'auto'): string {
  const mode =
    preferredMode === 'tesseract'
      ? '强制离线Tesseract(15s休眠)'
      : process.platform === 'win32'
        ? getWinNativeOcrSupportState() === false
          ? 'Tesseract兜底(15s休眠)'
          : 'Windows原生WinRT优先(0MB常驻)'
        : 'Tesseract离线(15s休眠)'
  return `${mode} | ${lastOcrStatsSummary}`
}

function touchOcrIdleTimer(): void {
  if (ocrIdleTimer) clearTimeout(ocrIdleTimer)
  ocrIdleTimer = setTimeout(() => {
    ocrIdleTimer = null
    terminateOcrWorker().catch(() => {})
  }, OCR_IDLE_RELEASE_MS)
}

async function getOcrWorker(): Promise<Worker> {
  touchOcrIdleTimer()
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
  if (typeof app?.getPath === 'function') {
    const tmpImg = join(app.getPath('temp'), 'hexbuddy-ocr-strip.png')
    await rm(tmpImg, { force: true }).catch(() => {})
  }
}

async function runTesseractPassOnBuffer(
  buf: Buffer,
  stripWidthHint: number,
  augments: Record<string, AugmentMeta>
): Promise<ParsedOcrPass> {
  const worker = await getOcrWorker()
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

  return matchColumnsAndFallback(columnTexts, rawLines, augments)
}

async function runBestAvailableOcrOnBuffer(
  pngBuf: Buffer,
  stripWidthHint: number,
  augments: Record<string, AugmentMeta>,
  engineMode: OcrEngineMode = 'auto'
): Promise<ParsedOcrPass> {
  if (engineMode === 'tesseract') {
    return runTesseractPassOnBuffer(pngBuf, stripWidthHint, augments)
  }
  const winPass = await tryWindowsNativeOcrOnBuffer(
    pngBuf,
    stripWidthHint,
    augments,
    touchOcrIdleTimer
  )
  if (winPass && winPass.matchedIds.length >= 2) {
    return winPass
  }
  const tessPass = await runTesseractPassOnBuffer(pngBuf, stripWidthHint, augments)
  if (winPass && winPass.matchedIds.length > tessPass.matchedIds.length) {
    return winPass
  }
  return tessPass
}

export async function recognizeAugmentsFromDataUrl(
  imageDataUrl: string,
  augments: Record<string, AugmentMeta>,
  engineMode: OcrEngineMode = 'auto'
): Promise<OcrRecognizeResult> {
  const start = Date.now()
  touchOcrIdleTimer()

  try {
    const base64Match = imageDataUrl.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/)
    const imgBuf = base64Match
      ? Buffer.from(base64Match[1], 'base64')
      : Buffer.from(imageDataUrl, 'base64')

    const natImg = nativeImage.createFromBuffer(imgBuf)
    const size = natImg.isEmpty() ? { width: 1920, height: 1080 } : natImg.getSize()
    const imgW = Math.max(320, size.width)
    const imgH = Math.max(240, size.height)

    let passResult: ParsedOcrPass | null = null

    if (!natImg.isEmpty() && imgW >= 800 && imgH >= 480) {
      const titleRect = computeOcrTitleStripCropRect(imgW, imgH)
      let stripped = natImg.crop(titleRect)
      let stripWidth = titleRect.width
      if (titleRect.height < 92) {
        const scale = 104 / Math.max(1, titleRect.height)
        stripWidth = Math.round(titleRect.width * scale)
        stripped = stripped.resize({
          width: stripWidth,
          height: 104,
          quality: 'best'
        })
      }
      passResult = await runBestAvailableOcrOnBuffer(
        stripped.toPNG(),
        stripWidth,
        augments,
        engineMode
      )
    }

    if (!passResult || passResult.matchedIds.length < 2) {
      const fullPng = !natImg.isEmpty() ? natImg.toPNG() : imgBuf
      const fullPass = await runBestAvailableOcrOnBuffer(fullPng, imgW, augments, engineMode)
      if (!passResult || fullPass.matchedIds.length >= passResult.matchedIds.length) {
        passResult = fullPass
      }
    }

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

    const elapsedMs = Date.now() - start
    lastOcrStatsSummary = `最近命中 ${passResult.matchedIds.length} 张 (${elapsedMs}ms, 图像 ${imgW}x${imgH})`

    return {
      success: passResult.matchedIds.length > 0,
      matchedAugmentIds: passResult.matchedIds,
      cardSlots,
      rawTexts: passResult.rawLines.slice(0, 8),
      confidence: passResult.avgConf,
      elapsedMs,
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

export async function captureScreenAndRecognizeAugments(
  augments: Record<string, AugmentMeta>,
  trackedGameDipBounds?: WindowBoundsRect,
  engineMode: OcrEngineMode = 'auto'
): Promise<OcrRecognizeResult> {
  const start = Date.now()
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 2560, height: 1440 }
    })

    const lolGameWin = sources.find(
      (s) =>
        s.id.startsWith('window:') &&
        /League of Legends \(TM\) Client|League of Legends/i.test(s.name) &&
        !/ClientUx/i.test(s.name) &&
        !s.thumbnail.isEmpty()
    )

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
      const thumbSize = gameImage.getSize()
      const clientAspect = trackedGameDipBounds.width / Math.max(1, trackedGameDipBounds.height)
      const thumbAspect = thumbSize.width / Math.max(1, thumbSize.height)
      if (thumbAspect < clientAspect - 0.02) {
        const expectedClientH = clamp(
          Math.round(thumbSize.width / clientAspect),
          240,
          thumbSize.height
        )
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

    return recognizeAugmentsFromDataUrl(gameImage.toDataURL(), augments, engineMode)
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
