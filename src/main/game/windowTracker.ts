import { spawn, type ChildProcess } from 'node:child_process'
import type { WindowBoundsRect } from '@shared/types'

/**
 * Persistent zero-overhead Win32 Client-Area & DPI-Aware Window Tracker.
 *
 * Why GetClientRect + ClientToScreen + PerMonitorDpiAware instead of GetWindowRect:
 *  1. Windowed LoL has a ~32px Windows title bar and 8px invisible DWM shadow borders.
 *     GetClientRect + ClientToScreen returns ONLY the inner playable canvas!
 *  2. SetProcessDpiAwareness(2) guarantees true physical pixel coordinates on 125%/150%/200% displays,
 *     which Electron's `screen.screenToDipRect` then maps 1:1 to logical DIP coordinates on mixed-DPI monitors.
 *  3. Runs inside ONE persistent hidden PowerShell loop (compiled once at startup) instead of spawning
 *     processes repeatedly — 0% CPU overhead and zero micro-stutter during gameplay!
 */
const WIN32_DAEMON_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class LeagueWinTracker {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  [DllImport("shcore.dll")]
  public static extern int SetProcessDpiAwareness(int value);

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindowW(string lpClassName, string lpWindowName);

  [DllImport("user32.dll")]
  public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  public static void InitDpi() {
    try { SetProcessDpiAwareness(2); } catch { try { SetProcessDPIAware(); } catch {} }
  }

  public static string PollOnce() {
    IntPtr gameHwnd = FindWindowW("RiotWindowClass", null);
    IntPtr clientHwnd = FindWindowW("RCLIENT", null);

    IntPtr target = IntPtr.Zero;
    string kind = "";

    if (gameHwnd != IntPtr.Zero && IsWindowVisible(gameHwnd) && !IsIconic(gameHwnd)) {
      target = gameHwnd;
      kind = "game";
    } else if (clientHwnd != IntPtr.Zero && IsWindowVisible(clientHwnd) && !IsIconic(clientHwnd)) {
      target = clientHwnd;
      kind = "client";
    }

    if (target == IntPtr.Zero) {
      return "none|0|0|0|0|0";
    }

    RECT rc;
    if (!GetClientRect(target, out rc)) {
      return "none|0|0|0|0|0";
    }
    int w = rc.Right - rc.Left;
    int h = rc.Bottom - rc.Top;
    if (w < 640 || h < 360) {
      return "none|0|0|0|0|0";
    }

    POINT pt = new POINT { X = 0, Y = 0 };
    ClientToScreen(target, ref pt);

    IntPtr fg = GetForegroundWindow();
    int isFg = (fg == target || fg == gameHwnd || fg == clientHwnd) ? 1 : 0;
    if (isFg == 0 && fg != IntPtr.Zero) {
      uint pid = 0;
      GetWindowThreadProcessId(fg, out pid);
      if (pid > 0) {
        try {
          string pname = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant();
          if (pname.Contains("hexbuddy") || pname.Contains("electron") || pname.Contains("league")) {
            isFg = 1;
          }
        } catch {}
      }
    }

    return string.Format("{0}|{1}|{2}|{3}|{4}|{5}", kind, pt.X, pt.Y, w, h, isFg);
  }
}
"@

[LeagueWinTracker]::InitDpi()
$lastLine = ""
while ($true) {
  $cur = [LeagueWinTracker]::PollOnce()
  if ($cur -ne $lastLine) {
    [Console]::WriteLine($cur)
    [Console]::Out.Flush()
    $lastLine = $cur
  }
  Start-Sleep -Milliseconds 350
}
`

export interface TrackedLeagueWindow {
  kind: 'game' | 'client'
  /** Physical screen pixels of the inner client canvas (convert via screen.screenToDipRect!) */
  physicalBounds: WindowBoundsRect
  /** Whether League of Legends or HexBuddy is currently the foreground focused window */
  isForeground: boolean
}

let daemonProc: ChildProcess | null = null
let latestTracked: TrackedLeagueWindow | null = null
let stdoutBuf = ''
let stopping = false
let restartTimer: NodeJS.Timeout | null = null

function parseTrackerLine(line: string): void {
  const parts = line.trim().split('|')
  if (parts.length < 6) return
  const [kind, xStr, yStr, wStr, hStr, fgStr] = parts
  if (kind !== 'game' && kind !== 'client') {
    latestTracked = null
    return
  }
  const x = Number(xStr)
  const y = Number(yStr)
  const width = Number(wStr)
  const height = Number(hStr)
  if (Number.isNaN(width) || Number.isNaN(height) || width < 640 || height < 360) {
    latestTracked = null
    return
  }
  latestTracked = {
    kind,
    physicalBounds: { x, y, width, height },
    isForeground: fgStr === '1'
  }
}

export function startLeagueWindowTracker(): void {
  if (process.platform !== 'win32' || daemonProc) return
  stopping = false

  try {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN32_DAEMON_SCRIPT],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )

    daemonProc = child
    stdoutBuf = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf-8')
      const lines = stdoutBuf.split(/\r?\n/)
      stdoutBuf = lines.pop() ?? ''
      for (const ln of lines) {
        if (ln.trim()) parseTrackerLine(ln)
      }
    })

    child.on('exit', () => {
      daemonProc = null
      if (!stopping) {
        restartTimer = setTimeout(() => startLeagueWindowTracker(), 3000)
      }
    })

    child.on('error', () => {
      daemonProc = null
    })
  } catch {
    daemonProc = null
  }
}

export function stopLeagueWindowTracker(): void {
  stopping = true
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (daemonProc) {
    try {
      daemonProc.kill()
    } catch {
      // ignore
    }
    daemonProc = null
  }
  latestTracked = null
}

export function getActiveLeagueWindow(): TrackedLeagueWindow | null {
  if (process.platform !== 'win32') return null
  return latestTracked
}
