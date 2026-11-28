import { screen } from 'electron'
import { resolveHoveredAugmentSlot } from '@shared/layoutGeometry'
import { appendLocalMatchRecord } from '../data/matchHistoryStore'
import { logDiag } from '../logger/diagLogger'
import {
  captureScreenAndRecognizeAugments,
  resetAutoOcrVisualCache
} from '../ocr/augmentOcr'
import { broadcastGameState, runtime, syncService } from '../state/runtimeStore'
import {
  clearHudIdleDestroyTimer,
  ensureHudTopmost,
  isLeagueCurrentlyForeground,
  scheduleIdleHudHibernation,
  syncHudBoundsToLeagueWindow,
  toggleSpatialHud
} from '../window/windowManager'

let lastSeenMilestone = 0
let lastMilestoneEnteredAt = 0
let offerFirstShownAt = 0

function currentActiveMilestone(level: number): number {
  if (level >= 15) return 15
  if (level >= 11) return 11
  if (level >= 7) return 7
  return 3
}

function showHudForCardsImmediately(): void {
  runtime.manuallyHiddenHud = false
  toggleSpatialHud(true, false)
  syncHudBoundsToLeagueWindow(true)
  ensureHudTopmost(runtime.hudWindow)
}

export async function triggerManualHudOcr(): Promise<void> {
  toggleSpatialHud(true, true)
  syncHudBoundsToLeagueWindow(true)
  const bundle = syncService.getBundle()
  const result = await captureScreenAndRecognizeAugments(
    bundle.augments,
    runtime.lastTrackedDipBounds,
    runtime.currentPrefs.ocrEngineMode,
    { mode: 'manual', trackedPhysicalBounds: runtime.lastTrackedPhysicalBounds }
  )
  if (result.matchedAugmentIds.length > 0) {
    runtime.emptyOfferScans = 0
    offerFirstShownAt = Date.now()
    runtime.gameState = {
      ...runtime.gameState,
      candidateAugmentIds: result.matchedAugmentIds,
      cardSlots: result.cardSlots
    }
    showHudForCardsImmediately()
    broadcastGameState()
  }
  for (const win of [runtime.mainWindow, runtime.hudWindow]) {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('ocr:result', result)
    }
  }
}

export async function tickSpatialVisionAndCursor(): Promise<void> {
  syncHudBoundsToLeagueWindow()

  if (
    runtime.gameState.cardSlots.length > 0 &&
    runtime.hudWindow &&
    !runtime.hudWindow.isDestroyed() &&
    runtime.hudWindow.isVisible()
  ) {
    try {
      const pt = screen.getCursorScreenPoint()
      const b = runtime.hudWindow.getBounds()
      if (pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height) {
        const offerCount: 2 | 3 | 4 =
          runtime.gameState.cardSlots[0]?.totalSlots ??
          (runtime.gameState.cardSlots.length >= 4 ? 4 : runtime.gameState.cardSlots.length === 2 ? 2 : 3)
        const slot = resolveHoveredAugmentSlot(pt.x - b.x, pt.y - b.y, b.width, b.height, offerCount)
        if (slot !== null) {
          runtime.lastHoveredCardSlot = slot
        }
      }
    } catch {
      // ignore transient screen cursor query failure
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

  // Pause auto-OCR while League is not foreground so Alt+Tab never causes false dismissal or wasted CPU
  if (!isLeagueCurrentlyForeground()) {
    return
  }

  const m = currentActiveMilestone(runtime.latestLive.currentLevel)
  const offerCurrentlyOpen = runtime.gameState.cardSlots.length > 0
  const now = Date.now()

  // Phase A: Augment 3-pick badges are currently shown -> watch for reroll or dismissal rapidly (450ms)
  if (offerCurrentlyOpen) {
    if (now - runtime.lastOcrScanAt < 450) return
    runtime.ocrBusy = true
    runtime.lastOcrScanAt = now
    try {
      const bundle = syncService.getBundle()
      const res = await captureScreenAndRecognizeAugments(
        bundle.augments,
        runtime.lastTrackedDipBounds,
        runtime.currentPrefs.ocrEngineMode,
        {
          mode: 'auto-poll',
          skipIfUnchanged: true,
          trackedPhysicalBounds: runtime.lastTrackedPhysicalBounds
        }
      )

      // Strip pixels unchanged -> cards are still open and player is still reading; 0 OCR cost!
      if (res.skippedUnchanged) {
        runtime.emptyOfferScans = 0
        return
      }

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
          showHudForCardsImmediately()
          broadcastGameState()
        }
      } else {
        // Fast dismiss: if strip visually mutated AND matched 0 cards after being visible >= 900ms, dismiss immediately;
        // otherwise confirm on 2nd miss (<0.9s total) so a single noisy frame doesn't flicker.
        runtime.emptyOfferScans++
        const canImmediateDismiss =
          res.matchedAugmentIds.length === 0 &&
          res.visualChanged &&
          now - offerFirstShownAt >= 900
        if (canImmediateDismiss || runtime.emptyOfferScans >= 2) {
          const chosenSlot =
            runtime.gameState.cardSlots.find((s) => s.slotIndex === runtime.lastHoveredCardSlot) ||
            runtime.gameState.cardSlots[0]
          const chosenId = chosenSlot?.augmentId
          const shouldRecordPick = now - offerFirstShownAt >= 800
          const nextPicked =
            shouldRecordPick && chosenId && !runtime.gameState.pickedAugmentIds.includes(chosenId)
              ? [...runtime.gameState.pickedAugmentIds, chosenId].slice(-6)
              : runtime.gameState.pickedAugmentIds

          if (shouldRecordPick) {
            runtime.resolvedMilestones.add(m)
          }
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

  // Phase B: Waiting for 3/4-pick modal to appear -> allow up to 6 picked augments (covers Transmute Chaos & bonus rounds!)
  if (runtime.gameState.pickedAugmentIds.length >= 6) return

  const milestoneUnresolved = !runtime.resolvedMilestones.has(m)
  const inRespawnFountainGrace = now - runtime.lastRespawnedAt <= 25_000
  const inLevel3OpeningGrace = m === 3 && now - runtime.matchEnteredAt <= 180_000
  const inFreshMilestoneGrace = now - lastMilestoneEnteredAt <= 90_000
  const isHotWindow =
    milestoneUnresolved &&
    (inLevel3OpeningGrace ||
      runtime.latestLive.isDead ||
      inRespawnFountainGrace ||
      inFreshMilestoneGrace)

  const pollIntervalMs = isHotWindow ? 700 : 2200
  if (now - runtime.lastOcrScanAt < pollIntervalMs) return

  runtime.ocrBusy = true
  runtime.lastOcrScanAt = now
  try {
    const bundle = syncService.getBundle()
    const res = await captureScreenAndRecognizeAugments(
      bundle.augments,
      runtime.lastTrackedDipBounds,
      runtime.currentPrefs.ocrEngineMode,
      {
        mode: 'auto-poll',
        skipIfUnchanged: true,
        trackedPhysicalBounds: runtime.lastTrackedPhysicalBounds
      }
    )
    if (res.skippedUnchanged) return

    if (res.matchedAugmentIds.length >= 2) {
      logDiag(
        'OCR',
        `Auto-detected Lv${runtime.latestLive.currentLevel} (M${m}) cards: ${res.matchedAugmentIds.join(',')} (${res.elapsedMs}ms)`
      )
      runtime.emptyOfferScans = 0
      offerFirstShownAt = Date.now()
      runtime.gameState = {
        ...runtime.gameState,
        candidateAugmentIds: res.matchedAugmentIds,
        cardSlots: res.cardSlots
      }
      showHudForCardsImmediately()
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

    const milestone = currentActiveMilestone(runtime.latestLive.currentLevel)
    if (milestone !== lastSeenMilestone) {
      lastSeenMilestone = milestone
      lastMilestoneEnteredAt = Date.now()
      resetAutoOcrVisualCache()
    }

    const enteredNewMatch = !runtime.wasLiveInGame
    if (enteredNewMatch) {
      runtime.matchEnteredAt = Date.now()
      runtime.lastLiveMatchStats = null
      lastMilestoneEnteredAt = Date.now()
      runtime.resolvedMilestones.clear()
      runtime.milestoneAttempts.clear()
      resetAutoOcrVisualCache()
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
      resetAutoOcrVisualCache()
    } else if (!runtime.wasDeadInLive && runtime.latestLive.isDead) {
      resetAutoOcrVisualCache()
    }
    runtime.wasDeadInLive = runtime.latestLive.isDead
    runtime.wasLiveInGame = true

    if (enteredNewMatch || !runtime.hudWindow || runtime.hudWindow.isDestroyed()) {
      toggleSpatialHud(true, false)
    }

    runtime.lastLiveMatchStats = {
      kills: runtime.latestLive.myKills,
      deaths: runtime.latestLive.myDeaths,
      assists: runtime.latestLive.myAssists,
      gameTimeSec: Math.max(
        runtime.lastLiveMatchStats?.gameTimeSec ?? 0,
        runtime.latestLive.gameTimeSec
      ),
      result:
        runtime.latestLive.matchResult !== 'unknown'
          ? runtime.latestLive.matchResult
          : (runtime.lastLiveMatchStats?.result ?? 'unknown')
    }

    runtime.gameState = {
      ...runtime.gameState,
      connectionMode: 'live-in-game',
      simulatorScene: undefined,
      ...(enteredNewMatch ? { selectedArchetypeId: null } : {}),
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
    const enteredChampSelect = !runtime.wasInChampSelect
    if (enteredChampSelect) {
      runtime.gameState = {
        ...runtime.gameState,
        playstyleMode: runtime.currentPrefs.defaultPlaystyle || 'steady'
      }
      runtime.resolvedMilestones.clear()
      runtime.milestoneAttempts.clear()
      lastSeenMilestone = 0
      resetAutoOcrVisualCache()
    }
    runtime.wasInChampSelect = true
    clearHudIdleDestroyTimer()
    runtime.userPinnedHudWhileDisconnected = false
    if (enteredChampSelect || !runtime.hudWindow || runtime.hudWindow.isDestroyed()) {
      toggleSpatialHud(true, false)
    }
    runtime.gameState = {
      ...runtime.gameState,
      connectionMode: 'lcu-champ-select',
      simulatorScene: undefined,
      selectedArchetypeId: null,
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
    if (runtime.wasLiveInGame && runtime.gameState.myHeroId) {
      const wallSec = Math.max(0, Math.round((Date.now() - runtime.matchEnteredAt) / 1000))
      const stats = runtime.lastLiveMatchStats
      const durationSec = stats && stats.gameTimeSec > 0 ? stats.gameTimeSec : wallSec
      appendLocalMatchRecord({
        durationSec,
        heroId: runtime.gameState.myHeroId,
        playstyleMode: runtime.gameState.playstyleMode,
        finalLevel: runtime.gameState.currentLevel,
        pickedAugmentIds: [...runtime.gameState.pickedAugmentIds],
        finalItemIds: [...runtime.gameState.currentItemIds],
        kills: stats?.kills,
        deaths: stats?.deaths,
        assists: stats?.assists,
        result: stats?.result ?? 'unknown'
      }).catch(() => {})
      runtime.lastLiveMatchStats = null
    }
    runtime.wasLiveInGame = false
    runtime.wasInChampSelect = false
    runtime.wasDeadInLive = false
    lastSeenMilestone = 0
    resetAutoOcrVisualCache()
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
