import React, { useMemo, useState } from 'react'
import { Search, Star } from 'lucide-react'
import { matchesSearchQuery } from '@shared/pinyin'
import type { HeroMeta, HeroRole, TierGrade } from '@shared/types'

interface TierRadarProps {
  heroes: Record<string, HeroMeta>
  selectedHeroId: string | null
  favoriteHeroIds: string[]
  onSelectHero: (heroId: string) => void
  onToggleFavorite: (heroId: string) => void
}

const COMPACT_FILTERS: Array<{ key: 'all' | 'fav' | HeroRole; label: string }> = [
  { key: 'all', label: '全' },
  { key: 'fav', label: '★' },
  { key: 'mage', label: '法' },
  { key: 'marksman', label: '射' },
  { key: 'tank', label: '坦' },
  { key: 'fighter', label: '战' },
  { key: 'assassin', label: '刺' },
  { key: 'support', label: '辅' }
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
  favoriteHeroIds,
  onSelectHero,
  onToggleFavorite
}) => {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<'all' | 'fav' | HeroRole>('all')

  const favSet = useMemo(() => new Set(favoriteHeroIds), [favoriteHeroIds])

  const filteredHeroes = useMemo(() => {
    return Object.values(heroes)
      .filter((h) => {
        if (role === 'fav' && !favSet.has(h.id)) return false
        if (role !== 'all' && role !== 'fav' && !h.roles.includes(role)) return false
        return matchesSearchQuery(query, {
          name: `${h.name} ${h.title} ${h.alias}`,
          pinyinFull: h.pinyinFull,
          pinyinInitials: h.pinyinInitials
        })
      })
      .sort((a, b) => b.smoothedWinRate - a.smoothedWinRate)
  }, [heroes, query, role, favSet])

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-[#090F1A] flex flex-col h-full">
      <div className="p-2.5 space-y-2 border-b border-border">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜英雄 / 外号 / 拼音"
            className="w-full pl-8 pr-2.5 py-1.5 rounded bg-[#131E30] border border-input text-xs text-foreground placeholder:text-[#8ea0b8] focus:outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-8 gap-0.5">
          {COMPACT_FILTERS.map((rf) => (
            <button
              key={rf.key}
              onClick={() => setRole(rf.key)}
              className={`py-1 rounded text-2xs cursor-pointer transition ${
                role === rf.key
                  ? 'bg-primary text-primary-foreground font-bold'
                  : 'bg-[#121C2D] text-muted-foreground hover:text-foreground'
              }`}
            >
              {rf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-white/6">
        {filteredHeroes.map((hero) => {
          const isSelected = hero.id === selectedHeroId
          const isFav = favSet.has(hero.id)
          return (
            <div
              key={hero.id}
              onClick={() => onSelectHero(hero.id)}
              className={`h-10 px-3 flex items-center justify-between gap-2 cursor-pointer transition group ${
                isSelected ? 'bg-[#182842] border-l-2 border-l-primary' : 'hover:bg-[#121d30]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={hero.avatarUrl}
                  alt={hero.name}
                  loading="lazy"
                  className="w-6.5 h-6.5 rounded border border-primary/40 object-cover shrink-0"
                />
                <span className="text-xs font-medium text-foreground truncate">{hero.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(hero.id)
                  }}
                  className={`p-0.5 cursor-pointer ${
                    isFav ? 'text-amber-300' : 'text-transparent group-hover:text-slate-400'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-300' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                <span
                  className={`text-xs font-semibold ${
                    hero.smoothedWinRate >= 0.525
                      ? 'text-accent'
                      : hero.smoothedWinRate <= 0.48
                        ? 'text-rose-400'
                        : 'text-[#d4dce8]'
                  }`}
                >
                  {(hero.smoothedWinRate * 100).toFixed(1)}%
                </span>
                <span
                  className={`text-2xs w-7 text-center py-0.2 rounded border font-semibold ${
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
