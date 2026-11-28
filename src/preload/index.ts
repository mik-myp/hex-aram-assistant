import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type {
  AiSettings,
  AppUpdateState,
  AugmentMeta,
  AugmentOfferSlotIndex,
  AugmentReverseDetail,
  BenchSuggestion,
  CacheStatsInfo,
  DatasetMetadata,
  DiagnosticSummary,
  GameLiveState,
  HeroDetailGuide,
  HeroMeta,
  ItemMeta,
  LocalMatchHistorySummary,
  OcrRecognizeResult,
  ShortcutStatusMap,
  TacticalAdvice,
  UserPreferences
} from '@shared/types'

export interface HexBuddyApi {
  getBootstrap: () => Promise<{
    meta: DatasetMetadata
    heroes: Record<string, HeroMeta>
    augments: Record<string, AugmentMeta>
    items: Record<string, ItemMeta>
    gameState: GameLiveState
    settings: AiSettings
    prefs: UserPreferences
    shortcutStatus: ShortcutStatusMap
    updateState: AppUpdateState
    miniClickThrough: boolean
  }>
  getHudBootstrap: () => Promise<{
    heroes: Record<string, HeroMeta>
    augments: Record<string, AugmentMeta>
    items: Record<string, ItemMeta>
    gameState: GameLiveState
    prefs: UserPreferences
  }>
  releaseRendererCache: () => void
  getHeroGuide: (heroId: string) => Promise<HeroDetailGuide | null>
  getAugmentReverse: (augmentId: string) => Promise<AugmentReverseDetail | null>
  searchAugments: (query: string) => Promise<AugmentMeta[]>
  getBenchSuggestions: (
    myHeroId: string | null,
    allyIds: string[],
    benchIds: string[]
  ) => Promise<BenchSuggestion[]>
  syncNow: (force?: boolean) => Promise<{
    updated: boolean
    meta: DatasetMetadata
    message: string
    heroes: Record<string, HeroMeta>
    augments: Record<string, AugmentMeta>
    items: Record<string, ItemMeta>
  }>
  switchDataset: (
    datasetPath: string,
    band: 'all' | 'high'
  ) => Promise<{
    ok: boolean
    meta: DatasetMetadata
    message: string
    heroes: Record<string, HeroMeta>
    augments: Record<string, AugmentMeta>
    items: Record<string, ItemMeta>
  }>
  setSimulator: (
    scene: 'off' | 'champ-select' | 'level-7-pick' | 'fountain-buy'
  ) => Promise<GameLiveState>
  setArchetype: (archetypeId: string | null) => Promise<GameLiveState>
  rerollSimSlot: (slotIndex: AugmentOfferSlotIndex) => Promise<GameLiveState>
  updateAugments: (payload: {
    pickedAugmentIds?: string[]
    candidateAugmentIds?: string[]
    myHeroId?: string | null
    benchHeroIds?: string[]
  }) => Promise<GameLiveState>
  captureScreenOcr: () => Promise<OcrRecognizeResult>
  recognizeImageOcr: (imageDataUrl: string) => Promise<OcrRecognizeResult>
  getTacticalAdvice: (selectedHeroId: string | null) => Promise<TacticalAdvice>
  askLlmAdvisor: (
    selectedHeroId: string | null,
    userQuestion?: string
  ) => Promise<{ ok: boolean; content: string }>
  testAiConnection: (
    draftSettings: AiSettings
  ) => Promise<{ ok: boolean; latencyMs: number; message: string }>
  saveSettings: (next: AiSettings) => Promise<AiSettings>
  savePrefs: (next: Partial<UserPreferences>) => Promise<UserPreferences>
  getShortcutStatus: () => Promise<ShortcutStatusMap>
  setShortcutRecording: (paused: boolean) => Promise<void>
  resetAllToDefaults: () => Promise<{
    settings: AiSettings
    prefs: UserPreferences
    shortcutStatus: ShortcutStatusMap
  }>
  exportConfigFile: () => Promise<{ ok: boolean; message: string }>
  importConfigFile: () => Promise<{
    ok: boolean
    message: string
    settings?: AiSettings
    prefs?: UserPreferences
    shortcutStatus?: ShortcutStatusMap
  }>
  getCacheStats: () => Promise<CacheStatsInfo>
  clearLocalCache: () => Promise<{
    ok: boolean
    message: string
    stats: CacheStatsInfo
    meta: DatasetMetadata
  }>
  toggleMiniOverlay: (forceShow?: boolean) => Promise<boolean>
  showMainWindow: () => Promise<void>
  minimizeMain: () => Promise<void>
  toggleMaximizeMain: () => Promise<boolean>
  closeMain: () => Promise<void>
  setHudInteractive: (interactive: boolean) => Promise<void>
  openExternal: (url: string) => Promise<void>
  copyText: (text: string) => Promise<void>
  copyShopItemText: (itemName: string) => Promise<{ restoredAfterSec: number }>
  getDiagnostics: () => Promise<DiagnosticSummary>
  openLogDir: () => Promise<void>
  relaunchAsAdmin: () => Promise<boolean>
  getMatchHistorySummary: () => Promise<LocalMatchHistorySummary>
  clearMatchHistory: () => Promise<LocalMatchHistorySummary>
  getUpdateState: () => Promise<AppUpdateState>
  checkForUpdates: () => Promise<AppUpdateState>
  downloadUpdate: () => Promise<AppUpdateState>
  installUpdate: () => Promise<{ ok: boolean; message?: string }>
  onGameStateUpdated: (cb: (state: GameLiveState) => void) => () => void
  onOcrResult: (cb: (res: OcrRecognizeResult) => void) => () => void
  onPrefsUpdated: (cb: (prefs: UserPreferences) => void) => () => void
  onSettingsUpdated: (cb: (settings: AiSettings) => void) => () => void
  onUpdateStateChanged: (cb: (state: AppUpdateState) => void) => () => void
  onWindowMaximizedChanged: (cb: (maximized: boolean) => void) => () => void
}

const api: HexBuddyApi = {
  getBootstrap: () => ipcRenderer.invoke('data:get-bootstrap'),
  getHudBootstrap: () => ipcRenderer.invoke('data:get-hud-bootstrap'),
  releaseRendererCache: () => {
    try {
      webFrame.clearCache()
    } catch {
      // ignore
    }
  },
  getHeroGuide: (heroId) => ipcRenderer.invoke('data:get-hero-guide', heroId),
  getAugmentReverse: (augmentId) => ipcRenderer.invoke('data:get-augment-reverse', augmentId),
  searchAugments: (query) => ipcRenderer.invoke('data:search-augments', query),
  getBenchSuggestions: (myHeroId, allyIds, benchIds) =>
    ipcRenderer.invoke('data:get-bench-suggestions', myHeroId, allyIds, benchIds),
  syncNow: (force) => ipcRenderer.invoke('data:sync-now', force),
  switchDataset: (datasetPath, band) =>
    ipcRenderer.invoke('data:switch-dataset', datasetPath, band),
  setSimulator: (scene) => ipcRenderer.invoke('game:set-simulator', scene),
  setArchetype: (archetypeId) => ipcRenderer.invoke('game:set-archetype', archetypeId),
  rerollSimSlot: (slotIndex) => ipcRenderer.invoke('game:reroll-sim-slot', slotIndex),
  updateAugments: (payload) => ipcRenderer.invoke('game:update-augments', payload),
  captureScreenOcr: () => ipcRenderer.invoke('ocr:capture-screen'),
  recognizeImageOcr: (imageDataUrl) => ipcRenderer.invoke('ocr:recognize-image', imageDataUrl),
  getTacticalAdvice: (selectedHeroId) => ipcRenderer.invoke('ai:get-tactical-advice', selectedHeroId),
  askLlmAdvisor: (selectedHeroId, userQuestion) =>
    ipcRenderer.invoke('ai:ask-llm', selectedHeroId, userQuestion),
  testAiConnection: (draftSettings) => ipcRenderer.invoke('ai:test-connection', draftSettings),
  saveSettings: (next) => ipcRenderer.invoke('settings:save', next),
  savePrefs: (next) => ipcRenderer.invoke('prefs:save', next),
  getShortcutStatus: () => ipcRenderer.invoke('shortcuts:get-status'),
  setShortcutRecording: (paused) => ipcRenderer.invoke('shortcuts:set-recording', paused),
  resetAllToDefaults: () => ipcRenderer.invoke('prefs:reset-defaults'),
  exportConfigFile: () => ipcRenderer.invoke('prefs:export-config'),
  importConfigFile: () => ipcRenderer.invoke('prefs:import-config'),
  getCacheStats: () => ipcRenderer.invoke('system:get-cache-stats'),
  clearLocalCache: () => ipcRenderer.invoke('system:clear-cache'),
  toggleMiniOverlay: (forceShow) => ipcRenderer.invoke('window:toggle-mini', forceShow),
  showMainWindow: () => ipcRenderer.invoke('window:show-main'),
  minimizeMain: () => ipcRenderer.invoke('window:minimize-main'),
  toggleMaximizeMain: () => ipcRenderer.invoke('window:toggle-maximize-main'),
  closeMain: () => ipcRenderer.invoke('window:close-main'),
  setHudInteractive: (interactive) => ipcRenderer.invoke('window:set-hud-interactive', interactive),
  openExternal: (url) => ipcRenderer.invoke('window:open-external', url),
  copyText: (text) => ipcRenderer.invoke('system:copy-text', text),
  copyShopItemText: (itemName) => ipcRenderer.invoke('system:copy-shop-item', itemName),
  getDiagnostics: () => ipcRenderer.invoke('system:get-diagnostics'),
  openLogDir: () => ipcRenderer.invoke('system:open-log-dir'),
  relaunchAsAdmin: () => ipcRenderer.invoke('system:relaunch-admin'),
  getMatchHistorySummary: () => ipcRenderer.invoke('history:get-summary'),
  clearMatchHistory: () => ipcRenderer.invoke('history:clear'),
  getUpdateState: () => ipcRenderer.invoke('updater:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onGameStateUpdated: (cb) => {
    const handler = (_: unknown, state: GameLiveState): void => cb(state)
    ipcRenderer.on('game:state-updated', handler)
    return () => ipcRenderer.removeListener('game:state-updated', handler)
  },
  onOcrResult: (cb) => {
    const handler = (_: unknown, res: OcrRecognizeResult): void => cb(res)
    ipcRenderer.on('ocr:result', handler)
    return () => ipcRenderer.removeListener('ocr:result', handler)
  },
  onPrefsUpdated: (cb) => {
    const handler = (_: unknown, prefs: UserPreferences): void => cb(prefs)
    ipcRenderer.on('prefs:updated', handler)
    return () => ipcRenderer.removeListener('prefs:updated', handler)
  },
  onSettingsUpdated: (cb) => {
    const handler = (_: unknown, settings: AiSettings): void => cb(settings)
    ipcRenderer.on('settings:updated', handler)
    return () => ipcRenderer.removeListener('settings:updated', handler)
  },
  onUpdateStateChanged: (cb) => {
    const handler = (_: unknown, st: AppUpdateState): void => cb(st)
    ipcRenderer.on('updater:state-updated', handler)
    return () => ipcRenderer.removeListener('updater:state-updated', handler)
  },
  onWindowMaximizedChanged: (cb) => {
    const handler = (_: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized-changed', handler)
    return () => ipcRenderer.removeListener('window:maximized-changed', handler)
  }
}

contextBridge.exposeInMainWorld('hexbuddy', api)
