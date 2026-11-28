import { desktopCapturer, screen, type NativeImage } from 'electron'
import { clamp } from '@shared/layoutGeometry'
import type { WindowBoundsRect } from '@shared/types'
import { hwndAddr, loadKoffiSafe } from '../game/win32Native'
import { logDiag } from '../logger/diagLogger'

/**
 * Ultra-fast Win32 GDI local region screen capture (`BitBlt` + `GetDIBits`) via lazy `koffi`.
 *
 * Captures ONLY the ~11% card band (icons + titles) directly in physical pixels in ~1.5–3.5ms,
 * completely bypassing Chromium's heavy full-screen `desktopCapturer.getSources` pipeline!
 * Gracefully returns `null` if unavailable or all-black (e.g. exclusive fullscreen) so callers
 * seamlessly fall back to `desktopCapturer`.
 */

export interface CapturedBgraRegion {
  bgra: Buffer
  width: number
  height: number
  elapsedMs: number
}

interface GdiCaptureBindings {
  GetDC: (hWnd: unknown) => unknown
  ReleaseDC: (hWnd: unknown, hDC: unknown) => number
  CreateCompatibleDC: (hdc: unknown) => unknown
  CreateCompatibleBitmap: (hdc: unknown, cx: number, cy: number) => unknown
  SelectObject: (hdc: unknown, h: unknown) => unknown
  BitBlt: (
    hdcDest: unknown,
    x: number,
    y: number,
    cx: number,
    cy: number,
    hdcSrc: unknown,
    x1: number,
    y1: number,
    rop: number
  ) => boolean
  GetDIBits: (
    hdc: unknown,
    hbm: unknown,
    start: number,
    cLines: number,
    lpvBits: Buffer,
    lpbmi: Buffer,
    usage: number
  ) => number
  DeleteObject: (ho: unknown) => boolean
  DeleteDC: (hdc: unknown) => boolean
}

const SRCCOPY = 0x00cc0020
const DIB_RGB_COLORS = 0

let gdiApi: GdiCaptureBindings | null = null
let gdiInitFailed = false
let consecutiveBlackFrames = 0

export function isExclusiveFullscreenSuspected(): boolean {
  return process.platform === 'win32' && consecutiveBlackFrames >= 2
}

function getGdiCaptureApi(): GdiCaptureBindings | null {
  if (process.platform !== 'win32' || gdiInitFailed) return null
  if (gdiApi) return gdiApi

  const koffi = loadKoffiSafe()
  if (!koffi) {
    gdiInitFailed = true
    return null
  }

  try {
    const user32 = koffi.load('user32.dll')
    const gdi32 = koffi.load('gdi32.dll')
    gdiApi = {
      GetDC: user32.func('void * __stdcall GetDC(void *hWnd)') as GdiCaptureBindings['GetDC'],
      ReleaseDC: user32.func(
        'int32 __stdcall ReleaseDC(void *hWnd, void *hDC)'
      ) as GdiCaptureBindings['ReleaseDC'],
      CreateCompatibleDC: gdi32.func(
        'void * __stdcall CreateCompatibleDC(void *hdc)'
      ) as GdiCaptureBindings['CreateCompatibleDC'],
      CreateCompatibleBitmap: gdi32.func(
        'void * __stdcall CreateCompatibleBitmap(void *hdc, int32 cx, int32 cy)'
      ) as GdiCaptureBindings['CreateCompatibleBitmap'],
      SelectObject: gdi32.func(
        'void * __stdcall SelectObject(void *hdc, void *h)'
      ) as GdiCaptureBindings['SelectObject'],
      BitBlt: gdi32.func(
        'bool __stdcall BitBlt(void *hdc, int32 x, int32 y, int32 cx, int32 cy, void *hdcSrc, int32 x1, int32 y1, uint32 rop)'
      ) as GdiCaptureBindings['BitBlt'],
      GetDIBits: gdi32.func(
        'int32 __stdcall GetDIBits(void *hdc, void *hbm, uint32 start, uint32 cLines, void *lpvBits, void *lpbmi, uint32 usage)'
      ) as GdiCaptureBindings['GetDIBits'],
      DeleteObject: gdi32.func(
        'bool __stdcall DeleteObject(void *ho)'
      ) as GdiCaptureBindings['DeleteObject'],
      DeleteDC: gdi32.func('bool __stdcall DeleteDC(void *hdc)') as GdiCaptureBindings['DeleteDC']
    }
    return gdiApi
  } catch (err) {
    gdiInitFailed = true
    logDiag('CAPTURE', `GDI local capture init failed: ${String(err).slice(0, 140)}`)
    return null
  }
}

export function isWin32FastCaptureAvailable(): boolean {
  return process.platform === 'win32' && !gdiInitFailed && Boolean(getGdiCaptureApi())
}

function buildTopDownBgraHeader(width: number, height: number): Buffer {
  const bmi = Buffer.alloc(40)
  bmi.writeUInt32LE(40, 0) // biSize
  bmi.writeInt32LE(width, 4) // biWidth
  bmi.writeInt32LE(-height, 8) // negative biHeight -> top-down DIB
  bmi.writeUInt16LE(1, 12) // biPlanes
  bmi.writeUInt16LE(32, 14) // biBitCount (32bpp BGRA)
  bmi.writeUInt32LE(0, 16) // biCompression (BI_RGB)
  return bmi
}

/**
 * Samples ~64 points to detect pitch-black frames (common when a game runs in exclusive DX fullscreen).
 */
function isLikelyBlackFrame(bgra: Buffer): boolean {
  const pixelCount = Math.floor(bgra.length / 4)
  if (pixelCount === 0) return true
  const step = Math.max(1, Math.floor(pixelCount / 64))
  let nonDark = 0
  for (let p = 0; p < pixelCount; p += step) {
    const i = p * 4
    if (bgra[i] > 6 || bgra[i + 1] > 6 || bgra[i + 2] > 6) {
      nonDark++
      if (nonDark >= 3) return false
    }
  }
  return true
}

export function captureWin32RegionBgra(rect: WindowBoundsRect): CapturedBgraRegion | null {
  const api = getGdiCaptureApi()
  if (!api) return null

  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  if (width < 64 || height < 32 || width > 8192 || height > 4320) return null

  const start = Date.now()
  let hScreenDC: unknown = null
  let hMemDC: unknown = null
  let hBitmap: unknown = null
  let hPrevObj: unknown = null

  try {
    hScreenDC = api.GetDC(null)
    if (hwndAddr(hScreenDC) === 0n) return null

    hMemDC = api.CreateCompatibleDC(hScreenDC)
    if (hwndAddr(hMemDC) === 0n) return null

    hBitmap = api.CreateCompatibleBitmap(hScreenDC, width, height)
    if (hwndAddr(hBitmap) === 0n) return null

    hPrevObj = api.SelectObject(hMemDC, hBitmap)
    if (!api.BitBlt(hMemDC, 0, 0, width, height, hScreenDC, x, y, SRCCOPY)) {
      return null
    }

    const bgra = Buffer.allocUnsafe(width * height * 4)
    const bmi = buildTopDownBgraHeader(width, height)
    const lines = api.GetDIBits(hMemDC, hBitmap, 0, height, bgra, bmi, DIB_RGB_COLORS)
    if (lines <= 0) {
      return null
    }
    if (isLikelyBlackFrame(bgra)) {
      consecutiveBlackFrames++
      return null
    }
    consecutiveBlackFrames = 0

    // Force opaque alpha channel (GDI 32bpp DIBs sometimes leave alpha=0)
    for (let i = 3; i < bgra.length; i += 4) {
      bgra[i] = 255
    }

    return {
      bgra,
      width,
      height,
      elapsedMs: Date.now() - start
    }
  } catch (err) {
    logDiag('CAPTURE', `BitBlt guarded error: ${String(err).slice(0, 140)}`)
    return null
  } finally {
    try {
      if (hwndAddr(hMemDC) !== 0n && hwndAddr(hPrevObj) !== 0n) {
        api.SelectObject(hMemDC, hPrevObj)
      }
      if (hwndAddr(hBitmap) !== 0n) api.DeleteObject(hBitmap)
      if (hwndAddr(hMemDC) !== 0n) api.DeleteDC(hMemDC)
      if (hwndAddr(hScreenDC) !== 0n) api.ReleaseDC(null, hScreenDC)
    } catch {
      // ignore cleanup failures
    }
  }
}

export function cropBgraSubRegion(
  src: Buffer,
  srcW: number,
  srcH: number,
  x: number,
  y: number,
  w: number,
  h: number
): { bgra: Buffer; width: number; height: number } | null {
  const rx = Math.max(0, Math.min(srcW - 1, Math.round(x)))
  const ry = Math.max(0, Math.min(srcH - 1, Math.round(y)))
  const rw = Math.max(1, Math.min(srcW - rx, Math.round(w)))
  const rh = Math.max(1, Math.min(srcH - ry, Math.round(h)))
  if (rw < 16 || rh < 8) return null

  const out = Buffer.allocUnsafe(rw * rh * 4)
  const srcStride = srcW * 4
  const dstStride = rw * 4
  for (let row = 0; row < rh; row++) {
    const srcStart = (ry + row) * srcStride + rx * 4
    src.copy(out, row * dstStride, srcStart, srcStart + dstStride)
  }
  return { bgra: out, width: rw, height: rh }
}

export async function captureDesktopFallbackImage(
  trackedGameDipBounds: WindowBoundsRect | undefined,
  isAutoPoll: boolean
): Promise<NativeImage | null> {
  const captureTypes: Array<'screen' | 'window'> =
    isAutoPoll && trackedGameDipBounds ? ['screen'] : ['screen', 'window']

  let targetDisplay = screen.getPrimaryDisplay()
  if (trackedGameDipBounds) {
    try {
      targetDisplay = screen.getDisplayMatching(trackedGameDipBounds)
    } catch {
      targetDisplay = screen.getPrimaryDisplay()
    }
  }

  const thumbW = Math.min(1920, Math.max(1280, Math.round(targetDisplay.bounds.width)))
  const thumbH = Math.min(1080, Math.max(720, Math.round(targetDisplay.bounds.height)))
  const sources = await desktopCapturer.getSources({
    types: captureTypes,
    thumbnailSize: { width: thumbW, height: thumbH }
  })

  const matchingScreen =
    sources.find(
      (s) =>
        s.id.startsWith('screen:') &&
        s.display_id === String(targetDisplay.id) &&
        !s.thumbnail.isEmpty()
    ) || sources.find((s) => s.id.startsWith('screen:') && !s.thumbnail.isEmpty())

  const lolGameWin = sources.find(
    (s) =>
      s.id.startsWith('window:') &&
      /League of Legends \(TM\) Client|League of Legends/i.test(s.name) &&
      !/ClientUx/i.test(s.name) &&
      !s.thumbnail.isEmpty()
  )

  const chosen = trackedGameDipBounds ? matchingScreen || lolGameWin : lolGameWin || matchingScreen
  if (!chosen || chosen.thumbnail.isEmpty()) return null

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
  }

  return gameImage
}
