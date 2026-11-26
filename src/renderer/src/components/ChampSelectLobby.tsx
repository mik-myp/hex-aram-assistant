import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Flame, ShieldAlert, Sparkles, Star, Users } from 'lucide-react'
import { TIER_STYLE } from './TierRadar'
import type { BenchSuggestion, HeroMeta, HeroRole, UserPreferences } from '@shared/types'

interface ChampSelectLobbyProps {
  heroes: Record<string, HeroMeta>
  myHeroId: string | null
  allyHeroIds: string[]
  benchSuggestions: BenchSuggestion[]
  prefs: UserPreferences
  onSelectHero: (heroId: string) => void
  onUpdatePrefs: (next: Partial<UserPreferences>) => void
}

const ROLE_OPTIONS: Array<{ key: HeroRole; label: string }> = [
  { key: 'mage', label: '法师' },
  { key: 'marksman', label: '射手' },
  { key: 'fighter', label: '战士' },
  { key: 'tank', label: '坦克' },
  { key: 'assassin', label: '刺客' },
  { key: 'support', label: '辅助' }
]

export const ChampSelectLobby: React.FC<ChampSelectLobbyProps> = ({
  heroes,
  myHeroId,
  allyHeroIds,
  benchSuggestions,
  prefs,
  onSelectHero,
  onUpdatePrefs
}) => {
  const [collapsed, setCollapsed] = useState(false)

  const allies = allyHeroIds
    .map((id) => heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))

  const apCount = allies.filter((h) => h.damageType === 'AP').length
  const adCount = allies.filter((h) => h.damageType === 'AD').length
  const tankCount = allies.filter((h) => h.roles.includes('tank')).length

  let compDiagnosis = '我方当前阵容前排与双C输出较为均衡'
  let compWarning = false
  if (apCount >= 4) {
    compDiagnosis = `我方已有 ${apCount} 名法系英雄，对面叠魔抗后极易刮痧！建议从替补席换取 AD 射手/战士或前排`
    compWarning = true
  } else if (adCount >= 4) {
    compDiagnosis = `我方全物理菜刀队（${adCount} AD），建议从替补席补充 AP 清线或前排控制`
    compWarning = true
  } else if (tankCount === 0 && allies.length >= 4) {
    compDiagnosis = '我方当前无正统坦克前排，替补席若有高胜率重装/控制英雄建议优先拿取'
    compWarning = true
  }

  const togglePreferredRole = (role: HeroRole): void => {
    const exists = prefs.preferredRoles.includes(role)
    const next = exists
      ? prefs.preferredRoles.filter((r) => r !== role)
      : [...prefs.preferredRoles, role]
    onUpdatePrefs({ preferredRoles: next })
  }

  return (
    <div className="mx-6 mt-4 rounded-lg border border-[#0AC8B9]/40 bg-gradient-to-r from-[#0C1A2B] via-[#0B1524] to-[#0A111E] overflow-hidden shrink-0">
      <div className="px-4 py-2.5 bg-[#0E1E32]/80 border-b border-[#0AC8B9]/25 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5CF2E5]">
            <Users className="w-4 h-4" />
            选人阶段作战室
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded border ${
              compWarning
                ? 'bg-amber-500/15 text-amber-200 border-amber-400/40'
                : 'bg-[#0AC8B9]/10 text-[#C8C1B2] border-[#0AC8B9]/25'
            }`}
          >
            {compWarning && <ShieldAlert className="w-3 h-3 inline mr-1 -mt-0.5" />}
            {compDiagnosis}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#94A3B8] hidden md:inline">我的熟练定位加权:</span>
          <div className="flex items-center gap-1">
            {ROLE_OPTIONS.map((ro) => {
              const active = prefs.preferredRoles.includes(ro.key)
              return (
                <button
                  key={ro.key}
                  onClick={() => togglePreferredRole(ro.key)}
                  className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer transition ${
                    active
                      ? 'bg-[#C8AA6E] text-[#070B12] border-[#C8AA6E] font-semibold'
                      : 'bg-[#0B1220] text-[#94A3B8] border-[#C8AA6E]/20 hover:text-[#F0E6D2]'
                  }`}
                >
                  {ro.label}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left: 5 Allies Overview */}
          <div className="xl:col-span-5 space-y-2">
            <div className="text-xs text-[#94A3B8] flex items-center justify-between gap-2">
              <span className="truncate">我方当前 5 人阵容（点击查看队友海克斯）</span>
              <span className="tabular-nums whitespace-nowrap shrink-0">
                {adCount} AD / {apCount} AP / {tankCount} 坦
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {allies.map((h, idx) => {
                const isMe = h.id === myHeroId
                return (
                  <button
                    key={`${h.id}-${idx}`}
                    onClick={() => onSelectHero(h.id)}
                    className={`p-2 rounded border flex flex-col items-center text-center gap-1 cursor-pointer transition ${
                      isMe
                        ? 'bg-[#162840] border-[#0AC8B9]'
                        : 'bg-[#0B1220] border-[#C8AA6E]/20 hover:border-[#C8AA6E]/50'
                    }`}
                  >
                    <div className="relative">
                      <img src={h.avatarUrl} alt={h.name} className="w-10 h-10 rounded object-cover" />
                      {isMe && (
                        <span className="absolute -top-1 -right-1 px-1 rounded bg-[#0AC8B9] text-[#070B12] text-[9px] font-bold">
                          我
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-[#F0E6D2] truncate w-full">
                      {h.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] px-1 rounded border ${TIER_STYLE[h.tier]}`}>
                        {h.tier}
                      </span>
                      <span className="text-[10px] text-[#94A3B8] tabular-nums">
                        {(h.smoothedWinRate * 100).toFixed(0)}%
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right: Weighted Bench Recommendations */}
          <div className="xl:col-span-7 space-y-2">
            <div className="text-xs text-[#94A3B8] flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[#E2C992] font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                替补席候选池对比（综合海斗胜率 + 你的熟练定位 + 本命收藏智能排序）
              </span>
            </div>

            {benchSuggestions.length === 0 ? (
              <div className="h-20 rounded border border-dashed border-[#C8AA6E]/20 flex items-center justify-center text-xs text-[#64748B]">
                当前替补席暂无英雄（队友使用骰子后将实时刷新推荐）
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {benchSuggestions.map((sug) => {
                  const h = heroes[sug.heroId]
                  if (!h) return null
                  return (
                    <button
                      key={sug.heroId}
                      onClick={() => onSelectHero(sug.heroId)}
                      className={`p-2.5 rounded-lg border text-left flex items-center gap-3 cursor-pointer transition ${
                        sug.isFavorite || sug.deltaVsCurrent >= 0.025
                          ? 'bg-[#12263A] border-[#0AC8B9]/55 hover:border-[#0AC8B9]'
                          : 'bg-[#0B1220] border-[#C8AA6E]/25 hover:border-[#C8AA6E]/55'
                      }`}
                    >
                      <img
                        src={h.avatarUrl}
                        alt={h.name}
                        className="w-11 h-11 rounded border border-[#C8AA6E]/40 shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-[#F0E6D2]">{h.name}</span>
                          <span className={`text-[10px] px-1 rounded border ${TIER_STYLE[h.tier]}`}>
                            {h.tier}
                          </span>
                          {sug.isFavorite && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/40">
                              <Star className="w-2.5 h-2.5 fill-amber-300" />
                              本命
                            </span>
                          )}
                          {sug.isMayhemBonusHero && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 rounded bg-purple-500/20 text-purple-200 border border-purple-400/40">
                              <Flame className="w-2.5 h-2.5" />
                              海斗红利
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#C8C1B2] truncate">{sug.reason}</p>
                      </div>

                      <div className="text-right shrink-0 tabular-nums">
                        <div className="text-xs font-bold text-[#F0E6D2]">
                          {(sug.winRate * 100).toFixed(1)}%
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${
                            sug.deltaVsCurrent >= 0 ? 'text-[#0AC8B9]' : 'text-rose-400'
                          }`}
                        >
                          {sug.deltaVsCurrent >= 0 ? '+' : ''}
                          {(sug.deltaVsCurrent * 100).toFixed(1)}%
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
