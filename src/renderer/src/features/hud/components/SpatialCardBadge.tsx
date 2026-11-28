import React from 'react'
import { Ban, Crown, Dices, Lock, Sparkles, Star } from 'lucide-react'
import type {
  AugmentMeta,
  HudDensityMode,
  OverlayOpacityMode,
  TacticalAdvice
} from '@shared/types'

interface SpatialCardBadgeProps {
  meta: AugmentMeta
  ev: NonNullable<TacticalAdvice['situationalCandidates'][number]>
  isBest: boolean
  isTrap: boolean
  opacityMode: OverlayOpacityMode
  densityMode: HudDensityMode
}

function formatSampleTag(
  sampleGames?: number,
  confidenceLevel?: 'high' | 'medium' | 'low'
): { text: string; tone: string } | null {
  if (sampleGames === undefined) return null
  if (sampleGames <= 0) {
    return { text: '暂无样本', tone: 'text-amber-300/90 bg-amber-500/15' }
  }
  const numStr =
    sampleGames >= 1000 ? `${(sampleGames / 1000).toFixed(1)}k场` : `${sampleGames}场`
  if (confidenceLevel === 'high') {
    return { text: `${numStr}·稳`, tone: 'text-emerald-300/95 bg-emerald-500/15' }
  }
  if (confidenceLevel === 'low') {
    return { text: `${numStr}·低样本`, tone: 'text-amber-300/95 bg-amber-500/15' }
  }
  return { text: numStr, tone: 'text-[#94A3B8] bg-white/10' }
}

export const SpatialCardBadge: React.FC<SpatialCardBadgeProps> = ({
  meta,
  ev,
  isBest,
  isTrap,
  opacityMode,
  densityMode
}) => {
  const surfaceClass =
    opacityMode === 'clear'
      ? isBest
        ? 'bg-[#05151E]/72 border-2 border-[#0AC8B9]'
        : isTrap
          ? 'bg-[#1D0810]/72 border border-rose-500/80'
          : 'bg-[#080E18]/68 border border-[#C8AA6E]/55'
      : opacityMode === 'glass'
        ? isBest
          ? 'bg-[#072230]/86 border-2 border-[#0AC8B9] shadow-[0_0_16px_rgba(10,200,185,0.28)]'
          : isTrap
            ? 'bg-[#240B15]/88 border border-rose-500/75'
            : 'bg-[#0A111E]/86 border border-[#C8AA6E]/50'
        : isBest
          ? 'bg-[#072230]/96 border-2 border-[#0AC8B9] shadow-[0_0_20px_rgba(10,200,185,0.34)]'
          : isTrap
            ? 'bg-[#240B15]/96 border border-rose-500/75'
            : 'bg-[#0A111E]/96 border border-[#C8AA6E]/50'

  const sampleBadge = formatSampleTag(ev.sampleGames, ev.confidenceLevel)

  return (
    <div className={`w-full rounded-xl px-3.5 py-2 shadow-2xl space-y-1 ${surfaceClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isBest ? (
            <span className="px-1.5 py-0.5 rounded bg-[#0AC8B9] text-[#070B12] text-[11px] font-extrabold flex items-center gap-0.5 shrink-0 [text-shadow:none]">
              <Crown className="w-3 h-3" />
              首选
            </span>
          ) : isTrap ? (
            <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[11px] font-bold shrink-0">
              避坑
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-white/18 text-[#F8FAFC] text-[11px] font-semibold shrink-0">
              备选
            </span>
          )}
          {ev.rerollAction === 'reroll' && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/22 text-amber-300 border border-amber-400/40 text-[10px] font-bold flex items-center gap-0.5 shrink-0">
              <Dices className="w-2.5 h-2.5" />
              建议重随
            </span>
          )}
          {isBest && ev.rerollAction === 'keep' && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/35 text-[10px] font-bold flex items-center gap-0.5 shrink-0">
              <Lock className="w-2.5 h-2.5" />
              锁定
            </span>
          )}
          {ev.userPreference === 'favorite' && (
            <span className="px-1.5 py-0.5 rounded bg-amber-400/22 text-amber-200 border border-amber-300/45 text-[10px] font-bold flex items-center gap-0.5 shrink-0">
              <Star className="w-2.5 h-2.5 fill-amber-300" />
              心愿
            </span>
          )}
          {ev.userPreference === 'blacklisted' && (
            <span className="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-200 border border-rose-400/50 text-[10px] font-bold flex items-center gap-0.5 shrink-0">
              <Ban className="w-2.5 h-2.5" />
              个人避坑
            </span>
          )}
          <span className="text-[13.5px] font-bold text-[#F8FAFC] truncate">{meta.name}</span>
        </div>

        <div className="text-right tabular-nums shrink-0">
          <span className="font-extrabold text-[15px] text-[#F8FAFC]">
            {(ev.situationalScore * 100).toFixed(1)}%
          </span>
          <span
            className={`ml-1 text-xs font-bold ${
              ev.situationalBonus >= 0.005
                ? 'text-[#3CE6D8]'
                : ev.situationalBonus <= -0.005
                  ? 'text-rose-400'
                  : ev.deltaWinRate >= 0
                    ? 'text-[#3CE6D8]'
                    : 'text-rose-400'
            }`}
          >
            {Math.abs(ev.situationalBonus) >= 0.005
              ? `${ev.situationalBonus >= 0 ? '全局+' : '全局'}${(ev.situationalBonus * 100).toFixed(1)}%`
              : `${ev.deltaWinRate >= 0 ? '+' : ''}${(ev.deltaWinRate * 100).toFixed(1)}%`}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1.5 text-xs">
        <span
          className={`font-semibold truncate flex items-center gap-1 ${
            ev.comboName
              ? 'text-amber-300'
              : isBest
                ? 'text-[#5CF2E5]'
                : isTrap
                  ? 'text-rose-300'
                  : 'text-[#F3DC9E]'
          }`}
        >
          {ev.comboName && <Sparkles className="w-3 h-3 shrink-0" />}
          <span className="truncate">{ev.primaryTag}</span>
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {sampleBadge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium tabular-nums ${sampleBadge.tone}`}>
              {sampleBadge.text}
            </span>
          )}
          {ev.pivotItem && (
            <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-black/55 text-[#F3DC9E] font-medium">
              配装: {ev.pivotItem.name}
            </span>
          )}
        </div>
      </div>

      {densityMode === 'detailed' && ev.situationReasons.length > 0 && (
        <div className="space-y-0.5">
          {ev.situationReasons.slice(0, 2).map((reason, idx) => (
            <div
              key={`${ev.augmentId}-r-${idx}`}
              className={`truncate ${
                idx === 0 ? 'text-[11.5px] text-[#E2E8F0]' : 'text-[10.5px] text-[#94A3B8]'
              }`}
            >
              {idx === 0 ? reason : `· ${reason}`}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
