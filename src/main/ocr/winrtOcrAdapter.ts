import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { app } from 'electron'
import type { AugmentMeta } from '@shared/types'
import { logDiag } from '../logger/diagLogger'
import {
  matchWordsAdaptiveColumns,
  type ParsedOcrPass,
  type StripGeometryHint
} from './ocrColumnMatcher'

export { matchWordsAdaptiveColumns, type ParsedOcrPass, type StripGeometryHint }

export interface WinNativeOcrOutcome {
  status: 'ok' | 'unsupported' | 'error'
  pass?: ParsedOcrPass
}

const WINRT_WORKER_IDLE_MS = 20_000
const WINRT_REQ_TIMEOUT_MS = 3200

type WinrtWorkerProc = ChildProcessByStdio<Writable, Readable, null>

let winNativeOcrSupported: boolean | null = null
let workerProc: WinrtWorkerProc | null = null
let workerIdleTimer: NodeJS.Timeout | null = null
let stdoutBuf = ''
let activeResolver: ((line: string) => void) | null = null
let requestQueue: Promise<void> = Promise.resolve()

export function getWinNativeOcrSupportState(): boolean | null {
  return winNativeOcrSupported
}

/**
 * Persistent on-demand PowerShell WinRT OCR worker:
 * - Initializes the Windows.Media.Ocr.OcrEngine ONCE (~500ms cold start) instead of
 *   spawning a fresh powershell.exe + CLR on every poll tick!
 * - Subsequent frames complete in ~40-90ms with near-zero CPU spike.
 * - Automatically terminates after 20s of inactivity so idle memory stays 0 MB.
 */
const WINRT_OCR_DAEMON_SCRIPT = `
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
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
    [Console]::Out.WriteLine("UNSUPPORTED")
    [Console]::Out.Flush()
    exit 0
  }

  while ($true) {
    $imgPath = [Console]::In.ReadLine()
    if ($null -eq $imgPath) { break }
    $imgPath = $imgPath.Trim()
    if ($imgPath -eq "__QUIT__") { break }
    if ([string]::IsNullOrEmpty($imgPath)) { continue }

    try {
      $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imgPath)) ([Windows.Storage.StorageFile])
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
      [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress -Depth 4))
      [Console]::Out.Flush()
    } catch {
      [Console]::Out.WriteLine("ERROR")
      [Console]::Out.Flush()
    }
  }
} catch {
  [Console]::Out.WriteLine("UNSUPPORTED")
  [Console]::Out.Flush()
}
`

function touchWorkerIdleTimer(): void {
  if (workerIdleTimer) clearTimeout(workerIdleTimer)
  workerIdleTimer = setTimeout(() => {
    workerIdleTimer = null
    terminateWinrtOcrWorker().catch(() => {})
  }, WINRT_WORKER_IDLE_MS)
}

function killWorkerProcess(): void {
  if (workerIdleTimer) {
    clearTimeout(workerIdleTimer)
    workerIdleTimer = null
  }
  const proc = workerProc
  workerProc = null
  stdoutBuf = ''
  if (activeResolver) {
    const fn = activeResolver
    activeResolver = null
    fn('ERROR')
  }
  if (proc && !proc.killed) {
    try {
      proc.stdin.write('__QUIT__\n')
      proc.stdin.end()
    } catch {
      // ignore
    }
    try {
      proc.kill()
    } catch {
      // ignore
    }
  }
}

export async function terminateWinrtOcrWorker(): Promise<void> {
  killWorkerProcess()
  if (typeof app?.getPath === 'function') {
    const tmpImg = join(app.getPath('temp'), 'hexbuddy-ocr-strip.png')
    await rm(tmpImg, { force: true }).catch(() => {})
  }
}

function ensureWorkerProcess(): WinrtWorkerProc | null {
  if (workerProc && !workerProc.killed && workerProc.exitCode === null) {
    return workerProc
  }
  try {
    const encoded = Buffer.from(WINRT_OCR_DAEMON_SCRIPT, 'utf16le').toString('base64')
    const proc = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encoded
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
    )

    stdoutBuf = ''
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk
      let nl = stdoutBuf.indexOf('\n')
      while (nl !== -1) {
        const line = stdoutBuf.slice(0, nl).trim()
        stdoutBuf = stdoutBuf.slice(nl + 1)
        if (line && activeResolver) {
          const resolveFn = activeResolver
          activeResolver = null
          resolveFn(line)
        } else if (line === 'UNSUPPORTED') {
          winNativeOcrSupported = false
        }
        nl = stdoutBuf.indexOf('\n')
      }
    })

    proc.on('error', () => {
      if (workerProc === proc) killWorkerProcess()
    })
    proc.on('exit', () => {
      if (workerProc === proc) {
        workerProc = null
        if (activeResolver) {
          const fn = activeResolver
          activeResolver = null
          fn('ERROR')
        }
      }
    })

    workerProc = proc
    return proc
  } catch (err) {
    logDiag('OCR', `Failed to start WinRT worker: ${String(err).slice(0, 140)}`)
    return null
  }
}

function queryWinrtWorker(imgPath: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const proc = ensureWorkerProcess()
    if (!proc) {
      resolve('ERROR')
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        activeResolver = null
        killWorkerProcess()
        resolve('ERROR')
      }
    }, WINRT_REQ_TIMEOUT_MS)

    activeResolver = (line: string) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve(line)
      }
    }

    try {
      proc.stdin.write(`${imgPath}\n`)
    } catch {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        activeResolver = null
        killWorkerProcess()
        resolve('ERROR')
      }
    }
  })
}

export async function tryWindowsNativeOcrOnBuffer(
  pngBuf: Buffer,
  stripWidthHint: number,
  augments: Record<string, AugmentMeta>,
  onActivity?: () => void,
  geomHint?: StripGeometryHint
): Promise<WinNativeOcrOutcome> {
  if (process.platform !== 'win32' || winNativeOcrSupported === false) {
    return { status: 'unsupported' }
  }

  onActivity?.()
  touchWorkerIdleTimer()

  let outcome: WinNativeOcrOutcome = { status: 'error' }
  const run = async (): Promise<void> => {
    const tmpPath = join(app.getPath('temp'), 'hexbuddy-ocr-strip.png')
    try {
      await writeFile(tmpPath, pngBuf)
      const trimmed = (await queryWinrtWorker(tmpPath)).trim()
      if (!trimmed || trimmed === 'UNSUPPORTED') {
        winNativeOcrSupported = false
        killWorkerProcess()
        outcome = { status: 'unsupported' }
        return
      }
      if (trimmed === 'ERROR') {
        outcome = { status: 'error' }
        return
      }

      const parsed = JSON.parse(trimmed) as {
        ok?: boolean
        text?: string
        words?: Array<{ t: string; x0: number; x1: number }>
      }
      if (!parsed.ok) {
        outcome = { status: 'error' }
        return
      }
      winNativeOcrSupported = true

      const words = parsed.words || []
      const rawLines = (parsed.text || '')
        .split(/[\r\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)

      outcome = {
        status: 'ok',
        pass: matchWordsAdaptiveColumns(words, stripWidthHint, rawLines, augments, geomHint)
      }
    } catch {
      outcome = { status: 'error' }
    }
  }

  requestQueue = requestQueue.then(run, run)
  await requestQueue
  return outcome
}
