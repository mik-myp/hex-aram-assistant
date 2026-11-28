import React from 'react'
import { ArrowRight, ChevronUp, Flame, Loader2, Plus, Search, ShieldAlert, Sparkles } from 'lucide-react'
import type {
  AugmentMeta,
  HeroMeta,
  HudDensityMode,
  ItemMeta,
  OverlayOpacityMode,
  TacticalAdvice
} from '@shared/types'
import { resolveFountainSurface } from '../hudConstants'

interface HudFountainRoadmapProps {
  heroId: string
  currentGold: number
  advice: TacticalAdvice
  heroes: Record<string, HeroMeta>
  augments: Record<string, AugmentMeta>
  items: Record<string, ItemMeta>
  pickedAugmentIds: string[]
  enemyCount: number
  opacityMode: OverlayOpacityMode
  densityMode: HudDensityMode
  copiedItemTip: string | null
  aiBriefBusy: boolean
  setAiBriefBusy: (v: boolean) => void
  aiBrief: string | null
  setAiBrief: (v: string | null) => void
  showAugPicker: boolean
  setShowAugPicker: React.Dispatch<React.SetStateAction<boolean>>
  augSearchQuery: string
  setAugSearchQuery: (q: string) => void
  augSearchResults: AugmentMeta[]
  onCollapse: () => void
  onCopyShopItemName: (name: string) => void
}

export const HudFountainRoadmap: React.FC<HudFountainRoadmapProps> = ({
  heroId,
  currentGold,
  advice,
  heroes,
  augments,
  items,
  pickedAugmentIds,
  enemyCount,
  opacityMode,
  densityMode,
  copiedItemTip,
  aiBriefBusy,
  setAiBriefBusy,
  aiBrief,
  setAiBrief,
  showAugPicker,
  setShowAugPicker,
  augSearchQuery,
  setAugSearchQuery,
  augSearchResults,
  onCollapse,
  onCopyShopItemName
}) => {
  const nextStep = advice.immediateNextItem
  const radar = advice.threatRadar
  const fedBossHero = radar.fedBossHeroId ? heroes[radar.fedBossHeroId] : null
  const adPct = Math.round(radar.enemyAdRatio * 100)
  const apPct = Math.max(0, 100 - adPct)
  const threatChips: Array<{ text: string; tone: string }> = []
  if (fedBossHero) {
    threatChips.push({
      text: `大爹 ${radar.fedBossKills}杀 ${fedBossHero.name}`,
      tone: 'bg-rose-500/25 text-rose-200 border-rose-400/50'
    })
  }
  if (radar.enemyTankCount >= 2) {
    threatChips.push({
      text: `${radar.enemyTankCount}前排`,
      tone: 'bg-amber-500/20 text-amber-200 border-amber-400/40'
    })
  }
  if (radar.enemyHealThreat >= 2) {
    threatChips.push({
      text: '高回血·必重伤',
      tone: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
    })
  }
  if (radar.enemyDiveThreat >= 2) {
    threatChips.push({
      text: `${radar.enemyDiveThreat}突脸`,
      tone: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/40'
    })
  }
  if ((radar.enemyPokeThreat ?? 0) >= 2) {
    threatChips.push({
      text: `${radar.enemyPokeThreat}长手Poke`,
      tone: 'bg-sky-500/20 text-sky-200 border-sky-400/40'
    })
  }
  if ((radar.enemyShieldThreat ?? 0) >= 2) {
    threatChips.push({
      text: '厚护盾',
      tone: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
    })
  }
  if ((radar.enemyArmorStackers ?? 0) >= 2) {
    threatChips.push({
      text: `${radar.enemyArmorStackers}人堆甲`,
      tone: 'bg-orange-500/20 text-orange-200 border-orange-400/40'
    })
  }
  if ((radar.enemyMrStackers ?? 0) >= 2) {
    threatChips.push({
      text: `${radar.enemyMrStackers}人堆魔抗`,
      tone: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40'
    })
  }

  return (
    <div
      className={`mt-2 px-4 py-3 rounded-xl border shadow-2xl space-y-2.5 max-w-3xl whitespace-normal ${resolveFountainSurface(
        opacityMode
      )}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-[#F8FAFC]">{advice.headline}</span>
          <span className="text-xs text-[#F3DC9E] font-semibold tabular-nums">当前金币: {currentGold}</span>
          {copiedItemTip ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#0AC8B9]/25 text-[#5CF2E5] border border-[#0AC8B9]/45 font-medium">
              {copiedItemTip}
            </span>
          ) : densityMode === 'detailed' ? (
            <span className="text-[11.5px] text-[#AEBCD0]">（点击装备一键复制名称搜商店）</span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={async () => {
              setAiBriefBusy(true)
              const r = await window.hexbuddy.askLlmAdvisor(heroId, '__MINI_BRIEF__')
              setAiBrief(r.content)
              setAiBriefBusy(false)
            }}
            disabled={aiBriefBusy}
            className="px-2.5 py-0.5 rounded-full bg-[#C8AA6E]/20 hover:bg-[#C8AA6E]/35 border border-[#C8AA6E]/45 text-[11px] text-[#E2C992] flex items-center gap-1 cursor-pointer shrink-0"
          >
            {aiBriefBusy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            <span>AI 锦囊</span>
          </button>
          <button
            type="button"
            onClick={onCollapse}
            title="收起泉水面板（不影响观战）"
            className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/18 border border-white/15 text-[11px] text-[#CBD5E1] hover:text-white flex items-center gap-0.5 cursor-pointer shrink-0"
          >
            <ChevronUp className="w-3 h-3" />
            <span>收起</span>
          </button>
        </div>
      </div>

      {aiBrief && (
        <div className="px-3 py-2 rounded bg-black/55 border border-[#0AC8B9]/40 text-[11px] text-[#F0E6D2] whitespace-pre-wrap">
          {aiBrief}
        </div>
      )}

      {enemyCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[10.5px] pt-0.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/45 border border-white/15 font-semibold tabular-nums">
            <ShieldAlert className="w-3 h-3 text-[#E2C992]" />
            <span className="text-orange-300">AD {adPct}%</span>
            <span className="text-[#64748B]">/</span>
            <span className="text-sky-300">AP {apPct}%</span>
          </span>
          {threatChips.map((chip, idx) => (
            <span
              key={`threat-${idx}`}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border font-semibold ${chip.tone}`}
            >
              {idx === 0 && fedBossHero && <Flame className="w-2.5 h-2.5" />}
              {chip.text}
            </span>
          ))}
          {densityMode === 'detailed' &&
            advice.playstyleTips.slice(0, 1).map((tip, idx) => (
              <span key={`tip-${idx}`} className="text-[#AEBCD0] truncate">
                · {tip}
              </span>
            ))}
        </div>
      )}

      {advice.availableArchetypes && advice.availableArchetypes.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[10.5px]">
          <span className="text-[#94A3B8] shrink-0">流派速切:</span>
          <button
            type="button"
            onClick={() => window.hexbuddy.setArchetype(null)}
            className={`px-2 py-0.5 rounded-full border cursor-pointer transition ${
              !advice.activeArchetypeId
                ? 'bg-[#0AC8B9]/25 border-[#0AC8B9] text-[#5CF2E5] font-bold'
                : 'bg-black/35 border-white/15 text-[#AEBCD0] hover:text-white'
            }`}
          >
            自动推演
          </button>
          {advice.availableArchetypes.map((arch) => {
            const active = advice.activeArchetypeId === arch.id
            return (
              <button
                key={arch.id}
                type="button"
                title={arch.itemPivotTip}
                onClick={() => window.hexbuddy.setArchetype(active ? null : arch.id)}
                className={`px-2 py-0.5 rounded-full border cursor-pointer transition ${
                  active
                    ? 'bg-[#C8AA6E]/30 border-[#C8AA6E] text-[#F8FAFC] font-bold'
                    : 'bg-black/35 border-white/15 text-[#AEBCD0] hover:text-white'
                }`}
              >
                {arch.title}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {advice.recommendedShoe && items[advice.recommendedShoe.itemId] && (
          <button
            type="button"
            onClick={() => onCopyShopItemName(items[advice.recommendedShoe!.itemId].name)}
            title={`${advice.recommendedShoe.reason}\n点击复制名称到商店搜索`}
            className={`px-2 py-1.5 rounded-lg border flex items-center gap-1.5 text-left cursor-pointer hover:border-[#0AC8B9] transition ${
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
          </button>
        )}

        {advice.dynamicBuildPlan.map((step, idx) => {
          const im = items[step.itemId]
          if (!im) return null
          const isNext = nextStep?.itemId === step.itemId && !step.owned
          return (
            <React.Fragment key={step.itemId}>
              <button
                type="button"
                onClick={() => onCopyShopItemName(im.name)}
                title={`${step.reason}\n${im.brief}\n点击复制装备名`}
                className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-2 text-left cursor-pointer hover:border-[#0AC8B9] transition ${
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
                  <div className="text-xs font-semibold text-[#F8FAFC] mt-0.5">{im.name}</div>
                </div>
              </button>
              {idx < advice.dynamicBuildPlan.length - 1 && (
                <ArrowRight className="w-3 h-3 text-[#64748B]" />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {advice.anvilFocus && (
        <div className="pt-1.5 border-t border-white/10 flex items-center justify-between gap-3 text-[11px] flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/35 font-bold shrink-0">
              属性铁砧
            </span>
            <span className="font-semibold text-[#F8FAFC] truncate">
              优先 {advice.anvilFocus.primary}
            </span>
            <span className="text-[#94A3B8] shrink-0">次选 {advice.anvilFocus.secondary}</span>
          </div>
          {densityMode === 'detailed' && (
            <span className="text-[10.5px] text-[#AEBCD0] truncate">
              {advice.anvilFocus.reason}
            </span>
          )}
        </div>
      )}

      <div className="pt-1.5 border-t border-white/10 flex items-center justify-between gap-2 text-[10.5px] relative">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[#94A3B8] shrink-0">本局已拿海克斯（用于算组合/冲突）:</span>
          {pickedAugmentIds.length === 0 && (
            <span className="text-[#64748B]">选卡后自动记录</span>
          )}
          {pickedAugmentIds.map((aid) => {
            const am = augments[aid]
            if (!am) return null
            return (
              <button
                key={aid}
                type="button"
                onClick={() =>
                  window.hexbuddy.updateAugments({
                    pickedAugmentIds: pickedAugmentIds.filter((x) => x !== aid)
                  })
                }
                title={`点击移除：${am.name}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/45 border border-[#C8AA6E]/35 hover:border-rose-400 text-[#F0E6D2] cursor-pointer"
              >
                {am.iconUrl && <img src={am.iconUrl} alt="" className="w-3.5 h-3.5 rounded" />}
                <span>{am.name}</span>
              </button>
            )
          })}
          {pickedAugmentIds.length < 6 && (
            <button
              type="button"
              onClick={() => setShowAugPicker((v) => !v)}
              title="若自动记录有偏差，点此手动补录（支持拼音）"
              className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 border border-dashed border-[#C8AA6E]/45 text-[#E2C992] inline-flex items-center gap-0.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>补录</span>
            </button>
          )}
        </div>

        {showAugPicker && (
          <div className="absolute bottom-8 right-0 w-56 p-2 rounded-lg bg-[#09101D]/98 border border-[#C8AA6E]/55 shadow-2xl z-50 space-y-1.5 whitespace-normal">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#111C2E] border border-white/15">
              <Search className="w-3 h-3 text-[#94A3B8]" />
              <input
                autoFocus
                value={augSearchQuery}
                onChange={(e) => setAugSearchQuery(e.target.value)}
                placeholder="搜海克斯 / 拼音 (zghs)"
                className="bg-transparent outline-none text-[11px] text-[#F0E6D2] w-full"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {augSearchResults.map((am) => {
                const already = pickedAugmentIds.includes(am.id)
                return (
                  <button
                    key={am.id}
                    type="button"
                    disabled={already}
                    onClick={() => {
                      window.hexbuddy.updateAugments({
                        pickedAugmentIds: [...pickedAugmentIds, am.id].slice(-6)
                      })
                      setShowAugPicker(false)
                      setAugSearchQuery('')
                    }}
                    className="w-full px-1.5 py-1 rounded hover:bg-white/10 flex items-center gap-1.5 text-left text-[11px] text-[#F0E6D2] disabled:opacity-40 cursor-pointer"
                  >
                    {am.iconUrl && <img src={am.iconUrl} alt="" className="w-4 h-4 rounded" />}
                    <span className="truncate flex-1">{am.name}</span>
                    {already && <span className="text-[9px] text-[#0AC8B9]">已加</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
