import { useEffect, useState } from 'react'
import type {
  AugmentMeta,
  BenchSuggestion,
  GameLiveState,
  HeroMeta,
  ItemMeta,
  TacticalAdvice,
  UserPreferences
} from '@shared/types'
import { TEN_BENCH_TEST_IDS } from './hudConstants'

export interface CustomScreenshotState {
  url: string
  width: number
  height: number
  name: string
  ocrSummary?: string
}

export function useHudSession() {
  const [heroes, setHeroes] = useState<Record<string, HeroMeta>>({})
  const [augments, setAugments] = useState<Record<string, AugmentMeta>>({})
  const [items, setItems] = useState<Record<string, ItemMeta>>({})
  const [gameState, setGameState] = useState<GameLiveState | null>(null)
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [benchList, setBenchList] = useState<BenchSuggestion[]>([])
  const [advice, setAdvice] = useState<TacticalAdvice | null>(null)

  const [ocrBusy, setOcrBusy] = useState(false)
  const [aiBriefBusy, setAiBriefBusy] = useState(false)
  const [aiBrief, setAiBrief] = useState<string | null>(null)
  const [hoveredBar, setHoveredBar] = useState(false)
  const [copiedItemTip, setCopiedItemTip] = useState<string | null>(null)
  const [showAugPicker, setShowAugPicker] = useState(false)
  const [augSearchQuery, setAugSearchQuery] = useState('')
  const [augSearchResults, setAugSearchResults] = useState<AugmentMeta[]>([])

  const [hostSize, setHostSize] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080
  })

  const [simPresetId, setSimPresetId] = useState<string>('1920x1080')

  useEffect(() => {
    document.body.style.backgroundColor = 'transparent'
    const onResize = (): void => {
      setHostSize({ w: window.innerWidth, h: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.hexbuddy.setHudInteractive(false)
    }
  }, [])

  useEffect(() => {
    window.hexbuddy.getHudBootstrap().then((boot) => {
      setHeroes(boot.heroes)
      setAugments(boot.augments)
      setItems(boot.items)
      setGameState(boot.gameState)
      setPrefs(boot.prefs)
    })

    const unsubState = window.hexbuddy.onGameStateUpdated((st) => {
      setGameState((prev) => {
        if (
          (prev?.connectionMode === 'lcu-champ-select' && st.connectionMode !== 'lcu-champ-select') ||
          ((prev?.cardSlots.length ?? 0) > 0 && st.cardSlots.length === 0)
        ) {
          setTimeout(() => window.hexbuddy.releaseRendererCache(), 500)
        }
        return st
      })
      setAiBrief(null)
    })
    const unsubPrefs = window.hexbuddy.onPrefsUpdated((p) => {
      setPrefs(p)
    })
    return () => {
      unsubState()
      unsubPrefs()
    }
  }, [])

  useEffect(() => {
    const w = window as unknown as {
      __setHexSimPreset?: (presetId: string, fullBench?: boolean) => void
    }
    w.__setHexSimPreset = (presetId: string, fullBench?: boolean) => {
      setSimPresetId(presetId)
      if (fullBench) {
        const validIds = TEN_BENCH_TEST_IDS.filter((id) => heroes[id])
        if (validIds.length > 0) {
          window.hexbuddy.updateAugments({ benchHeroIds: validIds })
        }
      }
    }
    return () => {
      delete w.__setHexSimPreset
    }
  }, [heroes])

  const heroId = gameState?.myHeroId || '1'

  useEffect(() => {
    if (!gameState) return
    window.hexbuddy.getTacticalAdvice(heroId).then(setAdvice)
    if (gameState.benchHeroIds.length > 0) {
      window.hexbuddy
        .getBenchSuggestions(gameState.myHeroId, gameState.allyHeroIds, gameState.benchHeroIds)
        .then(setBenchList)
    } else {
      setBenchList([])
    }
  }, [
    heroId,
    gameState?.playstyleMode,
    gameState?.enemyHeroIds,
    gameState?.allyHeroIds,
    gameState?.benchHeroIds,
    gameState?.pickedAugmentIds,
    gameState?.candidateAugmentIds,
    gameState?.currentItemIds,
    gameState?.currentGold,
    prefs?.favoriteHeroIds,
    prefs?.preferredRoles
  ])

  useEffect(() => {
    if (!showAugPicker) return
    window.hexbuddy.searchAugments(augSearchQuery).then(setAugSearchResults)
  }, [showAugPicker, augSearchQuery])

  const enterInteractive = (): void => {
    setHoveredBar(true)
    window.hexbuddy.setHudInteractive(true)
  }

  const leaveInteractive = (): void => {
    setHoveredBar(false)
    setShowAugPicker(false)
    window.hexbuddy.setHudInteractive(false)
  }

  const handleCopyShopItemName = async (name: string): Promise<void> => {
    const res = await window.hexbuddy.copyShopItemText(name)
    const msg =
      res.restoredAfterSec > 0
        ? `✓ 已复制「${name}」（${res.restoredAfterSec}秒后还原原剪贴板）`
        : `✓ 已复制「${name}」，游戏商店 Ctrl+V 秒搜`
    setCopiedItemTip(msg)
    setTimeout(() => {
      setCopiedItemTip((prev) => (prev === msg ? null : prev))
    }, 2400)
  }

  return {
    heroes,
    augments,
    items,
    gameState,
    prefs,
    benchList,
    advice,
    heroId,
    hostSize,
    simPresetId,
    setSimPresetId,
    ocrBusy,
    setOcrBusy,
    aiBriefBusy,
    setAiBriefBusy,
    aiBrief,
    setAiBrief,
    hoveredBar,
    copiedItemTip,
    showAugPicker,
    setShowAugPicker,
    augSearchQuery,
    setAugSearchQuery,
    augSearchResults,
    enterInteractive,
    leaveInteractive,
    handleCopyShopItemName
  }
}
