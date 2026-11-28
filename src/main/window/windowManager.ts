import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app, BrowserWindow, Menu, nativeImage, screen, shell, Tray } from 'electron'
import { terminateOcrWorker } from '../ocr/augmentOcr'
import { broadcastGameState, runtime, updateService } from '../state/runtimeStore'
import {
  ensureHudTopmost,
  isLeagueCurrentlyForeground,
  normalizeIntegerBounds,
  syncHudBoundsToLeagueWindow
} from './hudBoundsSync'
import {
  resetHudInteractiveState,
  startHudCursorHitTestLoop,
  stopHudCursorHitTestLoop
} from './hudInteraction'

export {
  ensureHudTopmost,
  isLeagueCurrentlyForeground,
  normalizeIntegerBounds,
  syncHudBoundsToLeagueWindow
}

function resolveIconPath(): string {
  const prod = resolve(process.resourcesPath || '', '../resources/icon.png')
  if (existsSync(prod)) return prod
  const dev = resolve(app.getAppPath(), 'resources/icon.png')
  if (existsSync(dev)) return dev
  return resolve(process.cwd(), 'resources/icon.png')
}

function resolveRendererUrl(hash = ''): { isUrl: boolean; target: string } {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    return { isUrl: true, target: hash ? `${devUrl}#${hash}` : devUrl }
  }
  return { isUrl: false, target: join(__dirname, '../renderer/index.html') }
}

export function clearHudIdleDestroyTimer(): void {
  if (runtime.hudIdleDestroyTimer) {
    clearTimeout(runtime.hudIdleDestroyTimer)
    runtime.hudIdleDestroyTimer = null
  }
}

export function scheduleIdleHudHibernation(): void {
  if (
    runtime.hudIdleDestroyTimer ||
    runtime.simulatorActive ||
    runtime.userPinnedHudWhileDisconnected
  ) {
    return
  }
  if (!runtime.hudWindow || runtime.hudWindow.isDestroyed()) return
  runtime.hudWindow.hide()
  runtime.hudIdleDestroyTimer = setTimeout(() => {
    runtime.hudIdleDestroyTimer = null
    if (
      runtime.gameState.connectionMode === 'disconnected' &&
      !runtime.simulatorActive &&
      !runtime.userPinnedHudWhileDisconnected &&
      runtime.hudWindow &&
      !runtime.hudWindow.isDestroyed()
    ) {
      runtime.hudWindow.destroy()
      runtime.hudWindow = null
      terminateOcrWorker().catch(() => {})
    }
  }, 8000)
}

export function createMainWindow(): void {
  const isMac = process.platform === 'darwin'
  runtime.mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#070B12',
    icon: resolveIconPath(),
    title: 'HexBuddy',
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (!isMac) {
    runtime.mainWindow.removeMenu()
  }

  runtime.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  runtime.mainWindow.on('maximize', () => {
    if (runtime.mainWindow && !runtime.mainWindow.isDestroyed()) {
      runtime.mainWindow.webContents.send('window:maximized-changed', true)
    }
  })
  runtime.mainWindow.on('unmaximize', () => {
    if (runtime.mainWindow && !runtime.mainWindow.isDestroyed()) {
      runtime.mainWindow.webContents.send('window:maximized-changed', false)
    }
  })

  const r = resolveRendererUrl()
  if (r.isUrl) runtime.mainWindow.loadURL(r.target)
  else runtime.mainWindow.loadFile(r.target)

  runtime.mainWindow.on('close', () => {
    if (!runtime.isQuitting && !runtime.currentPrefs.minimizeToTray) {
      runtime.isQuitting = true
      app.quit()
    }
  })

  runtime.mainWindow.on('closed', () => {
    runtime.mainWindow = null
  })
}

export function showMainWindow(): void {
  if (!runtime.mainWindow || runtime.mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  runtime.mainWindow.show()
  runtime.mainWindow.focus()
}

export function createSystemTray(onManualOcr: () => void): void {
  try {
    const iconImg = nativeImage
      .createFromPath(resolveIconPath())
      .resize({ width: 18, height: 18 })
    runtime.tray = new Tray(iconImg)
    runtime.tray.setToolTip('HexBuddy · 海克斯大乱斗原位 HUD 助手')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开海斗攻略图鉴与设置中心',
        click: () => showMainWindow()
      },
      {
        label: '显示/隐藏局内原位 HUD (Alt+H)',
        click: () => toggleSpatialHud()
      },
      {
        label: '手动识别当前三选一 (Alt+S)',
        click: () => onManualOcr()
      },
      {
        label: '检查软件版本更新...',
        click: () => {
          showMainWindow()
          updateService.checkForUpdates().catch(() => {})
        }
      },
      { type: 'separator' },
      {
        label: '彻底退出 HexBuddy',
        click: () => {
          runtime.isQuitting = true
          app.quit()
        }
      }
    ])

    runtime.tray.setContextMenu(contextMenu)
    runtime.tray.on('double-click', () => showMainWindow())
  } catch (err) {
    console.warn('[Tray] Failed to create tray:', err)
  }
}

export function toggleSpatialHud(forceShow?: boolean, userInitiated = false): boolean {
  clearHudIdleDestroyTimer()
  const isDisconnectedIdle =
    runtime.gameState.connectionMode === 'disconnected' && !runtime.simulatorActive

  if (forceShow === true && !userInitiated && !runtime.simulatorActive) {
    if (runtime.manuallyHiddenHud) return false
    if (runtime.currentPrefs.autoHideWhenUnfocused && !isLeagueCurrentlyForeground()) {
      return false
    }
  }

  if (runtime.hudWindow && !runtime.hudWindow.isDestroyed()) {
    if (forceShow === true) {
      if (userInitiated) {
        runtime.manuallyHiddenHud = false
        if (isDisconnectedIdle) runtime.userPinnedHudWhileDisconnected = true
      }
      if (!runtime.hudWindow.isVisible()) {
        runtime.hudWindow.showInactive()
      }
      ensureHudTopmost(runtime.hudWindow)
      return true
    }
    if (forceShow === false) {
      if (userInitiated) {
        runtime.manuallyHiddenHud = true
        runtime.userPinnedHudWhileDisconnected = false
      }
      if (isDisconnectedIdle) {
        runtime.hudWindow.destroy()
        runtime.hudWindow = null
      } else {
        runtime.hudWindow.hide()
      }
      return false
    }
    if (runtime.hudWindow.isVisible()) {
      runtime.manuallyHiddenHud = true
      runtime.userPinnedHudWhileDisconnected = false
      if (isDisconnectedIdle) {
        runtime.hudWindow.destroy()
        runtime.hudWindow = null
      } else {
        runtime.hudWindow.hide()
      }
      return false
    }
    runtime.manuallyHiddenHud = false
    if (userInitiated && isDisconnectedIdle) {
      runtime.userPinnedHudWhileDisconnected = true
    }
    runtime.hudWindow.showInactive()
    ensureHudTopmost(runtime.hudWindow)
    return true
  }

  if (forceShow === false) return false
  runtime.manuallyHiddenHud = false
  if (userInitiated && isDisconnectedIdle) {
    runtime.userPinnedHudWhileDisconnected = true
  }

  const rawBounds = screen.getPrimaryDisplay().bounds
  const initBounds = normalizeIntegerBounds({
    x: rawBounds.x,
    y: rawBounds.y,
    width: rawBounds.width,
    height: Math.max(360, rawBounds.height - 1)
  }) || { x: 0, y: 0, width: 1280, height: 719 }

  const hud = new BrowserWindow({
    x: initBounds.x,
    y: initBounds.y,
    width: initBounds.width,
    height: initBounds.height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'HexBuddy Spatial HUD',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  runtime.hudWindow = hud
  hud.setIgnoreMouseEvents(true, { forward: true })
  // Windows 10 2004+ WDA_EXCLUDEFROMCAPTURE: prevents our own HUD from ever being captured by OCR/GDI!
  if (process.platform === 'win32') {
    try {
      hud.setContentProtection(runtime.currentPrefs.excludeHudFromCapture !== false)
    } catch {
      // ignore on older OS builds
    }
  }

  const canRevealNow = (): boolean =>
    userInitiated ||
    runtime.simulatorActive ||
    (!runtime.manuallyHiddenHud &&
      (!runtime.currentPrefs.autoHideWhenUnfocused || isLeagueCurrentlyForeground()))

  hud.webContents.once('did-finish-load', () => {
    if (hud.isDestroyed()) return
    if (canRevealNow()) {
      hud.showInactive()
      ensureHudTopmost(hud)
      startHudCursorHitTestLoop()
    }
    syncHudBoundsToLeagueWindow(true)
    broadcastGameState()
  })

  hud.once('ready-to-show', () => {
    if (!hud.isDestroyed() && !hud.isVisible() && canRevealNow()) {
      hud.showInactive()
      ensureHudTopmost(hud)
      startHudCursorHitTestLoop()
    }
  })

  const r = resolveRendererUrl('mini')
  if (r.isUrl) hud.loadURL(r.target)
  else hud.loadFile(r.target, { hash: 'mini' })

  hud.on('show', () => {
    startHudCursorHitTestLoop()
  })
  hud.on('hide', () => {
    stopHudCursorHitTestLoop()
  })

  hud.on('closed', () => {
    if (runtime.hudWindow === hud) {
      runtime.hudWindow = null
      resetHudInteractiveState()
    }
  })
  return true
}
