import React, { useEffect, useState } from 'react'
import { SimulatorBar } from './components/SimulatorBar'
import { TierRadar } from './components/TierRadar'
import { AugmentDex } from './components/AugmentDex'
import { HeroGuide } from './components/HeroGuide'
import { MiniOverlay } from './components/MiniOverlay'
import { SettingsModal } from './components/SettingsModal'
import type {
  AiSettings,
  AugmentMeta,
  DatasetMetadata,
  GameLiveState,
  HeroDetailGuide,
  HeroMeta,
  ItemMeta,
  UserPreferences
} from '@shared/types'

export const App: React.FC = () => {
  const isMiniMode = window.location.hash === '#mini'
  if (isMiniMode) {
    return <MiniOverlay />
  }
  return <MainWorkspace />
}

/**
 * Pure, calm, clutter-free Strategy Reference Dictionary (Main Window).
 * Live match decisions & multi-situation recommendations are handled by the Spatial HUD Overlay!
 */
const MainWorkspace: React.FC = () => {
  const [meta, setMeta] = useState<DatasetMetadata | null>(null)
  const [heroes, setHeroes] = useState<Record<string, HeroMeta>>({})
  const [augments, setAugments] = useState<Record<string, AugmentMeta>>({})
  const [items, setItems] = useState<Record<string, ItemMeta>>({})
  const [gameState, setGameState] = useState<GameLiveState | null>(null)
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)

  const [mainView, setMainView] = useState<'heroes' | 'augments'>('heroes')
  const [dexFocusAugmentId, setDexFocusAugmentId] = useState<string | null>(null)
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null)
  const [heroGuide, setHeroGuide] = useState<HeroDetailGuide | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

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

      const sorted = Object.values(boot.heroes).sort(
        (a, b) => b.smoothedWinRate - a.smoothedWinRate
      )
      setSelectedHeroId(sorted[0]?.id || null)
    })

    const unsubGame = window.hexbuddy.onGameStateUpdated((nextState) => {
      setGameState(nextState)
    })
    const unsubPrefs = window.hexbuddy.onPrefsUpdated((nextPrefs) => {
      setPrefs(nextPrefs)
    })

    return () => {
      unsubGame()
      unsubPrefs()
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

  if (!meta || !gameState || !settings || !prefs) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#070B12] text-[#C8AA6E] text-sm">
        正在加载海斗攻略图鉴...
      </div>
    )
  }

  const isHeroFav = selectedHeroId ? prefs.favoriteHeroIds.includes(selectedHeroId) : false

  const isMac = navigator.userAgent.includes('Mac')

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-[#070B12] text-[#F0E6D2] overflow-hidden ${
        !isMac ? 'border border-[#C8AA6E]/22' : ''
      }`}
    >
      <SimulatorBar
        gameState={gameState}
        mainView={mainView}
        onChangeMainView={setMainView}
        onSelectSimScene={(scene) => {
          window.hexbuddy.setSimulator(scene)
          if (scene !== 'off') {
            showNotice('已在全屏原位 HUD 中开启实景贴标演练（可在屏幕上方直接切换 5 档心态）')
          }
        }}
        onToggleHud={async () => {
          const visible = await window.hexbuddy.toggleMiniOverlay()
          showNotice(visible ? '已开启全屏透明穿透原位 HUD' : '已隐藏原位 HUD')
        }}
        onOpenSettings={() => setShowSettings(true)}
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-[#142338] border border-[#0AC8B9]/50 text-xs text-[#F0E6D2] shadow-xl">
          {toast}
        </div>
      )}

      {mainView === 'augments' ? (
        <AugmentDex
          augments={augments}
          heroes={heroes}
          initialAugmentId={dexFocusAugmentId}
          onJumpToHero={(hid) => {
            setSelectedHeroId(hid)
            setMainView('heroes')
          }}
        />
      ) : (
        <div className="flex-1 flex min-h-0">
          <TierRadar
            heroes={heroes}
            selectedHeroId={selectedHeroId}
            favoriteHeroIds={prefs.favoriteHeroIds}
            onSelectHero={setSelectedHeroId}
            onToggleFavorite={handleToggleFavoriteHero}
          />

          {heroGuide ? (
            <HeroGuide
              guide={heroGuide}
              augments={augments}
              items={items}
              isFavorite={isHeroFav}
              onToggleFavorite={() =>
                selectedHeroId && handleToggleFavoriteHero(selectedHeroId)
              }
              onOpenInAugmentDex={(aid) => {
                setDexFocusAugmentId(aid)
                setMainView('augments')
              }}
            />
          ) : null}
        </div>
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          prefs={prefs}
          meta={meta}
          syncing={syncing}
          onSwitchDataset={handleSwitchDataset}
          onSyncNow={handleSyncNow}
          onClose={() => setShowSettings(false)}
          onSave={async (nextSettings, nextPrefs) => {
            const [updatedSettings, updatedPrefs] = await Promise.all([
              window.hexbuddy.saveSettings(nextSettings),
              window.hexbuddy.savePrefs(nextPrefs)
            ])
            setSettings(updatedSettings)
            setPrefs(updatedPrefs)
            showNotice('设置已保存')
          }}
        />
      )}
    </div>
  )
}
