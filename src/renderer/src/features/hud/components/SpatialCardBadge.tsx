import React from 'react'
import { Crown } from 'lucide-react'
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
        ? 'bg-black/48 backdrop-blur-[2px] border-2 border-[#0AC8B9]'
        : isTrap
          ? 'bg-black/48 backdrop-blur-[2px] border border-rose-500/80'
          : 'bg-black/45 backdrop-blur-[2px] border border-[#C8AA6E]/55'
      : opacityMode === 'glass'
        ? isBest
          ? 'bg-[#072230]/76 backdrop-blur-md border-2 border-[#0AC8B9] shadow-[0_0_20px_rgba(10,200,185,0.3)]'
          : isTrap
            ? 'bg-[#240B15]/78 backdrop-blur-md border border-rose-500/75'
            : 'bg-[#0A111E]/76 backdrop-blur-md border border-[#C8AA6E]/50'
        : isBest
          ? 'bg-[#072230]/96 border-2 border-[#0AC8B9] shadow-[0_0_24px_rgba(10,200,185,0.38)]'
          : isTrap
            ? 'bg-[#240B15]/96 border border-rose-500/75'
            : 'bg-[#0A111E]/96 border border-[#C8AA6E]/50'

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
          <span className="text-[13.5px] font-bold text-[#F8FAFC] truncate">{meta.name}</span>
        </div>

        <div className="text-right tabular-nums shrink-0">
          <span className="font-extrabold text-[15px] text-[#F8FAFC]">
            {(ev.baseWinRate * 100).toFixed(1)}%
          </span>
          <span
            className={`ml-1 text-xs font-bold ${
              ev.deltaWinRate >= 0 ? 'text-[#3CE6D8]' : 'text-rose-400'
            }`}
          >
            {ev.deltaWinRate >= 0 ? '+' : ''}
            {(ev.deltaWinRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span
          className={`font-semibold truncate ${
            isBest ? 'text-[#5CF2E5]' : isTrap ? 'text-rose-300' : 'text-[#F3DC9E]'
          }`}
        >
          {ev.primaryTag}
        </span>

        {ev.pivotItem && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-black/55 text-[#F3DC9E] font-medium shrink-0">
            配装: {ev.pivotItem.name}
          </span>
        )}
      </div>

      {densityMode === 'detailed' && ev.situationReasons[0] && (
        <div className="text-[11.5px] text-[#E2E8F0] truncate">{ev.situationReasons[0]}</div>
      )}
    </div>
  )
}
