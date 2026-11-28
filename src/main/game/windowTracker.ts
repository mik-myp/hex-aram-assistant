import type { WindowBoundsRect } from '@shared/types'
import { logDiag } from '../logger/diagLogger'
import {
  getWin32,
  hwndAddr,
  PROCESS_QUERY_INFORMATION,
  PROCESS_QUERY_LIMITED_INFORMATION,
  queryExePathByPid,
  TOKEN_ELEVATION_CLASS,
  TOKEN_QUERY
} from './win32Native'

export interface TrackedLeagueWindow {
  kind: 'game' | 'client'
  /** Physical screen pixels of the inner client canvas (convert via screen.screenToDipRect!) */
  physicalBounds: WindowBoundsRect
  /** Whether League of Legends or HexBuddy is currently the foreground focused window */
  isForeground: boolean
}

export interface LeagueClientProcessInfo {
  pid: number
  exePath: string
}

const HWND_TOPMOST = -1
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const SWP_SHOWWINDOW = 0x0040
const SWP_NOOWNERZORDER = 0x0200

export function startLeagueWindowTracker(): void {
  getWin32()
}

export function stopLeagueWindowTracker(): void {
  // No external daemon process to kill anymore — 0 MB background footprint!
}

/**
 * Re-asserts HWND_TOPMOST without activating or stealing input focus from League of Legends.
 */
export function raiseWindowTopmostNoActivate(nativeHandleBuf: Buffer): boolean {
  const api = getWin32()
  if (!api || !nativeHandleBuf || nativeHandleBuf.length < 4) return false
  try {
    const hwndVal =
      nativeHandleBuf.length >= 8
        ? nativeHandleBuf.readBigUInt64LE(0)
        : BigInt(nativeHandleBuf.readUInt32LE(0))
    if (hwndVal === 0n) return false
    const flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW
    return Boolean(api.SetWindowPos(hwndVal, HWND_TOPMOST, 0, 0, 0, 0, flags))
  } catch {
    return false
  }
}

export function getActiveLeagueWindow(): TrackedLeagueWindow | null {
  const api = getWin32()
  if (!api) return null

  try {
    const gameHwnd = api.FindWindowW('RiotWindowClass', null)
    const clientHwnd = api.FindWindowW('RCLIENT', null)
    const gameAddr = hwndAddr(gameHwnd)
    const clientAddr = hwndAddr(clientHwnd)

    let target: unknown = null
    let targetAddr = 0n
    let kind: 'game' | 'client' = 'game'

    if (gameAddr !== 0n && api.IsWindowVisible(gameHwnd) && !api.IsIconic(gameHwnd)) {
      target = gameHwnd
      targetAddr = gameAddr
      kind = 'game'
    } else if (clientAddr !== 0n && api.IsWindowVisible(clientHwnd) && !api.IsIconic(clientHwnd)) {
      target = clientHwnd
      targetAddr = clientAddr
      kind = 'client'
    }

    if (!target || targetAddr === 0n) return null

    const rc = { left: 0, top: 0, right: 0, bottom: 0 }
    if (!api.GetClientRect(target, rc)) return null

    const width = Math.round(rc.right - rc.left)
    const height = Math.round(rc.bottom - rc.top)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 640 || height < 360) {
      return null
    }

    const pt = { x: 0, y: 0 }
    if (!api.ClientToScreen(target, pt)) return null
    if (
      !Number.isFinite(pt.x) ||
      !Number.isFinite(pt.y) ||
      pt.x < -16000 ||
      pt.y < -16000 ||
      pt.x > 32000 ||
      pt.y > 32000
    ) {
      return null
    }

    const fgHwnd = api.GetForegroundWindow()
    const fgAddr = hwndAddr(fgHwnd)
    let isForeground =
      fgAddr !== 0n && (fgAddr === targetAddr || fgAddr === gameAddr || fgAddr === clientAddr)

    if (!isForeground && fgAddr !== 0n) {
      const pidOut: [number] = [0]
      api.GetWindowThreadProcessId(fgHwnd, pidOut)
      const fgPid = pidOut[0]
      if (fgPid === process.pid) {
        isForeground = true
      } else if (fgPid > 0) {
        const exeLower = queryExePathByPid(api, fgPid).toLowerCase()
        if (
          exeLower.includes('hexbuddy') ||
          exeLower.includes('electron') ||
          exeLower.includes('league')
        ) {
          isForeground = true
        }
      }
    }

    return {
      kind,
      physicalBounds: { x: Math.round(pt.x), y: Math.round(pt.y), width, height },
      isForeground
    }
  } catch (err) {
    logDiag('WIN32', `getActiveLeagueWindow guarded error: ${String(err).slice(0, 140)}`)
    return null
  }
}

export function findLeagueClientUxProcessInfo(): LeagueClientProcessInfo | null {
  const api = getWin32()
  if (!api) return null

  try {
    const clientHwnd = api.FindWindowW('RCLIENT', null)
    if (hwndAddr(clientHwnd) === 0n) return null

    const pidOut: [number] = [0]
    api.GetWindowThreadProcessId(clientHwnd, pidOut)
    const pid = pidOut[0]
    if (pid <= 0) return null

    return { pid, exePath: queryExePathByPid(api, pid) }
  } catch {
    return null
  }
}

export function hasActiveGameWindow(): boolean {
  if (process.platform !== 'win32') return true
  const api = getWin32()
  if (!api) return true
  try {
    return hwndAddr(api.FindWindowW('RiotWindowClass', null)) !== 0n
  } catch {
    return true
  }
}

let cachedSelfElevated: boolean | null = null

export function checkWindowsElevationParity(): {
  isSelfElevated: boolean
  leagueElevatedMismatch: boolean
} {
  const api = getWin32()
  if (!api) return { isSelfElevated: false, leagueElevatedMismatch: false }

  try {
    if (cachedSelfElevated === null) {
      try {
        const tokOut: [unknown] = [null]
        if (
          api.OpenProcessToken(api.GetCurrentProcess(), TOKEN_QUERY, tokOut) &&
          hwndAddr(tokOut[0]) !== 0n
        ) {
          const elevBuf = Buffer.alloc(4)
          const retLen: [number] = [0]
          if (api.GetTokenInformation(tokOut[0], TOKEN_ELEVATION_CLASS, elevBuf, 4, retLen)) {
            cachedSelfElevated = elevBuf.readUInt32LE(0) !== 0
          }
          api.CloseHandle(tokOut[0])
        }
      } catch {
        cachedSelfElevated = false
      }
      if (cachedSelfElevated === null) cachedSelfElevated = false
    }

    if (cachedSelfElevated) return { isSelfElevated: true, leagueElevatedMismatch: false }

    const targetHwnd = api.FindWindowW('RiotWindowClass', null) || api.FindWindowW('RCLIENT', null)
    if (hwndAddr(targetHwnd) === 0n) return { isSelfElevated: false, leagueElevatedMismatch: false }

    const pidOut: [number] = [0]
    api.GetWindowThreadProcessId(targetHwnd, pidOut)
    const pid = pidOut[0]
    if (pid <= 0) return { isSelfElevated: false, leagueElevatedMismatch: false }

    const hFull = api.OpenProcess(PROCESS_QUERY_INFORMATION, false, pid)
    if (hwndAddr(hFull) !== 0n) {
      api.CloseHandle(hFull)
      return { isSelfElevated: false, leagueElevatedMismatch: false }
    }
    const hLim = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
    if (hwndAddr(hLim) !== 0n) {
      api.CloseHandle(hLim)
      return { isSelfElevated: false, leagueElevatedMismatch: true }
    }
    return { isSelfElevated: false, leagueElevatedMismatch: false }
  } catch {
    return { isSelfElevated: false, leagueElevatedMismatch: false }
  }
}

export function relaunchAsWindowsAdmin(execPath: string, args: string[]): boolean {
  const api = getWin32()
  if (!api) return false
  try {
    const paramStr = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')
    const res = api.ShellExecuteW(null, 'runas', execPath, paramStr || null, null, 1)
    return hwndAddr(res) > 32n
  } catch {
    return false
  }
}
