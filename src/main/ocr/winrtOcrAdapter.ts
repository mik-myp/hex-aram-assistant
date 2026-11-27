import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { matchAugmentsFromOcrText } from '@shared/pinyin'
import type { AugmentMeta } from '@shared/types'

const execFileAsync = promisify(execFile)

export interface ParsedOcrPass {
  matchedIds: string[]
  slotMap: Map<0 | 1 | 2, string>
  rawLines: string[]
  avgConf: number
}

let winNativeOcrSupported: boolean | null = null

export function getWinNativeOcrSupportState(): boolean | null {
  return winNativeOcrSupported
}

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

export function matchColumnsAndFallback(
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

export async function tryWindowsNativeOcrOnBuffer(
  pngBuf: Buffer,
  stripWidthHint: number,
  augments: Record<string, AugmentMeta>,
  onActivity?: () => void
): Promise<ParsedOcrPass | null> {
  if (process.platform !== 'win32' || winNativeOcrSupported === false) {
    return null
  }

  onActivity?.()
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
