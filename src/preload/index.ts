import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiSettings,
  AugmentMeta,
  BenchSuggestion,
  DatasetMetadata,
  GameLiveState,
  HeroDetailGuide,
  HeroMeta,
  ItemMeta,
  OcrRecognizeResult,
  TacticalAdvice
} from '@shared/types'

export interface HexBuddyApi {
  getBootstrap: () => Promise<{
    meta: DatasetMetadata
    heroes: Record<string, HeroMeta>
    augments: Record<string, AugmentMeta>
    items: Record<string, ItemMeta>
    gameState: GameLiveState
    settings: AiSettings
  }>
  getHeroGuide: (heroId: string) => Promise<HeroDetailGuide | null>
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
  setSimulator: (
    scene: 'off' | 'champ-select' | 'level-7-pick' | 'teamfight-5v5'
  ) => Promise<GameLiveState>
  updateAugments: (payload: {
    pickedAugmentIds?: string[]
    candidateAugmentIds?: string[]
    myHeroId?: string | null
  }) => Promise<GameLiveState>
  captureScreenOcr: () => Promise<OcrRecognizeResult>
  recognizeImageOcr: (imageDataUrl: string) => Promise<OcrRecognizeResult>
  getTacticalAdvice: (selectedHeroId: string | null) => Promise<TacticalAdvice>
  askLlmAdvisor: (
    selectedHeroId: string | null,
    userQuestion?: string
  ) => Promise<{ ok: boolean; content: string }>
  saveSettings: (next: AiSettings) => Promise<AiSettings>
  toggleMiniOverlay: (forceShow?: boolean) => Promise<boolean>
  openExternal: (url: string) => Promise<void>
  onGameStateUpdated: (cb: (state: GameLiveState) => void) => () => void
  onOcrResult: (cb: (res: OcrRecognizeResult) => void) => () => void
}

const api: HexBuddyApi = {
  getBootstrap: () => ipcRenderer.invoke('data:get-bootstrap'),
  getHeroGuide: (heroId) => ipcRenderer.invoke('data:get-hero-guide', heroId),
  getBenchSuggestions: (myHeroId, allyIds, benchIds) =>
    ipcRenderer.invoke('data:get-bench-suggestions', myHeroId, allyIds, benchIds),
  syncNow: (force) => ipcRenderer.invoke('data:sync-now', force),
  setSimulator: (scene) => ipcRenderer.invoke('game:set-simulator', scene),
  updateAugments: (payload) => ipcRenderer.invoke('game:update-augments', payload),
  captureScreenOcr: () => ipcRenderer.invoke('ocr:capture-screen'),
  recognizeImageOcr: (imageDataUrl) => ipcRenderer.invoke('ocr:recognize-image', imageDataUrl),
  getTacticalAdvice: (selectedHeroId) => ipcRenderer.invoke('ai:get-tactical-advice', selectedHeroId),
  askLlmAdvisor: (selectedHeroId, userQuestion) =>
    ipcRenderer.invoke('ai:ask-llm', selectedHeroId, userQuestion),
  saveSettings: (next) => ipcRenderer.invoke('settings:save', next),
  toggleMiniOverlay: (forceShow) => ipcRenderer.invoke('window:toggle-mini', forceShow),
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
  }
}

contextBridge.exposeInMainWorld('hexbuddy', api)
