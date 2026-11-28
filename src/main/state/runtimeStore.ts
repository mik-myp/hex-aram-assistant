import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, type BrowserWindow, clipboard, session, type Tray } from 'electron'
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_USER_PREFERENCES,
  sanitizeAiSettings,
  sanitizeUserPreferences
} from '@shared/configSchema'
import type {
  AiSettings,
  AugmentOfferSlotIndex,
  CacheStatsInfo,
  GameLiveState,
  MatchOutcome,
  ShortcutStatusMap,
  UserPreferences,
  WindowBoundsRect
} from '@shared/types'
import { DataSyncService } from '../data/syncService'
import type { LcuChampSelectSnapshot, ReadOnlyLcuWatcher } from '../game/lcuWatcher'
import type { LiveMatchSnapshot, ReadOnlyLiveWatcher } from '../game/liveWatcher'
import { getLogDirPath, logDiag } from '../logger/diagLogger'
import { AppUpdateService } from '../updater/updateService'

export const syncService = new DataSyncService()
export const updateService = new AppUpdateService()

export const runtime = {
  mainWindow: null as BrowserWindow | null,
  hudWindow: null as BrowserWindow | null,
  tray: null as Tray | null,
  isQuitting: false,

  lcuWatcher: null as ReadOnlyLcuWatcher | null,
  liveWatcher: null as ReadOnlyLiveWatcher | null,
  hudLoopTimer: null as NodeJS.Timeout | null,

  latestLcu: null as LcuChampSelectSnapshot | null,
  latestLive: null as LiveMatchSnapshot | null,
  simulatorActive: false,

  resolvedMilestones: new Set<number>(),
  milestoneAttempts: new Map<number, number>(),
  ocrBusy: false,
  lastOcrScanAt: 0,
  emptyOfferScans: 0,
  lastHoveredCardSlot: 1 as AugmentOfferSlotIndex,
  manuallyHiddenHud: false,
  userPinnedHudWhileDisconnected: false,
  hudIdleDestroyTimer: null as NodeJS.Timeout | null,

  wasLiveInGame: false,
  wasInChampSelect: false,
  wasDeadInLive: false,
  lastRespawnedAt: 0,
  matchEnteredAt: 0,
  lastLiveMatchStats: null as {
    kills: number
    deaths: number
    assists: number
    gameTimeSec: number
    result: MatchOutcome
  } | null,
  lastTrackedDipBounds: undefined as WindowBoundsRect | undefined,
  lastTrackedPhysicalBounds: undefined as WindowBoundsRect | undefined,

  shortcutRecordingPaused: false,
  clipboardRestoreTimer: null as NodeJS.Timeout | null,
  shortcutStatus: {
    overlay: { accelerator: DEFAULT_AI_SETTINGS.shortcutOverlay, registered: false },
    ocr: { accelerator: DEFAULT_AI_SETTINGS.shortcutOcr, registered: false }
  } as ShortcutStatusMap,

  gameState: {
    connectionMode: 'disconnected',
    myHeroId: null,
    allyHeroIds: [],
    benchHeroIds: [],
    enemyHeroIds: [],
    enemyPlayers: [],
    currentLevel: 3,
    currentGold: 1400,
    isDead: false,
    isAugmentMilestone: false,
    currentItemIds: [],
    pickedAugmentIds: [],
    candidateAugmentIds: [],
    cardSlots: [],
    lastUpdatedAt: Date.now()
  } as GameLiveState,

  currentSettings: { ...DEFAULT_AI_SETTINGS } as AiSettings,
  currentPrefs: { ...DEFAULT_USER_PREFERENCES } as UserPreferences
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'hexbuddy-settings.json')
}

function getPrefsPath(): string {
  return join(app.getPath('userData'), 'hexbuddy-prefs-v3.json')
}

export async function loadSettingsAndPrefs(): Promise<void> {
  const sp = getSettingsPath()
  if (existsSync(sp)) {
    try {
      runtime.currentSettings = sanitizeAiSettings(JSON.parse(await readFile(sp, 'utf-8')))
    } catch {
      runtime.currentSettings = { ...DEFAULT_AI_SETTINGS }
    }
  }
  const pp = getPrefsPath()
  if (existsSync(pp)) {
    try {
      runtime.currentPrefs = sanitizeUserPreferences(JSON.parse(await readFile(pp, 'utf-8')))
    } catch {
      runtime.currentPrefs = { ...DEFAULT_USER_PREFERENCES }
    }
  }
}

export async function saveSettingsToDisk(
  next: AiSettings,
  onAfterSave?: () => void
): Promise<AiSettings> {
  runtime.currentSettings = sanitizeAiSettings(next)
  const p = getSettingsPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(runtime.currentSettings, null, 2), 'utf-8')
  onAfterSave?.()
  for (const win of [runtime.mainWindow, runtime.hudWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings:updated', runtime.currentSettings)
    }
  }
  return runtime.currentSettings
}

export async function savePrefsToDisk(next: Partial<UserPreferences>): Promise<UserPreferences> {
  const prevLaunch = Boolean(runtime.currentPrefs.launchAtLogin)
  runtime.currentPrefs = sanitizeUserPreferences({ ...runtime.currentPrefs, ...next })

  const p = getPrefsPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(runtime.currentPrefs, null, 2), 'utf-8')

  if (app.isPackaged && Boolean(runtime.currentPrefs.launchAtLogin) !== prevLaunch) {
    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(runtime.currentPrefs.launchAtLogin),
        args: ['--hidden']
      })
      logDiag(
        'PREFS',
        `Updated launchAtLogin=${Boolean(runtime.currentPrefs.launchAtLogin)} (--hidden)`
      )
    } catch {
      // ignore on unsupported environments
    }
  }

  if (
    process.platform === 'win32' &&
    next.excludeHudFromCapture !== undefined &&
    runtime.hudWindow &&
    !runtime.hudWindow.isDestroyed()
  ) {
    try {
      runtime.hudWindow.setContentProtection(Boolean(runtime.currentPrefs.excludeHudFromCapture))
    } catch {
      // ignore on unsupported OS builds
    }
  }

  for (const win of [runtime.mainWindow, runtime.hudWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('prefs:updated', runtime.currentPrefs)
    }
  }
  return runtime.currentPrefs
}

export function broadcastGameState(): void {
  runtime.gameState = { ...runtime.gameState, lastUpdatedAt: Date.now() }
  for (const win of [runtime.mainWindow, runtime.hudWindow]) {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      try {
        win.webContents.send('game:state-updated', runtime.gameState)
      } catch {
        // ignore transient renderer teardown race
      }
    }
  }
}

export function isInActiveMatchOrChampSelect(): boolean {
  return (
    runtime.gameState.connectionMode === 'lcu-champ-select' ||
    runtime.gameState.connectionMode === 'live-in-game'
  )
}

export async function computeCacheStats(): Promise<CacheStatsInfo> {
  const bundleBytes = await syncService.getCachedBundleBytes()
  let logBytes = 0
  const logDir = getLogDirPath()
  if (existsSync(logDir)) {
    const names = await readdir(logDir).catch(() => [])
    for (const n of names) {
      const st = await stat(join(logDir, n)).catch(() => null)
      if (st?.isFile()) logBytes += st.size
    }
  }
  const chromiumCacheBytes = await session.defaultSession.getCacheSize().catch(() => 0)
  return {
    bundleBytes,
    logBytes,
    chromiumCacheBytes,
    totalBytes: bundleBytes + logBytes + chromiumCacheBytes
  }
}

export function copyShopItemWithOptionalRestore(itemName: string): { restoredAfterSec: number } {
  if (typeof itemName !== 'string' || !itemName) {
    return { restoredAfterSec: 0 }
  }
  const prevClip = runtime.currentPrefs.restoreClipboardAfterCopy ? clipboard.readText() : ''
  clipboard.writeText(itemName)
  if (runtime.clipboardRestoreTimer) {
    clearTimeout(runtime.clipboardRestoreTimer)
    runtime.clipboardRestoreTimer = null
  }
  if (runtime.currentPrefs.restoreClipboardAfterCopy) {
    runtime.clipboardRestoreTimer = setTimeout(() => {
      try {
        if (clipboard.readText() === itemName) {
          clipboard.writeText(prevClip)
        }
      } catch {
        // ignore clipboard race
      }
      runtime.clipboardRestoreTimer = null
    }, 10_000)
    return { restoredAfterSec: 10 }
  }
  return { restoredAfterSec: 0 }
}
