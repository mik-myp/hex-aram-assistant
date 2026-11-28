import { type BrowserWindow, screen } from 'electron'
import type { WindowBoundsRect } from '@shared/types'
import { runtime } from '../state/runtimeStore'

const HIT_TEST_INTERVAL_MS = 40
const HIT_PADDING_PX = 4

let interactiveRects: WindowBoundsRect[] = []
let rendererHoverHint = false
let lastAppliedInteractive: boolean | null = null
let hitTestTimer: NodeJS.Timeout | null = null

export function isPointInsideInteractiveRects(
  localX: number,
  localY: number,
  rects: WindowBoundsRect[],
  pad = HIT_PADDING_PX
): boolean {
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) return false
  for (const r of rects) {
    if (
      localX >= r.x - pad &&
      localX <= r.x + r.width + pad &&
      localY >= r.y - pad &&
      localY <= r.y + r.height + pad
    ) {
      return true
    }
  }
  return false
}

function applyHudMouseInteractive(
  win: BrowserWindow,
  interactive: boolean,
  force = false
): void {
  if (!force && lastAppliedInteractive === interactive) return
  lastAppliedInteractive = interactive
  try {
    if (interactive) {
      // Pass NO `{ forward: true }` when disabling click-through so Windows routes clicks cleanly to the HUD
      win.setIgnoreMouseEvents(false)
    } else {
      win.setIgnoreMouseEvents(true, { forward: true })
    }
  } catch {
    // ignore transient window teardown race
  }
}

export function syncHudInteractiveFromCursor(force = false): void {
  const win = runtime.hudWindow
  if (!win || win.isDestroyed() || !win.isVisible()) {
    lastAppliedInteractive = null
    return
  }

  try {
    const pt = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const localX = pt.x - b.x
    const localY = pt.y - b.y
    const hitRect = isPointInsideInteractiveRects(localX, localY, interactiveRects, HIT_PADDING_PX)
    const shouldInteract =
      interactiveRects.length > 0 ? hitRect : rendererHoverHint
    applyHudMouseInteractive(win, shouldInteract, force)
  } catch {
    // ignore transient screen cursor query errors
  }
}

export function setHudInteractiveRects(rects: WindowBoundsRect[]): void {
  interactiveRects = Array.isArray(rects)
    ? rects
        .filter(
          (r) =>
            r &&
            Number.isFinite(r.x) &&
            Number.isFinite(r.y) &&
            Number.isFinite(r.width) &&
            Number.isFinite(r.height) &&
            r.width >= 4 &&
            r.height >= 4
        )
        .slice(0, 24)
    : []
  if (runtime.hudWindow && !runtime.hudWindow.isDestroyed() && runtime.hudWindow.isVisible()) {
    startHudCursorHitTestLoop()
  }
  syncHudInteractiveFromCursor()
}

export function setHudRendererHover(interactive: boolean): void {
  rendererHoverHint = Boolean(interactive)
  const win = runtime.hudWindow
  if (!win || win.isDestroyed() || !win.isVisible()) return
  if (rendererHoverHint) {
    applyHudMouseInteractive(win, true)
  } else {
    syncHudInteractiveFromCursor()
  }
}

export function startHudCursorHitTestLoop(): void {
  if (hitTestTimer) return
  syncHudInteractiveFromCursor(true)
  hitTestTimer = setInterval(() => {
    const win = runtime.hudWindow
    if (!win || win.isDestroyed() || !win.isVisible()) {
      stopHudCursorHitTestLoop()
      return
    }
    syncHudInteractiveFromCursor()
  }, HIT_TEST_INTERVAL_MS)
}

export function stopHudCursorHitTestLoop(): void {
  if (hitTestTimer) {
    clearInterval(hitTestTimer)
    hitTestTimer = null
  }
  lastAppliedInteractive = null
  rendererHoverHint = false
}

export function resetHudInteractiveState(): void {
  stopHudCursorHitTestLoop()
  interactiveRects = []
}
