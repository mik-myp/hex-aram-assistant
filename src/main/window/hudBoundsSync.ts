import { type BrowserWindow, screen } from 'electron'
import type { WindowBoundsRect } from '@shared/types'
import { getActiveLeagueWindow, raiseWindowTopmostNoActivate } from '../game/windowTracker'
import { logDiag } from '../logger/diagLogger'
import { runtime } from '../state/runtimeStore'
import {
  startHudCursorHitTestLoop,
  stopHudCursorHitTestLoop,
  syncHudInteractiveFromCursor
} from './hudInteraction'

let lastLeagueForeground = false
let lastTopmostRaiseAt = 0

/**
 * Electron 36 strictly requires finite integer bounds for `setBounds` and `getDisplayMatching`.
 * On 125% / 150% / 175% DPI Windows laptops, `screen.screenToDipRect` can yield fractional values
 * that throw native conversion errors when League launches.
 */
export function normalizeIntegerBounds(rect: WindowBoundsRect): WindowBoundsRect | null {
  if (
    !rect ||
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    return null
  }
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  if (width < 320 || height < 240 || width > 16384 || height > 16384) {
    return null
  }
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width,
    height
  }
}

export function isLeagueCurrentlyForeground(): boolean {
  if (process.platform !== 'win32') return true
  const tracked = getActiveLeagueWindow()
  return Boolean(tracked?.isForeground)
}

export function ensureHudTopmost(win: BrowserWindow | null = runtime.hudWindow): void {
  if (!win || win.isDestroyed()) return
  try {
    win.setAlwaysOnTop(true, 'screen-saver', 1)
    win.moveTop()
    if (process.platform === 'win32') {
      raiseWindowTopmostNoActivate(win.getNativeWindowHandle())
    }
    syncHudInteractiveFromCursor(true)
    lastTopmostRaiseAt = Date.now()
  } catch (err) {
    logDiag('HUD', `ensureHudTopmost guarded error: ${String(err).slice(0, 120)}`)
  }
}

export function syncHudBoundsToLeagueWindow(forceRaiseTopmost = false): void {
  if (!runtime.hudWindow || runtime.hudWindow.isDestroyed() || runtime.simulatorActive) return

  const tracked = getActiveLeagueWindow()
  if (!tracked) {
    runtime.lastTrackedDipBounds = undefined
    runtime.lastTrackedPhysicalBounds = undefined
    lastLeagueForeground = false
    return
  }

  runtime.lastTrackedPhysicalBounds = tracked.physicalBounds
  runtime.gameState.targetWindowKind = tracked.kind

  const becameForeground = tracked.isForeground && !lastLeagueForeground
  lastLeagueForeground = tracked.isForeground

  const inActiveSession = Boolean(runtime.latestLive?.inGame || runtime.latestLcu?.inChampSelect)
  const hasUrgentCards = runtime.gameState.cardSlots.length > 0

  if (runtime.currentPrefs.autoHideWhenUnfocused && !runtime.manuallyHiddenHud) {
    if (!tracked.isForeground) {
      if (runtime.hudWindow.isVisible()) {
        runtime.hudWindow.hide()
        stopHudCursorHitTestLoop()
      }
      return
    }
    if (tracked.isForeground && !runtime.hudWindow.isVisible() && inActiveSession) {
      runtime.hudWindow.showInactive()
      ensureHudTopmost(runtime.hudWindow)
      startHudCursorHitTestLoop()
    }
  }

  let dipRect: WindowBoundsRect | null = null
  try {
    const rawDip =
      process.platform === 'win32'
        ? screen.screenToDipRect(runtime.hudWindow, tracked.physicalBounds)
        : tracked.physicalBounds
    dipRect = normalizeIntegerBounds(rawDip)
  } catch (err) {
    logDiag('HUD', `screenToDipRect guarded fallback: ${String(err).slice(0, 120)}`)
    dipRect = normalizeIntegerBounds(tracked.physicalBounds)
  }

  if (!dipRect) return

  let dispBounds: WindowBoundsRect
  try {
    dispBounds = screen.getDisplayMatching(dipRect).bounds
  } catch {
    dispBounds = screen.getPrimaryDisplay().bounds
  }

  const coversFullMonitor =
    dipRect.x <= dispBounds.x + 2 &&
    dipRect.y <= dispBounds.y + 2 &&
    Math.abs(dipRect.width - dispBounds.width) <= 3 &&
    Math.abs(dipRect.height - dispBounds.height) <= 3

  const safeBounds = normalizeIntegerBounds({
    x: dipRect.x,
    y: dipRect.y,
    width: dipRect.width,
    height: coversFullMonitor ? Math.max(360, dipRect.height - 1) : dipRect.height
  })
  if (!safeBounds) return

  runtime.lastTrackedDipBounds = dipRect

  try {
    const cur = runtime.hudWindow.getBounds()
    const changed =
      Math.abs(cur.x - safeBounds.x) > 1 ||
      Math.abs(cur.y - safeBounds.y) > 1 ||
      Math.abs(cur.width - safeBounds.width) > 1 ||
      Math.abs(cur.height - safeBounds.height) > 1

    if (changed) {
      runtime.hudWindow.setBounds(safeBounds, false)
    }

    const raiseIntervalMs = hasUrgentCards ? 1200 : 2800
    if (
      tracked.isForeground &&
      runtime.hudWindow.isVisible() &&
      (forceRaiseTopmost ||
        becameForeground ||
        changed ||
        Date.now() - lastTopmostRaiseAt >= raiseIntervalMs)
    ) {
      ensureHudTopmost(runtime.hudWindow)
    }
  } catch (err) {
    logDiag('HUD', `setBounds guarded error: ${String(err).slice(0, 120)}`)
  }
}
