import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  Eye,
  Loader2,
  Lock,
  MousePointerClick,
  Search,
  ShieldAlert,
  Sparkles,
  X
} from 'lucide-react'
import { matchesSearchQuery } from '@shared/pinyin'
import { RARITY_BADGE, RARITY_LABEL, VERDICT_STYLE } from './HeroGuide'
import type {
  AugmentMeta,
  GameLiveState,
  HeroDetailGuide,
  HeroMeta,
  ItemMeta,
  OcrRecognizeResult,
  OverlayOpacityMode,
  TacticalAdvice
} from '@shared/types'

const OPACITY_STYLES: Record<OverlayOpacityMode, { shell: string; card: string; label: string }> = {
  solid: {
    shell: 'bg-[#080D16] border-[#C8AA6E]/50',
    card: 'bg-[#101A2C] border-[#C8AA6E]/25',
    label: '实底'
  },
  glass: {
    shell: 'bg-[#080D16]/78 backdrop-blur-md border-[#C8AA6E]/40',
    card: 'bg-[#0E1726]/75 border-[#C8AA6E]/20',
    label: '半透'
  },
  clear: {
    shell: 'bg-[#05080F]/42 border-white/15',
    card: 'bg-[#070B14]/55 border-white/15',
    label: '全透'
  }
}

export const MiniOverlay: React.FC = () => {
  const [heroes, setHeroes] = useState<Record<string, HeroMeta>>({})
  const [augments, setAugments] = useState<Record<string, AugmentMeta>>({})
  const [items, setItems] = useState<Record<string, ItemMeta>>({})
  const [gameState, setGameState] = useState<GameLiveState | null>(null)
  const [heroId, setHeroId] = useState<string>('103')
  const [guide, setGuide] = useState<HeroDetailGuide | null>(null)
  const [advice, setAdvice] = useState<TacticalAdvice | null>(null)

  const [collapsed, setCollapsed] = useState<boolean>(false)
  const [opacityMode, setOpacityMode] = useState<OverlayOpacityMode>('solid')
  const [clickThrough, setClickThrough] = useState<boolean>(false)
  const [subTab, setSubTab] = useState<'pick' | 'build'>('build')

  const [query, setQuery] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrMsg, setOcrMsg] = useState<string | null>(null)
  const [aiBriefBusy, setAiBriefBusy] = useState(false)
  const [aiBriefText, setAiBriefText] = useState<string | null>(null)

  // Make body transparent in mini overlay window so clear/glass modes let game background shine through
  useEffect(() => {
    document.body.style.backgroundColor = 'transparent'
  }, [])

  useEffect(() => {
    window.hexbuddy.getBootstrap().then((boot) => {
      setHeroes(boot.heroes)
      setAugments(boot.augments)
      setItems(boot.items)
      setGameState(boot.gameState)
      setOpacityMode(boot.prefs.overlayOpacity || 'solid')
      setClickThrough(boot.miniClickThrough)
      const initialHero = boot.gameState.myHeroId || Object.keys(boot.heroes)[0]
      if (initialHero) setHeroId(initialHero)
      if (boot.gameState.candidateAugmentIds.length > 0) {
        setSubTab('pick')
      }
    })

    const unsubState = window.hexbuddy.onGameStateUpdated((st) => {
      setGameState(st)
      if (st.myHeroId) setHeroId(st.myHeroId)
      if (st.candidateAugmentIds.length > 0) {
        setSubTab('pick')
        setCollapsed(false)
      }
    })
    const unsubOcr = window.hexbuddy.onOcrResult((res: OcrRecognizeResult) => {
      setOcrMsg(
        res.success
          ? `已识别 ${res.matchedAugmentIds.length} 张海克斯（${res.elapsedMs}ms）`
          : res.error || '未识别到三选一卡片'
      )
      if (res.matchedAugmentIds.length > 0) {
        setSubTab('pick')
        setCollapsed(false)
      }
    })
    const unsubCt = window.hexbuddy.onMiniClickThroughChanged((locked) => {
      setClickThrough(locked)
    })

    return () => {
      unsubState()
      unsubOcr()
      unsubCt()
    }
  }, [])

  useEffect(() => {
    window.hexbuddy.resizeMiniOverlay(collapsed)
  }, [collapsed])

  useEffect(() => {
    if (!heroId) return
    window.hexbuddy.getHeroGuide(heroId).then(setGuide)
    window.hexbuddy.getTacticalAdvice(heroId).then(setAdvice)
    setAiBriefText(null)
  }, [heroId, gameState?.enemyHeroIds, gameState?.pickedAugmentIds])

  const cycleOpacity = (): void => {
    const order: OverlayOpacityMode[] = ['solid', 'glass', 'clear']
    const next = order[(order.indexOf(opacityMode) + 1) % order.length]
    setOpacityMode(next)
    window.hexbuddy.savePrefs({ overlayOpacity: next })
  }

  const toggleClickThroughLock = async (): Promise<void> => {
    const next = !clickThrough
    const confirmed = await window.hexbuddy.setMiniClickThrough(next)
    setClickThrough(confirmed)
  }

  const statMap = useMemo(() => {
    return new Map((guide?.augments || []).map((s) => [s.augmentId, s]))
  }, [guide])

  const pickedTags = useMemo(() => {
    return new Set(
      (gameState?.pickedAugmentIds || [])
        .flatMap((id) => augments[id]?.tags || [])
        .filter((t) => t !== 'general')
    )
  }, [gameState?.pickedAugmentIds, augments])

  const quickHits = useMemo(() => {
    if (!query.trim()) return []
    return Object.values(augments)
      .filter((a) =>
        matchesSearchQuery(query, {
          name: a.name,
          pinyinFull: a.pinyinFull,
          pinyinInitials: a.pinyinInitials
        })
      )
      .slice(0, 6)
  }, [augments, query])

  const candidates = gameState?.candidateAugmentIds || []
  const evaluated = useMemo(() => {
    const rows = candidates
      .map((id) => {
        const meta = augments[id]
        if (!meta) return null
        const stat = statMap.get(id)
        const hasSynergy = meta.tags.some((t) => pickedTags.has(t))
        const score = (stat?.smoothedWinRate ?? 0.48) + (hasSynergy ? 0.012 : 0)
        return { meta, stat, hasSynergy, score }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    const bestId = rows.length >= 2 ? [...rows].sort((a, b) => b.score - a.score)[0].meta.id : null
    return { rows, bestId }
  }, [candidates, augments, statMap, pickedTags])

  const handleOcrClick = async (): Promise<void> => {
    setOcrBusy(true)
    const res = await window.hexbuddy.captureScreenOcr()
    setOcrMsg(
      res.success
        ? `识别成功（${res.elapsedMs}ms）`
        : res.error || '未检测到海克斯卡，可用下方首字母秒搜'
    )
    if (res.matchedAugmentIds.length > 0) {
      setSubTab('pick')
      setCollapsed(false)
    }
    setOcrBusy(false)
  }

  const handleGenerateAiBrief = async (): Promise<void> => {
    setAiBriefBusy(true)
    const res = await window.hexbuddy.askLlmAdvisor(heroId, '__MINI_BRIEF__')
    setAiBriefText(res.content)
    setAiBriefBusy(false)
  }

  const addCandidate = (id: string): void => {
    if (candidates.includes(id)) return
    const next = candidates.length >= 3 ? [...candidates.slice(1), id] : [...candidates, id]
    window.hexbuddy.updateAugments({ candidateAugmentIds: next })
    setSubTab('pick')
    setQuery('')
  }

  const pickWinnerAndCollapse = (id: string): void => {
    const prev = gameState?.pickedAugmentIds || []
    const nextPicked = prev.includes(id) ? prev : [...prev, id].slice(-4)
    window.hexbuddy.updateAugments({ pickedAugmentIds: nextPicked, candidateAugmentIds: [] })
    setSubTab('build')
    // Automatically collapse back into unobtrusive combat pill after picking!
    setCollapsed(true)
  }

  const currentHero = heroes[heroId]
  const nextCounterItemId =
    advice?.counterItemIds?.[0]?.itemId || guide?.coreBuilds?.[0]?.items?.[0]
  const nextItem = nextCounterItemId ? items[nextCounterItemId] : null
  const theme = OPACITY_STYLES[opacityMode]

  // =========================================================================
  // STATE 1: COLLAPSED COMBAT HUD PILL (400 x 50px) — Zero screen clutter!
  // =========================================================================
  if (collapsed) {
    return (
      <div
        className={`h-screen w-screen rounded-lg border px-2.5 flex items-center justify-between gap-2 text-xs shadow-lg ${theme.shell}`}
      >
        <div className="app-drag flex items-center gap-2 min-w-0 flex-1 py-1">
          {currentHero && (
            <img
              src={currentHero.avatarUrl}
              alt=""
              className="w-7 h-7 rounded border border-[#C8AA6E]/50 shrink-0"
            />
          )}
          <div className="min-w-0 truncate">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[#F0E6D2]">{currentHero?.name || '海斗军师'}</span>
              {currentHero?.skillOrder && (
                <span className="text-[10px] px-1 rounded bg-[#C8AA6E]/20 text-[#E2C992]">
                  {currentHero.skillOrder}
                </span>
              )}
            </div>
            {nextItem && (
              <div className="flex items-center gap-1 text-[11px] text-[#5CF2E5] truncate">
                <span>下一件:</span>
                <img src={nextItem.iconUrl} alt="" className="w-3.5 h-3.5 rounded-sm" />
                <span className="truncate">{nextItem.name}</span>
              </div>
            )}
          </div>
        </div>

        <div
          onMouseEnter={() => {
            if (clickThrough) window.hexbuddy.setMiniClickThrough(false, true)
          }}
          onMouseLeave={() => {
            if (clickThrough) window.hexbuddy.setMiniClickThrough(true, true)
          }}
          className="app-no-drag flex items-center gap-1 shrink-0"
        >
          <button
            onClick={toggleClickThroughLock}
            title={
              clickThrough
                ? '当前已开启鼠标穿透（防团战误点），点击或按 Alt+H 解锁'
                : '开启鼠标右键穿透锁定（团战不抢游戏焦点）'
            }
            className={`p-1.5 rounded border cursor-pointer transition ${
              clickThrough
                ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                : 'bg-black/30 border-white/15 text-[#94A3B8] hover:text-white'
            }`}
          >
            {clickThrough ? (
              <Lock className="w-3.5 h-3.5" />
            ) : (
              <MousePointerClick className="w-3.5 h-3.5" />
            )}
          </button>

          {!clickThrough && (
            <>
              <button
                onClick={handleOcrClick}
                disabled={ocrBusy}
                title="一键截屏识别三选一 (Alt+S)"
                className="px-2 py-1 rounded bg-[#0AC8B9] text-[#070B12] font-semibold flex items-center gap-1 cursor-pointer"
              >
                {ocrBusy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Camera className="w-3 h-3" />
                )}
                <span>识屏</span>
              </button>

              <button
                onClick={() => setCollapsed(false)}
                title="展开三选一与出装详情"
                className="p-1.5 rounded bg-black/30 border border-white/15 text-[#F0E6D2] hover:bg-white/10 cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // =========================================================================
  // STATE 2: EXPANDED FOUNTAIN / 3-PICK DECISION OVERLAY (440 x 590px)
  // =========================================================================
  return (
    <div
      className={`h-screen w-screen rounded-lg border flex flex-col overflow-hidden text-xs shadow-2xl ${theme.shell}`}
    >
      {/* Top Control Header */}
      <div className="app-drag h-10 px-3 bg-black/35 border-b border-[#C8AA6E]/25 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {currentHero && (
            <img
              src={currentHero.avatarUrl}
              alt=""
              className="w-6 h-6 rounded border border-[#C8AA6E]/45 shrink-0"
            />
          )}
          <span className="font-bold text-[#F0E6D2] truncate">{currentHero?.name || 'HexBuddy'}</span>
          {currentHero?.skillOrder && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C8AA6E]/20 text-[#E2C992] border border-[#C8AA6E]/35 shrink-0">
              {currentHero.skillOrder}
            </span>
          )}
        </div>

        <div
          onMouseEnter={() => {
            if (clickThrough) window.hexbuddy.setMiniClickThrough(false, true)
          }}
          onMouseLeave={() => {
            if (clickThrough) window.hexbuddy.setMiniClickThrough(true, true)
          }}
          className="app-no-drag flex items-center gap-1"
        >
          <button
            onClick={cycleOpacity}
            title="切换背景透明度（实底 / 毛玻璃半透 / 全透浮字）"
            className="px-1.5 py-1 rounded bg-black/40 border border-white/15 text-[11px] text-[#C8C1B2] hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <Eye className="w-3 h-3 text-[#C8AA6E]" />
            <span>{theme.label}</span>
          </button>

          <button
            onClick={toggleClickThroughLock}
            title={clickThrough ? '点击或按 Alt+H 解锁鼠标穿透' : '锁定鼠标穿透防误点'}
            className={`px-1.5 py-1 rounded border text-[11px] flex items-center gap-1 cursor-pointer ${
              clickThrough
                ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                : 'bg-black/40 border-white/15 text-[#C8C1B2] hover:text-white'
            }`}
          >
            {clickThrough ? <Lock className="w-3 h-3" /> : <MousePointerClick className="w-3 h-3" />}
            <span>{clickThrough ? '已穿透' : '穿透'}</span>
          </button>

          <button
            onClick={handleOcrClick}
            disabled={ocrBusy}
            className="px-2 py-1 rounded bg-[#0AC8B9] text-[#070B12] font-semibold flex items-center gap-1 cursor-pointer"
          >
            {ocrBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
            <span>识屏</span>
          </button>

          <button
            onClick={() => setCollapsed(true)}
            title="收起为顶部窄胶囊条（团战不挡视野）"
            className="p-1 text-[#C8C1B2] hover:text-white cursor-pointer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>

          <button
            onClick={() => window.hexbuddy.toggleMiniOverlay(false)}
            title="隐藏悬浮窗 (Alt+H)"
            className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dual-View Switcher + Picked Augment Mini Icons */}
      <div className="px-3 py-2 bg-black/25 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center bg-black/40 rounded p-0.5 border border-white/10">
          <button
            onClick={() => setSubTab('pick')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition ${
              subTab === 'pick'
                ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                : 'text-[#C8C1B2] hover:text-white'
            }`}
          >
            三选一决策 {candidates.length > 0 ? `(${candidates.length})` : ''}
          </button>
          <button
            onClick={() => setSubTab('build')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer transition ${
              subTab === 'build'
                ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                : 'text-[#C8C1B2] hover:text-white'
            }`}
          >
            买装与速记
          </button>
        </div>

        {/* 4 Picked Augment mini badges */}
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3].map((idx) => {
            const aid = gameState?.pickedAugmentIds[idx]
            const am = aid ? augments[aid] : null
            return (
              <div
                key={idx}
                title={am ? `已拿: ${am.name}` : '待选槽'}
                className="w-6 h-6 rounded border border-white/15 bg-black/40 flex items-center justify-center overflow-hidden"
              >
                {am?.iconUrl ? (
                  <img src={am.iconUrl} alt="" className="w-5 h-5" />
                ) : (
                  <span className="text-[9px] text-slate-500">{[3, 7, 11, 15][idx]}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {/* Hero quick switch + Pinyin quick input */}
        <div className="flex gap-1.5">
          <select
            value={heroId}
            onChange={(e) => setHeroId(e.target.value)}
            className="w-26 px-2 py-1.5 rounded bg-black/50 border border-[#C8AA6E]/30 text-[#F0E6D2] focus:outline-none"
          >
            {Object.values(heroes)
              .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
              .map((h) => (
                <option key={h.id} value={h.id} className="bg-[#0C1320]">
                  {h.name}
                </option>
              ))}
          </select>

          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输首字母秒加三选一 (如 zghs)"
              className="w-full pl-8 pr-2 py-1.5 rounded bg-black/50 border border-[#C8AA6E]/30 text-[#F0E6D2] placeholder-[#64748B] focus:outline-none focus:border-[#C8AA6E]"
            />
          </div>
        </div>

        {quickHits.length > 0 && (
          <div className={`flex flex-wrap gap-1 p-2 rounded border ${theme.card}`}>
            {quickHits.map((m) => (
              <button
                key={m.id}
                onClick={() => addCandidate(m.id)}
                className={`px-2 py-1 rounded border text-[11px] cursor-pointer ${RARITY_BADGE[m.rarity]}`}
              >
                + {m.name}
              </button>
            ))}
          </div>
        )}

        {ocrMsg && (
          <div className="px-2.5 py-1.5 rounded bg-black/45 border border-[#C8AA6E]/25 text-[11px] text-[#C8C1B2]">
            {ocrMsg}
          </div>
        )}

        {subTab === 'pick' ? (
          // ---------------- VIEW A: 3-PICK DECISION ----------------
          evaluated.rows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-[#C8C1B2]">
                <span>点“选定并收起”会自动记槽并缩回顶部胶囊条</span>
                <button
                  onClick={() => window.hexbuddy.updateAugments({ candidateAugmentIds: [] })}
                  className="text-rose-300 hover:underline cursor-pointer"
                >
                  清空重选
                </button>
              </div>
              {evaluated.rows.map(({ meta, stat, hasSynergy }) => {
                const isBest = evaluated.bestId === meta.id
                return (
                  <div
                    key={meta.id}
                    className={`p-3 rounded-lg border space-y-1.5 ${
                      isBest
                        ? 'bg-[#102638]/90 border-[#0AC8B9] shadow-[0_0_14px_rgba(10,200,185,0.18)]'
                        : theme.card
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {meta.iconUrl && (
                          <img src={meta.iconUrl} alt="" className="w-8 h-8 rounded bg-black/50" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {isBest && <Crown className="w-3.5 h-3.5 text-[#0AC8B9] shrink-0" />}
                            <span className="font-bold text-[#F0E6D2] truncate">{meta.name}</span>
                            <span
                              className={`text-[10px] px-1 rounded border ${RARITY_BADGE[meta.rarity]}`}
                            >
                              {RARITY_LABEL[meta.rarity]}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {stat && (
                              <span
                                className={`text-[10px] px-1.5 rounded border ${
                                  VERDICT_STYLE[stat.verdict]
                                }`}
                              >
                                {stat.verdictLabel}
                              </span>
                            )}
                            {hasSynergy && (
                              <span className="text-[10px] px-1.5 rounded bg-[#0AC8B9]/20 text-[#5CF2E5]">
                                同系联动
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right tabular-nums shrink-0">
                        <div className="text-sm font-bold text-[#F0E6D2]">
                          {stat ? `${(stat.smoothedWinRate * 100).toFixed(1)}%` : '--'}
                        </div>
                        {stat && (
                          <div
                            className={`text-[10px] font-semibold ${
                              stat.deltaWinRate >= 0 ? 'text-[#0AC8B9]' : 'text-rose-400'
                            }`}
                          >
                            {stat.deltaWinRate >= 0 ? '+' : ''}
                            {(stat.deltaWinRate * 100).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-[#D5CEBE] line-clamp-2">{meta.desc}</p>

                    {stat?.boundItems && stat.boundItems.length > 0 && (
                      <div className="px-2 py-1 rounded bg-black/35 text-[11px] text-[#E2C992]">
                        选它后首件改出：{stat.boundItems[0].name}（胜率{' '}
                        {(stat.boundItems[0].winRate * 100).toFixed(0)}%）
                      </div>
                    )}

                    <button
                      onClick={() => pickWinnerAndCollapse(meta.id)}
                      className={`w-full py-1.5 rounded font-semibold flex items-center justify-center gap-1 cursor-pointer transition ${
                        isBest
                          ? 'bg-[#C8AA6E] text-[#070B12] hover:bg-[#E2C992]'
                          : 'bg-white/10 text-[#F0E6D2] hover:bg-white/20'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>选定此卡并收起</span>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={`p-4 rounded-lg border text-center space-y-2 ${theme.card}`}>
              <p className="text-[#F0E6D2] font-medium">当前暂无三选一待选卡</p>
              <p className="text-[11px] text-[#94A3B8]">
                游戏弹出三选一时将自动识屏（也可按 Alt+S 手动识屏，或在上方输首字母如 zghs 秒加）
              </p>
            </div>
          )
        ) : (
          // ---------------- VIEW B: FOUNTAIN BUYING & CHEAT SHEET ----------------
          <div className="space-y-3">
            {/* Dynamic Counter Item Priority */}
            {advice && advice.counterItemIds.length > 0 && (
              <div className={`p-2.5 rounded-lg border space-y-2 ${theme.card}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#5CF2E5] flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    针对本局阵容 · 优先购买推荐
                  </span>
                  <button
                    onClick={handleGenerateAiBrief}
                    disabled={aiBriefBusy}
                    className="px-2 py-0.5 rounded bg-[#C8AA6E]/20 hover:bg-[#C8AA6E]/35 border border-[#C8AA6E]/40 text-[10px] text-[#E2C992] flex items-center gap-1 cursor-pointer"
                  >
                    {aiBriefBusy ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-2.5 h-2.5" />
                    )}
                    <span>一键 AI 锦囊</span>
                  </button>
                </div>

                {aiBriefText && (
                  <div className="p-2 rounded bg-black/50 border border-[#0AC8B9]/35 text-[11px] text-[#F0E6D2] leading-snug whitespace-pre-wrap">
                    {aiBriefText}
                  </div>
                )}

                {advice.counterItemIds.slice(0, 2).map(({ itemId, reason }) => {
                  const im = items[itemId]
                  if (!im) return null
                  return (
                    <div key={itemId} className="flex items-start gap-2 bg-black/35 p-2 rounded">
                      <img src={im.iconUrl} alt="" className="w-8 h-8 rounded border border-[#C8AA6E]/40 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-[#F0E6D2]">{im.name}</div>
                        <div className="text-[10px] text-[#C8C1B2] leading-snug">{reason}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Core 3-Item Build with Chinese Names & New-Item Briefs */}
            {guide && guide.coreBuilds[0] && (
              <div className={`p-2.5 rounded-lg border space-y-2 ${theme.card}`}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#E2C992]">核心三件套合成顺序（商店搜名字直买）</span>
                  {currentHero?.topShoes?.[0] && items[currentHero.topShoes[0].itemId] && (
                    <span className="inline-flex items-center gap-1 text-[#C8C1B2]">
                      <img
                        src={items[currentHero.topShoes[0].itemId].iconUrl}
                        alt=""
                        className="w-3.5 h-3.5 rounded-sm"
                      />
                      {items[currentHero.topShoes[0].itemId].name}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {guide.coreBuilds[0].items.map((iid, idx) => {
                    const im = items[iid]
                    if (!im) return null
                    return (
                      <div
                        key={`${iid}-${idx}`}
                        className="flex items-center gap-2 bg-black/35 px-2 py-1.5 rounded"
                      >
                        <span className="text-[10px] text-[#C8AA6E] font-semibold shrink-0">
                          第{idx + 1}件
                        </span>
                        <img src={im.iconUrl} alt="" className="w-6 h-6 rounded shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[#F0E6D2] truncate">{im.name}</div>
                          {im.brief && (
                            <div className="text-[10px] text-[#94A3B8] truncate">{im.brief}</div>
                          )}
                        </div>
                        {idx < guide.coreBuilds[0].items.length - 1 && (
                          <ArrowRight className="w-3 h-3 text-[#64748B] shrink-0" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Top 5 God Augments & Top 3 Traps Cheat Sheet */}
            {guide && (
              <div className={`p-2.5 rounded-lg border space-y-2 ${theme.card}`}>
                <div className="text-[11px] font-semibold text-[#F0E6D2]">
                  本英雄必拿神卡速记（看到直接锁）
                </div>
                <div className="space-y-1">
                  {guide.augments.slice(0, 5).map((st) => {
                    const m = augments[st.augmentId]
                    if (!m) return null
                    return (
                      <div
                        key={st.augmentId}
                        className="px-2 py-1 rounded bg-black/35 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {m.iconUrl && <img src={m.iconUrl} alt="" className="w-5 h-5 rounded" />}
                          <span className="text-[#F0E6D2] truncate">{m.name}</span>
                          <span className={`text-[9px] px-1 rounded border ${RARITY_BADGE[m.rarity]}`}>
                            {RARITY_LABEL[m.rarity]}
                          </span>
                        </div>
                        <span className="text-[#0AC8B9] font-semibold tabular-nums shrink-0">
                          {(st.smoothedWinRate * 100).toFixed(1)}%
                        </span>
                      </div>
                    )
                  })}
                </div>

                {guide.trapAugments.length > 0 && (
                  <div className="pt-1.5 border-t border-white/10 flex items-center gap-1.5 flex-wrap text-[11px]">
                    <span className="text-rose-300 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      千万别碰:
                    </span>
                    {guide.trapAugments.slice(0, 3).map((t) => (
                      <span
                        key={t.augmentId}
                        className="px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-500/35 text-rose-200 text-[10px]"
                      >
                        {augments[t.augmentId]?.name} ({(t.deltaWinRate * 100).toFixed(1)}%)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
