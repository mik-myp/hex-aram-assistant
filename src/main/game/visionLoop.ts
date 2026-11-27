import { screen } from 'electron'
import { resolveHoveredAugmentSlot } from '@shared/layoutGeometry'
import { logDiag } from '../logger/diagLogger'
import { captureScreenAndRecognizeAugments } from '../ocr/augmentOcr'
import { broadcastGameState, runtime, syncService } from '../state/runtimeStore'
import {
  clearHudIdleDestroyTimer,
  scheduleIdleHudHibernation,
  syncHudBoundsToLeagueWindow,
  toggleSpatialHud
} from '../window/windowManager'

function currentActiveMilestone(level: number): number {
  if (level >= 15) return 15
  if (level >= 11) return 11
  if (level >= 7) return 7
  return 3
}

export async function triggerManualHudOcr(): Promise<void> {
  toggleSpatialHud(true, true)
  const bundle = syncService.getBundle()
  const result = await captureScreenAndRecognizeAugments(
    bundle.augments,
    runtime.lastTrackedDipBounds,
    runtime.currentPrefs.ocrEngineMode
  )
  if (result.matchedAugmentIds.length > 0) {
    runtime.emptyOfferScans = 0
    runtime.gameState = {
      ...runtime.gameState,
      candidateAugmentIds: result.matchedAugmentIds,
      cardSlots: result.cardSlots
    }
    broadcastGameState()
  }
  for (const win of [runtime.mainWindow, runtime.hudWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('ocr:result', result)
    }
  }
}

export async function tickSpatialVisionAndCursor(): Promise<void> {
  syncHudBoundsToLeagueWindow()

  if (
    runtime.gameState.cardSlots.length > 0 &&
    runtime.hudWindow &&
    !runtime.hudWindow.isDestroyed()
  ) {
    const pt = screen.getCursorScreenPoint()
    const b = runtime.hudWindow.getBounds()
    if (pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height) {
      const slot = resolveHoveredAugmentSlot(pt.x - b.x, pt.y - b.y, b.width, b.height)
      if (slot !== null) {
        runtime.lastHoveredCardSlot = slot
      }
    }
  }

  if (
    runtime.simulatorActive ||
    !runtime.latestLive?.inGame ||
    !runtime.currentPrefs.autoOcrOnMilestone ||
    runtime.ocrBusy
  ) {
    return
  }

  const m = currentActiveMilestone(runtime.latestLive.currentLevel)
  const offerCurrentlyOpen = runtime.gameState.cardSlots.length > 0

  if (offerCurrentlyOpen) {
    if (Date.now() - runtime.lastOcrScanAt < 1200) return
    runtime.ocrBusy = true
    runtime.lastOcrScanAt = Date.now()
    try {
      const bundle = syncService.getBundle()
      const res = await captureScreenAndRecognizeAugments(
        bundle.augments,
        runtime.lastTrackedDipBounds,
        runtime.currentPrefs.ocrEngineMode
      )
      if (res.matchedAugmentIds.length >= 2) {
        runtime.emptyOfferScans = 0
        const prevKey = runtime.gameState.cardSlots.map((c) => c.augmentId).join(',')
        const nextKey = res.cardSlots.map((c) => c.augmentId).join(',')
        if (prevKey !== nextKey) {
          runtime.gameState = {
            ...runtime.gameState,
            candidateAugmentIds: res.matchedAugmentIds,
            cardSlots: res.cardSlots
          }
          broadcastGameState()
        }
      } else {
        runtime.emptyOfferScans++
        if (runtime.emptyOfferScans >= 2) {
          const chosenSlot =
            runtime.gameState.cardSlots.find((s) => s.slotIndex === runtime.lastHoveredCardSlot) ||
            runtime.gameState.cardSlots[0]
          const chosenId = chosenSlot?.augmentId
          const nextPicked =
            chosenId && !runtime.gameState.pickedAugmentIds.includes(chosenId)
              ? [...runtime.gameState.pickedAugmentIds, chosenId].slice(-4)
              : runtime.gameState.pickedAugmentIds

          runtime.resolvedMilestones.add(m)
          runtime.emptyOfferScans = 0
          runtime.gameState = {
            ...runtime.gameState,
            pickedAugmentIds: nextPicked,
            candidateAugmentIds: [],
            cardSlots: []
          }
          broadcastGameState()
        }
      }
    } finally {
      runtime.ocrBusy = false
    }
    return
  }

  if (runtime.resolvedMilestones.has(m)) return
  const inRespawnFountainGrace = Date.now() - runtime.lastRespawnedAt <= 14_000
  const inLevel3OpeningGrace = m === 3 && Date.now() - runtime.matchEnteredAt <= 120_000
  if (!(inLevel3OpeningGrace || runtime.latestLive.isDead || inRespawnFountainGrace)) return

  const tries = runtime.milestoneAttempts.get(m) ?? 0
  if (tries >= 24) return
  if (Date.now() - runtime.lastOcrScanAt < 3000) return

  runtime.ocrBusy = true
  runtime.lastOcrScanAt = Date.now()
  runtime.milestoneAttempts.set(m, tries + 1)
  try {
    const bundle = syncService.getBundle()
    const res = await captureScreenAndRecognizeAugments(
      bundle.augments,
      runtime.lastTrackedDipBounds,
      runtime.currentPrefs.ocrEngineMode
    )
    if (res.matchedAugmentIds.length >= 2) {
      logDiag(
        'OCR',
        `Auto-detected milestone Lv${m} cards: ${res.matchedAugmentIds.join(',')} (${res.elapsedMs}ms)`
      )
      runtime.emptyOfferScans = 0
      runtime.manuallyHiddenHud = false
      toggleSpatialHud(true)
      runtime.gameState = {
        ...runtime.gameState,
        candidateAugmentIds: res.matchedAugmentIds,
        cardSlots: res.cardSlots
      }
      broadcastGameState()
    }
  } finally {
    runtime.ocrBusy = false
  }
}

export function recomputeRealGameState(): void {
  if (runtime.simulatorActive) return

  if (runtime.latestLive?.inGame) {
    clearHudIdleDestroyTimer()
    runtime.userPinnedHudWhileDisconnected = false

    if (!runtime.wasLiveInGame) {
      runtime.matchEnteredAt = Date.now()
      logDiag(
        'LIVE',
        `Entered live match (hero=${runtime.latestLive.myHeroId}, lv=${runtime.latestLive.currentLevel})`
      )
      if (
        runtime.currentPrefs.releaseMainOnMatch !== false &&
        runtime.mainWindow &&
        !runtime.mainWindow.isDestroyed()
      ) {
        runtime.mainWindow.destroy()
        runtime.mainWindow = null
      }
    }
    if (runtime.wasDeadInLive && !runtime.latestLive.isDead) {
      runtime.lastRespawnedAt = Date.now()
    }
    runtime.wasDeadInLive = runtime.latestLive.isDead
    runtime.wasLiveInGame = true

    toggleSpatialHud(true)
    runtime.gameState = {
      ...runtime.gameState,
      connectionMode: 'live-in-game',
      simulatorScene: undefined,
      myHeroId: runtime.latestLive.myHeroId || runtime.gameState.myHeroId,
      allyHeroIds: runtime.latestLive.allyHeroIds,
      benchHeroIds: [],
      enemyHeroIds: runtime.latestLive.enemyHeroIds,
      enemyPlayers: runtime.latestLive.enemyPlayers,
      currentLevel: runtime.latestLive.currentLevel,
      currentGold: runtime.latestLive.currentGold,
      isDead: runtime.latestLive.isDead,
      isAugmentMilestone: runtime.latestLive.isAugmentMilestone,
      currentItemIds: runtime.latestLive.currentItemIds
    }
  } else if (runtime.latestLcu?.inChampSelect) {
    runtime.wasLiveInGame = false
    if (!runtime.wasInChampSelect) {
      runtime.gameState = {
        ...runtime.gameState,
        playstyleMode: runtime.currentPrefs.defaultPlaystyle || 'steady'
      }
    }
    runtime.wasInChampSelect = true
    clearHudIdleDestroyTimer()
    runtime.userPinnedHudWhileDisconnected = false
    runtime.resolvedMilestones.clear()
    runtime.milestoneAttempts.clear()
    toggleSpatialHud(true)
    runtime.gameState = {
      ...runtime.gameState,
      connectionMode: 'lcu-champ-select',
      simulatorScene: undefined,
      myHeroId: runtime.latestLcu.myHeroId,
      allyHeroIds: runtime.latestLcu.allyHeroIds,
      benchHeroIds: runtime.latestLcu.benchHeroIds,
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
    runtime.wasLiveInGame = false
    runtime.wasInChampSelect = false
    runtime.wasDeadInLive = false
    runtime.gameState = {
      ...runtime.gameState,
      connectionMode: 'disconnected',
      simulatorScene: undefined,
      benchHeroIds: [],
      cardSlots: [],
      isDead: false
    }
    scheduleIdleHudHibernation()
  }
  broadcastGameState()
}
