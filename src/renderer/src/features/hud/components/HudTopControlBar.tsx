import React from 'react'
import { BookOpen, Camera, Loader2, Plus, Search, X } from 'lucide-react'
import type {
  AugmentMeta,
  GameLiveState,
  HeroMeta,
  HudDensityMode,
  ItemMeta,
  OverlayOpacityMode,
  TacticalAdvice
} from '@shared/types'
import { PLAYSTYLE_MODES, resolveTopPillSurface } from '../hudConstants'
import { HudFountainRoadmap } from './HudFountainRoadmap'

interface HudTopControlBarProps {
  heroId: string
  currentHero?: HeroMeta
  gameState: GameLiveState
  augments: Record<string, AugmentMeta>
  items: Record<string, ItemMeta>
  advice: TacticalAdvice | null
  isChampSelect: boolean
  isSimulator: boolean
  showShoppingDrawer: boolean
  hoveredBar: boolean
  topBarCenterX: number
  topBarTopPx: number
  hudUiScale: number
  opacityMode: OverlayOpacityMode
  densityMode: HudDensityMode
  ocrBusy: boolean
  setOcrBusy: (v: boolean) => void
  aiBriefBusy: boolean
  setAiBriefBusy: (v: boolean) => void
  aiBrief: string | null
  setAiBrief: (v: string | null) => void
  copiedItemTip: string | null
  showAugPicker: boolean
  setShowAugPicker: React.Dispatch<React.SetStateAction<boolean>>
  augSearchQuery: string
  setAugSearchQuery: (q: string) => void
  augSearchResults: AugmentMeta[]
  enterInteractive: () => void
  leaveInteractive: () => void
  onCopyShopItemName: (name: string) => void
}

export const HudTopControlBar: React.FC<HudTopControlBarProps> = ({
  heroId,
  currentHero,
  gameState,
  augments,
  items,
  advice,
  isChampSelect,
  isSimulator,
  showShoppingDrawer,
  hoveredBar,
  topBarCenterX,
  topBarTopPx,
  hudUiScale,
  opacityMode,
  densityMode,
  ocrBusy,
  setOcrBusy,
  aiBriefBusy,
  setAiBriefBusy,
  aiBrief,
  setAiBrief,
  copiedItemTip,
  showAugPicker,
  setShowAugPicker,
  augSearchQuery,
  setAugSearchQuery,
  augSearchResults,
  enterInteractive,
  leaveInteractive,
  onCopyShopItemName
}) => {
  const nextStep = advice?.immediateNextItem
  const nextItem = nextStep ? items[nextStep.itemId] : null

  return (
    <div
      onMouseEnter={enterInteractive}
      onMouseLeave={leaveInteractive}
      style={{
        left: `${topBarCenterX}px`,
        top: `${topBarTopPx}px`,
        transform: `translateX(-50%) scale(${hudUiScale})`,
        transformOrigin: 'top center'
      }}
      className="pointer-events-auto absolute z-40 flex flex-col items-center whitespace-nowrap"
    >
      <div
        className={`px-3 py-1.5 rounded-full border flex items-center gap-2.5 transition-all shadow-xl ${resolveTopPillSurface(
          opacityMode,
          hoveredBar || gameState.isDead || isSimulator
        )}`}
      >
        {currentHero && (
          <div className="flex items-center gap-1.5 pr-2 border-r border-white/15">
            <img
              src={currentHero.avatarUrl}
              alt=""
              className="w-6 h-6 rounded-full border border-[#C8AA6E]/60"
            />
            <span className="font-bold text-[#F0E6D2]">{currentHero.name}</span>
            {currentHero.skillOrder && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C8AA6E]/20 text-[#E2C992]">
                {currentHero.skillOrder}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-0.5 bg-black/45 p-0.5 rounded-full border border-white/10">
          {PLAYSTYLE_MODES.map((pm) => {
            const active = gameState.playstyleMode === pm.key
            return (
              <button
                key={pm.key}
                onClick={() => window.hexbuddy.setPlaystyleMode(pm.key)}
                title={pm.tip}
                className={`px-2 py-0.5 rounded-full text-[11px] cursor-pointer transition whitespace-nowrap ${
                  active
                    ? 'bg-[#C8AA6E] text-[#070B12] font-bold shadow'
                    : 'text-[#94A3B8] hover:text-[#F0E6D2]'
                }`}
              >
                {pm.short}
              </button>
            )
          })}
        </div>

        {nextItem && nextStep && !isChampSelect && (
          <div className="flex items-center gap-1.5 pl-1 border-l border-white/15">
            <span className="text-[11px] text-[#94A3B8]">下一件:</span>
            <img
              src={nextItem.iconUrl}
              alt=""
              className="w-5 h-5 rounded border border-[#C8AA6E]/40"
            />
            <span className="font-semibold text-[#F0E6D2]">{nextItem.name}</span>
            {nextStep.affordableNow ? (
              <span className="px-1.5 py-0.5 rounded bg-[#0AC8B9]/25 text-[#5CF2E5] border border-[#0AC8B9]/45 text-[10px] font-bold">
                钱已够!
              </span>
            ) : (
              <span className="text-[10px] text-[#94A3B8] tabular-nums">
                差{nextStep.goldRemaining}金
              </span>
            )}
          </div>
        )}

        {!isChampSelect && (
          <div className="flex items-center gap-1 pl-1 border-l border-white/15 relative">
            {gameState.pickedAugmentIds.map((aid) => {
              const am = augments[aid]
              if (!am) return null
              return (
                <button
                  key={aid}
                  onClick={() =>
                    window.hexbuddy.updateAugments({
                      pickedAugmentIds: gameState.pickedAugmentIds.filter((x) => x !== aid)
                    })
                  }
                  title={`已记录：${am.name}（点击移除）`}
                  className="w-5 h-5 rounded bg-black/50 border border-[#C8AA6E]/40 overflow-hidden cursor-pointer hover:border-rose-400"
                >
                  {am.iconUrl && <img src={am.iconUrl} alt="" className="w-full h-full" />}
                </button>
              )
            })}

            {gameState.pickedAugmentIds.length < 4 && (
              <button
                onClick={() => setShowAugPicker((v) => !v)}
                title="手动补录或修正本局已拿海克斯（支持拼音如 zghs）"
                className="w-5 h-5 rounded bg-white/8 hover:bg-white/15 border border-dashed border-[#C8AA6E]/45 flex items-center justify-center text-[#E2C992] cursor-pointer"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}

            {showAugPicker && (
              <div className="absolute top-8 right-0 w-56 p-2 rounded-lg bg-[#09101D]/98 border border-[#C8AA6E]/55 shadow-2xl z-50 space-y-1.5 whitespace-normal">
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
                <div className="max-h-44 overflow-y-auto space-y-0.5">
                  {augSearchResults.map((am) => {
                    const already = gameState.pickedAugmentIds.includes(am.id)
                    return (
                      <button
                        key={am.id}
                        disabled={already}
                        onClick={() => {
                          window.hexbuddy.updateAugments({
                            pickedAugmentIds: [...gameState.pickedAugmentIds, am.id].slice(-4)
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
        )}

        <div className="flex items-center gap-1 pl-1 border-l border-white/15">
          <button
            onClick={async () => {
              setOcrBusy(true)
              await window.hexbuddy.captureScreenOcr()
              setOcrBusy(false)
            }}
            title="手动重识三选一 (Alt+S)"
            className="p-1 rounded-full hover:bg-white/10 text-[#0AC8B9] cursor-pointer"
          >
            {ocrBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => window.hexbuddy.showMainWindow()}
            title="打开攻略查阅词典"
            className="p-1 rounded-full hover:bg-white/10 text-[#C8C1B2] hover:text-white cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              leaveInteractive()
              window.hexbuddy.toggleMiniOverlay(false)
            }}
            title="隐藏原位 HUD (Alt+H)"
            className="p-1 rounded-full hover:bg-white/10 text-[#94A3B8] hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showShoppingDrawer && !isChampSelect && advice && (
        <HudFountainRoadmap
          heroId={heroId}
          currentGold={gameState.currentGold}
          advice={advice}
          items={items}
          opacityMode={opacityMode}
          densityMode={densityMode}
          copiedItemTip={copiedItemTip}
          aiBriefBusy={aiBriefBusy}
          setAiBriefBusy={setAiBriefBusy}
          aiBrief={aiBrief}
          setAiBrief={setAiBrief}
          onCopyShopItemName={onCopyShopItemName}
        />
      )}
    </div>
  )
}
