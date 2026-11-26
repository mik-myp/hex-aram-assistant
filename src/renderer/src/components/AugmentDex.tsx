import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Crown, Search, Sparkles } from 'lucide-react'
import { matchesSearchQuery } from '@shared/pinyin'
import { RARITY_BADGE, RARITY_LABEL } from './HeroGuide'
import { TIER_STYLE } from './TierRadar'
import type {
  AugmentMeta,
  AugmentRarity,
  AugmentReverseDetail,
  HeroMeta
} from '@shared/types'

interface AugmentDexProps {
  augments: Record<string, AugmentMeta>
  heroes: Record<string, HeroMeta>
  initialAugmentId?: string | null
  onJumpToHero: (heroId: string) => void
}

const TAG_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部机制' },
  { key: 'crit', label: '暴击' },
  { key: 'burn', label: '持续灼烧' },
  { key: 'haste', label: '技能急速' },
  { key: 'tank', label: '叠肉双抗' },
  { key: 'onhit', label: '攻速特效' },
  { key: 'heal', label: '回复护盾' },
  { key: 'mobility', label: '雪球位移' }
]

export const AugmentDex: React.FC<AugmentDexProps> = ({
  augments,
  heroes,
  initialAugmentId,
  onJumpToHero
}) => {
  const [rarity, setRarity] = useState<'all' | AugmentRarity>('all')
  const [tag, setTag] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initialAugmentId || null)
  const [detail, setDetail] = useState<AugmentReverseDetail | null>(null)

  useEffect(() => {
    if (initialAugmentId) setSelectedId(initialAugmentId)
  }, [initialAugmentId])

  const filteredList = useMemo(() => {
    const order: Record<AugmentRarity, number> = { prismatic: 0, gold: 1, silver: 2 }
    return Object.values(augments)
      .filter((a) => {
        if (rarity !== 'all' && a.rarity !== rarity) return false
        if (tag !== 'all' && !a.tags.includes(tag) && !(tag === 'heal' && a.tags.includes('shield'))) {
          return false
        }
        return matchesSearchQuery(query, {
          name: a.name,
          pinyinFull: a.pinyinFull,
          pinyinInitials: a.pinyinInitials,
          extraKeywords: a.desc
        })
      })
      .sort((a, b) => order[a.rarity] - order[b.rarity] || a.name.localeCompare(b.name, 'zh-CN'))
  }, [augments, rarity, tag, query])

  useEffect(() => {
    if (!selectedId && filteredList.length > 0) {
      setSelectedId(filteredList[0].id)
    }
  }, [filteredList, selectedId])

  useEffect(() => {
    if (!selectedId) return
    window.hexbuddy.getAugmentReverse(selectedId).then(setDetail)
  }, [selectedId])

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left Rail: All 237 Augments Catalog */}
      <aside className="w-88 shrink-0 border-r border-[#C8AA6E]/20 bg-[#090F1A] flex flex-col h-full">
        <div className="p-3 space-y-2.5 border-b border-[#C8AA6E]/15">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜海克斯名 / 效果词 / 拼音 (如 zghs, 暴击)"
              className="w-full pl-8 pr-3 py-1.5 rounded bg-[#131E30] border border-[#C8AA6E]/25 text-xs text-[#F0E6D2] placeholder-[#64748B] focus:outline-none focus:border-[#C8AA6E]"
            />
          </div>

          <div className="flex gap-1">
            {(
              [
                { key: 'all', label: '全部品阶' },
                { key: 'prismatic', label: '棱彩' },
                { key: 'gold', label: '黄金' },
                { key: 'silver', label: '白银' }
              ] as const
            ).map((r) => (
              <button
                key={r.key}
                onClick={() => setRarity(r.key)}
                className={`flex-1 py-1 rounded text-[11px] cursor-pointer transition ${
                  rarity === r.key
                    ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                    : 'bg-[#121C2D] text-[#94A3B8] hover:text-[#F0E6D2]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            {TAG_FILTERS.map((tf) => (
              <button
                key={tf.key}
                onClick={() => setTag(tf.key)}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                  tag === tf.key
                    ? 'bg-[#0AC8B9]/20 text-[#5CF2E5] border border-[#0AC8B9]/45'
                    : 'bg-[#121C2D] text-[#94A3B8] hover:text-[#F0E6D2]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 py-1.5 text-[11px] text-[#64748B] border-b border-[#C8AA6E]/10 flex justify-between">
          <span>海克斯强化图鉴（共 {filteredList.length} 项）</span>
          <span>点击反查天选英雄</span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#C8AA6E]/8">
          {filteredList.map((aug) => {
            const active = aug.id === selectedId
            return (
              <button
                key={aug.id}
                onClick={() => setSelectedId(aug.id)}
                className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left cursor-pointer transition ${
                  active ? 'bg-[#17253B] border-l-2 border-l-[#C8AA6E]' : 'hover:bg-[#111B2B]'
                }`}
              >
                {aug.iconUrl ? (
                  <img
                    src={aug.iconUrl}
                    alt={aug.name}
                    loading="lazy"
                    className="w-9 h-9 rounded bg-black/50 p-0.5 border border-white/15 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded bg-black/40 border border-white/10 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#F0E6D2] truncate">{aug.name}</span>
                    <span className={`text-[10px] px-1 rounded border ${RARITY_BADGE[aug.rarity]}`}>
                      {RARITY_LABEL[aug.rarity]}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] truncate mt-0.5">{aug.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Right Stage: Augment Reverse Fit Leaderboard */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#070B12]">
        {detail ? (
          <>
            {/* Augment Banner */}
            <div
              className={`rounded-xl p-5 flex flex-wrap items-start justify-between gap-4 ${
                detail.augment.rarity === 'prismatic'
                  ? 'rarity-frame-prismatic'
                  : detail.augment.rarity === 'gold'
                    ? 'rarity-frame-gold'
                    : 'rarity-frame-silver'
              }`}
            >
              <div className="flex items-start gap-4 max-w-3xl">
                {detail.augment.iconUrl && (
                  <img
                    src={detail.augment.iconUrl}
                    alt={detail.augment.name}
                    className="w-16 h-16 rounded-lg bg-black/55 p-1 border border-white/20 shrink-0"
                  />
                )}
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <h1 className="font-runeterra text-xl font-bold text-[#F0E6D2]">
                      {detail.augment.name}
                    </h1>
                    <span
                      className={`text-xs px-2 py-0.5 rounded border font-semibold ${
                        RARITY_BADGE[detail.augment.rarity]
                      }`}
                    >
                      {RARITY_LABEL[detail.augment.rarity]}阶强化
                    </span>
                  </div>
                  <p className="text-sm text-[#E5DEC9] leading-relaxed">{detail.augment.desc}</p>
                </div>
              </div>

              <div className="flex items-center gap-5 bg-black/35 px-4 py-3 rounded-lg border border-white/10 tabular-nums">
                <div>
                  <div className="text-[11px] text-[#94A3B8]">全英雄平均胜率</div>
                  <div className="text-lg font-bold text-[#0AC8B9]">
                    {(detail.avgWinRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <div className="text-[11px] text-[#94A3B8]">总选取人次</div>
                  <div className="text-lg font-bold text-[#F0E6D2]">
                    {detail.totalPickGames.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Best Abusers vs Worst Traps */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <section className="lg:col-span-7 hex-panel rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#F0E6D2] flex items-center gap-2">
                    <Crown className="w-4 h-4 text-[#0AC8B9]" />
                    <span>Top 10 天选适配英雄（拿到直接质变 · 点击跳转英雄出装）</span>
                  </h2>
                  <span className="text-[11px] text-[#94A3B8]">按净胜率增幅与绝对胜率综合排序</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {detail.bestHeroes.map((fit, idx) => {
                    const h = heroes[fit.heroId]
                    if (!h) return null
                    return (
                      <button
                        key={fit.heroId}
                        onClick={() => onJumpToHero(fit.heroId)}
                        className="p-2.5 rounded bg-[#111B2C] hover:bg-[#17263E] border border-[#C8AA6E]/20 hover:border-[#0AC8B9]/50 flex items-center justify-between gap-2.5 text-left cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs font-bold text-[#C8AA6E] w-4 tabular-nums">
                            {idx + 1}
                          </span>
                          <img
                            src={h.avatarUrl}
                            alt={h.name}
                            className="w-9 h-9 rounded border border-[#C8AA6E]/35 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-[#F0E6D2] truncate">
                                {h.name}
                              </span>
                              <span
                                className={`text-[10px] px-1 rounded border ${TIER_STYLE[h.tier]}`}
                              >
                                {h.tier}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#94A3B8] tabular-nums">
                              样本 {fit.games.toLocaleString()} 局
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 tabular-nums">
                          <div className="text-xs font-bold text-[#F0E6D2]">
                            {(fit.smoothedWinRate * 100).toFixed(1)}%
                          </div>
                          <div className="text-[11px] font-semibold text-[#0AC8B9]">
                            {fit.deltaWinRate >= 0 ? '+' : ''}
                            {(fit.deltaWinRate * 100).toFixed(1)}%
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="lg:col-span-5 rounded-lg p-4 bg-gradient-to-br from-rose-950/30 to-[#0C1320] border border-rose-500/30 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <h2 className="text-sm font-semibold text-rose-200">
                    千万慎拿 · 该海克斯避坑英雄榜
                  </h2>
                </div>

                {detail.trapHeroes.length === 0 ? (
                  <p className="text-xs text-[#94A3B8] py-4">
                    该海克斯通用性极佳，暂无高频选出且胜率大幅暴跌的英雄。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.trapHeroes.map((fit) => {
                      const h = heroes[fit.heroId]
                      if (!h) return null
                      return (
                        <button
                          key={fit.heroId}
                          onClick={() => onJumpToHero(fit.heroId)}
                          className="w-full p-2.5 rounded bg-[#0B101B]/90 hover:bg-[#131B2C] border border-rose-500/25 flex items-center justify-between gap-2 text-left cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <img
                              src={h.avatarUrl}
                              alt={h.name}
                              className="w-8 h-8 rounded border border-rose-500/30"
                            />
                            <div>
                              <div className="text-xs font-medium text-[#F0E6D2]">{h.name}</div>
                              <div className="text-[11px] text-[#94A3B8] tabular-nums">
                                误选 {fit.games.toLocaleString()} 局
                              </div>
                            </div>
                          </div>
                          <div className="text-right tabular-nums">
                            <div className="text-xs font-semibold text-rose-400">
                              {(fit.deltaWinRate * 100).toFixed(1)}%
                            </div>
                            <div className="text-[11px] text-[#94A3B8]">
                              胜率 {(fit.smoothedWinRate * 100).toFixed(1)}%
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="text-xs text-[#94A3B8] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C8AA6E]" />
            <span>点击左侧任意海克斯查看天选适配英雄...</span>
          </div>
        )}
      </main>
    </div>
  )
}
