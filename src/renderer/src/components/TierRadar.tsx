import React, { useMemo, useState } from 'react'
import { Search, Star } from 'lucide-react'
import { matchesSearchQuery } from '@shared/pinyin'
import type { HeroMeta, HeroRole, TierGrade } from '@shared/types'

interface TierRadarProps {
  heroes: Record<string, HeroMeta>
  selectedHeroId: string | null
  myLiveHeroId: string | null
  favoriteHeroIds: string[]
  onSelectHero: (heroId: string) => void
  onToggleFavorite: (heroId: string) => void
}

const ROLE_FILTERS: Array<{ key: 'all' | 'fav' | HeroRole; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'fav', label: '★ 本命' },
  { key: 'mage', label: '法师' },
  { key: 'marksman', label: '射手' },
  { key: 'tank', label: '坦克' },
  { key: 'fighter', label: '战士' },
  { key: 'assassin', label: '刺客' },
  { key: 'support', label: '辅助' }
]

export const TIER_STYLE: Record<TierGrade, string> = {
  T0: 'bg-[#0AC8B9]/20 text-[#5CF2E5] border-[#0AC8B9]/50',
  T1: 'bg-[#C8AA6E]/20 text-[#F0D9A8] border-[#C8AA6E]/50',
  T2: 'bg-slate-700/40 text-slate-200 border-slate-500/40',
  T3: 'bg-slate-800/60 text-slate-400 border-slate-600/30',
  T4: 'bg-rose-950/40 text-rose-300/80 border-rose-800/40'
}

export const TierRadar: React.FC<TierRadarProps> = ({
  heroes,
  selectedHeroId,
  myLiveHeroId,
  favoriteHeroIds,
  onSelectHero,
  onToggleFavorite
}) => {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<'all' | 'fav' | HeroRole>('all')
  const [onlyTopTier, setOnlyTopTier] = useState(false)

  const favSet = useMemo(() => new Set(favoriteHeroIds), [favoriteHeroIds])

  const filteredHeroes = useMemo(() => {
    return Object.values(heroes)
      .filter((h) => {
        if (role === 'fav' && !favSet.has(h.id)) return false
        if (role !== 'all' && role !== 'fav' && !h.roles.includes(role)) return false
        if (onlyTopTier && h.tier !== 'T0' && h.tier !== 'T1') return false
        return matchesSearchQuery(query, {
          name: `${h.name} ${h.title} ${h.alias}`,
          pinyinFull: h.pinyinFull,
          pinyinInitials: h.pinyinInitials
        })
      })
      .sort((a, b) => b.smoothedWinRate - a.smoothedWinRate)
  }, [heroes, query, role, onlyTopTier, favSet])

  return (
    <aside className="w-80 shrink-0 border-r border-[#C8AA6E]/20 bg-[#090F1A] flex flex-col h-full">
      {/* Search & Filters */}
      <div className="p-3 space-y-2.5 border-b border-[#C8AA6E]/15">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜英雄名 / 外号(火女,狗头) / 拼音(jks)"
            className="w-full pl-8 pr-3 py-1.5 rounded bg-[#131E30] border border-[#C8AA6E]/25 text-xs text-[#F0E6D2] placeholder-[#64748B] focus:outline-none focus:border-[#C8AA6E]"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {ROLE_FILTERS.map((rf) => (
            <button
              key={rf.key}
              onClick={() => setRole(rf.key)}
              className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition ${
                role === rf.key
                  ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                  : 'bg-[#121C2D] text-[#94A3B8] hover:text-[#F0E6D2]'
              }`}
            >
              {rf.label}
            </button>
          ))}
          <button
            onClick={() => setOnlyTopTier(!onlyTopTier)}
            className={`ml-auto px-2 py-0.5 rounded text-[11px] border cursor-pointer transition ${
              onlyTopTier
                ? 'bg-[#0AC8B9]/20 text-[#5CF2E5] border-[#0AC8B9]/50'
                : 'bg-[#121C2D] text-[#94A3B8] border-transparent hover:text-[#F0E6D2]'
            }`}
          >
            仅 T0/T1
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-[#64748B] border-b border-[#C8AA6E]/10">
        <span>英雄与定位（共 {filteredHeroes.length} 位）</span>
        <span>平滑胜率 / 梯队</span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#C8AA6E]/8">
        {filteredHeroes.map((hero) => {
          const isSelected = hero.id === selectedHeroId
          const isLiveMe = hero.id === myLiveHeroId
          const isFav = favSet.has(hero.id)
          return (
            <div
              key={hero.id}
              onClick={() => onSelectHero(hero.id)}
              className={`w-full px-3 py-2 flex items-center gap-2.5 text-left transition cursor-pointer group ${
                isSelected ? 'bg-[#17253B] border-l-2 border-l-[#C8AA6E]' : 'hover:bg-[#111B2B]'
              }`}
            >
              <div className="relative shrink-0">
                <img
                  src={hero.avatarUrl}
                  alt={hero.name}
                  loading="lazy"
                  className="w-9 h-9 rounded border border-[#C8AA6E]/35 object-cover bg-[#0D1420]"
                />
                {isLiveMe && (
                  <span className="absolute -bottom-1 -right-1 px-1 rounded text-[9px] font-bold bg-[#0AC8B9] text-[#070B12]">
                    我
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-[#F0E6D2] truncate">{hero.name}</span>
                  <span className="text-[11px] text-[#64748B] truncate">{hero.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleFavorite(hero.id)
                    }}
                    title={isFav ? '取消本命收藏' : '收藏为我的本命熟练英雄（选人替补席优先提示）'}
                    className={`ml-auto p-0.5 cursor-pointer transition ${
                      isFav
                        ? 'text-amber-300'
                        : 'text-transparent group-hover:text-slate-500 hover:!text-amber-300'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-300' : ''}`} />
                  </button>
                </div>
                <div className="text-[11px] text-[#94A3B8] flex items-center gap-2 tabular-nums">
                  <span>登场 {(hero.pickRate * 100).toFixed(1)}%</span>
                  <span>·</span>
                  <span>{(hero.games / 10000).toFixed(1)}万局</span>
                </div>
              </div>

              <div className="text-right shrink-0 flex items-center gap-2">
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    hero.smoothedWinRate >= 0.525
                      ? 'text-[#0AC8B9]'
                      : hero.smoothedWinRate <= 0.48
                        ? 'text-rose-400'
                        : 'text-[#F0E6D2]'
                  }`}
                >
                  {(hero.smoothedWinRate * 100).toFixed(1)}%
                </span>
                <span
                  className={`text-[11px] w-7 text-center py-0.5 rounded border font-semibold ${
                    TIER_STYLE[hero.tier]
                  }`}
                >
                  {hero.tier}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
