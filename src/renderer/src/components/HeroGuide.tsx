import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookMarked,
  Check,
  Flame,
  Footprints,
  GitBranch,
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
  onAddCandidateAugment,
  onOpenInAugmentDex
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
      {/* 1. Dynamic Archetype Synergies */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-[#F0E6D2] flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#C8AA6E]" />
            <span>海克斯化学反应与变阵套路（针对转海斗与回归玩家动态归纳）</span>
          </h3>
          <span className="text-xs text-[#94A3B8]">点击海克斯标签可记入本局槽位</span>
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

                <div className="pt-1 space-y-1.5">
                  <div className="text-[11px] text-[#94A3B8]">
                    核心海克斯（平均净增幅{' '}
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

              <div className="pt-2.5 border-t border-[#C8AA6E]/15 space-y-2">
                <p className="text-[11px] text-[#E2C992] leading-snug">{arc.itemPivotTip}</p>
                {arc.recommendedItems.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {arc.recommendedItems.map((iid) => {
                      const im = items[iid]
                      if (!im) return null
                      return (
                        <div
                          key={iid}
                          title={im.fullDesc || im.brief}
                          className="flex items-center gap-1.5 bg-[#141F30] px-2 py-1 rounded border border-[#C8AA6E]/20 text-[11px] text-[#C8C1B2]"
                        >
                          <img src={im.iconUrl} alt={im.name} className="w-4 h-4 rounded-sm" />
                          <span>{im.name}</span>
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

      {/* 2. Standard Ordered Core Builds (with New-Item 1-line Briefs + Shoes) vs Augment Pivot Builds & Trap List */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left 7 cols: Standard Core Builds + New Item Quick-Read + Shoes */}
        <div className="xl:col-span-7 hex-panel rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#F0E6D2] flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#C8AA6E]" />
              <span>常规三件套合成顺序 & 新赛季装备速懂</span>
            </h3>
            {guide.hero.topShoes && guide.hero.topShoes.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#94A3B8] flex items-center gap-1">
                  <Footprints className="w-3.5 h-3.5 text-[#C8AA6E]" />
                  推荐鞋:
                </span>
                {guide.hero.topShoes.map((sh) => {
                  const im = items[sh.itemId]
                  if (!im) return null
                  return (
                    <span
                      key={sh.itemId}
                      title={im.fullDesc || im.brief}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#141F30] border border-[#C8AA6E]/25 text-[11px] text-[#F0E6D2] tabular-nums"
                    >
                      <img src={im.iconUrl} alt={im.name} className="w-4 h-4 rounded-sm" />
                      <span>{im.name}</span>
                      <span className="text-[#0AC8B9]">{(sh.winRate * 100).toFixed(0)}%</span>
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {guide.coreBuilds.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">
              该英雄机制特殊（如变身窃取类），装备请结合本局克制灵活选择：
              {guide.situationalItems
                .slice(0, 4)
                .map((s) => items[s.itemId]?.name)
                .filter(Boolean)
                .join(' / ')}
            </p>
          ) : (
            <div className="space-y-2.5">
              {guide.coreBuilds.map((b, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded bg-[#111B2C] border border-[#C8AA6E]/15 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.items.map((iid, stepIdx) => {
                        const im = items[iid]
                        return (
                          <React.Fragment key={`${iid}-${stepIdx}`}>
                            <div
                              title={im?.fullDesc || im?.brief}
                              className="flex items-center gap-2 bg-[#0B111D] px-2.5 py-1.5 rounded border border-[#C8AA6E]/25 max-w-52"
                            >
                              {im?.iconUrl && (
                                <img
                                  src={im.iconUrl}
                                  alt={im.name}
                                  className="w-8 h-8 rounded border border-[#C8AA6E]/35 shrink-0"
                                />
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-[#C8AA6E]">
                                    第{stepIdx + 1}件
                                  </span>
                                  <span className="text-xs font-semibold text-[#F0E6D2] truncate">
                                    {im?.name || iid}
                                  </span>
                                </div>
                                {im?.brief && (
                                  <div className="text-[10px] text-[#94A3B8] truncate">
                                    {im.brief}
                                  </div>
                                )}
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
                </div>
              ))}
            </div>
          )}

          {/* Augment-Specific Pivot First Items (e.g. Destiny Weapon / Special Quest Augments) */}
          {guide.augmentPivotBuilds.length > 0 && (
            <div className="pt-3 border-t border-[#C8AA6E]/15 space-y-2">
              <div className="text-xs font-semibold text-[#E2C992] flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                <span>拿到特定海克斯后的「变阵首件参考」（如命运之武器等特殊机制）</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {guide.augmentPivotBuilds.slice(0, 4).map((pv) => {
                  const am = augments[pv.augmentId]
                  if (!am) return null
                  return (
                    <div
                      key={pv.augmentId}
                      className="p-2 rounded bg-[#0B111D] border border-[#C8AA6E]/20 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {am.iconUrl && <img src={am.iconUrl} alt="" className="w-5 h-5 rounded" />}
                        <span className="font-medium text-[#F0E6D2] truncate">{am.name}</span>
                        <span className="text-[#64748B]">→</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {pv.items.slice(0, 2).map((bi) => {
                          const im = items[bi.itemId]
                          return (
                            <span
                              key={bi.itemId}
                              title={im?.fullDesc || im?.brief}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#142033] border border-[#0AC8B9]/30 text-[11px] text-[#5CF2E5] tabular-nums"
                            >
                              {im?.iconUrl && (
                                <img src={im.iconUrl} alt="" className="w-3.5 h-3.5 rounded-sm" />
                              )}
                              <span>{bi.name}</span>
                              <span>{(bi.winRate * 100).toFixed(0)}%</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right 5 cols: Trap Warning Red List */}
        <div className="xl:col-span-5 rounded-lg p-4 bg-gradient-to-br from-rose-950/35 to-[#0C1320] border border-rose-500/35 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>该英雄避坑红榜（字面诱人但实际掉胜率）</span>
            </h3>
          </div>

          {guide.trapAugments.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">该英雄适应面极广，暂无明显大幅倒挂的高频陷阱符文。</p>
          ) : (
            <div className="space-y-2">
              {guide.trapAugments.slice(0, 5).map((trap) => {
                const m = augments[trap.augmentId]
                if (!m) return null
                return (
                  <div
                    key={trap.augmentId}
                    className="p-2.5 rounded bg-[#0B101B]/90 border border-rose-500/25 flex items-start justify-between gap-2.5"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {m.iconUrl && (
                        <img
                          src={m.iconUrl}
                          alt={m.name}
                          className="w-8 h-8 rounded bg-black/40 shrink-0 mt-0.5"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#F0E6D2] truncate">
                            {m.name}
                          </span>
                          <span
                            className={`text-[10px] px-1 rounded border ${RARITY_BADGE[m.rarity]}`}
                          >
                            {RARITY_LABEL[m.rarity]}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#94A3B8] line-clamp-2 mt-0.5">{m.desc}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-xs font-bold text-rose-400">
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
              placeholder="搜海克斯名称、效果或拼音首字母 (如 zghs)"
              className="w-full pl-8 pr-3 py-1.5 rounded bg-[#111B2C] border border-[#C8AA6E]/25 text-xs text-[#F0E6D2] placeholder-[#64748B] focus:outline-none focus:border-[#C8AA6E]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredAugments.slice(0, 48).map((st) => {
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
                      变阵首件推荐：
                      {st.boundItems
                        .slice(0, 2)
                        .map((bi) => `${bi.name}(${(bi.winRate * 100).toFixed(0)}%)`)
                        .join(' / ')}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                  <button
                    onClick={() => onOpenInAugmentDex(st.augmentId)}
                    title="在海克斯百科中查看最契合该符文的天选英雄"
                    className="text-[#94A3B8] hover:text-[#E2C992] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <BookMarked className="w-3 h-3" />
                    <span className="tabular-nums">{st.games.toLocaleString()}局 · 适配榜</span>
                  </button>

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
                      <span>{inCompare ? '对比中' : '进三选一'}</span>
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
                      <span>{isPicked ? '已拿' : '记已拿'}</span>
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
