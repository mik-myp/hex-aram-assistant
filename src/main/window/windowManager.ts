import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app, BrowserWindow, Menu, nativeImage, screen, shell, Tray } from 'electron'
import type { WindowBoundsRect } from '@shared/types'
import { getActiveLeagueWindow } from '../game/windowTracker'
import { terminateOcrWorker } from '../ocr/augmentOcr'
import { runtime, updateService } from '../state/runtimeStore'

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

export function syncHudBoundsToLeagueWindow(): void {
  if (!runtime.hudWindow || runtime.hudWindow.isDestroyed() || runtime.simulatorActive) return
  const tracked = getActiveLeagueWindow()
  if (!tracked) {
    runtime.lastTrackedDipBounds = undefined
    return
  }

  if (runtime.currentPrefs.autoHideWhenUnfocused && !runtime.manuallyHiddenHud) {
    if (!tracked.isForeground && runtime.hudWindow.isVisible()) {
      runtime.hudWindow.hide()
      return
    }
    if (
      tracked.isForeground &&
      !runtime.hudWindow.isVisible() &&
      (runtime.latestLive?.inGame || runtime.latestLcu?.inChampSelect)
    ) {
      runtime.hudWindow.showInactive()
    }
  }

  const dipRect =
    process.platform === 'win32'
      ? screen.screenToDipRect(runtime.hudWindow, tracked.physicalBounds)
      : tracked.physicalBounds

  const disp = screen.getDisplayMatching(dipRect).bounds
  const coversFullMonitor =
    dipRect.x <= disp.x + 1 &&
    dipRect.y <= disp.y + 1 &&
    Math.abs(dipRect.width - disp.width) <= 2 &&
    Math.abs(dipRect.height - disp.height) <= 2

  const safeBounds: WindowBoundsRect = {
    x: dipRect.x,
    y: dipRect.y,
    width: dipRect.width,
    height: coversFullMonitor ? Math.max(360, dipRect.height - 1) : dipRect.height
  }
  runtime.lastTrackedDipBounds = dipRect

  const cur = runtime.hudWindow.getBounds()
  const changed =
    Math.abs(cur.x - safeBounds.x) > 1 ||
    Math.abs(cur.y - safeBounds.y) > 1 ||
    Math.abs(cur.width - safeBounds.width) > 1 ||
    Math.abs(cur.height - safeBounds.height) > 1

  if (changed) {
    runtime.hudWindow.setBounds(safeBounds, false)
  }
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
    runtime.mainWindow?.webContents.send('window:maximized-changed', true)
  })
  runtime.mainWindow.on('unmaximize', () => {
    runtime.mainWindow?.webContents.send('window:maximized-changed', false)
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

  if (runtime.hudWindow && !runtime.hudWindow.isDestroyed()) {
    if (forceShow === true) {
      if (userInitiated) {
        runtime.manuallyHiddenHud = false
        if (isDisconnectedIdle) runtime.userPinnedHudWhileDisconnected = true
      }
      runtime.hudWindow.showInactive()
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
    return true
  }

  if (forceShow === false) return false
  runtime.manuallyHiddenHud = false
  if (userInitiated && isDisconnectedIdle) {
    runtime.userPinnedHudWhileDisconnected = true
  }

  const display = screen.getPrimaryDisplay()
  const bounds = display.bounds

  runtime.hudWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: Math.max(360, bounds.height - 1),
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

  runtime.hudWindow.setAlwaysOnTop(true, 'screen-saver')
  runtime.hudWindow.setIgnoreMouseEvents(true, { forward: true })

  const r = resolveRendererUrl('mini')
  if (r.isUrl) runtime.hudWindow.loadURL(r.target)
  else runtime.hudWindow.loadFile(r.target, { hash: 'mini' })

  runtime.hudWindow.on('closed', () => {
    runtime.hudWindow = null
  })
  return true
}
