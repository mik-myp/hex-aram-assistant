import { execFile } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app, desktopCapturer, nativeImage, screen } from 'electron'
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

const execFileAsync = promisify(execFile)

/**
 * Memory-Slimmed Dual-Engine OCR (`v0.3.2`):
 *  1. Primary on Windows 10/11: Built-in OS `Windows.Media.Ocr` (`zh-Hans-CN` / profile languages).
 *     Requires 0 MB bundled WASM heap in HexBuddy and finishes in ~40-90ms on the narrow title strip!
 *  2. Fallback (macOS or stripped netcafe Windows missing Chinese OCR pack): `tesseract.js` WASM.
 *  3. Auto-Hibernation ("用完即焚"): 15 seconds after the last OCR scan, any fallback WASM worker
 *     and temp strip file are automatically destroyed, returning OCR RAM strictly to 0.0 MB during combat!
 */

const OCR_IDLE_RELEASE_MS = 15_000

let ocrWorkerPromise: Promise<Worker> | null = null
let ocrIdleTimer: NodeJS.Timeout | null = null
let winNativeOcrSupported: boolean | null = null

const WINRT_OCR_SCRIPT = `
param([string]$ImgPath)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]

  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  })[0]

  function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
  }

  $lang = New-Object Windows.Globalization.Language("zh-Hans-CN")
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
  if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  }
  if ($null -eq $engine) {
    Write-Output "UNSUPPORTED"
    exit 0
  }

  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImgPath)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $stream.Dispose()

  $outWords = @()
  foreach ($line in $res.Lines) {
    foreach ($w in $line.Words) {
      $r = $w.BoundingRect
      $outWords += @{
        t = $w.Text
        x0 = [int]$r.X
        x1 = [int]($r.X + $r.Width)
      }
    }
  }
  $payload = @{
    ok = $true
    text = $res.Text
    words = $outWords
  }
  Write-Output ($payload | ConvertTo-Json -Compress -Depth 4)
} catch {
  Write-Output "ERROR"
}
`

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

interface ParsedOcrPass {
  matchedIds: string[]
  slotMap: Map<0 | 1 | 2, string>
  rawLines: string[]
  avgConf: number
}

function matchColumnsAndFallback(
  columnTexts: [string[], string[], string[]],
  rawLines: string[],
  augments: Record<string, AugmentMeta>
): ParsedOcrPass {
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
 * Zero-WASM-Memory Windows 10/11 Native WinRT OCR pass.
 * Returns `null` if running on non-Windows or if system Chinese OCR pack is unavailable.
 */
async function tryWindowsNativeOcrOnBuffer(
  pngBuf: Buffer,
  stripWidthHint: number,
  augments: Record<string, AugmentMeta>
): Promise<ParsedOcrPass | null> {
  if (process.platform !== 'win32' || winNativeOcrSupported === false) {
    return null
  }

  touchOcrIdleTimer()
  const tmpPath = join(app.getPath('temp'), 'hexbuddy-ocr-strip.png')
  try {
    await writeFile(tmpPath, pngBuf)
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        WINRT_OCR_SCRIPT,
        '-ImgPath',
        tmpPath
      ],
      { timeout: 3500, windowsHide: true }
    )
    const trimmed = stdout.trim()
    if (!trimmed || trimmed === 'UNSUPPORTED') {
      winNativeOcrSupported = false
      return null
    }
    if (trimmed === 'ERROR') {
      return null
    }

    const parsed = JSON.parse(trimmed) as {
      ok?: boolean
      text?: string
      words?: Array<{ t: string; x0: number; x1: number }>
    }
    if (!parsed.ok) return null
    winNativeOcrSupported = true

    const columnTexts: [string[], string[], string[]] = [[], [], []]
    const words = parsed.words || []
    if (words.length > 0) {
      const maxX = Math.max(stripWidthHint, ...words.map((w) => w.x1 || 0))
      const colJoin: [string[], string[], string[]] = [[], [], []]
      for (const wd of words) {
        if (!wd.t?.trim()) continue
        const cx = (wd.x0 + wd.x1) / 2 / Math.max(1, maxX)
        const col: 0 | 1 | 2 = cx < 0.34 ? 0 : cx > 0.66 ? 2 : 1
        colJoin[col].push(wd.t.trim())
      }
      for (const c of [0, 1, 2] as const) {
        if (colJoin[c].length > 0) columnTexts[c].push(colJoin[c].join(''))
      }
    }

    const rawLines = (parsed.text || '')
      .split(/[\r\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    return matchColumnsAndFallback(columnTexts, rawLines, augments)
  } catch {
    return null
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
  augments: Record<string, AugmentMeta>
): Promise<ParsedOcrPass> {
  const winPass = await tryWindowsNativeOcrOnBuffer(pngBuf, stripWidthHint, augments)
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
  augments: Record<string, AugmentMeta>
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

    // Pass 1: Narrow aspect-ratio aware Title-Strip crop (fast & 0% self-reading)
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
      passResult = await runBestAvailableOcrOnBuffer(stripped.toPNG(), stripWidth, augments)
    }

    // Pass 2: Fallback to full image (e.g. user uploaded a pre-cropped 3-card snippet)
    if (!passResult || passResult.matchedIds.length < 2) {
      const fullPng = !natImg.isEmpty() ? natImg.toPNG() : imgBuf
      const fullPass = await runBestAvailableOcrOnBuffer(fullPng, imgW, augments)
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
