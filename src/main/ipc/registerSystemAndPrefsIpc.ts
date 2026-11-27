import { existsSync } from 'node:fs'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, clipboard, dialog, ipcMain, session, shell } from 'electron'
import {
  buildConfigBackupJson,
  DEFAULT_AI_SETTINGS,
  DEFAULT_USER_PREFERENCES,
  parseConfigBackupJson
} from '@shared/configSchema'
import type { AiSettings, UserPreferences } from '@shared/types'
import { triggerManualHudOcr } from '../game/visionLoop'
import { checkWindowsElevationParity, relaunchAsWindowsAdmin } from '../game/windowTracker'
import { buildDiagnosticSummary, getLogDirPath } from '../logger/diagLogger'
import { getOcrDiagnosticStatus } from '../ocr/augmentOcr'
import {
  registerGlobalShortcuts,
  setShortcutRecordingPaused
} from '../shortcuts/shortcutManager'
import {
  computeCacheStats,
  copyShopItemWithOptionalRestore,
  runtime,
  savePrefsToDisk,
  saveSettingsToDisk,
  syncService,
  updateService
} from '../state/runtimeStore'
import { showMainWindow, toggleSpatialHud } from '../window/windowManager'

export function registerSystemAndPrefsIpc(): void {
  const shortcutCallbacks = {
    onToggleHud: () => {
      toggleSpatialHud()
    },
    onManualOcr: () => {
      triggerManualHudOcr()
    }
  }

  ipcMain.handle('settings:save', async (_, next: AiSettings) =>
    saveSettingsToDisk(next, () => registerGlobalShortcuts(shortcutCallbacks))
  )

  ipcMain.handle('prefs:save', async (_, next: Partial<UserPreferences>) => savePrefsToDisk(next))

  ipcMain.handle('shortcuts:get-status', () => runtime.shortcutStatus)

  ipcMain.handle('shortcuts:set-recording', (_, paused: boolean) => {
    setShortcutRecordingPaused(paused, shortcutCallbacks)
  })

  ipcMain.handle('prefs:reset-defaults', async () => {
    const nextPrefs = await savePrefsToDisk({
      ...DEFAULT_USER_PREFERENCES,
      onboardingDismissed: true
    })
    const nextSettings = await saveSettingsToDisk(
      { ...DEFAULT_AI_SETTINGS, apiKey: runtime.currentSettings.apiKey },
      () => registerGlobalShortcuts(shortcutCallbacks)
    )
    return { settings: nextSettings, prefs: nextPrefs, shortcutStatus: runtime.shortcutStatus }
  })

  ipcMain.handle('prefs:export-config', async () => {
    const opts = {
      title: '导出 HexBuddy 偏好与设置备份',
      defaultPath: `hexbuddy-config-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON 配置文件', extensions: ['json'] }]
    }
    const res = runtime.mainWindow
      ? await dialog.showSaveDialog(runtime.mainWindow, opts)
      : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return { ok: false, message: '已取消导出' }
    await writeFile(
      res.filePath,
      buildConfigBackupJson(runtime.currentPrefs, runtime.currentSettings),
      'utf-8'
    )
    return { ok: true, message: '已导出配置备份（API Key 已自动脱敏剔除）' }
  })

  ipcMain.handle('prefs:import-config', async () => {
    const opts = {
      title: '导入 HexBuddy 偏好与设置备份',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON 配置文件', extensions: ['json'] }]
    }
    const res = runtime.mainWindow
      ? await dialog.showOpenDialog(runtime.mainWindow, opts)
      : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return { ok: false, message: '已取消导入' }
    try {
      const raw = await readFile(res.filePaths[0], 'utf-8')
      const parsed = parseConfigBackupJson(raw, runtime.currentSettings.apiKey)
      const nextPrefs = await savePrefsToDisk(parsed.prefs)
      const nextSettings = await saveSettingsToDisk(parsed.settings, () =>
        registerGlobalShortcuts(shortcutCallbacks)
      )
      return {
        ok: true,
        message: '配置导入成功并已立即生效',
        settings: nextSettings,
        prefs: nextPrefs,
        shortcutStatus: runtime.shortcutStatus
      }
    } catch (err) {
      return {
        ok: false,
        message: `导入失败：${err instanceof Error ? err.message : String(err)}`
      }
    }
  })

  ipcMain.handle('system:get-cache-stats', () => computeCacheStats())

  ipcMain.handle('system:clear-cache', async () => {
    await session.defaultSession.clearCache().catch(() => {})
    const meta = await syncService.clearCachedBundle()
    const logDir = getLogDirPath()
    if (existsSync(logDir)) {
      const names = await readdir(logDir).catch(() => [])
      for (const n of names) {
        if (n.endsWith('.log')) await rm(join(logDir, n), { force: true }).catch(() => {})
      }
    }
    const stats = await computeCacheStats()
    return {
      ok: true,
      message: '已清理本地图片缓存、热更快照与历史日志（已回退至内置离线种子）',
      stats,
      meta
    }
  })

  ipcMain.handle('window:toggle-mini', (_, forceShow?: boolean) => toggleSpatialHud(forceShow, true))
  ipcMain.handle('window:show-main', () => showMainWindow())
  ipcMain.handle('window:minimize-main', () => runtime.mainWindow?.minimize())
  ipcMain.handle('window:toggle-maximize-main', () => {
    if (!runtime.mainWindow || runtime.mainWindow.isDestroyed()) return false
    if (runtime.mainWindow.isMaximized()) {
      runtime.mainWindow.unmaximize()
      return false
    }
    runtime.mainWindow.maximize()
    return true
  })
  ipcMain.handle('window:close-main', () => runtime.mainWindow?.close())
  ipcMain.handle('window:set-hud-interactive', (_, interactive: boolean) => {
    if (runtime.hudWindow && !runtime.hudWindow.isDestroyed()) {
      runtime.hudWindow.setIgnoreMouseEvents(!interactive, { forward: true })
    }
  })
  ipcMain.handle('window:open-external', (_, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  ipcMain.handle('updater:get-state', () => updateService.getState())
  ipcMain.handle('updater:check', () => updateService.checkForUpdates())
  ipcMain.handle('updater:download', () => updateService.downloadUpdate())
  ipcMain.handle('updater:install', () =>
    updateService.installDownloadedUpdate(() => {
      runtime.isQuitting = true
    })
  )

  ipcMain.handle('system:copy-text', (_, text: string) => {
    if (typeof text === 'string' && text) clipboard.writeText(text)
  })
  ipcMain.handle('system:copy-shop-item', (_, itemName: string) =>
    copyShopItemWithOptionalRestore(itemName)
  )

  ipcMain.handle('system:get-diagnostics', async () => {
    const elev = checkWindowsElevationParity()
    const meta = syncService.getMeta()
    const trackedStr = runtime.lastTrackedDipBounds
      ? `${runtime.gameState.targetWindowKind || 'game'} ${runtime.lastTrackedDipBounds.width}x${runtime.lastTrackedDipBounds.height} @(${runtime.lastTrackedDipBounds.x},${runtime.lastTrackedDipBounds.y})`
      : '未锁定游戏窗口'
    return buildDiagnosticSummary({
      isSelfElevated: elev.isSelfElevated,
      leagueElevatedMismatch: elev.leagueElevatedMismatch,
      connectionMode: runtime.gameState.connectionMode,
      trackedWindowSummary: trackedStr,
      ocrEngineSummary: getOcrDiagnosticStatus(runtime.currentPrefs.ocrEngineMode),
      datasetSummary: `${meta.patch} (${meta.modeLabel} · seq#${meta.seq} · ${meta.fromSource})`
    })
  })

  ipcMain.handle('system:open-log-dir', () => shell.openPath(getLogDirPath()))

  ipcMain.handle('system:relaunch-admin', () => {
    if (process.platform !== 'win32') return false
    const targetExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
    const args = process.env.PORTABLE_EXECUTABLE_FILE ? [] : process.argv.slice(1)
    const launched = relaunchAsWindowsAdmin(targetExe, args)
    if (launched) {
      runtime.isQuitting = true
      setTimeout(() => app.quit(), 150)
    }
    return launched
  })
}
