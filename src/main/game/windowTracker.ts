import koffi from 'koffi'
import type { WindowBoundsRect } from '@shared/types'

/**
 * Ultra-lightweight in-process Win32 FFI Window Tracker (via `koffi`).
 *
 * Memory & Latency impact vs old PowerShell daemon:
 *  - Eliminates the ~55–70 MB persistent `powershell.exe` + `.NET CLR` background process!
 *  - Direct C calls into `user32.dll` / `kernel32.dll` take ~0.005ms with 0 child processes.
 *  - Strips Windows title bars & DWM invisible borders via `GetClientRect` + `ClientToScreen`.
 *  - Strictly read-only window & path metadata (`PROCESS_QUERY_LIMITED_INFORMATION` = 0x1000;
 *    never reads or touches game memory!).
 */

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

interface Win32Bindings {
  FindWindowW: (lpClassName: string | null, lpWindowName: string | null) => unknown
  GetClientRect: (hWnd: unknown, lpRect: { left: number; top: number; right: number; bottom: number }) => boolean
  ClientToScreen: (hWnd: unknown, lpPoint: { x: number; y: number }) => boolean
  IsIconic: (hWnd: unknown) => boolean
  IsWindowVisible: (hWnd: unknown) => boolean
  GetForegroundWindow: () => unknown
  GetWindowThreadProcessId: (hWnd: unknown, lpdwProcessId: [number]) => number
  GetCurrentProcess: () => unknown
  OpenProcess: (dwDesiredAccess: number, bInheritHandle: boolean, dwProcessId: number) => unknown
  CloseHandle: (hObject: unknown) => boolean
  QueryFullProcessImageNameW: (
    hProcess: unknown,
    dwFlags: number,
    lpExeName: Buffer,
    lpdwSize: [number]
  ) => boolean
  OpenProcessToken: (ProcessHandle: unknown, DesiredAccess: number, TokenHandle: [unknown]) => boolean
  GetTokenInformation: (
    TokenHandle: unknown,
    TokenInformationClass: number,
    TokenInformation: Buffer,
    TokenInformationLength: number,
    ReturnLength: [number]
  ) => boolean
  ShellExecuteW: (
    hwnd: unknown,
    lpOperation: string | null,
    lpFile: string,
    lpParameters: string | null,
    lpDirectory: string | null,
    nShowCmd: number
  ) => unknown
}

const PROCESS_QUERY_INFORMATION = 0x0400
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const TOKEN_QUERY = 0x0008
const TOKEN_ELEVATION_CLASS = 20

let win32: Win32Bindings | null = null
let win32InitFailed = false

function getWin32(): Win32Bindings | null {
  if (process.platform !== 'win32' || win32InitFailed) return null
  if (win32) return win32

  try {
    koffi.struct('WIN32_RECT', {
      left: 'int32',
      top: 'int32',
      right: 'int32',
      bottom: 'int32'
    })
    koffi.struct('WIN32_POINT', {
      x: 'int32',
      y: 'int32'
    })

    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    const advapi32 = koffi.load('advapi32.dll')
    const shell32 = koffi.load('shell32.dll')

    // Ensure Per-Monitor DPI awareness (Electron sets this in manifest on Win10/11, safe belt-and-suspenders)
    try {
      const shcore = koffi.load('shcore.dll')
      const SetProcessDpiAwareness = shcore.func('int32 __stdcall SetProcessDpiAwareness(int32 value)')
      SetProcessDpiAwareness(2)
    } catch {
      // Already set by Electron manifest; ignore E_ACCESSDENIED (0x80070005)
    }

    win32 = {
      FindWindowW: user32.func('void * __stdcall FindWindowW(str16 lpClassName, str16 lpWindowName)'),
      GetClientRect: user32.func('bool __stdcall GetClientRect(void *hWnd, _Out_ WIN32_RECT *lpRect)'),
      ClientToScreen: user32.func('bool __stdcall ClientToScreen(void *hWnd, _Inout_ WIN32_POINT *lpPoint)'),
      IsIconic: user32.func('bool __stdcall IsIconic(void *hWnd)'),
      IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(void *hWnd)'),
      GetForegroundWindow: user32.func('void * __stdcall GetForegroundWindow()'),
      GetWindowThreadProcessId: user32.func(
        'uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)'
      ),
      GetCurrentProcess: kernel32.func('void * __stdcall GetCurrentProcess()'),
      OpenProcess: kernel32.func(
        'void * __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)'
      ),
      CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *hObject)'),
      QueryFullProcessImageNameW: kernel32.func(
        'bool __stdcall QueryFullProcessImageNameW(void *hProcess, uint32 dwFlags, void *lpExeName, _Inout_ uint32 *lpdwSize)'
      ),
      OpenProcessToken: advapi32.func(
        'bool __stdcall OpenProcessToken(void *ProcessHandle, uint32 DesiredAccess, _Out_ void **TokenHandle)'
      ),
      GetTokenInformation: advapi32.func(
        'bool __stdcall GetTokenInformation(void *TokenHandle, int32 TokenInformationClass, void *TokenInformation, uint32 TokenInformationLength, _Out_ uint32 *ReturnLength)'
      ),
      ShellExecuteW: shell32.func(
        'void * __stdcall ShellExecuteW(void *hwnd, str16 lpOperation, str16 lpFile, str16 lpParameters, str16 lpDirectory, int32 nShowCmd)'
      )
    }
    return win32
  } catch (err) {
    win32InitFailed = true
    console.warn('[WindowTracker] koffi Win32 init failed:', err)
    return null
  }
}

function hwndAddr(hWnd: unknown): bigint {
  if (!hWnd) return 0n
  try {
    return koffi.address(hWnd)
  } catch {
    return 0n
  }
}

function queryExePathByPid(api: Win32Bindings, pid: number): string {
  if (pid <= 0) return ''
  const hProc = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
  if (hwndAddr(hProc) === 0n) return ''
  try {
    const buf = Buffer.alloc(2048)
    const chars: [number] = [1024]
    if (api.QueryFullProcessImageNameW(hProc, 0, buf, chars) && chars[0] > 0) {
      return buf.toString('utf16le', 0, chars[0] * 2)
    }
    return ''
  } finally {
    api.CloseHandle(hProc)
  }
}

export function startLeagueWindowTracker(): void {
  getWin32()
}

export function stopLeagueWindowTracker(): void {
  // No external daemon process to kill anymore — 0 MB background footprint!
}

export function getActiveLeagueWindow(): TrackedLeagueWindow | null {
  const api = getWin32()
  if (!api) return null

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

  if (!target || targetAddr === 0n) {
    return null
  }

  const rc = { left: 0, top: 0, right: 0, bottom: 0 }
  if (!api.GetClientRect(target, rc)) return null

  const width = rc.right - rc.left
  const height = rc.bottom - rc.top
  if (width < 640 || height < 360) return null

  const pt = { x: 0, y: 0 }
  api.ClientToScreen(target, pt)

  const fgHwnd = api.GetForegroundWindow()
  const fgAddr = hwndAddr(fgHwnd)
  let isForeground = fgAddr !== 0n && (fgAddr === targetAddr || fgAddr === gameAddr || fgAddr === clientAddr)

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
    physicalBounds: { x: pt.x, y: pt.y, width, height },
    isForeground
  }
}

/**
 * Zero-PowerShell helper for LCU credential watcher: checks whether `RCLIENT` window exists
 * and resolves its PID & installation path in <0.02ms so `lockfile` can be read directly!
 */
export function findLeagueClientUxProcessInfo(): LeagueClientProcessInfo | null {
  const api = getWin32()
  if (!api) return null

  const clientHwnd = api.FindWindowW('RCLIENT', null)
  if (hwndAddr(clientHwnd) === 0n) return null

  const pidOut: [number] = [0]
  api.GetWindowThreadProcessId(clientHwnd, pidOut)
  const pid = pidOut[0]
  if (pid <= 0) return null

  const exePath = queryExePathByPid(api, pid)
  return { pid, exePath }
}

/**
 * <0.005ms check for whether the in-game `RiotWindowClass` window exists on Windows,
 * used to short-circuit `127.0.0.1:2999` HTTPS polling when no game is running!
 */
export function hasActiveGameWindow(): boolean {
  if (process.platform !== 'win32') return true
  const api = getWin32()
  if (!api) return true
  const gameHwnd = api.FindWindowW('RiotWindowClass', null)
  return hwndAddr(gameHwnd) !== 0n
}

let cachedSelfElevated: boolean | null = null

/**
 * Checks whether HexBuddy itself is running elevated (Administrator) and whether an active
 * WeGame / League of Legends process is running at higher integrity (which blocks global hotkeys via UIPI!).
 */
export function checkWindowsElevationParity(): {
  isSelfElevated: boolean
  leagueElevatedMismatch: boolean
} {
  const api = getWin32()
  if (!api) {
    return { isSelfElevated: false, leagueElevatedMismatch: false }
  }

  if (cachedSelfElevated === null) {
    try {
      const tokOut: [unknown] = [null]
      if (api.OpenProcessToken(api.GetCurrentProcess(), TOKEN_QUERY, tokOut) && hwndAddr(tokOut[0]) !== 0n) {
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

  if (cachedSelfElevated) {
    return { isSelfElevated: true, leagueElevatedMismatch: false }
  }

  // If HexBuddy is NOT elevated, check if active League window belongs to an elevated process (WeGame default)
  const targetHwnd = api.FindWindowW('RiotWindowClass', null) || api.FindWindowW('RCLIENT', null)
  if (hwndAddr(targetHwnd) === 0n) {
    return { isSelfElevated: false, leagueElevatedMismatch: false }
  }

  const pidOut: [number] = [0]
  api.GetWindowThreadProcessId(targetHwnd, pidOut)
  const pid = pidOut[0]
  if (pid <= 0) {
    return { isSelfElevated: false, leagueElevatedMismatch: false }
  }

  // Standard Windows UIPI signature: LIMITED_INFORMATION succeeds while full QUERY_INFORMATION is denied (NULL)
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
}

/**
 * Triggers the standard Windows UAC elevation prompt ("runas") to relaunch HexBuddy as Administrator
 * when the user clicks "以管理员身份重启".
 */
export function relaunchAsWindowsAdmin(execPath: string, args: string[]): boolean {
  const api = getWin32()
  if (!api) return false
  const paramStr = args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')
  const res = api.ShellExecuteW(null, 'runas', execPath, paramStr || null, null, 1)
  return hwndAddr(res) > 32n
}
