import { useEffect, useState } from 'react'
import type {
  AiSettings,
  AppUpdateState,
  AugmentMeta,
  DatasetMetadata,
  GameLiveState,
  HeroDetailGuide,
  HeroMeta,
  ItemMeta,
  ShortcutStatusMap,
  UserPreferences
} from '@shared/types'

export function useWorkspaceBootstrap() {
  const [meta, setMeta] = useState<DatasetMetadata | null>(null)
  const [heroes, setHeroes] = useState<Record<string, HeroMeta>>({})
  const [augments, setAugments] = useState<Record<string, AugmentMeta>>({})
  const [items, setItems] = useState<Record<string, ItemMeta>>({})
  const [gameState, setGameState] = useState<GameLiveState | null>(null)
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [shortcutStatus, setShortcutStatus] = useState<ShortcutStatusMap | null>(null)
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null)

  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null)
  const [heroGuide, setHeroGuide] = useState<HeroDetailGuide | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const showNotice = (msg: string): void => {
    setToast(msg)
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev))
    }, 3200)
  }

  useEffect(() => {
    window.hexbuddy.getBootstrap().then((boot) => {
      setMeta(boot.meta)
      setHeroes(boot.heroes)
      setAugments(boot.augments)
      setItems(boot.items)
      setGameState(boot.gameState)
      setSettings(boot.settings)
      setPrefs(boot.prefs)
      setShortcutStatus(boot.shortcutStatus)
      setUpdateState(boot.updateState)

      const sorted = Object.values(boot.heroes).sort(
        (a, b) => b.smoothedWinRate - a.smoothedWinRate
      )
      setSelectedHeroId(sorted[0]?.id || null)
    })

    const unsubGame = window.hexbuddy.onGameStateUpdated(setGameState)
    const unsubPrefs = window.hexbuddy.onPrefsUpdated(setPrefs)
    const unsubSettings = window.hexbuddy.onSettingsUpdated((nextSettings) => {
      setSettings(nextSettings)
      window.hexbuddy.getShortcutStatus().then(setShortcutStatus).catch(() => {})
    })
    const unsubUpdater = window.hexbuddy.onUpdateStateChanged(setUpdateState)

    return () => {
      unsubGame()
      unsubPrefs()
      unsubSettings()
      unsubUpdater()
    }
  }, [])

  useEffect(() => {
    if (!selectedHeroId) return
    window.hexbuddy.getHeroGuide(selectedHeroId).then(setHeroGuide)
  }, [selectedHeroId, meta?.seq, meta?.mode, meta?.activeBand])

  const handleSyncNow = async (): Promise<void> => {
    setSyncing(true)
    try {
      const res = await window.hexbuddy.syncNow(false)
      setMeta(res.meta)
      setHeroes(res.heroes)
      setAugments(res.augments)
      setItems(res.items)
      showNotice(res.message)
    } catch (err) {
      showNotice(`同步失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleSwitchDataset = async (path: string, band: 'all' | 'high'): Promise<void> => {
    setSyncing(true)
    try {
      const res = await window.hexbuddy.switchDataset(path, band)
      setMeta(res.meta)
      setHeroes(res.heroes)
      setAugments(res.augments)
      setItems(res.items)
      showNotice(res.message)
    } catch (err) {
      showNotice(`切换数据集失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleToggleFavoriteHero = async (hid: string): Promise<void> => {
    if (!prefs) return
    const exists = prefs.favoriteHeroIds.includes(hid)
    const next = exists
      ? prefs.favoriteHeroIds.filter((x) => x !== hid)
      : [...prefs.favoriteHeroIds, hid]
    const updated = await window.hexbuddy.savePrefs({ favoriteHeroIds: next })
    setPrefs(updated)
  }

  return {
    meta,
    setMeta,
    heroes,
    augments,
    items,
    gameState,
    settings,
    setSettings,
    prefs,
    setPrefs,
    shortcutStatus,
    setShortcutStatus,
    updateState,
    selectedHeroId,
    setSelectedHeroId,
    heroGuide,
    syncing,
    toast,
    showNotice,
    handleSyncNow,
    handleSwitchDataset,
    handleToggleFavoriteHero
  }
}
