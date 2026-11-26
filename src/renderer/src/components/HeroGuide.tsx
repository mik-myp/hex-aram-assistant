import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Flame,
  Plus,
  Scale,
  Search,
  ShoppingBag
} from 'lucide-react'
import { matchesSearchQuery } from '@shared/pinyin'
import type {
  AugmentMeta,
  AugmentRarity,
  AugmentVerdict,
  HeroDetailGuide,
  ItemMeta
} from '@shared/types'

interface HeroGuideProps {
  guide: HeroDetailGuide
  augments: Record<string, AugmentMeta>
  items: Record<string, ItemMeta>
  pickedAugmentIds: string[]
  candidateAugmentIds: string[]
  onTogglePickAugment: (augId: string) => void
  onAddCandidateAugment: (augId: string) => void
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
  'S+': 'bg-[#0AC8B9]/20 text-[#5CF2E5] border-[#0AC8B9]/55',
  S: 'bg-[#C8AA6E]/25 text-[#F5E2B8] border-[#C8AA6E]/60',
  A: 'bg-slate-700/50 text-slate-200 border-slate-500/40',
  B: 'bg-slate-800/70 text-slate-400 border-slate-600/30',
  TRAP: 'bg-rose-600/20 text-rose-300 border-rose-500/50'
}

export const HeroGuide: React.FC<HeroGuideProps> = ({
  guide,
  augments,
  items,
  pickedAugmentIds,
  candidateAugmentIds,
  onTogglePickAugment,
  onAddCandidateAugment
}) => {
  const [rarityFilter, setRarityFilter] = useState<'all' | AugmentRarity>('all')
  const [augQuery, setAugQuery] = useState('')

  const filteredAugments = useMemo(() => {
    return guide.augments.filter((st) => {
      const meta = augments[st.augmentId]
      if (!meta) return false
      if (rarityFilter !== 'all' && meta.rarity !== rarityFilter) return false
      return matchesSearchQuery(augQuery, {
        name: meta.name,
        pinyinFull: meta.pinyinFull,
        pinyinInitials: meta.pinyinInitials,
        extraKeywords: meta.desc
      })
    })
  }, [guide.augments, augments, rarityFilter, augQuery])

  return (
    <div className="space-y-6 pb-8">
      {/* 1. Dynamic Beginner Archetype Synergies */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-[#F0E6D2] flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#C8AA6E]" />
            <span>核心流派套路与出装转型（算法结合版本大数据动态推导）</span>
          </h3>
          <span className="text-xs text-[#94A3B8]">点击流派内的海克斯可直接记入本局已拿槽位</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          {guide.archetypes.map((arc) => (
            <div
              key={arc.id}
              className="hex-panel rounded-lg p-4 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#F0E6D2]">{arc.title}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-[#C8AA6E]/20 text-[#E2C992] border border-[#C8AA6E]/40 shrink-0">
                    {arc.badge}
                  </span>
                </div>

                <p className="text-xs text-[#C8C1B2] leading-relaxed">{arc.summary}</p>

                {/* Core augments */}
                <div className="pt-1 space-y-1.5">
                  <div className="text-[11px] text-[#94A3B8]">
                    流派核心海克斯（平均净增幅{' '}
                    <span className="text-[#0AC8B9] font-semibold tabular-nums">
                      {arc.avgDeltaWinRate >= 0 ? '+' : ''}
                      {(arc.avgDeltaWinRate * 100).toFixed(1)}%
                    </span>
                    ）：
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {arc.coreAugmentIds.map((aid) => {
                      const am = augments[aid]
                      if (!am) return null
                      const picked = pickedAugmentIds.includes(aid)
                      return (
                        <button
                          key={aid}
                          onClick={() => onTogglePickAugment(aid)}
                          title={`${am.desc}\n点击标记为本局已拿`}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs border cursor-pointer transition ${
                            picked
                              ? 'bg-[#0AC8B9]/25 border-[#0AC8B9] text-[#F0E6D2]'
                              : RARITY_BADGE[am.rarity]
                          }`}
                        >
                          {am.iconUrl && (
                            <img src={am.iconUrl} alt="" className="w-3.5 h-3.5 rounded-sm" />
                          )}
                          <span>{am.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Pivot items */}
              <div className="pt-2.5 border-t border-[#C8AA6E]/15 space-y-2">
                <p className="text-[11px] text-[#E2C992] leading-snug">{arc.itemPivotTip}</p>
                {arc.recommendedItems.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {arc.recommendedItems.map((iid) => {
                      const im = items[iid]
                      if (!im) return null
                      return (
                        <div
                          key={iid}
                          className="flex items-center gap-1 bg-[#141F30] px-1.5 py-1 rounded border border-[#C8AA6E]/20 text-[11px] text-[#C8C1B2]"
                        >
                          <img src={im.iconUrl} alt={im.name} className="w-4 h-4 rounded-sm" />
                          <span className="truncate max-w-20">{im.name}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Ordered Core Builds + Situational Items */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 hex-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#F0E6D2] flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#C8AA6E]" />
              <span>高胜率核心三件套（严格按合成先后顺序）</span>
            </h3>
            <span className="text-[11px] text-[#94A3B8]">排除特殊赠装干扰口径</span>
          </div>

          {guide.coreBuilds.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">该英雄机制特殊（如窃取形态类），请参考右侧单件高胜率神装。</p>
          ) : (
            <div className="space-y-2.5">
              {guide.coreBuilds.map((b, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-[#111B2C] border border-[#C8AA6E]/15 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {b.items.map((iid, stepIdx) => {
                      const im = items[iid]
                      return (
                        <React.Fragment key={`${iid}-${stepIdx}`}>
                          <div className="flex items-center gap-2 bg-[#0B111D] px-2.5 py-1.5 rounded border border-[#C8AA6E]/25">
                            {im?.iconUrl && (
                              <img
                                src={im.iconUrl}
                                alt={im.name}
                                className="w-7 h-7 rounded border border-[#C8AA6E]/35"
                              />
                            )}
                            <div>
                              <div className="text-[10px] text-[#94A3B8]">第 {stepIdx + 1} 件</div>
                              <div className="text-xs font-medium text-[#F0E6D2]">
                                {im?.name || iid}
                              </div>
                            </div>
                          </div>
                          {stepIdx < b.items.length - 1 && (
                            <ArrowRight className="w-3.5 h-3.5 text-[#C8AA6E]/70 shrink-0" />
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>

                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs font-semibold text-[#0AC8B9]">
                      胜率 {(b.winRate * 100).toFixed(1)}%
                    </div>
                    <div className="text-[11px] text-[#94A3B8]">{b.games.toLocaleString()} 局</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trap Warning Red List */}
        <div className="lg:col-span-5 rounded-lg p-4 bg-gradient-to-br from-rose-950/35 to-[#0C1320] border border-rose-500/35 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>新手避坑红榜（看似美好实则掉胜率）</span>
            </h3>
          </div>

          {guide.trapAugments.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">该英雄适应面极广，暂无明显大幅倒挂的高频陷阱符文。</p>
          ) : (
            <div className="space-y-2">
              {guide.trapAugments.slice(0, 4).map((trap) => {
                const m = augments[trap.augmentId]
                if (!m) return null
                return (
                  <div
                    key={trap.augmentId}
                    className="p-2 rounded bg-[#0B101B]/85 border border-rose-500/25 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {m.iconUrl && (
                        <img src={m.iconUrl} alt={m.name} className="w-7 h-7 rounded bg-black/40" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-[#F0E6D2] truncate">
                            {m.name}
                          </span>
                          <span
                            className={`text-[10px] px-1 rounded border ${RARITY_BADGE[m.rarity]}`}
                          >
                            {RARITY_LABEL[m.rarity]}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#94A3B8] truncate">{m.desc}</div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-xs font-semibold text-rose-400">
                        {(trap.deltaWinRate * 100).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-[#94A3B8]">
                        胜率 {(trap.smoothedWinRate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* 3. Full Augment Tier Browser */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {(
              [
                { key: 'all', label: '全部品阶' },
                { key: 'prismatic', label: '棱彩阶' },
                { key: 'gold', label: '黄金阶' },
                { key: 'silver', label: '白银阶' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setRarityFilter(tab.key)}
                className={`px-3 py-1.5 rounded text-xs cursor-pointer transition ${
                  rarityFilter === tab.key
                    ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                    : 'bg-[#111B2C] text-[#C8C1B2] hover:text-[#F0E6D2] border border-[#C8AA6E]/20'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={augQuery}
              onChange={(e) => setAugQuery(e.target.value)}
              placeholder="搜海克斯名称或拼音首字母 (如 zghs)"
              className="w-full pl-8 pr-3 py-1.5 rounded bg-[#111B2C] border border-[#C8AA6E]/25 text-xs text-[#F0E6D2] placeholder-[#64748B] focus:outline-none focus:border-[#C8AA6E]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredAugments.slice(0, 45).map((st) => {
            const meta = augments[st.augmentId]
            if (!meta) return null
            const isPicked = pickedAugmentIds.includes(st.augmentId)
            const inCompare = candidateAugmentIds.includes(st.augmentId)
            const frameClass =
              meta.rarity === 'prismatic'
                ? 'rarity-frame-prismatic'
                : meta.rarity === 'gold'
                  ? 'rarity-frame-gold'
                  : 'rarity-frame-silver'

            return (
              <div
                key={st.augmentId}
                className={`${frameClass} rounded-lg p-3.5 flex flex-col justify-between space-y-2.5`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {meta.iconUrl ? (
                        <img
                          src={meta.iconUrl}
                          alt={meta.name}
                          loading="lazy"
                          className="w-10 h-10 rounded bg-black/50 p-0.5 border border-white/15 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-black/40 border border-white/10 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-semibold text-[#F0E6D2] truncate">
                            {meta.name}
                          </h4>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded border shrink-0 ${
                              RARITY_BADGE[meta.rarity]
                            }`}
                          >
                            {RARITY_LABEL[meta.rarity]}
                          </span>
                        </div>
                        <span
                          className={`inline-block mt-1 text-[11px] px-1.5 py-0.2 rounded border font-medium ${
                            VERDICT_STYLE[st.verdict]
                          }`}
                        >
                          {st.verdictLabel}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-sm font-bold text-[#F0E6D2]">
                        {(st.smoothedWinRate * 100).toFixed(1)}%
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          st.deltaWinRate >= 0.015
                            ? 'text-[#0AC8B9]'
                            : st.deltaWinRate <= -0.02
                              ? 'text-rose-400'
                              : 'text-[#94A3B8]'
                        }`}
                      >
                        {st.deltaWinRate >= 0 ? '+' : ''}
                        {(st.deltaWinRate * 100).toFixed(1)}% 净增幅
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[#C8C1B2] leading-relaxed line-clamp-3">{meta.desc}</p>

                  {st.boundItems && st.boundItems.length > 0 && (
                    <div className="text-[11px] text-[#E2C992] bg-black/25 px-2 py-1 rounded">
                      最佳首件绑定：
                      {st.boundItems
                        .slice(0, 2)
                        .map((bi) => `${bi.name}(${(bi.winRate * 100).toFixed(0)}%)`)
                        .join(' / ')}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                  <span className="text-[#94A3B8] tabular-nums">
                    样本 {st.games.toLocaleString()} 局{st.lowSample ? ' (小样本已平滑)' : ''}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onAddCandidateAugment(st.augmentId)}
                      className={`px-2 py-1 rounded flex items-center gap-1 border cursor-pointer transition ${
                        inCompare
                          ? 'bg-[#C8AA6E]/25 border-[#C8AA6E] text-[#F0E6D2]'
                          : 'bg-black/30 border-white/15 text-[#C8C1B2] hover:text-[#F0E6D2]'
                      }`}
                    >
                      <Scale className="w-3 h-3" />
                      <span>{inCompare ? '已在对比' : '进三选一'}</span>
                    </button>
                    <button
                      onClick={() => onTogglePickAugment(st.augmentId)}
                      className={`px-2 py-1 rounded flex items-center gap-1 border cursor-pointer transition ${
                        isPicked
                          ? 'bg-[#0AC8B9] border-[#0AC8B9] text-[#070B12] font-semibold'
                          : 'bg-black/30 border-white/15 text-[#C8C1B2] hover:text-[#F0E6D2]'
                      }`}
                    >
                      {isPicked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      <span>{isPicked ? '本局已拿' : '记为已拿'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
