import React, { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Crown,
  Dices,
  Loader2,
  MousePointerClick,
  Sparkles,
  X
} from 'lucide-react'
import { TIER_STYLE } from './TierRadar'
import type {
  AugmentMeta,
  BenchSuggestion,
  GameLiveState,
  HeroMeta,
  ItemMeta,
  PlaystyleMode,
  TacticalAdvice,
  UserPreferences
} from '@shared/types'

const PLAYSTYLE_MODES: Array<{ key: PlaystyleMode; short: string; tip: string }> = [
  { key: 'steady', short: '⚖️ 稳健', tip: '综合高胜率核心与局势克制，求稳上分' },
  { key: 'counter', short: '🎯 针对', tip: '专治敌方人头大爹、重装坦克与强回血' },
  { key: 'team', short: '🤝 团队', tip: '缺前排补肉、全队偏AP自动转物理/减抗' },
  { key: 'yolo', short: '🔥 独爽', tip: '只顾自己爽！无视防守拉满核弹/暴击伤害上限' },
  { key: 'torment', short: '😈 折磨', tip: '无限灼烧减速或叠肉回血，不死恶心流' }
]

export const MiniOverlay: React.FC = () => {
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

  useEffect(() => {
    document.body.style.backgroundColor = 'transparent'
    return () => {
      window.hexbuddy.setHudInteractive(false)
    }
  }, [])

  useEffect(() => {
    window.hexbuddy.getBootstrap().then((boot) => {
      setHeroes(boot.heroes)
      setAugments(boot.augments)
      setItems(boot.items)
      setGameState(boot.gameState)
      setPrefs(boot.prefs)
    })

    const unsubState = window.hexbuddy.onGameStateUpdated((st) => {
      setGameState(st)
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

  const heroId = gameState?.myHeroId || '1'
  const currentHero = heroes[heroId]

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

  const enterInteractive = (): void => {
    setHoveredBar(true)
    window.hexbuddy.setHudInteractive(true)
  }

  const leaveInteractive = (): void => {
    setHoveredBar(false)
    window.hexbuddy.setHudInteractive(false)
  }

  if (!gameState) return null

  const isSimulator = gameState.connectionMode === 'simulator'
  const isChampSelect =
    gameState.connectionMode === 'lcu-champ-select' ||
    (isSimulator && gameState.simulatorScene === 'champ-select')
  const hasThreePick = gameState.cardSlots.length > 0 && (advice?.situationalCandidates.length ?? 0) > 0
  const showShoppingDrawer = Boolean(gameState.isDead && !hasThreePick) || hoveredBar

  const nextStep = advice?.immediateNextItem
  const nextItem = nextStep ? items[nextStep.itemId] : null
  const badgeAtBottom = prefs?.badgePosition === 'bottom'

  const evalByAugId = new Map(
    (advice?.situationalCandidates || []).map((ev) => [ev.augmentId, ev])
  )

  const handleSimPickCard = (augId: string): void => {
    const nextPicked = gameState.pickedAugmentIds.includes(augId)
      ? gameState.pickedAugmentIds
      : [...gameState.pickedAugmentIds, augId].slice(-4)
    window.hexbuddy.updateAugments({
      pickedAugmentIds: nextPicked,
      candidateAugmentIds: []
    })
  }

  return (
    <div className="w-screen h-screen bg-transparent pointer-events-none relative overflow-hidden select-none text-xs">
      {/* =====================================================================
          SIMULATOR BACKDROP (Only rendered during desktop preview mode so users
          on macOS / outside game see exact spatial alignment!)
          ===================================================================== */}
      {isSimulator && (
        <div className="absolute inset-0 bg-[#050912]/72 backdrop-blur-[2px] flex items-center justify-center">
          <div
            onMouseEnter={enterInteractive}
            onMouseLeave={leaveInteractive}
            className="pointer-events-auto fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#0D1626]/95 border border-[#C8AA6E]/45 flex items-center gap-2 shadow-2xl"
          >
            <span className="text-[11px] text-[#E2C992] font-semibold">原位 HUD 演练场：</span>
            {(
              [
                { key: 'champ-select', label: '① 选人替补席原位贴标' },
                { key: 'level-7-pick', label: '② 局内三选一原位贴标+刷新' },
                { key: 'fountain-buy', label: '③ 阵亡逛商店动态出装' }
              ] as const
            ).map((sc) => (
              <button
                key={sc.key}
                onClick={() => window.hexbuddy.setSimulator(sc.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] cursor-pointer transition ${
                  gameState.simulatorScene === sc.key
                    ? 'bg-[#C8AA6E] text-[#070B12] font-bold'
                    : 'bg-white/8 text-[#C8C1B2] hover:text-white'
                }`}
              >
                {sc.label}
              </button>
            ))}
            <button
              onClick={() => {
                leaveInteractive()
                window.hexbuddy.setSimulator('off')
                window.hexbuddy.toggleMiniOverlay(false)
              }}
              className="ml-2 px-2.5 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-400/40 text-[11px] cursor-pointer"
            >
              退出演练
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          1. TOP-CENTER HUD BAR (5 Mindset Pills + Next Item + Fountain Roadmap)
             Quiet & translucent during alive combat; expands on death/hover!
          ===================================================================== */}
      <div
        onMouseEnter={enterInteractive}
        onMouseLeave={leaveInteractive}
        className="pointer-events-auto fixed top-2.5 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center max-w-[94vw]"
      >
        {/* Main Slim Pill */}
        <div
          className={`px-3 py-1.5 rounded-full border flex items-center gap-2.5 transition-all shadow-xl ${
            hoveredBar || gameState.isDead || isSimulator
              ? 'bg-[#09101D]/95 border-[#C8AA6E]/55 opacity-100'
              : 'bg-[#09101D]/58 border-white/15 opacity-75'
          }`}
        >
          {/* Current Hero + Skill Order */}
          {currentHero && (
            <div className="flex items-center gap-1.5 pr-2 border-r border-white/15">
              <img
                src={currentHero.avatarUrl}
                alt=""
                className="w-6 h-6 rounded-full border border-[#C8AA6E]/60"
              />
              <span className="font-bold text-[#F0E6D2]">{currentHero.name}</span>
              {currentHero.skillOrder && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C8AA6E]/20 text-[#E2C992]">
                  {currentHero.skillOrder}
                </span>
              )}
            </div>
          )}

          {/* 5 Playstyle Mindset Switcher */}
          <div className="flex items-center gap-0.5 bg-black/45 p-0.5 rounded-full border border-white/10">
            {PLAYSTYLE_MODES.map((pm) => {
              const active = gameState.playstyleMode === pm.key
              return (
                <button
                  key={pm.key}
                  onClick={() => window.hexbuddy.setPlaystyleMode(pm.key)}
                  title={pm.tip}
                  className={`px-2 py-0.5 rounded-full text-[11px] cursor-pointer transition whitespace-nowrap ${
                    active
                      ? 'bg-[#C8AA6E] text-[#070B12] font-bold shadow'
                      : 'text-[#94A3B8] hover:text-[#F0E6D2]'
                  }`}
                >
                  {pm.short}
                </button>
              )
            })}
          </div>

          {/* Next Item + Live Gold Status */}
          {nextItem && nextStep && !isChampSelect && (
            <div className="flex items-center gap-1.5 pl-1 border-l border-white/15">
              <span className="text-[11px] text-[#94A3B8]">下一件:</span>
              <img src={nextItem.iconUrl} alt="" className="w-5 h-5 rounded border border-[#C8AA6E]/40" />
              <span className="font-semibold text-[#F0E6D2]">{nextItem.name}</span>
              {nextStep.affordableNow ? (
                <span className="px-1.5 py-0.5 rounded bg-[#0AC8B9]/25 text-[#5CF2E5] border border-[#0AC8B9]/45 text-[10px] font-bold">
                  钱已够!
                </span>
              ) : (
                <span className="text-[10px] text-[#94A3B8] tabular-nums">
                  差{nextStep.goldRemaining}金
                </span>
              )}
            </div>
          )}

          {/* Picked Augment Mini Slots (click to remove/adjust) */}
          {gameState.pickedAugmentIds.length > 0 && (
            <div className="flex items-center gap-1 pl-1 border-l border-white/15">
              {gameState.pickedAugmentIds.map((aid) => {
                const am = augments[aid]
                if (!am) return null
                return (
                  <button
                    key={aid}
                    onClick={() =>
                      window.hexbuddy.updateAugments({
                        pickedAugmentIds: gameState.pickedAugmentIds.filter((x) => x !== aid)
                      })
                    }
                    title={`已记录：${am.name}（点击移除）`}
                    className="w-5 h-5 rounded bg-black/50 border border-[#C8AA6E]/40 overflow-hidden cursor-pointer hover:border-rose-400"
                  >
                    {am.iconUrl && <img src={am.iconUrl} alt="" className="w-full h-full" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* Utility Buttons */}
          <div className="flex items-center gap-1 pl-1 border-l border-white/15">
            <button
              onClick={async () => {
                setOcrBusy(true)
                await window.hexbuddy.captureScreenOcr()
                setOcrBusy(false)
              }}
              title="手动重识三选一 (Alt+S)"
              className="p-1 rounded-full hover:bg-white/10 text-[#0AC8B9] cursor-pointer"
            >
              {ocrBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => window.hexbuddy.showMainWindow()}
              title="打开攻略查阅词典"
              className="p-1 rounded-full hover:bg-white/10 text-[#C8C1B2] hover:text-white cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                leaveInteractive()
                window.hexbuddy.toggleMiniOverlay(false)
              }}
              title="隐藏原位 HUD (Alt+H)"
              className="p-1 rounded-full hover:bg-white/10 text-[#94A3B8] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Fountain Shopping Roadmap Strip (Auto-expands when Dead in Base or Hovered!) */}
        {showShoppingDrawer && !isChampSelect && advice && (
          <div className="mt-2 px-4 py-3 rounded-xl bg-[#09101D]/95 border border-[#C8AA6E]/45 shadow-2xl space-y-2.5 max-w-3xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#F0E6D2]">{advice.headline}</span>
                <span className="text-[11px] text-[#E2C992] tabular-nums">
                  当前金币: {gameState.currentGold}
                </span>
              </div>

              <button
                onClick={async () => {
                  setAiBriefBusy(true)
                  const r = await window.hexbuddy.askLlmAdvisor(heroId, '__MINI_BRIEF__')
                  setAiBrief(r.content)
                  setAiBriefBusy(false)
                }}
                disabled={aiBriefBusy}
                className="px-2.5 py-0.5 rounded-full bg-[#C8AA6E]/20 hover:bg-[#C8AA6E]/35 border border-[#C8AA6E]/45 text-[11px] text-[#E2C992] flex items-center gap-1 cursor-pointer"
              >
                {aiBriefBusy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                <span>AI 一句话锦囊</span>
              </button>
            </div>

            {aiBrief && (
              <div className="px-3 py-2 rounded bg-black/55 border border-[#0AC8B9]/40 text-[11px] text-[#F0E6D2] whitespace-pre-wrap">
                {aiBrief}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {/* Recommended Shoe */}
              {advice.recommendedShoe && items[advice.recommendedShoe.itemId] && (
                <div
                  title={advice.recommendedShoe.reason}
                  className={`px-2 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                    advice.recommendedShoe.owned
                      ? 'bg-black/30 border-white/10 opacity-50'
                      : 'bg-[#121E32] border-[#C8AA6E]/30'
                  }`}
                >
                  <img
                    src={items[advice.recommendedShoe.itemId].iconUrl}
                    alt=""
                    className="w-7 h-7 rounded"
                  />
                  <div>
                    <div className="text-[10px] text-[#94A3B8]">推荐鞋</div>
                    <div className="text-[11px] font-semibold text-[#F0E6D2]">
                      {items[advice.recommendedShoe.itemId].name}
                    </div>
                  </div>
                </div>
              )}

              {/* 5 Dynamic Items */}
              {advice.dynamicBuildPlan.map((step, idx) => {
                const im = items[step.itemId]
                if (!im) return null
                const isNext = nextStep?.itemId === step.itemId && !step.owned
                return (
                  <React.Fragment key={step.itemId}>
                    <div
                      title={`${step.reason}\n${im.brief}`}
                      className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-2 transition ${
                        step.owned
                          ? 'bg-black/30 border-emerald-500/30 opacity-55'
                          : isNext
                            ? 'bg-[#10283B] border-[#0AC8B9] shadow-[0_0_12px_rgba(10,200,185,0.25)]'
                            : 'bg-[#121E32] border-[#C8AA6E]/25'
                      }`}
                    >
                      <img src={im.iconUrl} alt="" className="w-7 h-7 rounded shrink-0" />
                      <div>
                        <div className="flex items-center gap-1">
                          <span
                            className={`text-[10px] px-1 rounded ${
                              step.sourceTag === '常规核心'
                                ? 'bg-white/10 text-[#C8C1B2]'
                                : 'bg-[#C8AA6E]/25 text-[#E2C992]'
                            }`}
                          >
                            {step.owned ? '✓ 已买' : step.sourceTag}
                          </span>
                          {isNext && step.affordableNow && (
                            <span className="text-[10px] text-[#5CF2E5] font-bold">直接买!</span>
                          )}
                        </div>
                        <div className="text-[11px] font-semibold text-[#F0E6D2] mt-0.5">
                          {im.name}
                        </div>
                      </div>
                    </div>
                    {idx < advice.dynamicBuildPlan.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-[#64748B]" />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          2. SCENE A: CHAMP SELECT IN-PLACE BENCH PORTRAIT BADGES
             Directly aligned underneath each Bench hero slot in LOL Client!
          ===================================================================== */}
      {isChampSelect && benchList.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Center Bench Row aligned at top-center of 16:9 LOL Client */}
          <div className="absolute top-[13%] left-1/2 -translate-x-1/2 flex items-start gap-3">
            {benchList.map((sug) => {
              const h = heroes[sug.heroId]
              if (!h) return null
              const isHot = sug.isFavorite || sug.deltaVsCurrent >= 0.02 || sug.tier === 'T0'
              return (
                <div key={`${sug.heroId}-${sug.benchIndex}`} className="flex flex-col items-center w-24">
                  {/* Show simulated client bench portrait in demo mode */}
                  {isSimulator && (
                    <div className="mb-1.5 relative">
                      <img
                        src={h.avatarUrl}
                        alt={h.name}
                        className="w-14 h-14 rounded-md border-2 border-[#C8AA6E]/70 shadow-lg"
                      />
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[10px] text-center text-[#F0E6D2] py-0.5">
                        {h.name}
                      </span>
                    </div>
                  )}

                  {/* The actual In-Place Spatial Badge painted directly beneath the bench slot! */}
                  <div
                    className={`w-full px-1.5 py-1 rounded-md border text-center shadow-xl ${
                      isHot
                        ? 'bg-[#081F2D]/95 border-[#0AC8B9] shadow-[0_0_14px_rgba(10,200,185,0.28)]'
                        : 'bg-[#090F1A]/92 border-white/20'
                    }`}
                  >
                    <div
                      className={`text-[10px] font-bold truncate ${
                        isHot ? 'text-[#5CF2E5]' : 'text-[#C8C1B2]'
                      }`}
                    >
                      {sug.shortTag}
                    </div>
                    <div className="flex items-center justify-center gap-1 mt-0.5 tabular-nums">
                      <span className="text-[11px] font-bold text-[#F0E6D2]">
                        {(sug.winRate * 100).toFixed(1)}%
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${
                          sug.deltaVsCurrent >= 0 ? 'text-[#0AC8B9]' : 'text-rose-400'
                        }`}
                      >
                        {sug.deltaVsCurrent >= 0 ? '+' : ''}
                        {(sug.deltaVsCurrent * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Left-side My Team Composition Callout */}
          <div className="absolute left-[6%] top-[28%] bg-[#09101D]/92 border border-[#C8AA6E]/45 rounded-lg p-3 space-y-2 shadow-xl max-w-60">
            <div className="text-[11px] font-bold text-[#E2C992]">我方阵容体检</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {gameState.allyHeroIds.map((hid, i) => {
                const ah = heroes[hid]
                if (!ah) return null
                return (
                  <div key={`${hid}-${i}`} className="flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded">
                    <img src={ah.avatarUrl} alt="" className="w-5 h-5 rounded" />
                    <span className="text-[10px] text-[#F0E6D2]">{ah.name}</span>
                    <span className={`text-[9px] px-1 rounded border ${TIER_STYLE[ah.tier]}`}>
                      {ah.tier}
                    </span>
                  </div>
                )
              })}
            </div>
            {advice?.threatRadar.allyDamageWarning && (
              <div className="text-[11px] text-amber-300 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{advice.threatRadar.allyDamageWarning}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          3. SCENE B: IN-GAME 3-CARD SPATIAL AUGMENT OVERLAY BADGES
             Painted directly above/below the 3 Hextech Augment Cards in center!
          ===================================================================== */}
      {hasThreePick && (
        <div className="absolute inset-0 pointer-events-none">
          {gameState.cardSlots.map((slot) => {
            const meta = augments[slot.augmentId]
            const ev = evalByAugId.get(slot.augmentId)
            if (!meta || !ev) return null

            const isBest = ev.isRecommendedPick
            const isTrap = ev.verdict === 'TRAP' || ev.hasConflict

            return (
              <div
                key={`${slot.slotIndex}-${slot.augmentId}`}
                style={{
                  left: `${slot.xRatio * 100}%`,
                  top: isSimulator ? '50%' : badgeAtBottom ? '74%' : '21%'
                }}
                className={`absolute -translate-x-1/2 ${
                  isSimulator ? '-translate-y-1/2' : ''
                } flex flex-col items-center w-64`}
              >
                {/* Spatial Floating Recommendation Tag (Top position) */}
                {!badgeAtBottom && (
                  <SpatialCardBadge meta={meta} ev={ev} isBest={isBest} isTrap={isTrap} />
                )}

                {/* Simulated Game Card Frame (ONLY shown in desktop simulator so user can test Reroll & Pick!) */}
                {isSimulator && (
                  <div
                    onMouseEnter={enterInteractive}
                    onMouseLeave={leaveInteractive}
                    className={`pointer-events-auto my-2.5 w-60 rounded-xl p-4 border bg-[#0E1726]/95 text-center space-y-2.5 shadow-2xl ${
                      isBest ? 'border-[#0AC8B9]' : 'border-[#C8AA6E]/35'
                    }`}
                  >
                    <div className="text-[10px] text-[#64748B]">（模拟游戏中央卡片 #{slot.slotIndex + 1}）</div>
                    {meta.iconUrl && (
                      <img src={meta.iconUrl} alt="" className="w-12 h-12 mx-auto rounded-lg bg-black/50 p-1" />
                    )}
                    <div className="text-sm font-bold text-[#F0E6D2]">{meta.name}</div>
                    <p className="text-[11px] text-[#94A3B8] line-clamp-2">{meta.desc}</p>
                    <div className="pt-1 flex items-center gap-1.5">
                      <button
                        onClick={() => handleSimPickCard(meta.id)}
                        className="flex-1 py-1.5 rounded bg-[#C8AA6E] hover:bg-[#E2C992] text-[#070B12] font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <MousePointerClick className="w-3 h-3" />
                        <span>模拟选它</span>
                      </button>
                      <button
                        onClick={() => window.hexbuddy.rerollSimSlot(slot.slotIndex)}
                        title="模拟在游戏里点击骰子刷新这张海克斯卡"
                        className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[#F0E6D2] text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Dices className="w-3.5 h-3.5 text-[#0AC8B9]" />
                        <span>刷新</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Spatial Floating Recommendation Tag (Bottom position) */}
                {badgeAtBottom && (
                  <SpatialCardBadge meta={meta} ev={ev} isBest={isBest} isTrap={isTrap} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const SpatialCardBadge: React.FC<{
  meta: AugmentMeta
  ev: NonNullable<TacticalAdvice['situationalCandidates'][number]>
  isBest: boolean
  isTrap: boolean
}> = ({ meta, ev, isBest, isTrap }) => {
  return (
    <div
      className={`w-full rounded-xl px-3.5 py-2.5 border shadow-2xl backdrop-blur-md space-y-1 ${
        isBest
          ? 'bg-[#072230]/95 border-2 border-[#0AC8B9] shadow-[0_0_24px_rgba(10,200,185,0.35)]'
          : isTrap
            ? 'bg-[#240B15]/95 border border-rose-500/75'
            : 'bg-[#0A111E]/95 border border-[#C8AA6E]/45'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isBest ? (
            <span className="px-1.5 py-0.5 rounded bg-[#0AC8B9] text-[#070B12] text-[10px] font-extrabold flex items-center gap-0.5 shrink-0">
              <Crown className="w-3 h-3" />
              首选
            </span>
          ) : isTrap ? (
            <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold shrink-0">
              避坑
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-white/15 text-[#F0E6D2] text-[10px] font-semibold shrink-0">
              备选
            </span>
          )}
          <span className="font-bold text-[#F0E6D2] truncate">{meta.name}</span>
        </div>

        <div className="text-right tabular-nums shrink-0">
          <span className="font-extrabold text-sm text-[#F0E6D2]">
            {(ev.baseWinRate * 100).toFixed(1)}%
          </span>
          <span
            className={`ml-1 text-[11px] font-semibold ${
              ev.deltaWinRate >= 0 ? 'text-[#0AC8B9]' : 'text-rose-400'
            }`}
          >
            {ev.deltaWinRate >= 0 ? '+' : ''}
            {(ev.deltaWinRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className={`font-semibold truncate ${
            isBest ? 'text-[#5CF2E5]' : isTrap ? 'text-rose-300' : 'text-[#E2C992]'
          }`}
        >
          {ev.primaryTag}
        </span>

        {ev.pivotItem && (
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/45 text-[#E2C992] shrink-0">
            配装: {ev.pivotItem.name}
          </span>
        )}
      </div>

      {ev.situationReasons[0] && (
        <div className="text-[10px] text-[#C8C1B2] truncate">{ev.situationReasons[0]}</div>
      )}
    </div>
  )
}
