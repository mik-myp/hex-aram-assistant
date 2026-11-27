import { ipcMain, screen } from 'electron'
import { sanitizeAiSettings } from '@shared/configSchema'
import type { AiSettings, PlaystyleMode } from '@shared/types'
import { askCustomLlmAdvisor, testLlmConnection } from '../ai/llmClient'
import { computeLocalTacticalAdvice } from '../ai/tacticalEngine'
import {
  buildAugmentReverseDetail,
  buildHeroDetailGuide,
  computeBenchSuggestions
} from '../data/synergyEngine'
import { createSimulatorScene, makeDefaultCardSlots } from '../game/mockSimulator'
import { recomputeRealGameState } from '../game/visionLoop'
import {
  captureScreenAndRecognizeAugments,
  recognizeAugmentsFromDataUrl
} from '../ocr/augmentOcr'
import { broadcastGameState, runtime, syncService, updateService } from '../state/runtimeStore'
import { toggleSpatialHud } from '../window/windowManager'

export function registerDataAndGameplayIpc(): void {
  ipcMain.handle('data:get-bootstrap', () => {
    const bundle = syncService.getBundle()
    return {
      meta: bundle.meta,
      heroes: bundle.heroes,
      augments: bundle.augments,
      items: bundle.items,
      gameState: runtime.gameState,
      settings: runtime.currentSettings,
      prefs: runtime.currentPrefs,
      shortcutStatus: runtime.shortcutStatus,
      updateState: updateService.getState(),
      miniClickThrough: true
    }
  })

  ipcMain.handle('data:get-hud-bootstrap', () => {
    const bundle = syncService.getBundle()
    const slimHeroes: Record<string, (typeof bundle.heroes)[string]> = {}
    for (const [id, h] of Object.entries(bundle.heroes)) {
      slimHeroes[id] = {
        ...h,
        title: '',
        topShoes: undefined,
        pinyinFull: '',
        pinyinInitials: ''
      }
    }
    const slimAugments: Record<string, (typeof bundle.augments)[string]> = {}
    for (const [id, a] of Object.entries(bundle.augments)) {
      slimAugments[id] = { ...a, pinyinFull: '', pinyinInitials: '' }
    }
    const slimItems: Record<string, (typeof bundle.items)[string]> = {}
    for (const [id, im] of Object.entries(bundle.items)) {
      slimItems[id] = { ...im, fullDesc: '' }
    }
    return {
      heroes: slimHeroes,
      augments: slimAugments,
      items: slimItems,
      gameState: runtime.gameState,
      prefs: runtime.currentPrefs
    }
  })

  ipcMain.handle('data:get-hero-guide', (_, heroId: string) =>
    buildHeroDetailGuide(syncService.getBundle(), heroId)
  )
  ipcMain.handle('data:get-augment-reverse', (_, augmentId: string) =>
    buildAugmentReverseDetail(syncService.getBundle(), augmentId)
  )

  ipcMain.handle('data:search-augments', (_, query: string) => {
    const q = (query || '').trim().toLowerCase()
    const all = Object.values(syncService.getBundle().augments)
    if (!q) return all.slice(0, 12)
    return all
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.pinyinInitials.includes(q) ||
          a.pinyinFull.includes(q)
      )
      .slice(0, 12)
  })

  ipcMain.handle(
    'data:get-bench-suggestions',
    (_, myHeroId: string | null, allyIds: string[], benchIds: string[]) =>
      computeBenchSuggestions(
        syncService.getBundle(),
        myHeroId,
        allyIds,
        benchIds,
        runtime.currentPrefs
      )
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
        runtime.simulatorActive = false
        recomputeRealGameState()
        return runtime.gameState
      }
      runtime.simulatorActive = true
      runtime.manuallyHiddenHud = false
      toggleSpatialHud(true, true)
      if (runtime.hudWindow && !runtime.hudWindow.isDestroyed()) {
        const b = screen.getPrimaryDisplay().bounds
        runtime.hudWindow.setBounds(
          { x: b.x, y: b.y, width: b.width, height: Math.max(360, b.height - 1) },
          false
        )
      }
      runtime.gameState = createSimulatorScene(
        scene,
        syncService.getBundle(),
        runtime.gameState.playstyleMode
      )
      broadcastGameState()
      return runtime.gameState
    }
  )

  ipcMain.handle('game:set-playstyle', (_, mode: PlaystyleMode) => {
    runtime.gameState = { ...runtime.gameState, playstyleMode: mode }
    broadcastGameState()
    return runtime.gameState
  })

  ipcMain.handle('game:reroll-sim-slot', (_, slotIndex: 0 | 1 | 2) => {
    const bundle = syncService.getBundle()
    const pool = Object.values(bundle.augments).filter(
      (a) => a.rarity === 'prismatic' && !runtime.gameState.candidateAugmentIds.includes(a.id)
    )
    const randomPick = pool[Math.floor(Math.random() * pool.length)]
    if (!randomPick) return runtime.gameState
    const nextCands = [...runtime.gameState.candidateAugmentIds]
    nextCands[slotIndex] = randomPick.id
    runtime.gameState = {
      ...runtime.gameState,
      candidateAugmentIds: nextCands,
      cardSlots: makeDefaultCardSlots(nextCands)
    }
    broadcastGameState()
    return runtime.gameState
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
          : runtime.gameState.candidateAugmentIds
      const w = runtime.lastTrackedDipBounds?.width || 1920
      const h = runtime.lastTrackedDipBounds?.height || 1080
      runtime.gameState = {
        ...runtime.gameState,
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
            : runtime.gameState.cardSlots,
        ...(payload.myHeroId !== undefined ? { myHeroId: payload.myHeroId } : {})
      }
      broadcastGameState()
      return runtime.gameState
    }
  )

  ipcMain.handle('ocr:capture-screen', async () => {
    const bundle = syncService.getBundle()
    const res = await captureScreenAndRecognizeAugments(
      bundle.augments,
      runtime.lastTrackedDipBounds,
      runtime.currentPrefs.ocrEngineMode
    )
    if (res.matchedAugmentIds.length > 0) {
      runtime.gameState = {
        ...runtime.gameState,
        candidateAugmentIds: res.matchedAugmentIds,
        cardSlots: res.cardSlots
      }
      broadcastGameState()
    }
    return res
  })

  ipcMain.handle('ocr:recognize-image', async (_, imageDataUrl: string) => {
    const bundle = syncService.getBundle()
    const res = await recognizeAugmentsFromDataUrl(
      imageDataUrl,
      bundle.augments,
      runtime.currentPrefs.ocrEngineMode
    )
    if (res.matchedAugmentIds.length > 0) {
      runtime.gameState = {
        ...runtime.gameState,
        candidateAugmentIds: res.matchedAugmentIds,
        cardSlots: res.cardSlots
      }
      broadcastGameState()
    }
    return res
  })

  ipcMain.handle('ai:get-tactical-advice', (_, selectedHeroId: string | null) =>
    computeLocalTacticalAdvice(syncService.getBundle(), runtime.gameState, selectedHeroId)
  )

  ipcMain.handle('ai:ask-llm', async (_, selectedHeroId: string | null, userQuestion?: string) =>
    askCustomLlmAdvisor({
      bundle: syncService.getBundle(),
      state: runtime.gameState,
      selectedHeroId,
      settings: runtime.currentSettings,
      userQuestion
    })
  )

  ipcMain.handle('ai:test-connection', async (_, draftSettings: AiSettings) =>
    testLlmConnection(sanitizeAiSettings(draftSettings))
  )
}
