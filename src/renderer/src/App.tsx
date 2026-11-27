import React, { useEffect, useState } from 'react'
import { SimulatorBar } from './components/SimulatorBar'
import { TierRadar } from './components/TierRadar'
import { AugmentDex } from './components/AugmentDex'
import { HeroGuide } from './components/HeroGuide'
import { CommandPalette } from './components/CommandPalette'
import { OnboardingBanner } from './components/OnboardingBanner'
import { MiniOverlay } from './features/hud/MiniOverlay'
import { SettingsCenter } from './features/settings/SettingsCenter'
import { useWorkspaceBootstrap } from './hooks/useWorkspaceBootstrap'
import type { MainViewTab, SettingsSectionId } from '@shared/types'

export const App: React.FC = () => {
  if (window.location.hash === '#mini') {
    return <MiniOverlay />
  }
  return <MainWorkspace />
}

const MainWorkspace: React.FC = () => {
  const ws = useWorkspaceBootstrap()
  const [mainView, setMainView] = useState<MainViewTab>('heroes')
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('general')
  const [dexFocusAugmentId, setDexFocusAugmentId] = useState<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    const scale = ws.prefs?.uiFontScale || 'comfortable'
    document.documentElement.dataset.fontScale = scale
    return () => {
      delete document.documentElement.dataset.fontScale
    }
  }, [ws.prefs?.uiFontScale])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleLaunchSimDemo = (
    scene: 'off' | 'champ-select' | 'level-7-pick' | 'fountain-buy'
  ): void => {
    window.hexbuddy.setSimulator(scene)
    if (scene !== 'off') {
      ws.showNotice('已在全屏原位 HUD 中开启实景贴标演练（可在屏幕上方直接切换 5 档心态）')
    }
  }

  if (!ws.meta || !ws.gameState || !ws.settings || !ws.prefs) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-primary text-sm">
        正在加载海斗攻略图鉴...
      </div>
    )
  }

  const isHeroFav = ws.selectedHeroId
    ? ws.prefs.favoriteHeroIds.includes(ws.selectedHeroId)
    : false
  const isMac = navigator.userAgent.includes('Mac')

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden ${
        !isMac ? 'border border-primary/22' : ''
      }`}
    >
      <SimulatorBar
        gameState={ws.gameState}
        updateState={ws.updateState}
        mainView={mainView}
        onChangeMainView={setMainView}
        onOpenCommandPalette={() => setCommandOpen(true)}
        onSelectSimScene={handleLaunchSimDemo}
        onToggleHud={async () => {
          const visible = await window.hexbuddy.toggleMiniOverlay()
          ws.showNotice(visible ? '已开启全屏透明穿透原位 HUD' : '已隐藏原位 HUD')
        }}
        onJumpToUpdateSection={() => {
          setSettingsSection('about')
          setMainView('settings')
        }}
      />

      {!ws.prefs.onboardingDismissed && (
        <OnboardingBanner
          onStartSimDemo={() => handleLaunchSimDemo('level-7-pick')}
          onDismiss={async () => {
            const updated = await window.hexbuddy.savePrefs({ onboardingDismissed: true })
            ws.setPrefs(updated)
          }}
        />
      )}

      {ws.toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-[#142338] border border-accent/50 text-xs text-foreground shadow-xl">
          {ws.toast}
        </div>
      )}

      {mainView === 'settings' ? (
        <SettingsCenter
          settings={ws.settings}
          prefs={ws.prefs}
          meta={ws.meta}
          shortcutStatus={ws.shortcutStatus}
          updateState={ws.updateState}
          syncing={ws.syncing}
          initialSection={settingsSection}
          onSwitchDataset={ws.handleSwitchDataset}
          onSyncNow={ws.handleSyncNow}
          onUpdatePrefs={async (patch) => {
            const updated = await window.hexbuddy.savePrefs(patch)
            ws.setPrefs(updated)
          }}
          onUpdateSettings={async (nextSettings) => {
            const updated = await window.hexbuddy.saveSettings(nextSettings)
            ws.setSettings(updated)
            const st = await window.hexbuddy.getShortcutStatus()
            ws.setShortcutStatus(st)
          }}
          onResetAll={async () => {
            const res = await window.hexbuddy.resetAllToDefaults()
            ws.setSettings(res.settings)
            ws.setPrefs(res.prefs)
            ws.setShortcutStatus(res.shortcutStatus)
          }}
          onImportedConfig={(payload) => {
            if (payload.settings) ws.setSettings(payload.settings)
            if (payload.prefs) ws.setPrefs(payload.prefs)
            if (payload.shortcutStatus) ws.setShortcutStatus(payload.shortcutStatus)
          }}
          onCacheCleared={ws.setMeta}
          onOpenSimPreview={() => handleLaunchSimDemo('level-7-pick')}
          onNotify={ws.showNotice}
        />
      ) : mainView === 'augments' ? (
        <AugmentDex
          augments={ws.augments}
          heroes={ws.heroes}
          initialAugmentId={dexFocusAugmentId}
          onJumpToHero={(hid) => {
            ws.setSelectedHeroId(hid)
            setMainView('heroes')
          }}
        />
      ) : (
        <div className="flex-1 flex min-h-0">
          <TierRadar
            heroes={ws.heroes}
            selectedHeroId={ws.selectedHeroId}
            favoriteHeroIds={ws.prefs.favoriteHeroIds}
            onSelectHero={ws.setSelectedHeroId}
            onToggleFavorite={ws.handleToggleFavoriteHero}
          />

          {ws.heroGuide ? (
            <HeroGuide
              guide={ws.heroGuide}
              augments={ws.augments}
              items={ws.items}
              isFavorite={isHeroFav}
              onToggleFavorite={() =>
                ws.selectedHeroId && ws.handleToggleFavoriteHero(ws.selectedHeroId)
              }
              onOpenInAugmentDex={(aid) => {
                setDexFocusAugmentId(aid)
                setMainView('augments')
              }}
            />
          ) : null}
        </div>
      )}

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        heroes={ws.heroes}
        augments={ws.augments}
        items={ws.items}
        onSelectHero={(hid) => {
          ws.setSelectedHeroId(hid)
          setMainView('heroes')
        }}
        onSelectAugment={(aid) => {
          setDexFocusAugmentId(aid)
          setMainView('augments')
        }}
        onSelectSetting={(section) => {
          setSettingsSection(section)
          setMainView('settings')
        }}
        onCopyItem={async (itemName) => {
          const res = await window.hexbuddy.copyShopItemText(itemName)
          ws.showNotice(
            res.restoredAfterSec > 0
              ? `✓ 已复制「${itemName}」（${res.restoredAfterSec}秒后自动恢复原剪贴板）`
              : `✓ 已复制装备「${itemName}」，可在游戏商店 Ctrl+V 搜索`
          )
        }}
      />
    </div>
  )
}
