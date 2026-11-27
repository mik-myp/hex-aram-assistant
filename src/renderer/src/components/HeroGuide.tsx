import React, { useMemo, useState } from 'react'
import { ArrowRight, Search, Star } from 'lucide-react'
import { matchesSearchQuery } from '@shared/pinyin'
import { TIER_STYLE } from './TierRadar'
import type {
  AugmentMeta,
  AugmentRarity,
  AugmentVerdict,
  HeroAugmentStat,
  HeroDetailGuide,
  ItemMeta
} from '@shared/types'

interface HeroGuideProps {
  guide: HeroDetailGuide
  augments: Record<string, AugmentMeta>
  items: Record<string, ItemMeta>
  isFavorite: boolean
  onToggleFavorite: () => void
  onOpenInAugmentDex: (augId: string) => void
}

export const RARITY_LABEL: Record<AugmentRarity, string> = {
  prismatic: '棱彩',
  gold: '黄金',
  silver: '白银'
}

export const RARITY_BADGE: Record<AugmentRarity, string> = {
  prismatic: 'bg-purple-500/20 text-purple-200 border-purple-400/50',
  gold: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
  silver: 'bg-slate-400/15 text-slate-200 border-slate-400/40'
}

export const VERDICT_STYLE: Record<AugmentVerdict, string> = {
  'S+': 'bg-[#0AC8B9]/20 text-[#5CF2E5] border-[#0AC8B9]/50',
  S: 'bg-[#C8AA6E]/25 text-[#F5E2B8] border-[#C8AA6E]/55',
  A: 'bg-slate-700/45 text-slate-200 border-slate-500/35',
  B: 'bg-slate-800/60 text-slate-400 border-slate-600/25',
  TRAP: 'bg-rose-600/20 text-rose-300 border-rose-500/45'
}

const SHORT_VERDICT: Record<AugmentVerdict, string> = {
  'S+': 'S+ 必拿',
  S: 'S 优选',
  A: 'A 可用',
  B: 'B 备选',
  TRAP: '避坑'
}

export const HeroGuide: React.FC<HeroGuideProps> = ({
  guide,
  augments,
  items,
  isFavorite,
  onToggleFavorite,
  onOpenInAugmentDex
}) => {
  const [query, setQuery] = useState('')
  const [hoveredAug, setHoveredAug] = useState<HeroAugmentStat | null>(null)
  const [hoveredItem, setHoveredItem] = useState<ItemMeta | null>(null)

  const columns = useMemo(() => {
    const filtered = guide.augments.filter((st) => {
      const m = augments[st.augmentId]
      if (!m) return false
      return matchesSearchQuery(query, {
        name: m.name,
        pinyinFull: m.pinyinFull,
        pinyinInitials: m.pinyinInitials,
        extraKeywords: m.desc
      })
    })
    return {
      prismatic: filtered.filter((s) => augments[s.augmentId]?.rarity === 'prismatic'),
      gold: filtered.filter((s) => augments[s.augmentId]?.rarity === 'gold'),
      silver: filtered.filter((s) => augments[s.augmentId]?.rarity === 'silver')
    }
  }, [guide.augments, augments, query])

  const { hero } = guide
  const primaryBuild = guide.coreBuilds[0]
  const topShoe = hero.topShoes?.[0] ? items[hero.topShoes[0].itemId] : null

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#070B12] relative">
      {/* 1. Unified Compact Hero & Core Build Top Strip */}
      <div className="px-5 py-3.5 border-b border-[#C8AA6E]/20 bg-[#0B111E] flex flex-wrap items-center justify-between gap-4 shrink-0">
        {/* Left: Hero Summary */}
        <div className="flex items-center gap-3">
          <img
            src={hero.avatarUrl}
            alt={hero.name}
            className="w-12 h-12 rounded-lg border border-[#C8AA6E]/60 object-cover"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-runeterra text-lg font-bold text-[#F0E6D2]">{hero.name}</h1>
              <span className={`text-[11px] px-1.5 py-0.2 rounded border font-bold ${TIER_STYLE[hero.tier]}`}>
                {hero.tier}
              </span>
              <span className="text-xs font-semibold text-[#0AC8B9] tabular-nums">
                {(hero.smoothedWinRate * 100).toFixed(1)}%
              </span>
              {hero.skillOrder && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#C8AA6E]/15 text-[#E2C992] border border-[#C8AA6E]/30">
                  {hero.skillOrder}
                </span>
              )}
              {guide.bestSpells[0] && (
                <span className="text-[11px] text-[#94A3B8]">{guide.bestSpells[0].label}</span>
              )}
              <button
                onClick={onToggleFavorite}
                title="设为本命英雄（选人时原位 HUD 高亮提醒）"
                className={`p-1 rounded border cursor-pointer transition ${
                  isFavorite
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                    : 'bg-[#121C2D] text-[#64748B] border-white/10 hover:text-[#F0E6D2]'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-300' : ''}`} />
              </button>
            </div>

            {/* Secondary Build / Pivot quick hint */}
            {guide.augmentPivotBuilds.length > 0 && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[#94A3B8]">
                <span>特定海克斯变阵首件：</span>
                {guide.augmentPivotBuilds.slice(0, 2).map((pv) => {
                  const am = augments[pv.augmentId]
                  const firstIt = pv.items[0]
                  if (!am || !firstIt) return null
                  return (
                    <span key={pv.augmentId} className="text-[#E2C992]">
                      【{am.name}】→ {firstIt.name}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Single-Line Core Equipment Strip (Hover for New-Item Details!) */}
        <div className="flex items-center gap-2 flex-wrap">
          {topShoe && (
            <div
              onMouseEnter={() => setHoveredItem(topShoe)}
              onMouseLeave={() => setHoveredItem(null)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#121D30] border border-[#C8AA6E]/25 cursor-help"
            >
              <img src={topShoe.iconUrl} alt={topShoe.name} className="w-6 h-6 rounded" />
              <span className="text-xs text-[#C8C1B2]">{topShoe.name}</span>
            </div>
          )}

          {primaryBuild && (
            <div className="flex items-center gap-1.5 bg-[#10192A] px-3 py-1.5 rounded border border-[#C8AA6E]/30">
              {primaryBuild.items.map((iid, idx) => {
                const im = items[iid]
                if (!im) return null
                return (
                  <React.Fragment key={`${iid}-${idx}`}>
                    <div
                      onMouseEnter={() => setHoveredItem(im)}
                      onMouseLeave={() => setHoveredItem(null)}
                      className="flex items-center gap-1.5 cursor-help"
                    >
                      <img src={im.iconUrl} alt={im.name} className="w-6 h-6 rounded border border-[#C8AA6E]/35" />
                      <span className="text-xs font-medium text-[#F0E6D2]">{im.name}</span>
                    </div>
                    {idx < primaryBuild.items.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-[#C8AA6E]/60" />
                    )}
                  </React.Fragment>
                )
              })}
              <span className="ml-1.5 text-[11px] text-[#0AC8B9] font-semibold tabular-nums">
                {(primaryBuild.winRate * 100).toFixed(1)}%
              </span>
            </div>
          )}

          <div className="relative w-48">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="筛海克斯 / 拼音 (zghs)"
              className="w-full pl-8 pr-2.5 py-1.5 rounded bg-[#131E30] border border-[#C8AA6E]/25 text-xs text-[#F0E6D2] placeholder-[#64748B] focus:outline-none focus:border-[#C8AA6E]"
            />
          </div>
        </div>
      </div>

      {/* Hover Popover for Equipment or Augment Detail (Fixed bottom-right crisp HUD card, zero layout shift!) */}
      {(hoveredAug || hoveredItem) && (
        <div className="fixed bottom-5 right-6 z-50 w-96 p-4 rounded-xl bg-[#0B1322]/98 border border-[#C8AA6E]/60 shadow-2xl pointer-events-none space-y-2">
          {hoveredItem && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img src={hoveredItem.iconUrl} alt="" className="w-9 h-9 rounded border border-[#C8AA6E]/40" />
                  <div>
                    <div className="text-sm font-bold text-[#F0E6D2]">{hoveredItem.name}</div>
                    <div className="text-[11px] text-[#E2C992]">总价 {hoveredItem.totalGold} 金币</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-[#C8C1B2] leading-relaxed whitespace-pre-line">
                {hoveredItem.fullDesc || hoveredItem.brief || '标准传说装备'}
              </p>
            </>
          )}

          {hoveredAug && !hoveredItem && augments[hoveredAug.augmentId] && (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  {augments[hoveredAug.augmentId].iconUrl && (
                    <img
                      src={augments[hoveredAug.augmentId].iconUrl}
                      alt=""
                      className="w-9 h-9 rounded bg-black/50 p-0.5 border border-white/15"
                    />
                  )}
                  <div>
                    <div className="text-sm font-bold text-[#F0E6D2]">
                      {augments[hoveredAug.augmentId].name}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] tabular-nums">
                      样本 {hoveredAug.games.toLocaleString()} 局 · 点击可看全联盟天选英雄榜
                    </div>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded border font-semibold ${
                    VERDICT_STYLE[hoveredAug.verdict]
                  }`}
                >
                  {hoveredAug.verdictLabel}
                </span>
              </div>
              <p className="text-xs text-[#E2DEC9] leading-relaxed">
                {augments[hoveredAug.augmentId].desc}
              </p>
              {hoveredAug.boundItems && hoveredAug.boundItems.length > 0 && (
                <div className="pt-1 text-[11px] text-[#5CF2E5]">
                  最佳绑定首件：
                  {hoveredAug.boundItems
                    .map((bi) => `${bi.name} (${(bi.winRate * 100).toFixed(1)}%)`)
                    .join(' / ')}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 2. Three-Column Parallel Augment Tier Board: 棱彩 | 黄金 | 白银 */}
      <div className="flex-1 grid grid-cols-3 divide-x divide-[#C8AA6E]/15 min-h-0">
        {(
          [
            {
              key: 'prismatic',
              title: '棱彩阶强化',
              accent: 'text-purple-300 border-b-purple-400/40 bg-purple-950/15',
              list: columns.prismatic
            },
            {
              key: 'gold',
              title: '黄金阶强化',
              accent: 'text-amber-300 border-b-amber-400/40 bg-amber-950/15',
              list: columns.gold
            },
            {
              key: 'silver',
              title: '白银阶强化',
              accent: 'text-slate-200 border-b-slate-400/40 bg-slate-800/20',
              list: columns.silver
            }
          ] as const
        ).map((col) => (
          <div key={col.key} className="flex flex-col min-h-0">
            <div
              className={`px-3.5 py-2 border-b flex items-center justify-between text-xs font-semibold shrink-0 ${col.accent}`}
            >
              <span>{col.title}</span>
              <span className="text-[11px] text-[#94A3B8] font-normal tabular-nums">
                {col.list.length} 项 · 悬停看效果
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {col.list.map((st) => {
                const m = augments[st.augmentId]
                if (!m) return null
                const isTrap = st.verdict === 'TRAP'
                return (
                  <button
                    key={st.augmentId}
                    onMouseEnter={() => setHoveredAug(st)}
                    onMouseLeave={() => setHoveredAug(null)}
                    onClick={() => onOpenInAugmentDex(st.augmentId)}
                    className={`w-full h-10 px-3 flex items-center justify-between gap-2 text-left cursor-pointer transition ${
                      isTrap
                        ? 'opacity-70 hover:opacity-100 hover:bg-rose-950/25'
                        : 'hover:bg-[#131F33]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {m.iconUrl ? (
                        <img
                          src={m.iconUrl}
                          alt=""
                          loading="lazy"
                          className="w-6 h-6 rounded bg-black/50 p-0.5 border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-black/40 shrink-0" />
                      )}
                      <span className="text-xs font-medium text-[#F0E6D2] truncate">{m.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded border shrink-0 ${
                          VERDICT_STYLE[st.verdict]
                        }`}
                      >
                        {SHORT_VERDICT[st.verdict]}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 tabular-nums text-xs">
                      <span className="text-[#F0E6D2] font-semibold">
                        {(st.smoothedWinRate * 100).toFixed(1)}%
                      </span>
                      <span
                        className={`w-11 text-right text-[11px] font-medium ${
                          st.deltaWinRate >= 0.015
                            ? 'text-[#0AC8B9]'
                            : st.deltaWinRate <= -0.02
                              ? 'text-rose-400'
                              : 'text-[#64748B]'
                        }`}
                      >
                        {st.deltaWinRate >= 0 ? '+' : ''}
                        {(st.deltaWinRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
