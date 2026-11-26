import React, { useEffect, useState } from 'react'
import { BookOpen, Bot, Scale, Sparkles, X } from 'lucide-react'
import { SimulatorBar } from './components/SimulatorBar'
import { TierRadar, TIER_STYLE } from './components/TierRadar'
import { HeroGuide, RARITY_BADGE } from './components/HeroGuide'
import { ThreePickModal } from './components/ThreePickModal'
import { AiAdvisorPanel } from './components/AiAdvisorPanel'
import { MiniOverlay } from './components/MiniOverlay'
import { SettingsModal } from './components/SettingsModal'
import type {
  AiSettings,
  AugmentMeta,
  BenchSuggestion,
  DatasetMetadata,
  GameLiveState,
  HeroDetailGuide,
  HeroMeta,
  ItemMeta,
  OcrRecognizeResult
} from '@shared/types'

type ActiveTab = 'guide' | 'three-pick' | 'advisor'

export const App: React.FC = () => {
  const isMiniMode = window.location.hash === '#mini'
  if (isMiniMode) {
    return <MiniOverlay />
  }
  return <MainWorkspace />
}

const MainWorkspace: React.FC = () => {
  const [meta, setMeta] = useState<DatasetMetadata | null>(null)
  const [heroes, setHeroes] = useState<Record<string, HeroMeta>>({})
  const [augments, setAugments] = useState<Record<string, AugmentMeta>>({})
  const [items, setItems] = useState<Record<string, ItemMeta>>({})
  const [gameState, setGameState] = useState<GameLiveState | null>(null)
  const [settings, setSettings] = useState<AiSettings | null>(null)

  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null)
  const [heroGuide, setHeroGuide] = useState<HeroDetailGuide | null>(null)
  const [benchSuggestions, setBenchSuggestions] = useState<BenchSuggestion[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('guide')

  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [lastOcrResult, setLastOcrResult] = useState<OcrRecognizeResult | null>(null)

  const showNotice = (msg: string): void => {
    setToast(msg)
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev))
    }, 3500)
  }

  useEffect(() => {
    window.hexbuddy.getBootstrap().then((boot) => {
      setMeta(boot.meta)
      setHeroes(boot.heroes)
      setAugments(boot.augments)
      setItems(boot.items)
      setGameState(boot.gameState)
      setSettings(boot.settings)

      // Default to top winrate champion or live champion
      const sorted = Object.values(boot.heroes).sort(
        (a, b) => b.smoothedWinRate - a.smoothedWinRate
      )
      setSelectedHeroId(boot.gameState.myHeroId || sorted[0]?.id || null)
    })

    const unsubGame = window.hexbuddy.onGameStateUpdated((nextState) => {
      setGameState(nextState)
      if (nextState.myHeroId) {
        setSelectedHeroId(nextState.myHeroId)
      }
      if (nextState.simulatorScene === 'level-7-pick') {
        setActiveTab('three-pick')
      } else if (nextState.simulatorScene === 'teamfight-5v5') {
        setActiveTab('advisor')
      } else if (nextState.simulatorScene === 'champ-select') {
        setActiveTab('guide')
      }
    })

    const unsubOcr = window.hexbuddy.onOcrResult((res) => {
      setLastOcrResult(res)
      if (res.matchedAugmentIds.length > 0) {
        setActiveTab('three-pick')
      }
    })

    return () => {
      unsubGame()
      unsubOcr()
    }
  }, [])

  useEffect(() => {
    if (!selectedHeroId) return
    window.hexbuddy.getHeroGuide(selectedHeroId).then(setHeroGuide)
  }, [selectedHeroId, meta?.seq])

  useEffect(() => {
    if (!gameState || gameState.benchHeroIds.length === 0) {
      setBenchSuggestions([])
      return
    }
    window.hexbuddy
      .getBenchSuggestions(gameState.myHeroId, gameState.allyHeroIds, gameState.benchHeroIds)
      .then(setBenchSuggestions)
  }, [gameState?.myHeroId, gameState?.allyHeroIds, gameState?.benchHeroIds])

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

  const handleTogglePickAugment = (augId: string): void => {
    if (!gameState) return
    const exists = gameState.pickedAugmentIds.includes(augId)
    const next = exists
      ? gameState.pickedAugmentIds.filter((id) => id !== augId)
      : [...gameState.pickedAugmentIds, augId].slice(-4)
    window.hexbuddy.updateAugments({ pickedAugmentIds: next })
  }

  const handleAddCandidateAugment = (augId: string): void => {
    if (!gameState) return
    if (gameState.candidateAugmentIds.includes(augId)) {
      setActiveTab('three-pick')
      return
    }
    const next =
      gameState.candidateAugmentIds.length >= 3
        ? [...gameState.candidateAugmentIds.slice(1), augId]
        : [...gameState.candidateAugmentIds, augId]
    window.hexbuddy.updateAugments({ candidateAugmentIds: next })
    showNotice(`已加入三选一对比槽（${next.length}/3）`)
  }

  if (!meta || !gameState || !settings) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#070B12] text-[#C8AA6E] text-sm">
        正在加载海克斯大乱斗国服数据库...
      </div>
    )
  }

  const hero = heroGuide?.hero

  return (
    <div className="h-screen w-screen flex flex-col bg-[#070B12] text-[#F0E6D2] overflow-hidden">
      <SimulatorBar
        meta={meta}
        gameState={gameState}
        syncing={syncing}
        onSyncNow={handleSyncNow}
        onSelectSimScene={(scene) => window.hexbuddy.setSimulator(scene)}
        onOpenMini={() => window.hexbuddy.toggleMiniOverlay(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2 rounded-lg bg-[#142338] border border-[#0AC8B9]/50 text-xs text-[#F0E6D2] shadow-xl">
          {toast}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <TierRadar
          heroes={heroes}
          selectedHeroId={selectedHeroId}
          myLiveHeroId={gameState.myHeroId}
          benchSuggestions={benchSuggestions}
          onSelectHero={setSelectedHeroId}
        />

        {/* Right Main Command Deck */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#070B12]">
          {hero && heroGuide ? (
            <>
              {/* Hero Header Banner + 4 Picked Augment Slots */}
              <div className="px-6 py-4 border-b border-[#C8AA6E]/20 bg-gradient-to-r from-[#0E1728] via-[#0B1220] to-[#080D17] shrink-0 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={hero.avatarUrl}
                      alt={hero.name}
                      className="w-14 h-14 rounded-lg border-2 border-[#C8AA6E]/65 shadow-lg object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h1 className="font-runeterra text-xl font-bold text-[#F0E6D2]">
                          {hero.name}
                        </h1>
                        <span className="text-sm text-[#94A3B8]">{hero.title}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded border font-bold ${
                            TIER_STYLE[hero.tier]
                          }`}
                        >
                          {hero.tier} 梯队
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#C8C1B2] tabular-nums">
                        <span>
                          国服胜率{' '}
                          <strong className="text-[#0AC8B9]">
                            {(hero.smoothedWinRate * 100).toFixed(2)}%
                          </strong>
                        </span>
                        <span>·</span>
                        <span>全英雄排名 #{hero.rank}</span>
                        <span>·</span>
                        <span>统计场次 {hero.games.toLocaleString()}</span>
                        {heroGuide.bestSpells[0] && (
                          <>
                            <span>·</span>
                            <span>
                              推荐技能：
                              <strong className="text-[#E2C992]">
                                {heroGuide.bestSpells[0].label}
                              </strong>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 4 In-Game Augment Slots (Lv 3 / 7 / 11 / 15) */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#94A3B8] mr-1">本局已拿海克斯:</span>
                    {[3, 7, 11, 15].map((lv, idx) => {
                      const aid = gameState.pickedAugmentIds[idx]
                      const am = aid ? augments[aid] : null
                      return (
                        <div
                          key={lv}
                          className={`h-9 px-2.5 rounded border flex items-center gap-1.5 text-xs ${
                            am
                              ? RARITY_BADGE[am.rarity]
                              : 'bg-[#0D1524] border-dashed border-[#C8AA6E]/25 text-[#64748B]'
                          }`}
                        >
                          {am ? (
                            <>
                              {am.iconUrl && (
                                <img src={am.iconUrl} alt="" className="w-4 h-4 rounded-sm" />
                              )}
                              <span className="max-w-24 truncate">{am.name}</span>
                              <button
                                onClick={() => handleTogglePickAugment(am.id)}
                                className="text-white/60 hover:text-white cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <span>{lv}级槽</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Workspace Navigation Tabs */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    {(
                      [
                        {
                          key: 'guide',
                          label: '流派套路 · 出装 · 避坑指南',
                          icon: BookOpen
                        },
                        {
                          key: 'three-pick',
                          label: `局内「三选一」救急对比${
                            gameState.candidateAugmentIds.length > 0
                              ? ` (${gameState.candidateAugmentIds.length}/3)`
                              : ''
                          }`,
                          icon: Scale
                        },
                        {
                          key: 'advisor',
                          label: 'AI 局内军师 & 5v5 阵容克制',
                          icon: Bot
                        }
                      ] as const
                    ).map((tab) => {
                      const Icon = tab.icon
                      const active = activeTab === tab.key
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key)}
                          className={`px-4 py-2 rounded-t-md text-xs font-semibold flex items-center gap-2 border-b-2 cursor-pointer transition ${
                            active
                              ? 'bg-[#142033] text-[#F0E6D2] border-[#C8AA6E]'
                              : 'text-[#94A3B8] border-transparent hover:text-[#F0E6D2] hover:bg-white/5'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 text-[#C8AA6E]" />
                          <span>{tab.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => window.hexbuddy.openExternal(meta.sourceRepo)}
                    className="text-[11px] text-[#64748B] hover:text-[#C8AA6E] cursor-pointer hidden xl:block"
                  >
                    统计来源: github.com/czgreat/aramhex-data (CC BY-NC 4.0)
                  </button>
                </div>
              </div>

              {/* Scrollable Content Stage */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {activeTab === 'guide' && (
                  <HeroGuide
                    guide={heroGuide}
                    augments={augments}
                    items={items}
                    pickedAugmentIds={gameState.pickedAugmentIds}
                    candidateAugmentIds={gameState.candidateAugmentIds}
                    onTogglePickAugment={handleTogglePickAugment}
                    onAddCandidateAugment={handleAddCandidateAugment}
                  />
                )}

                {activeTab === 'three-pick' && (
                  <ThreePickModal
                    guide={heroGuide}
                    augments={augments}
                    pickedAugmentIds={gameState.pickedAugmentIds}
                    candidateAugmentIds={gameState.candidateAugmentIds}
                    lastOcrResult={lastOcrResult}
                    onSetCandidates={(ids) =>
                      window.hexbuddy.updateAugments({ candidateAugmentIds: ids })
                    }
                    onSelectWinnerToPicked={(aid) => {
                      const nextPicked = gameState.pickedAugmentIds.includes(aid)
                        ? gameState.pickedAugmentIds
                        : [...gameState.pickedAugmentIds, aid].slice(-4)
                      window.hexbuddy.updateAugments({
                        pickedAugmentIds: nextPicked,
                        candidateAugmentIds: []
                      })
                      showNotice(`已将【${augments[aid]?.name}】记入本局已拿槽位，AI 军师建议已同步更新`)
                    }}
                    onOcrResultReceived={(res) => setLastOcrResult(res)}
                  />
                )}

                {activeTab === 'advisor' && (
                  <AiAdvisorPanel
                    selectedHeroId={hero.id}
                    heroes={heroes}
                    items={items}
                    gameState={gameState}
                    settings={settings}
                    onOpenSettings={() => setShowSettings(true)}
                    onActivate5v5Sim={() => window.hexbuddy.setSimulator('teamfight-5v5')}
                  />
                )}
              </div>
            </>
          ) : null}
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          meta={meta}
          onClose={() => setShowSettings(false)}
          onSave={async (next) => {
            const updated = await window.hexbuddy.saveSettings(next)
            setSettings(updated)
            showNotice('设置已保存并生效')
          }}
        />
      )}
    </div>
  )
}
