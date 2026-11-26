import React, { useEffect, useMemo, useState } from 'react'
import { Camera, CheckCircle2, Crown, Loader2, Search, ShieldAlert, X } from 'lucide-react'
import { matchesSearchQuery } from '@shared/pinyin'
import { RARITY_BADGE, RARITY_LABEL, VERDICT_STYLE } from './HeroGuide'
import type {
  AugmentMeta,
  GameLiveState,
  HeroDetailGuide,
  HeroMeta,
  ItemMeta,
  OcrRecognizeResult,
  TacticalAdvice
} from '@shared/types'

export const MiniOverlay: React.FC = () => {
  const [heroes, setHeroes] = useState<Record<string, HeroMeta>>({})
  const [augments, setAugments] = useState<Record<string, AugmentMeta>>({})
  const [items, setItems] = useState<Record<string, ItemMeta>>({})
  const [gameState, setGameState] = useState<GameLiveState | null>(null)
  const [heroId, setHeroId] = useState<string>('103')
  const [guide, setGuide] = useState<HeroDetailGuide | null>(null)
  const [advice, setAdvice] = useState<TacticalAdvice | null>(null)
  const [query, setQuery] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrMsg, setOcrMsg] = useState<string | null>(null)

  useEffect(() => {
    window.hexbuddy.getBootstrap().then((boot) => {
      setHeroes(boot.heroes)
      setAugments(boot.augments)
      setItems(boot.items)
      setGameState(boot.gameState)
      const initialHero = boot.gameState.myHeroId || Object.keys(boot.heroes)[0]
      if (initialHero) setHeroId(initialHero)
    })

    const unsubState = window.hexbuddy.onGameStateUpdated((st) => {
      setGameState(st)
      if (st.myHeroId) setHeroId(st.myHeroId)
    })
    const unsubOcr = window.hexbuddy.onOcrResult((res: OcrRecognizeResult) => {
      setOcrMsg(
        res.success
          ? `已识别 ${res.matchedAugmentIds.length} 张海克斯（${res.elapsedMs}ms）`
          : res.error || '未匹配到海克斯'
      )
    })
    return () => {
      unsubState()
      unsubOcr()
    }
  }, [])

  useEffect(() => {
    if (!heroId) return
    window.hexbuddy.getHeroGuide(heroId).then(setGuide)
    window.hexbuddy.getTacticalAdvice(heroId).then(setAdvice)
  }, [heroId, gameState?.enemyHeroIds, gameState?.pickedAugmentIds])

  const statMap = useMemo(() => {
    return new Map((guide?.augments || []).map((s) => [s.augmentId, s]))
  }, [guide])

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
        return { meta, stat, score: stat?.smoothedWinRate ?? 0.48 }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    const bestId = rows.length >= 2 ? [...rows].sort((a, b) => b.score - a.score)[0].meta.id : null
    return { rows, bestId }
  }, [candidates, augments, statMap])

  const handleOcrClick = async (): Promise<void> => {
    setOcrBusy(true)
    const res = await window.hexbuddy.captureScreenOcr()
    setOcrMsg(
      res.success
        ? `识别成功（${res.elapsedMs}ms）`
        : res.error || '未检测到海克斯卡，请用下方拼音秒搜'
    )
    setOcrBusy(false)
  }

  const addCandidate = (id: string): void => {
    if (candidates.includes(id)) return
    const next = candidates.length >= 3 ? [...candidates.slice(1), id] : [...candidates, id]
    window.hexbuddy.updateAugments({ candidateAugmentIds: next })
    setQuery('')
  }

  const pickWinner = (id: string): void => {
    const prev = gameState?.pickedAugmentIds || []
    const nextPicked = prev.includes(id) ? prev : [...prev, id].slice(-4)
    window.hexbuddy.updateAugments({ pickedAugmentIds: nextPicked, candidateAugmentIds: [] })
  }

  const currentHero = heroes[heroId]

  return (
    <div className="h-screen w-screen bg-[#080D16] border border-[#C8AA6E]/45 flex flex-col overflow-hidden text-xs">
      {/* Drag Header */}
      <div className="app-drag h-10 px-3 bg-[#0C1422] border-b border-[#C8AA6E]/25 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {currentHero && (
            <img src={currentHero.avatarUrl} alt="" className="w-6 h-6 rounded border border-[#C8AA6E]/40" />
          )}
          <span className="font-semibold text-[#F0E6D2] truncate">
            {currentHero ? `${currentHero.name} · 局内三选一` : 'HexBuddy 悬浮窗'}
          </span>
        </div>

        <div className="app-no-drag flex items-center gap-1.5">
          <button
            onClick={handleOcrClick}
            disabled={ocrBusy}
            className="px-2 py-1 rounded bg-[#0AC8B9] text-[#070B12] font-semibold flex items-center gap-1 cursor-pointer"
          >
            {ocrBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
            <span>识屏 (Alt+S)</span>
          </button>
          <button
            onClick={() => window.hexbuddy.toggleMiniOverlay(false)}
            className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {/* Hero switcher + Pinyin quick add */}
        <div className="flex gap-1.5">
          <select
            value={heroId}
            onChange={(e) => setHeroId(e.target.value)}
            className="w-28 px-2 py-1.5 rounded bg-[#131F31] border border-[#C8AA6E]/25 text-[#F0E6D2] focus:outline-none"
          >
            {Object.values(heroes)
              .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
              .map((h) => (
                <option key={h.id} value={h.id}>
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
              className="w-full pl-8 pr-2 py-1.5 rounded bg-[#131F31] border border-[#C8AA6E]/25 text-[#F0E6D2] focus:outline-none focus:border-[#C8AA6E]"
            />
          </div>
        </div>

        {ocrMsg && (
          <div className="px-2.5 py-1.5 rounded bg-[#101A2B] border border-[#C8AA6E]/20 text-[11px] text-[#C8C1B2]">
            {ocrMsg}
          </div>
        )}

        {quickHits.length > 0 && (
          <div className="flex flex-wrap gap-1 p-2 rounded bg-[#0E1726] border border-[#C8AA6E]/25">
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

        {/* 3 Candidate Cards OR Top S+ Cheat Sheet when idle */}
        {evaluated.rows.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
              <span>当前三选一对比结果</span>
              <button
                onClick={() => window.hexbuddy.updateAugments({ candidateAugmentIds: [] })}
                className="text-rose-300 hover:underline cursor-pointer"
              >
                清空重选
              </button>
            </div>
            {evaluated.rows.map(({ meta, stat }) => {
              const isBest = evaluated.bestId === meta.id
              return (
                <div
                  key={meta.id}
                  className={`p-3 rounded-lg border space-y-1.5 ${
                    isBest
                      ? 'bg-[#112436] border-[#0AC8B9]'
                      : 'bg-[#0E1625] border-[#C8AA6E]/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {meta.iconUrl && <img src={meta.iconUrl} alt="" className="w-8 h-8 rounded" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isBest && <Crown className="w-3.5 h-3.5 text-[#0AC8B9] shrink-0" />}
                          <span className="font-bold text-[#F0E6D2] truncate">{meta.name}</span>
                          <span className={`text-[10px] px-1 rounded border ${RARITY_BADGE[meta.rarity]}`}>
                            {RARITY_LABEL[meta.rarity]}
                          </span>
                        </div>
                        {stat && (
                          <span
                            className={`inline-block mt-0.5 text-[10px] px-1.5 rounded border ${
                              VERDICT_STYLE[stat.verdict]
                            }`}
                          >
                            {stat.verdictLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right tabular-nums shrink-0">
                      <div className="text-sm font-bold text-[#F0E6D2]">
                        {stat ? `${(stat.smoothedWinRate * 100).toFixed(1)}%` : '--'}
                      </div>
                      {stat && (
                        <div
                          className={`text-[10px] ${
                            stat.deltaWinRate >= 0 ? 'text-[#0AC8B9]' : 'text-rose-400'
                          }`}
                        >
                          {stat.deltaWinRate >= 0 ? '+' : ''}
                          {(stat.deltaWinRate * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-[#94A3B8] line-clamp-2">{meta.desc}</p>

                  <button
                    onClick={() => pickWinner(meta.id)}
                    className="w-full py-1 rounded bg-[#C8AA6E]/20 hover:bg-[#C8AA6E] text-[#E2C992] hover:text-[#070B12] font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>本局选定它</span>
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[11px] text-[#E2C992] font-medium">
              {currentHero?.name} 必拿 T0 海克斯速览（弹出三选一时按 Alt+S 识屏）
            </div>
            {(guide?.augments || []).slice(0, 6).map((st) => {
              const m = augments[st.augmentId]
              if (!m) return null
              return (
                <div
                  key={st.augmentId}
                  className="p-2 rounded bg-[#0E1625] border border-[#C8AA6E]/15 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {m.iconUrl && <img src={m.iconUrl} alt="" className="w-6 h-6 rounded" />}
                    <span className="text-[#F0E6D2] font-medium truncate">{m.name}</span>
                    <span className={`text-[10px] px-1 rounded border ${RARITY_BADGE[m.rarity]}`}>
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
        )}
      </div>

      {/* Bottom Counter-Item Strip */}
      {advice && advice.counterItemIds.length > 0 && (
        <div className="p-2.5 bg-[#0C1422] border-t border-[#C8AA6E]/25 flex items-center gap-2 shrink-0">
          <ShieldAlert className="w-4 h-4 text-[#0AC8B9] shrink-0" />
          <span className="text-[11px] text-[#94A3B8] shrink-0">推荐出装:</span>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {advice.counterItemIds.map(({ itemId }) => {
              const im = items[itemId]
              if (!im) return null
              return (
                <div
                  key={itemId}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#152238] border border-[#C8AA6E]/25 shrink-0"
                >
                  <img src={im.iconUrl} alt="" className="w-4 h-4 rounded-sm" />
                  <span className="text-[11px] text-[#F0E6D2]">{im.name}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
