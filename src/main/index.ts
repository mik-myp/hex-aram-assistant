import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray
} from 'electron'
import { DataSyncService } from './data/syncService'
import {
  buildAugmentReverseDetail,
  buildHeroDetailGuide,
  computeBenchSuggestions
} from './data/synergyEngine'
import { ReadOnlyLcuWatcher, type LcuChampSelectSnapshot } from './game/lcuWatcher'
import { ReadOnlyLiveWatcher, type LiveMatchSnapshot } from './game/liveWatcher'
import { createSimulatorScene, makeDefaultCardSlots } from './game/mockSimulator'
import {
  getActiveLeagueWindow,
  startLeagueWindowTracker,
  stopLeagueWindowTracker
} from './game/windowTracker'
import {
  captureScreenAndRecognizeAugments,
  recognizeAugmentsFromDataUrl,
  terminateOcrWorker
} from './ocr/augmentOcr'
import { askCustomLlmAdvisor, computeLocalTacticalAdvice } from './ai/advisorService'
import { resolveHoveredAugmentSlot } from '@shared/layoutGeometry'
import type {
  AiSettings,
  GameLiveState,
  PlaystyleMode,
  UserPreferences,
  WindowBoundsRect
} from '@shared/types'

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
  autoOcrOnMilestone: true,
  minimizeToTray: true,
  badgePosition: 'top',
  autoHideWhenUnfocused: true,
  hudOffsetX: 0,
  hudOffsetY: 0
}

const syncService = new DataSyncService()
let mainWindow: BrowserWindow | null = null
let hudWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

let lcuWatcher: ReadOnlyLcuWatcher | null = null
let liveWatcher: ReadOnlyLiveWatcher | null = null
let hudLoopTimer: NodeJS.Timeout | null = null

let latestLcu: LcuChampSelectSnapshot | null = null
let latestLive: LiveMatchSnapshot | null = null
let simulatorActive = false

// Dynamic 3-pick reroll rescan & cursor-column auto-pick tracking
const resolvedMilestones = new Set<number>()
const milestoneAttempts = new Map<number, number>()
let ocrBusy = false
let lastOcrScanAt = 0
let emptyOfferScans = 0
let lastHoveredCardSlot: 0 | 1 | 2 = 1
let manuallyHiddenHud = false
let lastTrackedDipBounds: WindowBoundsRect | undefined = undefined

let gameState: GameLiveState = {
  connectionMode: 'disconnected',
  playstyleMode: 'steady',
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
}

let currentSettings: AiSettings = { ...DEFAULT_SETTINGS }
let currentPrefs: UserPreferences = { ...DEFAULT_PREFS }

function resolveIconPath(): string {
  const prod = resolve(process.resourcesPath || '', '../resources/icon.png')
  if (existsSync(prod)) return prod
  const dev = resolve(app.getAppPath(), 'resources/icon.png')
  if (existsSync(dev)) return dev
  return resolve(process.cwd(), 'resources/icon.png')
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'hexbuddy-settings.json')
}

function getPrefsPath(): string {
  return join(app.getPath('userData'), 'hexbuddy-prefs-v3.json')
}

async function loadSettingsAndPrefs(): Promise<void> {
  const sp = getSettingsPath()
  if (existsSync(sp)) {
    try {
      currentSettings = { ...DEFAULT_SETTINGS, ...(JSON.parse(await readFile(sp, 'utf-8')) as Partial<AiSettings>) }
    } catch {
      currentSettings = { ...DEFAULT_SETTINGS }
    }
  }
  const pp = getPrefsPath()
  if (existsSync(pp)) {
    try {
      currentPrefs = { ...DEFAULT_PREFS, ...(JSON.parse(await readFile(pp, 'utf-8')) as Partial<UserPreferences>) }
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
  for (const win of [mainWindow, hudWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('prefs:updated', currentPrefs)
    }
  }
  return currentPrefs
}

function broadcastGameState(): void {
  gameState = { ...gameState, lastUpdatedAt: Date.now() }
  for (const win of [mainWindow, hudWindow]) {
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
 * Converts physical Win32 client bounds to Electron logical DIP bounds (handling 100%-225% DPI scaling
 * and multi-monitor mixed DPI) and applies a 1px bottom inset on borderless fullscreen to prevent
 * Windows DWM DirectFlip black-flicker / FPS drops.
 */
function syncHudBoundsToLeagueWindow(): void {
  if (!hudWindow || hudWindow.isDestroyed() || simulatorActive) return
  const tracked = getActiveLeagueWindow()
  if (!tracked) {
    lastTrackedDipBounds = undefined
    return
  }

  // Handle Alt+Tab foreground auto-hide so HUD never floats over Chrome / WeChat
  if (currentPrefs.autoHideWhenUnfocused && !manuallyHiddenHud) {
    if (!tracked.isForeground && hudWindow.isVisible()) {
      hudWindow.hide()
      return
    }
    if (
      tracked.isForeground &&
      !hudWindow.isVisible() &&
      (latestLive?.inGame || latestLcu?.inChampSelect)
    ) {
      hudWindow.showInactive()
    }
  }

  const dipRect =
    process.platform === 'win32'
      ? screen.screenToDipRect(hudWindow, tracked.physicalBounds)
      : tracked.physicalBounds

  const disp = screen.getDisplayMatching(dipRect).bounds
  const coversFullMonitor =
    dipRect.x <= disp.x + 1 &&
    dipRect.y <= disp.y + 1 &&
    Math.abs(dipRect.width - disp.width) <= 2 &&
    Math.abs(dipRect.height - disp.height) <= 2

  // 1px height guard prevents DWM fullscreen swapchain interference while keeping <0.09% sub-pixel precision
  const safeBounds: WindowBoundsRect = {
    x: dipRect.x,
    y: dipRect.y,
    width: dipRect.width,
    height: coversFullMonitor ? Math.max(360, dipRect.height - 1) : dipRect.height
  }
  lastTrackedDipBounds = dipRect

  const cur = hudWindow.getBounds()
  const changed =
    Math.abs(cur.x - safeBounds.x) > 1 ||
    Math.abs(cur.y - safeBounds.y) > 1 ||
    Math.abs(cur.width - safeBounds.width) > 1 ||
    Math.abs(cur.height - safeBounds.height) > 1

  if (changed) {
    hudWindow.setBounds(safeBounds, false)
  }

  if (
    gameState.targetWindowKind !== tracked.kind ||
    !gameState.targetBounds ||
    Math.abs(gameState.targetBounds.width - dipRect.width) > 1 ||
    Math.abs(gameState.targetBounds.height - dipRect.height) > 1
  ) {
    gameState = {
      ...gameState,
      targetBounds: dipRect,
      targetWindowKind: tracked.kind
    }
    broadcastGameState()
  }
}

/**
 * Handles both:
 * 1) Zero-overhead Win32 client-area & DPI bounds alignment + Alt-Tab focus sync
 * 2) Initial 3-pick detection at Lv3/7/11/15 fountain window
 * 3) Live Reroll rescan while 3 cards are open on screen + Aspect-ratio aware cursor-column auto-recording!
 */
async function tickSpatialVisionAndCursor(): Promise<void> {
  syncHudBoundsToLeagueWindow()

  // Track which card column (0=Left, 1=Center, 2=Right) cursor is hovering over while 3-pick is open
  // Uses height-scaled center distance so 21:9 & 32:9 ultrawide monitors resolve the exact card!
  if (gameState.cardSlots.length > 0 && hudWindow && !hudWindow.isDestroyed()) {
    const pt = screen.getCursorScreenPoint()
    const b = hudWindow.getBounds()
    if (pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height) {
      const slot = resolveHoveredAugmentSlot(pt.x - b.x, pt.y - b.y, b.width, b.height)
      if (slot !== null) {
        lastHoveredCardSlot = slot
      }
    }
  }

  if (simulatorActive || !latestLive?.inGame || !currentPrefs.autoOcrOnMilestone || ocrBusy) {
    return
  }

  const m = currentActiveMilestone(latestLive.currentLevel)
  const offerCurrentlyOpen = gameState.cardSlots.length > 0

  if (offerCurrentlyOpen) {
    // Low-overhead narrow title-strip rescan every 1200ms while offer is visible (zero HUD self-reading!)
    if (Date.now() - lastOcrScanAt < 1200) return
    ocrBusy = true
    lastOcrScanAt = Date.now()
    try {
      const bundle = syncService.getBundle()
      const res = await captureScreenAndRecognizeAugments(bundle.augments, lastTrackedDipBounds)
      if (res.matchedAugmentIds.length >= 2) {
        emptyOfferScans = 0
        const prevKey = gameState.cardSlots.map((c) => c.augmentId).join(',')
        const nextKey = res.cardSlots.map((c) => c.augmentId).join(',')
        if (prevKey !== nextKey) {
          gameState = {
            ...gameState,
            candidateAugmentIds: res.matchedAugmentIds,
            cardSlots: res.cardSlots
          }
          broadcastGameState()
        }
      } else {
        emptyOfferScans++
        if (emptyOfferScans >= 2) {
          // Player picked a card and the 3-pick screen closed! Auto-record the card under cursor!
          const chosenSlot =
            gameState.cardSlots.find((s) => s.slotIndex === lastHoveredCardSlot) ||
            gameState.cardSlots[0]
          const chosenId = chosenSlot?.augmentId
          const nextPicked =
            chosenId && !gameState.pickedAugmentIds.includes(chosenId)
              ? [...gameState.pickedAugmentIds, chosenId].slice(-4)
              : gameState.pickedAugmentIds

          resolvedMilestones.add(m)
          emptyOfferScans = 0
          gameState = {
            ...gameState,
            pickedAugmentIds: nextPicked,
            candidateAugmentIds: [],
            cardSlots: []
          }
          broadcastGameState()
        }
      }
    } finally {
      ocrBusy = false
    }
    return
  }

  // Otherwise, check if we are in a valid fountain selection window to detect a newly opened 3-pick
  if (resolvedMilestones.has(m)) return
  if (!(m === 3 || latestLive.isDead)) return
  const tries = milestoneAttempts.get(m) ?? 0
  if (tries >= 5) return
  if (Date.now() - lastOcrScanAt < 3200) return

  ocrBusy = true
  lastOcrScanAt = Date.now()
  milestoneAttempts.set(m, tries + 1)
  try {
    const bundle = syncService.getBundle()
    const res = await captureScreenAndRecognizeAugments(bundle.augments, lastTrackedDipBounds)
    if (res.matchedAugmentIds.length >= 2) {
      emptyOfferScans = 0
      manuallyHiddenHud = false
      toggleSpatialHud(true)
      gameState = {
        ...gameState,
        candidateAugmentIds: res.matchedAugmentIds,
        cardSlots: res.cardSlots
      }
      broadcastGameState()
    }
  } finally {
    ocrBusy = false
  }
}

function recomputeRealGameState(): void {
  if (simulatorActive) return

  if (latestLive?.inGame) {
    toggleSpatialHud(true)
    gameState = {
      ...gameState,
      connectionMode: 'live-in-game',
      simulatorScene: undefined,
      myHeroId: latestLive.myHeroId || gameState.myHeroId,
      allyHeroIds: latestLive.allyHeroIds,
      benchHeroIds: [],
      enemyHeroIds: latestLive.enemyHeroIds,
      enemyPlayers: latestLive.enemyPlayers,
      currentLevel: latestLive.currentLevel,
      currentGold: latestLive.currentGold,
      isDead: latestLive.isDead,
      isAugmentMilestone: latestLive.isAugmentMilestone,
      currentItemIds: latestLive.currentItemIds
    }
  } else if (latestLcu?.inChampSelect) {
    resolvedMilestones.clear()
    milestoneAttempts.clear()
    toggleSpatialHud(true)
    gameState = {
      ...gameState,
      connectionMode: 'lcu-champ-select',
      simulatorScene: undefined,
      myHeroId: latestLcu.myHeroId,
      allyHeroIds: latestLcu.allyHeroIds,
      benchHeroIds: latestLcu.benchHeroIds,
      enemyHeroIds: [],
      enemyPlayers: [],
      currentLevel: 3,
      currentGold: 1400,
      isDead: false,
      isAugmentMilestone: false,
      currentItemIds: [],
      pickedAugmentIds: [],
      candidateAugmentIds: [],
      cardSlots: []
    }
  } else {
    gameState = {
      ...gameState,
      connectionMode: 'disconnected',
      simulatorScene: undefined,
      benchHeroIds: [],
      cardSlots: [],
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
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#070B12',
    icon: resolveIconPath(),
    title: 'HexBuddy · 海斗攻略图鉴',
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
  if (r.isUrl) mainWindow.loadURL(r.target)
  else mainWindow.loadFile(r.target)

  mainWindow.on('close', (e) => {
    if (!isQuitting && currentPrefs.minimizeToTray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  mainWindow.show()
  mainWindow.focus()
}

function createSystemTray(): void {
  try {
    const iconImg = nativeImage
      .createFromPath(resolveIconPath())
      .resize({ width: 18, height: 18 })
    tray = new Tray(iconImg)
    tray.setToolTip('HexBuddy · 海克斯大乱斗原位 HUD 助手')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开海斗攻略图鉴 (主窗口)',
        click: () => showMainWindow()
      },
      {
        label: '显示/隐藏局内原位 HUD (Alt+H)',
        click: () => toggleSpatialHud()
      },
      {
        label: '手动识别当前三选一 (Alt+S)',
        click: () => triggerManualHudOcr()
      },
      { type: 'separator' },
      {
        label: '彻底退出 HexBuddy',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])

    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => showMainWindow())
  } catch (err) {
    console.warn('[Tray] Failed to create tray:', err)
  }
}

function toggleSpatialHud(forceShow?: boolean, userInitiated = false): boolean {
  if (hudWindow && !hudWindow.isDestroyed()) {
    if (forceShow === true) {
      if (userInitiated) manuallyHiddenHud = false
      hudWindow.showInactive()
      return true
    }
    if (forceShow === false) {
      if (userInitiated) manuallyHiddenHud = true
      hudWindow.hide()
      return false
    }
    if (hudWindow.isVisible()) {
      manuallyHiddenHud = true
      hudWindow.hide()
      return false
    }
    manuallyHiddenHud = false
    hudWindow.showInactive()
    return true
  }

  if (forceShow === false) return false
  manuallyHiddenHud = false

  const display = screen.getPrimaryDisplay()
  const bounds = display.bounds

  hudWindow = new BrowserWindow({
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

  hudWindow.setAlwaysOnTop(true, 'screen-saver')
  // 100% click-through into League of Legends by default, forwarding mousemove so top pill can detect hover!
  hudWindow.setIgnoreMouseEvents(true, { forward: true })

  const r = resolveRendererUrl('mini')
  if (r.isUrl) hudWindow.loadURL(r.target)
  else hudWindow.loadFile(r.target, { hash: 'mini' })

  hudWindow.on('closed', () => {
    hudWindow = null
  })
  return true
}

async function triggerManualHudOcr(): Promise<void> {
  toggleSpatialHud(true, true)
  const bundle = syncService.getBundle()
  const result = await captureScreenAndRecognizeAugments(bundle.augments, lastTrackedDipBounds)
  if (result.matchedAugmentIds.length > 0) {
    emptyOfferScans = 0
    gameState = {
      ...gameState,
      candidateAugmentIds: result.matchedAugmentIds,
      cardSlots: result.cardSlots
    }
    broadcastGameState()
  }
  for (const win of [mainWindow, hudWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('ocr:result', result)
    }
  }
}

function registerShortcuts(): void {
  globalShortcut.unregisterAll()
  try {
    if (currentSettings.shortcutOverlay) {
      globalShortcut.register(currentSettings.shortcutOverlay, () => {
        toggleSpatialHud()
      })
    }
  } catch (err) {
    console.warn('[Shortcut] HUD shortcut failed:', err)
  }

  try {
    if (currentSettings.shortcutOcr) {
      globalShortcut.register(currentSettings.shortcutOcr, () => {
        triggerManualHudOcr()
      })
    }
  } catch (err) {
    console.warn('[Shortcut] OCR shortcut failed:', err)
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
      miniClickThrough: true
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
    (_, scene: 'off' | 'champ-select' | 'level-7-pick' | 'fountain-buy') => {
      if (scene === 'off') {
        simulatorActive = false
        recomputeRealGameState()
        return gameState
      }
      simulatorActive = true
      manuallyHiddenHud = false
      // Ensure HUD fills primary display cleanly during desktop simulator calibration
      toggleSpatialHud(true, true)
      if (hudWindow && !hudWindow.isDestroyed()) {
        const b = screen.getPrimaryDisplay().bounds
        hudWindow.setBounds(
          { x: b.x, y: b.y, width: b.width, height: Math.max(360, b.height - 1) },
          false
        )
      }
      gameState = createSimulatorScene(scene, syncService.getBundle(), gameState.playstyleMode)
      broadcastGameState()
      return gameState
    }
  )

  ipcMain.handle('game:set-playstyle', (_, mode: PlaystyleMode) => {
    gameState = { ...gameState, playstyleMode: mode }
    broadcastGameState()
    return gameState
  })

  ipcMain.handle('game:reroll-sim-slot', (_, slotIndex: 0 | 1 | 2) => {
    const bundle = syncService.getBundle()
    const pool = Object.values(bundle.augments).filter(
      (a) => a.rarity === 'prismatic' && !gameState.candidateAugmentIds.includes(a.id)
    )
    const randomPick = pool[Math.floor(Math.random() * pool.length)]
    if (!randomPick) return gameState
    const nextCands = [...gameState.candidateAugmentIds]
    nextCands[slotIndex] = randomPick.id
    gameState = {
      ...gameState,
      candidateAugmentIds: nextCands,
      cardSlots: makeDefaultCardSlots(nextCands)
    }
    broadcastGameState()
    return gameState
  })

  ipcMain.handle(
    'game:update-augments',
    (
      _,
      payload: {
        pickedAugmentIds?: string[]
        candidateAugmentIds?: string[]
        myHeroId?: string | null
        benchHeroIds?: string[]
      }
    ) => {
      const nextCands =
        payload.candidateAugmentIds !== undefined
          ? payload.candidateAugmentIds.slice(0, 3)
          : gameState.candidateAugmentIds
      const w = lastTrackedDipBounds?.width || 1920
      const h = lastTrackedDipBounds?.height || 1080
      gameState = {
        ...gameState,
        ...(payload.pickedAugmentIds !== undefined
          ? { pickedAugmentIds: payload.pickedAugmentIds.slice(0, 4) }
          : {}),
        ...(payload.benchHeroIds !== undefined
          ? { benchHeroIds: payload.benchHeroIds.slice(0, 10) }
          : {}),
        candidateAugmentIds: nextCands,
        cardSlots:
          payload.candidateAugmentIds !== undefined
            ? makeDefaultCardSlots(nextCands, w, h)
            : gameState.cardSlots,
        ...(payload.myHeroId !== undefined ? { myHeroId: payload.myHeroId } : {})
      }
      broadcastGameState()
      return gameState
    }
  )

  ipcMain.handle('ocr:capture-screen', async () => {
    const bundle = syncService.getBundle()
    const res = await captureScreenAndRecognizeAugments(bundle.augments, lastTrackedDipBounds)
    if (res.matchedAugmentIds.length > 0) {
      gameState = {
        ...gameState,
        candidateAugmentIds: res.matchedAugmentIds,
        cardSlots: res.cardSlots
      }
      broadcastGameState()
    }
    return res
  })

  ipcMain.handle('ocr:recognize-image', async (_, imageDataUrl: string) => {
    const bundle = syncService.getBundle()
    const res = await recognizeAugmentsFromDataUrl(imageDataUrl, bundle.augments)
    if (res.matchedAugmentIds.length > 0) {
      gameState = {
        ...gameState,
        candidateAugmentIds: res.matchedAugmentIds,
        cardSlots: res.cardSlots
      }
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
    return toggleSpatialHud(forceShow, true)
  })

  ipcMain.handle('window:show-main', () => {
    showMainWindow()
  })

  ipcMain.handle('window:set-hud-interactive', (_, interactive: boolean) => {
    if (hudWindow && !hudWindow.isDestroyed()) {
      hudWindow.setIgnoreMouseEvents(!interactive, { forward: true })
    }
  })

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
  createSystemTray()
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
  startLeagueWindowTracker()
  lcuWatcher.start()
  liveWatcher.start()

  hudLoopTimer = setInterval(() => {
    tickSpatialVisionAndCursor().catch(() => {})
  }, 300)

  syncService.checkAndSync(false).catch(() => {})

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  // Keep background Tray & Spatial HUD alive unless explicitly quitting
  if (isQuitting && process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  globalShortcut.unregisterAll()
  if (hudLoopTimer) clearInterval(hudLoopTimer)
  stopLeagueWindowTracker()
  lcuWatcher?.stop()
  liveWatcher?.stop()
  tray?.destroy()
  await terminateOcrWorker()
})
