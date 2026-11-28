import { createRequire } from 'node:module'
import { logDiag } from '../logger/diagLogger'

export interface KoffiLib {
  func: (signature: string) => (...args: never[]) => unknown
}

export interface KoffiModule {
  struct: (name: string, def: Record<string, string>) => unknown
  load: (dllName: string) => KoffiLib
  address: (ptr: unknown) => bigint
}

export interface Win32Bindings {
  FindWindowW: (lpClassName: string | null, lpWindowName: string | null) => unknown
  GetClientRect: (
    hWnd: unknown,
    lpRect: { left: number; top: number; right: number; bottom: number }
  ) => boolean
  ClientToScreen: (hWnd: unknown, lpPoint: { x: number; y: number }) => boolean
  IsIconic: (hWnd: unknown) => boolean
  IsWindowVisible: (hWnd: unknown) => boolean
  GetForegroundWindow: () => unknown
  GetWindowThreadProcessId: (hWnd: unknown, lpdwProcessId: [number]) => number
  SetWindowPos: (
    hWnd: unknown,
    hWndInsertAfter: number,
    x: number,
    y: number,
    cx: number,
    cy: number,
    uFlags: number
  ) => boolean
  GetCurrentProcess: () => unknown
  OpenProcess: (dwDesiredAccess: number, bInheritHandle: boolean, dwProcessId: number) => unknown
  CloseHandle: (hObject: unknown) => boolean
  QueryFullProcessImageNameW: (
    hProcess: unknown,
    dwFlags: number,
    lpExeName: Buffer,
    lpdwSize: [number]
  ) => boolean
  OpenProcessToken: (
    ProcessHandle: unknown,
    DesiredAccess: number,
    TokenHandle: [unknown]
  ) => boolean
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

export const PROCESS_QUERY_INFORMATION = 0x0400
export const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
export const TOKEN_QUERY = 0x0008
export const TOKEN_ELEVATION_CLASS = 20

const nodeRequire = createRequire(import.meta.url)

let koffiMod: KoffiModule | null = null
let win32: Win32Bindings | null = null
let win32InitFailed = false
let structsDefined = false

export function loadKoffiSafe(): KoffiModule | null {
  if (koffiMod) return koffiMod
  try {
    koffiMod = nodeRequire('koffi') as KoffiModule
    return koffiMod
  } catch (err) {
    win32InitFailed = true
    logDiag('WIN32', `koffi load failed, falling back safely: ${String(err).slice(0, 180)}`)
    return null
  }
}

export function getWin32(): Win32Bindings | null {
  if (process.platform !== 'win32' || win32InitFailed) return null
  if (win32) return win32

  const koffi = loadKoffiSafe()
  if (!koffi) return null

  try {
    if (!structsDefined) {
      koffi.struct('WIN32_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
      koffi.struct('WIN32_POINT', { x: 'int32', y: 'int32' })
      structsDefined = true
    }

    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    const advapi32 = koffi.load('advapi32.dll')
    const shell32 = koffi.load('shell32.dll')

    try {
      const shcore = koffi.load('shcore.dll')
      const SetProcessDpiAwareness = shcore.func(
        'int32 __stdcall SetProcessDpiAwareness(int32 value)'
      ) as (value: number) => number
      SetProcessDpiAwareness(2)
    } catch {
      // Already set by Electron manifest or unsupported on older OS
    }

    win32 = {
      FindWindowW: user32.func(
        'void * __stdcall FindWindowW(str16 lpClassName, str16 lpWindowName)'
      ) as Win32Bindings['FindWindowW'],
      GetClientRect: user32.func(
        'bool __stdcall GetClientRect(void *hWnd, _Out_ WIN32_RECT *lpRect)'
      ) as Win32Bindings['GetClientRect'],
      ClientToScreen: user32.func(
        'bool __stdcall ClientToScreen(void *hWnd, _Inout_ WIN32_POINT *lpPoint)'
      ) as Win32Bindings['ClientToScreen'],
      IsIconic: user32.func('bool __stdcall IsIconic(void *hWnd)') as Win32Bindings['IsIconic'],
      IsWindowVisible: user32.func(
        'bool __stdcall IsWindowVisible(void *hWnd)'
      ) as Win32Bindings['IsWindowVisible'],
      GetForegroundWindow: user32.func(
        'void * __stdcall GetForegroundWindow()'
      ) as Win32Bindings['GetForegroundWindow'],
      GetWindowThreadProcessId: user32.func(
        'uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)'
      ) as Win32Bindings['GetWindowThreadProcessId'],
      SetWindowPos: user32.func(
        'bool __stdcall SetWindowPos(void *hWnd, intptr hWndInsertAfter, int32 X, int32 Y, int32 cx, int32 cy, uint32 uFlags)'
      ) as Win32Bindings['SetWindowPos'],
      GetCurrentProcess: kernel32.func(
        'void * __stdcall GetCurrentProcess()'
      ) as Win32Bindings['GetCurrentProcess'],
      OpenProcess: kernel32.func(
        'void * __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)'
      ) as Win32Bindings['OpenProcess'],
      CloseHandle: kernel32.func(
        'bool __stdcall CloseHandle(void *hObject)'
      ) as Win32Bindings['CloseHandle'],
      QueryFullProcessImageNameW: kernel32.func(
        'bool __stdcall QueryFullProcessImageNameW(void *hProcess, uint32 dwFlags, void *lpExeName, _Inout_ uint32 *lpdwSize)'
      ) as Win32Bindings['QueryFullProcessImageNameW'],
      OpenProcessToken: advapi32.func(
        'bool __stdcall OpenProcessToken(void *ProcessHandle, uint32 DesiredAccess, _Out_ void **TokenHandle)'
      ) as Win32Bindings['OpenProcessToken'],
      GetTokenInformation: advapi32.func(
        'bool __stdcall GetTokenInformation(void *TokenHandle, int32 TokenInformationClass, void *TokenInformation, uint32 TokenInformationLength, _Out_ uint32 *ReturnLength)'
      ) as Win32Bindings['GetTokenInformation'],
      ShellExecuteW: shell32.func(
        'void * __stdcall ShellExecuteW(void *hwnd, str16 lpOperation, str16 lpFile, str16 lpParameters, str16 lpDirectory, int32 nShowCmd)'
      ) as Win32Bindings['ShellExecuteW']
    }
    return win32
  } catch (err) {
    win32InitFailed = true
    logDiag('WIN32', `koffi Win32 init failed: ${String(err).slice(0, 180)}`)
    return null
  }
}

export function hwndAddr(hWnd: unknown): bigint {
  if (!hWnd || !koffiMod) return 0n
  try {
    return koffiMod.address(hWnd)
  } catch {
    return 0n
  }
}

export function queryExePathByPid(api: Win32Bindings, pid: number): string {
  if (pid <= 0) return ''
  let hProc: unknown = null
  try {
    hProc = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
    if (hwndAddr(hProc) === 0n) return ''
    const buf = Buffer.alloc(2048)
    const chars: [number] = [1024]
    if (api.QueryFullProcessImageNameW(hProc, 0, buf, chars) && chars[0] > 0) {
      return buf.toString('utf16le', 0, Math.min(buf.length, chars[0] * 2))
    }
    return ''
  } catch {
    return ''
  } finally {
    if (hwndAddr(hProc) !== 0n) {
      try {
        api.CloseHandle(hProc)
      } catch {
        // ignore
      }
    }
  }
}
