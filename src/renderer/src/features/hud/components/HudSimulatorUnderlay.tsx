import React from 'react'
import { Dices, MousePointerClick } from 'lucide-react'
import {
  clamp,
  CLIENT_BENCH_MAX_SLOTS,
  computeClientBenchSlotLayout,
  computeClientTeamSlotLayouts,
  type GameAugmentCardBox
} from '@shared/layoutGeometry'
import type {
  AugmentMeta,
  BenchSuggestion,
  GameLiveState,
  HeroMeta,
  WindowBoundsRect
} from '@shared/types'
import type { CustomScreenshotState } from '../useHudSession'

export const HudSimulatorUnderlay: React.FC<{
  viewportW: number
  viewportH: number
  hudUiScale: number
  offsetX: number
  offsetY: number
  isChampSelect: boolean
  hasThreePick: boolean
  showWireframe: boolean
  customScreenshot: CustomScreenshotState | null
  clientEffective: WindowBoundsRect
  cardBoxes: GameAugmentCardBox[]
  gameState: GameLiveState
  heroes: Record<string, HeroMeta>
  augments: Record<string, AugmentMeta>
  benchList: BenchSuggestion[]
  enterInteractive: () => void
  leaveInteractive: () => void
}> = ({
  viewportW,
  viewportH,
  hudUiScale,
  offsetX,
  offsetY,
  isChampSelect,
  hasThreePick,
  showWireframe,
  customScreenshot,
  clientEffective,
  cardBoxes,
  gameState,
  heroes,
  augments,
  benchList,
  enterInteractive,
  leaveInteractive
}) => {
  const benchBySlot = new Map(benchList.map((b) => [b.benchIndex, b]))
  const teamSlotLayouts = isChampSelect ? computeClientTeamSlotLayouts(viewportW, viewportH) : []

  const handleSimPickCard = (augId: string): void => {
    const nextPicked = gameState.pickedAugmentIds.includes(augId)
      ? gameState.pickedAugmentIds
      : [...gameState.pickedAugmentIds, augId].slice(-6)
    window.hexbuddy.updateAugments({
      pickedAugmentIds: nextPicked,
      candidateAugmentIds: []
    })
  }

  return (
    <>
      {customScreenshot && (
        <img
          src={customScreenshot.url}
          alt="Real Game Screenshot Underlay"
          className="absolute inset-0 w-full h-full object-fill pointer-events-none"
        />
      )}

      {showWireframe && (
        <div className="absolute inset-0 pointer-events-none">
          <div
            style={{
              transform: `scale(${clamp(hudUiScale, 0.8, 1.8)})`,
              transformOrigin: 'top right'
            }}
            className="absolute top-2.5 right-3 z-10 px-2.5 py-1 rounded bg-[#091322]/90 border border-[#0AC8B9]/45 text-[11px] text-[#5CF2E5] font-mono"
          >
            模拟客户区 {viewportW}×{viewportH} ({(viewportW / viewportH).toFixed(2)}:1) · UI缩放{' '}
            {hudUiScale.toFixed(2)}x
          </div>

          {isChampSelect && (
            <>
              {(clientEffective.x > 0 || clientEffective.y > 0) && (
                <div
                  style={{
                    left: `${clientEffective.x}px`,
                    top: `${clientEffective.y}px`,
                    width: `${clientEffective.width}px`,
                    height: `${clientEffective.height}px`
                  }}
                  className="absolute border-2 border-dashed border-amber-400/50 bg-[#0A1324]/40"
                >
                  <span className="absolute top-1.5 left-2 text-[11px] text-amber-300 bg-black/70 px-1.5 py-0.5 rounded">
                    LOL 客户端恒定 16:9 内嵌区域 ({clientEffective.width}×{clientEffective.height})
                  </span>
                </div>
              )}

              {Array.from({ length: CLIENT_BENCH_MAX_SLOTS }, (_, slotIdx) => {
                const slot = computeClientBenchSlotLayout(
                  viewportW,
                  viewportH,
                  slotIdx,
                  offsetX,
                  offsetY
                )
                const sug = benchBySlot.get(slotIdx)
                const hero = sug ? heroes[sug.heroId] : null
                return (
                  <div
                    key={`wire-bench-${slotIdx}`}
                    style={{
                      left: `${slot.portrait.x}px`,
                      top: `${slot.portrait.y}px`,
                      width: `${slot.portrait.width}px`,
                      height: `${slot.portrait.height}px`
                    }}
                    className={`absolute rounded border ${
                      hero
                        ? 'border-2 border-[#C8AA6E] bg-[#0F1B2E]/85 shadow-lg'
                        : 'border border-dashed border-[#0AC8B9]/35 bg-[#0A1526]/45'
                    } flex flex-col items-center justify-center overflow-hidden`}
                  >
                    {hero && !customScreenshot ? (
                      <>
                        <img
                          src={hero.avatarUrl}
                          alt={hero.name}
                          className="w-full h-full object-cover"
                        />
                        <span
                          style={{ fontSize: `${Math.max(9, Math.round(10 * slot.uiScale))}px` }}
                          className="absolute bottom-0 inset-x-0 bg-black/75 text-center text-[#F0E6D2] leading-tight py-0.5 truncate"
                        >
                          {hero.name}
                        </span>
                      </>
                    ) : (
                      <span
                        style={{ fontSize: `${Math.max(8, Math.round(10 * slot.uiScale))}px` }}
                        className="text-[#5CF2E5]/75 font-mono text-center leading-tight"
                      >
                        替补#{slotIdx + 1}
                      </span>
                    )}
                  </div>
                )
              })}

              {teamSlotLayouts.map((tl) => {
                const allyId = gameState.allyHeroIds[tl.slotIndex]
                const ah = allyId ? heroes[allyId] : null
                const isMe = allyId === gameState.myHeroId && tl.slotIndex === 0
                return (
                  <div
                    key={`wire-team-${tl.slotIndex}`}
                    style={{
                      left: `${tl.portrait.x}px`,
                      top: `${tl.portrait.y}px`,
                      width: `${tl.portrait.width}px`,
                      height: `${tl.portrait.height}px`
                    }}
                    className={`absolute rounded-full border ${
                      isMe
                        ? 'border-2 border-[#C8AA6E] bg-[#132238]/85'
                        : 'border border-dashed border-[#C8AA6E]/45 bg-[#0C1626]/65'
                    } flex items-center justify-center overflow-hidden`}
                  >
                    {ah && !customScreenshot ? (
                      <img
                        src={ah.avatarUrl}
                        alt={ah.name}
                        className="w-full h-full object-cover opacity-90"
                      />
                    ) : (
                      <span className="text-[10px] text-[#C8AA6E]/80 font-mono">
                        {tl.slotIndex + 1}L
                      </span>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {hasThreePick &&
            gameState.cardSlots.map((slot) => {
              const box = cardBoxes[slot.slotIndex]
              const meta = augments[slot.augmentId]
              if (!box || !meta) return null
              return (
                <React.Fragment key={`wire-card-${slot.slotIndex}`}>
                  <div
                    onMouseEnter={enterInteractive}
                    onMouseLeave={leaveInteractive}
                    style={{
                      left: `${box.cardFrame.x}px`,
                      top: `${box.cardFrame.y}px`,
                      width: `${box.cardFrame.width}px`,
                      height: `${box.cardFrame.height}px`
                    }}
                    className={`absolute rounded-lg border-2 pointer-events-auto ${
                      customScreenshot
                        ? 'border-dashed border-[#0AC8B9]/75 bg-transparent'
                        : 'border-[#C8AA6E]/65 bg-gradient-to-b from-[#101B2D]/90 via-[#0B1322]/92 to-[#09101C]/95 shadow-2xl'
                    }`}
                  >
                    {!customScreenshot && (
                      <>
                        <div
                          style={{ top: '9%', height: '24%' }}
                          className="absolute inset-x-0 flex flex-col items-center justify-center"
                        >
                          {meta.iconUrl && (
                            <img
                              src={meta.iconUrl}
                              alt=""
                              style={{
                                width: `${Math.round(64 * box.uiScale)}px`,
                                height: `${Math.round(64 * box.uiScale)}px`
                              }}
                              className="rounded-lg bg-black/60 p-1.5 border border-[#C8AA6E]/45"
                            />
                          )}
                        </div>

                        <div
                          style={{ top: '53%', bottom: '5%' }}
                          className="absolute inset-x-4 flex flex-col items-center justify-between text-center"
                        >
                          <p
                            style={{ fontSize: `${Math.max(10, Math.round(13 * box.uiScale))}px` }}
                            className="text-[#94A3B8] line-clamp-3 leading-snug"
                          >
                            {meta.desc}
                          </p>
                          <button
                            onClick={() => handleSimPickCard(meta.id)}
                            style={{
                              fontSize: `${Math.max(10, Math.round(12 * box.uiScale))}px`,
                              padding: `${Math.round(5 * box.uiScale)}px ${Math.round(12 * box.uiScale)}px`
                            }}
                            className="rounded bg-[#C8AA6E] hover:bg-[#E2C992] text-[#070B12] font-bold flex items-center gap-1 cursor-pointer shadow"
                          >
                            <MousePointerClick className="w-3.5 h-3.5" />
                            <span>模拟在游戏内选这张卡</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      left: `${box.titleBand.x}px`,
                      top: `${box.titleBand.y}px`,
                      width: `${box.titleBand.width}px`,
                      height: `${box.titleBand.height}px`
                    }}
                    className="absolute border border-dashed border-[#0AC8B9] bg-[#0AC8B9]/12 flex items-center justify-center px-2"
                  >
                    {!customScreenshot && (
                      <span
                        style={{ fontSize: `${Math.max(11, Math.round(17 * box.uiScale))}px` }}
                        className="font-bold text-[#F0E6D2] truncate"
                      >
                        {meta.name}
                      </span>
                    )}
                  </div>

                  <button
                    onMouseEnter={enterInteractive}
                    onMouseLeave={leaveInteractive}
                    onClick={() => window.hexbuddy.rerollSimSlot(slot.slotIndex)}
                    style={{
                      left: `${box.rerollRect.x}px`,
                      top: `${box.rerollRect.y}px`,
                      width: `${box.rerollRect.width}px`,
                      height: `${box.rerollRect.height}px`,
                      fontSize: `${Math.max(10, Math.round(13 * box.uiScale))}px`
                    }}
                    title="点击模拟游戏内刷新该槽位海克斯"
                    className={`pointer-events-auto absolute rounded border flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      customScreenshot
                        ? 'border-dashed border-amber-400/80 bg-black/35 text-amber-200'
                        : 'border-[#C8AA6E]/60 bg-[#111D30]/95 hover:bg-[#192B46] text-[#E2C992] shadow-lg'
                    }`}
                  >
                    <Dices className="w-4 h-4 text-[#0AC8B9]" />
                    <span>刷新槽位 #{slot.slotIndex + 1}</span>
                  </button>
                </React.Fragment>
              )
            })}
        </div>
      )}
    </>
  )
}
