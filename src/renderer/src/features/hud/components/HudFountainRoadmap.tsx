import React from 'react'
import { ArrowRight, Loader2, Sparkles } from 'lucide-react'
import type {
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
  items: Record<string, ItemMeta>
  opacityMode: OverlayOpacityMode
  densityMode: HudDensityMode
  copiedItemTip: string | null
  aiBriefBusy: boolean
  setAiBriefBusy: (v: boolean) => void
  aiBrief: string | null
  setAiBrief: (v: string | null) => void
  onCopyShopItemName: (name: string) => void
}

export const HudFountainRoadmap: React.FC<HudFountainRoadmapProps> = ({
  heroId,
  currentGold,
  advice,
  items,
  opacityMode,
  densityMode,
  copiedItemTip,
  aiBriefBusy,
  setAiBriefBusy,
  aiBrief,
  setAiBrief,
  onCopyShopItemName
}) => {
  const nextStep = advice.immediateNextItem

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
          <span>AI 一句话锦囊</span>
        </button>
      </div>

      {aiBrief && (
        <div className="px-3 py-2 rounded bg-black/55 border border-[#0AC8B9]/40 text-[11px] text-[#F0E6D2] whitespace-pre-wrap">
          {aiBrief}
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
    </div>
  )
}
