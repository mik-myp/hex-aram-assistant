import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron'
import { DataSyncService } from './data/syncService'
import { buildHeroDetailGuide, computeBenchSuggestions } from './data/synergyEngine'
import { ReadOnlyLcuWatcher, type LcuChampSelectSnapshot } from './game/lcuWatcher'
import { ReadOnlyLiveWatcher, type LiveMatchSnapshot } from './game/liveWatcher'
import { createSimulatorScene } from './game/mockSimulator'
import {
  captureScreenAndRecognizeAugments,
  recognizeAugmentsFromDataUrl,
  terminateOcrWorker
} from './ocr/augmentOcr'
import { askCustomLlmAdvisor, computeLocalTacticalAdvice } from './ai/advisorService'
import type { AiSettings, GameLiveState } from '@shared/types'

const DEFAULT_SETTINGS: AiSettings = {
  enabled: true,
  providerName: 'DeepSeek (OpenAI 兼容)',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  shortcutOverlay: 'Alt+H',
  shortcutOcr: 'Alt+S'
}

const syncService = new DataSyncService()
let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let lcuWatcher: ReadOnlyLcuWatcher | null = null
let liveWatcher: ReadOnlyLiveWatcher | null = null

let latestLcu: LcuChampSelectSnapshot | null = null
let latestLive: LiveMatchSnapshot | null = null
let simulatorActive = false

let gameState: GameLiveState = {
  connectionMode: 'disconnected',
  myHeroId: null,
  allyHeroIds: [],
  benchHeroIds: [],
  enemyHeroIds: [],
  currentLevel: 3,
  isAugmentMilestone: false,
  currentItemIds: [],
  pickedAugmentIds: [],
  candidateAugmentIds: [],
  lastUpdatedAt: Date.now()
}

let currentSettings: AiSettings = { ...DEFAULT_SETTINGS }

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'hexbuddy-settings.json')
}

async function loadSettings(): Promise<AiSettings> {
  const p = getSettingsPath()
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(await readFile(p, 'utf-8')) as Partial<AiSettings>
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed }
    } catch {
      currentSettings = { ...DEFAULT_SETTINGS }
    }
  }
  return currentSettings
}

async function saveSettings(next: AiSettings): Promise<AiSettings> {
  currentSettings = { ...DEFAULT_SETTINGS, ...next }
  const p = getSettingsPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(currentSettings, null, 2), 'utf-8')
  registerShortcuts()
  return currentSettings
}

function broadcastGameState(): void {
  gameState = { ...gameState, lastUpdatedAt: Date.now() }
  for (const win of [mainWindow, miniWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('game:state-updated', gameState)
    }
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
      isAugmentMilestone: latestLive.isAugmentMilestone,
      currentItemIds: latestLive.currentItemIds
    }
  } else if (latestLcu?.inChampSelect) {
    gameState = {
      ...gameState,
      connectionMode: 'lcu-champ-select',
      simulatorScene: undefined,
      myHeroId: latestLcu.myHeroId,
      allyHeroIds: latestLcu.allyHeroIds,
      benchHeroIds: latestLcu.benchHeroIds,
      enemyHeroIds: [],
      currentLevel: 3,
      isAugmentMilestone: false,
      currentItemIds: []
    }
  } else {
    gameState = {
      ...gameState,
      connectionMode: 'disconnected',
      simulatorScene: undefined,
      benchHeroIds: []
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
    width: 1320,
    height: 860,
    minWidth: 1024,
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

function toggleMiniOverlay(forceShow?: boolean): boolean {
  if (miniWindow && !miniWindow.isDestroyed()) {
    if (forceShow === true) {
      miniWindow.show()
      miniWindow.focus()
      return true
    }
    if (miniWindow.isVisible()) {
      miniWindow.hide()
      return false
    }
    miniWindow.show()
    miniWindow.focus()
    return true
  }

  if (forceShow === false) return false

  const display = screen.getPrimaryDisplay()
  const { width } = display.workAreaSize

  miniWindow = new BrowserWindow({
    width: 430,
    height: 610,
    x: Math.max(20, width - 460),
    y: 72,
    minWidth: 380,
    minHeight: 460,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    backgroundColor: '#080D16',
    title: 'HexBuddy 局内三选一悬浮窗',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  miniWindow.setAlwaysOnTop(true, 'floating')
  const r = resolveRendererUrl('mini')
  if (r.isUrl) {
    miniWindow.loadURL(r.target)
  } else {
    miniWindow.loadFile(r.target, { hash: 'mini' })
  }

  miniWindow.on('closed', () => {
    miniWindow = null
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
      settings: currentSettings
    }
  })

  ipcMain.handle('data:get-hero-guide', (_, heroId: string) => {
    const bundle = syncService.getBundle()
    return buildHeroDetailGuide(bundle, heroId)
  })

  ipcMain.handle('data:get-bench-suggestions', (_, myHeroId: string | null, allyIds: string[], benchIds: string[]) => {
    const bundle = syncService.getBundle()
    return computeBenchSuggestions(bundle, myHeroId, allyIds, benchIds)
  })

  ipcMain.handle('data:sync-now', async (_, force?: boolean) => {
    const res = await syncService.checkAndSync(Boolean(force))
    return {
      ...res,
      heroes: syncService.getBundle().heroes,
      augments: syncService.getBundle().augments,
      items: syncService.getBundle().items
    }
  })

  ipcMain.handle('game:set-simulator', (_, scene: 'off' | 'champ-select' | 'level-7-pick' | 'teamfight-5v5') => {
    if (scene === 'off') {
      simulatorActive = false
      recomputeRealGameState()
      return gameState
    }
    simulatorActive = true
    gameState = createSimulatorScene(scene, syncService.getBundle())
    broadcastGameState()
    return gameState
  })

  ipcMain.handle('game:update-augments', (_, payload: { pickedAugmentIds?: string[]; candidateAugmentIds?: string[]; myHeroId?: string | null }) => {
    gameState = {
      ...gameState,
      ...(payload.pickedAugmentIds !== undefined ? { pickedAugmentIds: payload.pickedAugmentIds.slice(0, 4) } : {}),
      ...(payload.candidateAugmentIds !== undefined ? { candidateAugmentIds: payload.candidateAugmentIds.slice(0, 3) } : {}),
      ...(payload.myHeroId !== undefined ? { myHeroId: payload.myHeroId } : {})
    }
    broadcastGameState()
    return gameState
  })

  ipcMain.handle('ocr:capture-screen', async () => {
    const bundle = syncService.getBundle()
    const res = await captureScreenAndRecognizeAugments(bundle.augments)
    if (res.matchedAugmentIds.length > 0) {
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

  ipcMain.handle('window:toggle-mini', (_, forceShow?: boolean) => {
    return toggleMiniOverlay(forceShow)
  })

  ipcMain.handle('window:open-external', (_, url: string) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })
}

app.whenReady().then(async () => {
  await loadSettings()
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

  // Non-blocking background check for newer stats dataset
  syncService.checkAndSync(false).catch(() => {
    // Offline fallback already active
  })

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
