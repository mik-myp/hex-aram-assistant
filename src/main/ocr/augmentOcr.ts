import { nativeImage, type NativeImage } from 'electron'
import {
  buildResolutionAwareCardSlots,
  computeGameAugmentCardBoxesForCount,
  computeOcrCardBandCropRect,
  computeOcrTitleStripCropRect
} from '@shared/layoutGeometry'
import type {
  AugmentMeta,
  AugmentOfferSlotIndex,
  CardSlotAnchor,
  OcrEngineMode,
  OcrRecognizeResult,
  WindowBoundsRect
} from '@shared/types'
import { getIconFingerprintCount } from './iconFingerprintStore'
import {
  mergeIconAndOcrPasses,
  runIconMatchOnCardBand,
  type IconBandMatchPass
} from './iconFusionPass'
import {
  computeBgraVisualSignature,
  hasVisualFrameChanged,
  runTesseractPassOnBuffer,
  terminateTesseractWorker,
  touchTesseractIdleTimer
} from './tesseractOcrAdapter'
import {
  captureDesktopFallbackImage,
  captureWin32RegionBgra,
  cropBgraSubRegion,
  isWin32FastCaptureAvailable
} from './win32ScreenCapture'
import {
  getWinNativeOcrSupportState,
  terminateWinrtOcrWorker,
  tryWindowsNativeOcrOnBuffer,
  type ParsedOcrPass
} from './winrtOcrAdapter'

let lastOcrStatsSummary = '尚未触发选卡识屏'
let lastAutoStripSig: Uint8Array | null = null

export interface CaptureOcrOptions {
  mode?: 'auto-poll' | 'manual'
  skipIfUnchanged?: boolean
  /** Raw physical pixels of the League game client area for zero-DPI-error Win32 BitBlt */
  trackedPhysicalBounds?: WindowBoundsRect
}

export interface ExtendedOcrResult extends OcrRecognizeResult {
  skippedUnchanged?: boolean
  visualChanged?: boolean
}

export function resetAutoOcrVisualCache(): void {
  lastAutoStripSig = null
}

export function getOcrDiagnosticStatus(preferredMode: OcrEngineMode = 'auto'): string {
  const fpCount = getIconFingerprintCount()
  const captureTag = isWin32FastCaptureAvailable() ? 'GDI局部抓屏' : '桌面抓屏'
  const ocrTag =
    preferredMode === 'tesseract'
      ? 'Tesseract'
      : process.platform === 'win32'
        ? getWinNativeOcrSupportState() === false
          ? 'Tesseract兜底'
          : 'WinRT常驻管道'
        : 'Tesseract'
  return `${captureTag} + 图标指纹(${fpCount}张) + ${ocrTag} | ${lastOcrStatsSummary}`
}

export async function terminateOcrWorker(): Promise<void> {
  lastAutoStripSig = null
  await terminateWinrtOcrWorker()
  await terminateTesseractWorker()
}

async function runBestAvailableOcrOnBuffer(
  pngBuf: Buffer,
  stripWidthHint: number,
  augments: Record<string, AugmentMeta>,
  engineMode: OcrEngineMode,
  isAutoPoll: boolean,
  geomHint?: { stripOriginX: number; stripScale: number; gameW: number; gameH: number }
): Promise<ParsedOcrPass> {
  if (engineMode === 'tesseract') {
    return runTesseractPassOnBuffer(pngBuf, stripWidthHint, augments, geomHint)
  }

  const winOutcome = await tryWindowsNativeOcrOnBuffer(
    pngBuf,
    stripWidthHint,
    augments,
    () => touchTesseractIdleTimer(),
    geomHint
  )

  if (winOutcome.status === 'ok' && winOutcome.pass) {
    if (isAutoPoll || winOutcome.pass.matchedIds.length >= 2) {
      return winOutcome.pass
    }
    const tessPass = await runTesseractPassOnBuffer(pngBuf, stripWidthHint, augments, geomHint)
    return winOutcome.pass.matchedIds.length >= tessPass.matchedIds.length
      ? winOutcome.pass
      : tessPass
  }

  if (winOutcome.status === 'error' && isAutoPoll) {
    return { matchedIds: [], slotMap: new Map(), rawLines: [], avgConf: 0 }
  }

  return runTesseractPassOnBuffer(pngBuf, stripWidthHint, augments, geomHint)
}

function buildResultFromPass(
  finalPass: ParsedOcrPass,
  gameW: number,
  gameH: number,
  startMs: number,
  channelTag: string,
  visualChanged: boolean,
  isAutoPoll: boolean
): ExtendedOcrResult {
  const totalSlots: 2 | 3 | 4 =
    finalPass.totalSlots ?? (finalPass.matchedIds.length >= 4 ? 4 : 3)
  const boxes = computeGameAugmentCardBoxesForCount(gameW, gameH, totalSlots)
  const cardSlots: CardSlotAnchor[] = []
  if (finalPass.slotMap.size > 0) {
    for (let i = 0; i < totalSlots; i++) {
      const colIdx = i as AugmentOfferSlotIndex
      const aid = finalPass.slotMap.get(colIdx)
      if (!aid) continue
      const box = boxes[colIdx]
      if (!box) continue
      cardSlots.push({
        slotIndex: colIdx,
        totalSlots,
        augmentId: aid,
        xRatio: Number(box.centerXRatio.toFixed(4)),
        yRatio: 0.208,
        cardWidthRatio: Number((box.cardFrame.width / gameW).toFixed(4))
      })
    }
  } else {
    cardSlots.push(...buildResolutionAwareCardSlots(finalPass.matchedIds, gameW, gameH, totalSlots))
  }

  const elapsedMs = Date.now() - startMs
  if (finalPass.matchedIds.length > 0 || !isAutoPoll) {
    lastOcrStatsSummary = `${channelTag}命中 ${finalPass.matchedIds.length} 张 (${elapsedMs}ms, ${gameW}x${gameH})`
  }

  return {
    success: finalPass.matchedIds.length > 0,
    visualChanged,
    matchedAugmentIds: finalPass.matchedIds,
    cardSlots,
    rawTexts: finalPass.rawLines.slice(0, 8),
    confidence: finalPass.avgConf,
    elapsedMs,
    error: finalPass.matchedIds.length === 0 ? '未检测到三选一海克斯卡片' : undefined
  }
}

/**
 * Dual-channel recognition on a cropped BGRA card band (Icons + Titles):
 * 1) <0.2ms visual signature gate skips unchanged frames
 * 2) ~3ms Icon ZNCC Fingerprint pass (zero OS OCR dependency, handles missing language packs!)
 * 3) On-demand OCR title strip fallback & per-slot fusion only when icon pass has < 3 confident hits
 */
async function recognizeFromCardBandBgra(params: {
  bandBgra: Buffer
  bandRect: WindowBoundsRect
  gameW: number
  gameH: number
  augments: Record<string, AugmentMeta>
  engineMode: OcrEngineMode
  isAutoPoll: boolean
  skipIfUnchanged: boolean
  startMs: number
  sourceTag: string
}): Promise<ExtendedOcrResult> {
  const {
    bandBgra,
    bandRect,
    gameW,
    gameH,
    augments,
    engineMode,
    isAutoPoll,
    skipIfUnchanged,
    startMs,
    sourceTag
  } = params

  let visualChanged = true
  if (isAutoPoll) {
    const { sig, contrastSpan } = computeBgraVisualSignature(bandBgra, bandRect.width, bandRect.height)
    visualChanged = hasVisualFrameChanged(lastAutoStripSig, sig)
    if (skipIfUnchanged && !visualChanged) {
      return {
        success: false,
        skippedUnchanged: true,
        visualChanged: false,
        matchedAugmentIds: [],
        cardSlots: [],
        rawTexts: [],
        confidence: 0,
        elapsedMs: Date.now() - startMs
      }
    }
    lastAutoStripSig = sig
    if (contrastSpan < 22) {
      return {
        success: false,
        visualChanged,
        matchedAugmentIds: [],
        cardSlots: [],
        rawTexts: [],
        confidence: 0,
        elapsedMs: Date.now() - startMs
      }
    }
  }

  // Primary channel: ~3ms illumination-invariant icon silhouette + edge ZNCC matching
  const iconPass: IconBandMatchPass = runIconMatchOnCardBand(
    bandBgra,
    bandRect.width,
    bandRect.height,
    bandRect.x,
    bandRect.y,
    gameW,
    gameH,
    augments,
    true
  )

  // Fast exit when all offered slots matched cleanly by icons (3/3 for 3-pick or 4/4 for 4-pick)
  const expectedFull = iconPass.totalSlots
  if (
    iconPass.confidentCount >= expectedFull ||
    (isAutoPoll && iconPass.confidentCount >= expectedFull - 1 && iconPass.avgScore >= 0.75)
  ) {
    const fused = mergeIconAndOcrPasses(iconPass, null)
    return buildResultFromPass(fused, gameW, gameH, startMs, `${sourceTag}图标秒识`, visualChanged, isAutoPoll)
  }

  // Secondary channel: run OCR on narrow title strip only if WinRT/Tesseract is needed
  // Note: during auto-poll on machines without WinRT zh-CN, avoid heavy Tesseract if icons found 0 cards
  const winrtUnavailable = process.platform === 'win32' && getWinNativeOcrSupportState() === false
  if (isAutoPoll && engineMode === 'auto' && winrtUnavailable && iconPass.matchedIds.length === 0) {
    const fused = mergeIconAndOcrPasses(iconPass, null)
    return buildResultFromPass(fused, gameW, gameH, startMs, `${sourceTag}图标`, visualChanged, isAutoPoll)
  }

  const titleRect = computeOcrTitleStripCropRect(gameW, gameH)
  const subTitle = cropBgraSubRegion(
    bandBgra,
    bandRect.width,
    bandRect.height,
    titleRect.x - bandRect.x,
    titleRect.y - bandRect.y,
    titleRect.width,
    titleRect.height
  )

  let ocrPass: ParsedOcrPass | null = null
  if (subTitle) {
    let stripImg = nativeImage.createFromBitmap(subTitle.bgra, {
      width: subTitle.width,
      height: subTitle.height
    })
    let stripWidth = subTitle.width
    let stripScale = 1
    if (subTitle.height < 92) {
      stripScale = 104 / Math.max(1, subTitle.height)
      stripWidth = Math.round(subTitle.width * stripScale)
      stripImg = stripImg.resize({ width: stripWidth, height: 104, quality: 'good' })
    }
    ocrPass = await runBestAvailableOcrOnBuffer(
      stripImg.toPNG(),
      stripWidth,
      augments,
      engineMode,
      isAutoPoll,
      { stripOriginX: titleRect.x, stripScale, gameW, gameH }
    )
  }

  const fused = mergeIconAndOcrPasses(iconPass, ocrPass)
  const tag =
    iconPass.confidentCount > 0 && (ocrPass?.matchedIds.length ?? 0) > 0
      ? `${sourceTag}图标+OCR融合`
      : iconPass.matchedIds.length > 0
        ? `${sourceTag}图标`
        : `${sourceTag}OCR`
  return buildResultFromPass(fused, gameW, gameH, startMs, tag, visualChanged, isAutoPoll)
}

async function recognizeAugmentsFromNativeImage(
  natImg: NativeImage,
  augments: Record<string, AugmentMeta>,
  engineMode: OcrEngineMode,
  options: CaptureOcrOptions = {}
): Promise<ExtendedOcrResult> {
  const start = Date.now()
  const isAutoPoll = options.mode === 'auto-poll'
  if (natImg.isEmpty()) {
    return {
      success: false,
      matchedAugmentIds: [],
      cardSlots: [],
      rawTexts: [],
      confidence: 0,
      elapsedMs: Date.now() - start,
      error: '画面图像为空'
    }
  }

  const size = natImg.getSize()
  const imgW = Math.max(320, size.width)
  const imgH = Math.max(240, size.height)

  if (imgW >= 800 && imgH >= 480) {
    const bandRect = computeOcrCardBandCropRect(imgW, imgH)
    const bandImg = natImg.crop(bandRect)
    const bandResult = await recognizeFromCardBandBgra({
      bandBgra: bandImg.toBitmap(),
      bandRect,
      gameW: imgW,
      gameH: imgH,
      augments,
      engineMode,
      isAutoPoll,
      skipIfUnchanged: Boolean(options.skipIfUnchanged),
      startMs: start,
      sourceTag: ''
    })
    if (bandResult.skippedUnchanged || isAutoPoll || bandResult.matchedAugmentIds.length >= 2) {
      return bandResult
    }
  }

  // Manual full-frame fallback (e.g. custom cropped screenshots imported in simulator)
  const fullPass = await runBestAvailableOcrOnBuffer(natImg.toPNG(), imgW, augments, engineMode, false)
  return buildResultFromPass(fullPass, imgW, imgH, start, '全图OCR', true, false)
}

export async function recognizeAugmentsFromDataUrl(
  imageDataUrl: string,
  augments: Record<string, AugmentMeta>,
  engineMode: OcrEngineMode = 'auto'
): Promise<OcrRecognizeResult> {
  const start = Date.now()
  touchTesseractIdleTimer()
  try {
    const base64Match = imageDataUrl.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/)
    const imgBuf = base64Match
      ? Buffer.from(base64Match[1], 'base64')
      : Buffer.from(imageDataUrl, 'base64')
    return await recognizeAugmentsFromNativeImage(
      nativeImage.createFromBuffer(imgBuf),
      augments,
      engineMode,
      { mode: 'manual' }
    )
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
  engineMode: OcrEngineMode = 'auto',
  options: CaptureOcrOptions = {}
): Promise<ExtendedOcrResult> {
  const start = Date.now()
  const isAutoPoll = options.mode === 'auto-poll'

  try {
    // Fast Path (Windows): Win32 BitBlt captures ONLY the ~11% card band in physical pixels (~2ms!)
    const phys = options.trackedPhysicalBounds
    if (process.platform === 'win32' && phys && phys.width >= 800 && phys.height >= 480) {
      const bandRect = computeOcrCardBandCropRect(phys.width, phys.height)
      const captured = captureWin32RegionBgra({
        x: phys.x + bandRect.x,
        y: phys.y + bandRect.y,
        width: bandRect.width,
        height: bandRect.height
      })
      if (captured) {
        return await recognizeFromCardBandBgra({
          bandBgra: captured.bgra,
          bandRect,
          gameW: phys.width,
          gameH: phys.height,
          augments,
          engineMode,
          isAutoPoll,
          skipIfUnchanged: Boolean(options.skipIfUnchanged),
          startMs: start,
          sourceTag: 'GDI·'
        })
      }
    }

    // Fallback Path: desktopCapturer (macOS, exclusive fullscreen fallback, or untracked window)
    const gameImage = await captureDesktopFallbackImage(trackedGameDipBounds, isAutoPoll)
    if (!gameImage) {
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

    return await recognizeAugmentsFromNativeImage(gameImage, augments, engineMode, options)
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
