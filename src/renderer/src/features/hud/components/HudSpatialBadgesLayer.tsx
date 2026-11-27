import React from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  computeClientBenchSlotLayout,
  type computeGameAugmentCardBoxes
} from '@shared/layoutGeometry'
import type {
  AugmentMeta,
  BenchSuggestion,
  GameLiveState,
  HeroMeta,
  HudDensityMode,
  OverlayOpacityMode,
  TacticalAdvice,
  WindowBoundsRect
} from '@shared/types'
import { TIER_STYLE } from '@/components/TierRadar'
import { resolveBenchBadgeSurface } from '../hudConstants'
import { SpatialCardBadge } from './SpatialCardBadge'

interface HudSpatialBadgesLayerProps {
  isChampSelect: boolean
  enableBenchBadges: boolean
  hasThreePick: boolean
  enableThreePickBadges: boolean
  benchList: BenchSuggestion[]
  heroes: Record<string, HeroMeta>
  augments: Record<string, AugmentMeta>
  gameState: GameLiveState
  advice: TacticalAdvice | null
  viewportW: number
  viewportH: number
  offsetX: number
  offsetY: number
  userHudScale: number
  hudUiScale: number
  badgeAtBottom: boolean
  opacityMode: OverlayOpacityMode
  densityMode: HudDensityMode
  clientEffective: WindowBoundsRect
  cardBoxes: ReturnType<typeof computeGameAugmentCardBoxes>
}

export const HudSpatialBadgesLayer: React.FC<HudSpatialBadgesLayerProps> = ({
  isChampSelect,
  enableBenchBadges,
  hasThreePick,
  enableThreePickBadges,
  benchList,
  heroes,
  augments,
  gameState,
  advice,
  viewportW,
  viewportH,
  offsetX,
  offsetY,
  userHudScale,
  hudUiScale,
  badgeAtBottom,
  opacityMode,
  densityMode,
  clientEffective,
  cardBoxes
}) => {
  const evalByAugId = new Map(
    (advice?.situationalCandidates || []).map((ev) => [ev.augmentId, ev])
  )

  return (
    <>
      {isChampSelect && enableBenchBadges && benchList.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-30">
          {benchList.map((sug) => {
            const h = heroes[sug.heroId]
            if (!h) return null
            const slot = computeClientBenchSlotLayout(
              viewportW,
              viewportH,
              sug.benchIndex,
              offsetX,
              offsetY
            )
            const isHot = sug.isFavorite || sug.deltaVsCurrent >= 0.02 || sug.tier === 'T0'
            const scaledSlotUi = slot.uiScale * userHudScale
            const tagFontPx = Math.max(9.5, Math.round(11 * scaledSlotUi))
            const wrFontPx = Math.max(10.5, Math.round(12 * scaledSlotUi))

            return (
              <div
                key={`bench-badge-${sug.heroId}-${sug.benchIndex}`}
                style={{
                  left: `${slot.centerX}px`,
                  top: `${slot.badgeTopY}px`,
                  width: `${slot.badgeWidth}px`,
                  padding: `${Math.max(2, Math.round(3.5 * scaledSlotUi))}px ${Math.max(2, Math.round(4 * scaledSlotUi))}px`
                }}
                className={`absolute -translate-x-1/2 rounded border text-center shadow-xl ${resolveBenchBadgeSurface(
                  opacityMode,
                  isHot
                )}`}
              >
                <div
                  style={{ fontSize: `${tagFontPx}px` }}
                  className={`font-bold truncate leading-tight ${
                    isHot ? 'text-[#5CF2E5]' : 'text-[#E2C992]'
                  }`}
                >
                  {sug.shortTag}
                </div>
                <div
                  style={{ fontSize: `${wrFontPx}px` }}
                  className="font-extrabold text-[#F0E6D2] leading-tight mt-0.5 tabular-nums"
                >
                  {(sug.winRate * 100).toFixed(1)}%
                </div>
                {densityMode === 'detailed' && (
                  <div
                    style={{ fontSize: `${Math.max(8, tagFontPx - 1)}px` }}
                    className={`font-semibold leading-tight tabular-nums ${
                      sug.deltaVsCurrent >= 0 ? 'text-[#0AC8B9]' : 'text-rose-400'
                    }`}
                  >
                    {sug.deltaVsCurrent >= 0 ? '+' : ''}
                    {(sug.deltaVsCurrent * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            )
          })}

          <div
            style={{
              left: `${Math.round(clientEffective.x + (192 / 1920) * clientEffective.width)}px`,
              top: `${Math.round(clientEffective.y + (260 / 1080) * clientEffective.height)}px`,
              transform: `scale(${hudUiScale})`,
              transformOrigin: 'top left'
            }}
            className="absolute bg-[#09101D]/92 border border-[#C8AA6E]/45 rounded-lg p-3 space-y-2 shadow-xl w-56"
          >
            <div className="text-[11px] font-bold text-[#E2C992]">我方阵容体检</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {gameState.allyHeroIds.map((hid, i) => {
                const ah = heroes[hid]
                if (!ah) return null
                return (
                  <div
                    key={`${hid}-${i}`}
                    className="flex items-center gap-1 bg-black/45 px-1.5 py-0.5 rounded"
                  >
                    <img src={ah.avatarUrl} alt="" className="w-5 h-5 rounded" />
                    <span className="text-[10px] text-[#F0E6D2]">{ah.name}</span>
                    <span className={`text-[9px] px-1 rounded border ${TIER_STYLE[ah.tier]}`}>
                      {ah.tier}
                    </span>
                  </div>
                )
              })}
            </div>
            {advice?.threatRadar.allyDamageWarning && (
              <div className="text-[11px] text-amber-300 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{advice.threatRadar.allyDamageWarning}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {hasThreePick && enableThreePickBadges && (
        <div className="absolute inset-0 pointer-events-none z-30">
          {gameState.cardSlots.map((slot) => {
            const meta = augments[slot.augmentId]
            const ev = evalByAugId.get(slot.augmentId)
            const box = cardBoxes[slot.slotIndex]
            if (!meta || !ev || !box) return null

            const isBest = ev.isRecommendedPick
            const isTrap = ev.verdict === 'TRAP' || ev.hasConflict
            const anchorY = badgeAtBottom ? box.badgeBottomModeTopY : box.badgeTopModeBottomY
            const finalBadgeScale = box.uiScale * userHudScale

            return (
              <div
                key={`aug-badge-${slot.slotIndex}-${slot.augmentId}`}
                style={{
                  left: `${box.centerX}px`,
                  top: `${anchorY}px`,
                  width: '304px',
                  transform: badgeAtBottom
                    ? `translate(-50%, 0) scale(${finalBadgeScale})`
                    : `translate(-50%, -100%) scale(${finalBadgeScale})`,
                  transformOrigin: badgeAtBottom ? 'top center' : 'bottom center'
                }}
                className="absolute"
              >
                <SpatialCardBadge
                  meta={meta}
                  ev={ev}
                  isBest={isBest}
                  isTrap={isTrap}
                  opacityMode={opacityMode}
                  densityMode={densityMode}
                />
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
