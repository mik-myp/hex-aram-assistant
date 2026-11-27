import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiSettings,
  AugmentMeta,
  AugmentReverseDetail,
  BenchSuggestion,
  DatasetMetadata,
  GameLiveState,
  HeroDetailGuide,
  HeroMeta,
  ItemMeta,
  OcrRecognizeResult,
  PlaystyleMode,
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
    miniClickThrough: boolean
  }>
  getHeroGuide: (heroId: string) => Promise<HeroDetailGuide | null>
  getAugmentReverse: (augmentId: string) => Promise<AugmentReverseDetail | null>
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
  setPlaystyleMode: (mode: PlaystyleMode) => Promise<GameLiveState>
  rerollSimSlot: (slotIndex: 0 | 1 | 2) => Promise<GameLiveState>
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
  saveSettings: (next: AiSettings) => Promise<AiSettings>
  savePrefs: (next: Partial<UserPreferences>) => Promise<UserPreferences>
  toggleMiniOverlay: (forceShow?: boolean) => Promise<boolean>
  showMainWindow: () => Promise<void>
  setHudInteractive: (interactive: boolean) => Promise<void>
  openExternal: (url: string) => Promise<void>
  onGameStateUpdated: (cb: (state: GameLiveState) => void) => () => void
  onOcrResult: (cb: (res: OcrRecognizeResult) => void) => () => void
  onPrefsUpdated: (cb: (prefs: UserPreferences) => void) => () => void
}

const api: HexBuddyApi = {
  getBootstrap: () => ipcRenderer.invoke('data:get-bootstrap'),
  getHeroGuide: (heroId) => ipcRenderer.invoke('data:get-hero-guide', heroId),
  getAugmentReverse: (augmentId) => ipcRenderer.invoke('data:get-augment-reverse', augmentId),
  getBenchSuggestions: (myHeroId, allyIds, benchIds) =>
    ipcRenderer.invoke('data:get-bench-suggestions', myHeroId, allyIds, benchIds),
  syncNow: (force) => ipcRenderer.invoke('data:sync-now', force),
  switchDataset: (datasetPath, band) =>
    ipcRenderer.invoke('data:switch-dataset', datasetPath, band),
  setSimulator: (scene) => ipcRenderer.invoke('game:set-simulator', scene),
  setPlaystyleMode: (mode) => ipcRenderer.invoke('game:set-playstyle', mode),
  rerollSimSlot: (slotIndex) => ipcRenderer.invoke('game:reroll-sim-slot', slotIndex),
  updateAugments: (payload) => ipcRenderer.invoke('game:update-augments', payload),
  captureScreenOcr: () => ipcRenderer.invoke('ocr:capture-screen'),
  recognizeImageOcr: (imageDataUrl) => ipcRenderer.invoke('ocr:recognize-image', imageDataUrl),
  getTacticalAdvice: (selectedHeroId) => ipcRenderer.invoke('ai:get-tactical-advice', selectedHeroId),
  askLlmAdvisor: (selectedHeroId, userQuestion) =>
    ipcRenderer.invoke('ai:ask-llm', selectedHeroId, userQuestion),
  saveSettings: (next) => ipcRenderer.invoke('settings:save', next),
  savePrefs: (next) => ipcRenderer.invoke('prefs:save', next),
  toggleMiniOverlay: (forceShow) => ipcRenderer.invoke('window:toggle-mini', forceShow),
  showMainWindow: () => ipcRenderer.invoke('window:show-main'),
  setHudInteractive: (interactive) => ipcRenderer.invoke('window:set-hud-interactive', interactive),
  openExternal: (url) => ipcRenderer.invoke('window:open-external', url),
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
  }
}

contextBridge.exposeInMainWorld('hexbuddy', api)
