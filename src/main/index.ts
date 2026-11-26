import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron'
import { DataSyncService } from './data/syncService'
import {
  buildAugmentReverseDetail,
  buildHeroDetailGuide,
  computeBenchSuggestions
} from './data/synergyEngine'
import { ReadOnlyLcuWatcher, type LcuChampSelectSnapshot } from './game/lcuWatcher'
import { ReadOnlyLiveWatcher, type LiveMatchSnapshot } from './game/liveWatcher'
import { createSimulatorScene } from './game/mockSimulator'
import {
  captureScreenAndRecognizeAugments,
  recognizeAugmentsFromDataUrl,
  terminateOcrWorker
} from './ocr/augmentOcr'
import { askCustomLlmAdvisor, computeLocalTacticalAdvice } from './ai/advisorService'
import type { AiSettings, GameLiveState, UserPreferences } from '@shared/types'

const DEFAULT_SETTINGS: AiSettings = {
  enabled: true,
  providerName: 'DeepSeek (OpenAI 兼容)',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  shortcutOverlay: 'Alt+H',
  shortcutOcr: 'Alt+S'
}

const DEFAULT_PREFS: UserPreferences = {
  preferredRoles: [],
  favoriteHeroIds: [],
  overlayOpacity: 'solid',
  autoOcrOnMilestone: true
}

const syncService = new DataSyncService()
let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let miniClickThrough = false
let lcuWatcher: ReadOnlyLcuWatcher | null = null
let liveWatcher: ReadOnlyLiveWatcher | null = null

let latestLcu: LcuChampSelectSnapshot | null = null
let latestLive: LiveMatchSnapshot | null = null
let simulatorActive = false

// Zero-FPS-drop milestone OCR guard: tracks milestones resolved per match
const resolvedMilestones = new Set<number>()
const milestoneAttempts = new Map<number, number>()
let autoOcrRunning = false
let lastAutoOcrAt = 0

let gameState: GameLiveState = {
  connectionMode: 'disconnected',
  myHeroId: null,
  allyHeroIds: [],
  benchHeroIds: [],
  enemyHeroIds: [],
  currentLevel: 3,
  isDead: false,
  isAugmentMilestone: false,
  currentItemIds: [],
  pickedAugmentIds: [],
  candidateAugmentIds: [],
  lastUpdatedAt: Date.now()
}

let currentSettings: AiSettings = { ...DEFAULT_SETTINGS }
let currentPrefs: UserPreferences = { ...DEFAULT_PREFS }

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'hexbuddy-settings.json')
}

function getPrefsPath(): string {
  return join(app.getPath('userData'), 'hexbuddy-prefs.json')
}

async function loadSettingsAndPrefs(): Promise<void> {
  const sp = getSettingsPath()
  if (existsSync(sp)) {
    try {
      const parsed = JSON.parse(await readFile(sp, 'utf-8')) as Partial<AiSettings>
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed }
    } catch {
      currentSettings = { ...DEFAULT_SETTINGS }
    }
  }
  const pp = getPrefsPath()
  if (existsSync(pp)) {
    try {
      const parsed = JSON.parse(await readFile(pp, 'utf-8')) as Partial<UserPreferences>
      currentPrefs = { ...DEFAULT_PREFS, ...parsed }
    } catch {
      currentPrefs = { ...DEFAULT_PREFS }
    }
  }
}

async function saveSettings(next: AiSettings): Promise<AiSettings> {
  currentSettings = { ...DEFAULT_SETTINGS, ...next }
  const p = getSettingsPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(currentSettings, null, 2), 'utf-8')
  registerShortcuts()
  return currentSettings
}

async function savePrefs(next: Partial<UserPreferences>): Promise<UserPreferences> {
  currentPrefs = { ...currentPrefs, ...next }
  const p = getPrefsPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(currentPrefs, null, 2), 'utf-8')
  for (const win of [mainWindow, miniWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('prefs:updated', currentPrefs)
    }
  }
  return currentPrefs
}

function broadcastGameState(): void {
  gameState = { ...gameState, lastUpdatedAt: Date.now() }
  for (const win of [mainWindow, miniWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('game:state-updated', gameState)
    }
  }
}

function currentActiveMilestone(level: number): number {
  if (level >= 15) return 15
  if (level >= 11) return 11
  if (level >= 7) return 7
  return 3
}

/**
 * 2999 Event-Driven Zero-FPS-Drop Auto OCR:
 * Strictly dormant during alive combat; runs at most 3 gentle checks ONLY during
 * Lv3 fountain start or Lv7/11/15 respawn selection windows!
 */
async function maybeTriggerMilestoneAutoOcr(snap: LiveMatchSnapshot): Promise<void> {
  if (!currentPrefs.autoOcrOnMilestone || autoOcrRunning) return
  if (gameState.candidateAugmentIds.length >= 2) return

  const m = currentActiveMilestone(snap.currentLevel)
  if (resolvedMilestones.has(m)) return

  const isEligibleWindow = m === 3 || snap.isDead
  if (!isEligibleWindow) return

  const tries = milestoneAttempts.get(m) ?? 0
  if (tries >= 3) return
  if (Date.now() - lastAutoOcrAt < 3800) return

  autoOcrRunning = true
  lastAutoOcrAt = Date.now()
  milestoneAttempts.set(m, tries + 1)

  try {
    const bundle = syncService.getBundle()
    const res = await captureScreenAndRecognizeAugments(bundle.augments)
    if (res.matchedAugmentIds.length >= 2) {
      resolvedMilestones.add(m)
      gameState = {
        ...gameState,
        candidateAugmentIds: res.matchedAugmentIds
      }
      toggleMiniOverlay(true)
      resizeMiniOverlay(false)
      broadcastGameState()
      for (const win of [mainWindow, miniWindow]) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('ocr:result', res)
        }
      }
    }
  } finally {
    autoOcrRunning = false
  }
}

function recomputeRealGameState(): void {
  if (simulatorActive) return

  if (latestLive?.inGame) {
    gameState = {
      ...gameState,
      connectionMode: 'live-in-game',
      simulatorScene: undefined,
      myHeroId: latestLive.myHeroId || gameState.myHeroId,
      allyHeroIds: latestLive.allyHeroIds,
      benchHeroIds: [],
      enemyHeroIds: latestLive.enemyHeroIds,
      currentLevel: latestLive.currentLevel,
      isDead: latestLive.isDead,
      isAugmentMilestone: latestLive.isAugmentMilestone,
      currentItemIds: latestLive.currentItemIds
    }
    maybeTriggerMilestoneAutoOcr(latestLive).catch(() => {})
  } else if (latestLcu?.inChampSelect) {
    // Reset per-match milestone tracker when entering a fresh champ select
    resolvedMilestones.clear()
    milestoneAttempts.clear()
    gameState = {
      ...gameState,
      connectionMode: 'lcu-champ-select',
      simulatorScene: undefined,
      myHeroId: latestLcu.myHeroId,
      allyHeroIds: latestLcu.allyHeroIds,
      benchHeroIds: latestLcu.benchHeroIds,
      enemyHeroIds: [],
      currentLevel: 3,
      isDead: false,
      isAugmentMilestone: false,
      currentItemIds: []
    }
  } else {
    gameState = {
      ...gameState,
      connectionMode: 'disconnected',
      simulatorScene: undefined,
      benchHeroIds: [],
      isDead: false
    }
  }
  broadcastGameState()
}

function resolveRendererUrl(hash = ''): { isUrl: boolean; target: string } {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    return { isUrl: true, target: hash ? `${devUrl}#${hash}` : devUrl }
  }
  return { isUrl: false, target: join(__dirname, '../renderer/index.html') }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 870,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#070B12',
    title: 'HexBuddy · 海斗军师',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const r = resolveRendererUrl()
  if (r.isUrl) {
    mainWindow.loadURL(r.target)
  } else {
    mainWindow.loadFile(r.target)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setMiniClickThroughState(ignore: boolean, tempHover = false): boolean {
  if (!tempHover) {
    miniClickThrough = ignore
  }
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.setIgnoreMouseEvents(ignore, { forward: true })
    if (!tempHover) {
      miniWindow.webContents.send('mini:click-through-changed', miniClickThrough)
    }
  }
  return miniClickThrough
}

function resizeMiniOverlay(collapsed: boolean): void {
  if (!miniWindow || miniWindow.isDestroyed()) return
  const [x, y] = miniWindow.getPosition()
  if (collapsed) {
    miniWindow.setMinimumSize(320, 48)
    miniWindow.setSize(400, 50, false)
    miniWindow.setPosition(x, y, false)
  } else {
    miniWindow.setMinimumSize(380, 420)
    miniWindow.setSize(440, 590, false)
    miniWindow.setPosition(x, y, false)
  }
}

function toggleMiniOverlay(forceShow?: boolean): boolean {
  if (miniWindow && !miniWindow.isDestroyed()) {
    // Pressing Alt+H while click-through is locked unlocks interaction first so user is never stuck!
    if (miniClickThrough && forceShow === undefined) {
      setMiniClickThroughState(false)
      miniWindow.show()
      return true
    }
    if (forceShow === true) {
      miniWindow.show()
      return true
    }
    if (miniWindow.isVisible()) {
      miniWindow.hide()
      return false
    }
    miniWindow.show()
    return true
  }

  if (forceShow === false) return false

  const display = screen.getPrimaryDisplay()
  const { width } = display.workAreaSize

  miniWindow = new BrowserWindow({
    width: 440,
    height: 590,
    x: Math.max(20, width - 460),
    y: 56,
    minWidth: 320,
    minHeight: 48,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    title: 'HexBuddy 局内悬浮窗',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  miniWindow.setAlwaysOnTop(true, 'screen-saver')
  const r = resolveRendererUrl('mini')
  if (r.isUrl) {
    miniWindow.loadURL(r.target)
  } else {
    miniWindow.loadFile(r.target, { hash: 'mini' })
  }

  miniWindow.on('closed', () => {
    miniWindow = null
    miniClickThrough = false
  })
  return true
}

function registerShortcuts(): void {
  globalShortcut.unregisterAll()
  try {
    if (currentSettings.shortcutOverlay) {
      globalShortcut.register(currentSettings.shortcutOverlay, () => {
        toggleMiniOverlay()
      })
    }
  } catch (err) {
    console.warn('[Shortcut] Overlay shortcut register failed:', err)
  }

  try {
    if (currentSettings.shortcutOcr) {
      globalShortcut.register(currentSettings.shortcutOcr, async () => {
        toggleMiniOverlay(true)
        resizeMiniOverlay(false)
        const bundle = syncService.getBundle()
        const result = await captureScreenAndRecognizeAugments(bundle.augments)
        if (result.matchedAugmentIds.length > 0) {
          gameState = {
            ...gameState,
            candidateAugmentIds: result.matchedAugmentIds
          }
          broadcastGameState()
        }
        for (const win of [mainWindow, miniWindow]) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('ocr:result', result)
          }
        }
      })
    }
  } catch (err) {
    console.warn('[Shortcut] OCR shortcut register failed:', err)
  }
}

function setupIpcHandlers(): void {
  ipcMain.handle('data:get-bootstrap', () => {
    const bundle = syncService.getBundle()
    return {
      meta: bundle.meta,
      heroes: bundle.heroes,
      augments: bundle.augments,
      items: bundle.items,
      gameState,
      settings: currentSettings,
      prefs: currentPrefs,
      miniClickThrough
    }
  })

  ipcMain.handle('data:get-hero-guide', (_, heroId: string) => {
    return buildHeroDetailGuide(syncService.getBundle(), heroId)
  })

  ipcMain.handle('data:get-augment-reverse', (_, augmentId: string) => {
    return buildAugmentReverseDetail(syncService.getBundle(), augmentId)
  })

  ipcMain.handle(
    'data:get-bench-suggestions',
    (_, myHeroId: string | null, allyIds: string[], benchIds: string[]) => {
      return computeBenchSuggestions(
        syncService.getBundle(),
        myHeroId,
        allyIds,
        benchIds,
        currentPrefs
      )
    }
  )

  ipcMain.handle('data:sync-now', async (_, force?: boolean) => {
    const res = await syncService.checkAndSync(Boolean(force))
    const b = syncService.getBundle()
    return { ...res, heroes: b.heroes, augments: b.augments, items: b.items }
  })

  ipcMain.handle('data:switch-dataset', async (_, datasetPath: string, band: 'all' | 'high') => {
    const res = await syncService.switchDataset(datasetPath, band)
    const b = syncService.getBundle()
    return { ...res, heroes: b.heroes, augments: b.augments, items: b.items }
  })

  ipcMain.handle(
    'game:set-simulator',
    (_, scene: 'off' | 'champ-select' | 'level-7-pick' | 'teamfight-5v5') => {
      if (scene === 'off') {
        simulatorActive = false
        recomputeRealGameState()
        return gameState
      }
      simulatorActive = true
      gameState = createSimulatorScene(scene, syncService.getBundle())
      broadcastGameState()
      return gameState
    }
  )

  ipcMain.handle(
    'game:update-augments',
    (
      _,
      payload: {
        pickedAugmentIds?: string[]
        candidateAugmentIds?: string[]
        myHeroId?: string | null
      }
    ) => {
      gameState = {
        ...gameState,
        ...(payload.pickedAugmentIds !== undefined
          ? { pickedAugmentIds: payload.pickedAugmentIds.slice(0, 4) }
          : {}),
        ...(payload.candidateAugmentIds !== undefined
          ? { candidateAugmentIds: payload.candidateAugmentIds.slice(0, 3) }
          : {}),
        ...(payload.myHeroId !== undefined ? { myHeroId: payload.myHeroId } : {})
      }
      broadcastGameState()
      return gameState
    }
  )

  ipcMain.handle('ocr:capture-screen', async () => {
    const bundle = syncService.getBundle()
    const res = await captureScreenAndRecognizeAugments(bundle.augments)
    if (res.matchedAugmentIds.length > 0) {
      resizeMiniOverlay(false)
      gameState = { ...gameState, candidateAugmentIds: res.matchedAugmentIds }
      broadcastGameState()
    }
    return res
  })

  ipcMain.handle('ocr:recognize-image', async (_, imageDataUrl: string) => {
    const bundle = syncService.getBundle()
    const res = await recognizeAugmentsFromDataUrl(imageDataUrl, bundle.augments)
    if (res.matchedAugmentIds.length > 0) {
      gameState = { ...gameState, candidateAugmentIds: res.matchedAugmentIds }
      broadcastGameState()
    }
    return res
  })

  ipcMain.handle('ai:get-tactical-advice', (_, selectedHeroId: string | null) => {
    return computeLocalTacticalAdvice(syncService.getBundle(), gameState, selectedHeroId)
  })

  ipcMain.handle('ai:ask-llm', async (_, selectedHeroId: string | null, userQuestion?: string) => {
    return askCustomLlmAdvisor({
      bundle: syncService.getBundle(),
      state: gameState,
      selectedHeroId,
      settings: currentSettings,
      userQuestion
    })
  })

  ipcMain.handle('settings:save', async (_, next: AiSettings) => {
    return saveSettings(next)
  })

  ipcMain.handle('prefs:save', async (_, next: Partial<UserPreferences>) => {
    return savePrefs(next)
  })

  ipcMain.handle('window:toggle-mini', (_, forceShow?: boolean) => {
    return toggleMiniOverlay(forceShow)
  })

  ipcMain.handle('window:resize-mini', (_, collapsed: boolean) => {
    resizeMiniOverlay(collapsed)
  })

  ipcMain.handle(
    'window:set-mini-click-through',
    (_, ignore: boolean, tempHover?: boolean) => {
      return setMiniClickThroughState(ignore, Boolean(tempHover))
    }
  )

  ipcMain.handle('window:open-external', (_, url: string) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })
}

app.whenReady().then(async () => {
  await loadSettingsAndPrefs()
  await syncService.init()
  setupIpcHandlers()
  createMainWindow()
  registerShortcuts()

  lcuWatcher = new ReadOnlyLcuWatcher((snap) => {
    latestLcu = snap
    recomputeRealGameState()
  })
  liveWatcher = new ReadOnlyLiveWatcher(
    () => syncService.getBundle().heroes,
    (snap) => {
      latestLive = snap
      recomputeRealGameState()
    }
  )
  lcuWatcher.start()
  liveWatcher.start()

  syncService.checkAndSync(false).catch(() => {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  globalShortcut.unregisterAll()
  lcuWatcher?.stop()
  liveWatcher?.stop()
  await terminateOcrWorker()
})
