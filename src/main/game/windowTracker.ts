import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WindowBoundsRect } from '@shared/types'

const execFileAsync = promisify(execFile)

const WIN32_RECT_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinRect {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
}
"@
$procs = Get-Process -Name "League of Legends","LeagueClientUx" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
foreach ($p in $procs) {
  if ([WinRect]::IsIconic($p.MainWindowHandle)) { continue }
  $r = New-Object WinRect+RECT
  if ([WinRect]::GetWindowRect($p.MainWindowHandle, [ref]$r)) {
    $w = $r.Right - $r.Left
    $h = $r.Bottom - $r.Top
    if ($w -ge 800 -and $h -ge 500) {
      Write-Output "$($p.ProcessName)|$($r.Left)|$($r.Top)|$w|$h"
      break
    }
  }
}
`

export interface TrackedLeagueWindow {
  kind: 'game' | 'client'
  bounds: WindowBoundsRect
}

export async function findActiveLeagueWindowBounds(): Promise<TrackedLeagueWindow | null> {
  if (process.platform !== 'win32') {
    return null
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', WIN32_RECT_SCRIPT],
      { timeout: 1800 }
    )
    const line = stdout.trim().split(/[\r\n]+/)[0]
    if (!line) return null
    const [procName, xStr, yStr, wStr, hStr] = line.split('|')
    const x = Number(xStr)
    const y = Number(yStr)
    const width = Number(wStr)
    const height = Number(hStr)
    if (Number.isNaN(width) || width < 640) return null
    return {
      kind: procName.includes('LeagueClient') ? 'client' : 'game',
      bounds: { x, y, width, height }
    }
  } catch {
    return null
  }
}
