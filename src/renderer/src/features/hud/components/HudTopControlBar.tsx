import React from 'react'
import { BookOpen, Camera, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import type {
  AugmentMeta,
  GameLiveState,
  HeroMeta,
  HudDensityMode,
  ItemMeta,
  OverlayOpacityMode,
  TacticalAdvice
} from '@shared/types'
import { resolveTopPillSurface } from '../hudConstants'
import { HudFountainRoadmap } from './HudFountainRoadmap'

interface HudTopControlBarProps {
  heroId: string
  currentHero?: HeroMeta
  heroes: Record<string, HeroMeta>
  gameState: GameLiveState
  augments: Record<string, AugmentMeta>
  items: Record<string, ItemMeta>
  advice: TacticalAdvice | null
  isChampSelect: boolean
  isSimulator: boolean
  showShoppingDrawer: boolean
  onToggleShoppingDrawer: () => void
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
  heroes,
  gameState,
  augments,
  items,
  advice,
  isChampSelect,
  isSimulator,
  showShoppingDrawer,
  onToggleShoppingDrawer,
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
      style={{
        left: `${topBarCenterX}px`,
        top: `${topBarTopPx}px`,
        transform: `translateX(-50%) scale(${hudUiScale})`,
        transformOrigin: 'top center'
      }}
      className="pointer-events-none absolute z-40 flex flex-col items-center whitespace-nowrap"
    >
      <div
        data-hud-interactive="1"
        onMouseEnter={enterInteractive}
        onMouseLeave={leaveInteractive}
        className={`pointer-events-auto px-3 py-1 rounded-full border flex items-center gap-2 transition-all shadow-xl ${resolveTopPillSurface(
          opacityMode,
          hoveredBar || gameState.isDead || isSimulator || showShoppingDrawer
        )}`}
      >
        {currentHero && (
          <div className="flex items-center gap-1.5 pr-2 border-r border-white/15">
            <img
              src={currentHero.avatarUrl}
              alt=""
              className="w-5 h-5 rounded-full border border-[#C8AA6E]/60"
            />
            <span className="font-bold text-[#F0E6D2]">{currentHero.name}</span>
            {currentHero.skillOrder && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#C8AA6E]/20 text-[#E2C992]">
                {currentHero.skillOrder}
              </span>
            )}
          </div>
        )}

        {nextItem && nextStep && !isChampSelect && (
          <div className="flex items-center gap-1.5">
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

        <div className="flex items-center gap-1 pl-1.5 border-l border-white/15">
          {!isChampSelect && advice && (
            <button
              type="button"
              onClick={onToggleShoppingDrawer}
              title={showShoppingDrawer ? '收起出装与战局面板' : '点击展开出装、流派速切与敌方威胁雷达'}
              className={`px-2 py-0.5 rounded-full text-[11px] flex items-center gap-0.5 cursor-pointer transition ${
                showShoppingDrawer
                  ? 'bg-[#C8AA6E]/25 text-[#F3DC9E] border border-[#C8AA6E]/50'
                  : 'bg-white/8 hover:bg-white/15 text-[#CBD5E1]'
              }`}
            >
              {showShoppingDrawer ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  <span>收起</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  <span>出装</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={async () => {
              setOcrBusy(true)
              await window.hexbuddy.captureScreenOcr()
              setOcrBusy(false)
            }}
            title="手动重识海克斯卡片 (Alt+S)"
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
          heroes={heroes}
          augments={augments}
          items={items}
          pickedAugmentIds={gameState.pickedAugmentIds}
          enemyCount={gameState.enemyHeroIds.length}
          opacityMode={opacityMode}
          densityMode={densityMode}
          copiedItemTip={copiedItemTip}
          aiBriefBusy={aiBriefBusy}
          setAiBriefBusy={setAiBriefBusy}
          aiBrief={aiBrief}
          setAiBrief={setAiBrief}
          showAugPicker={showAugPicker}
          setShowAugPicker={setShowAugPicker}
          augSearchQuery={augSearchQuery}
          setAugSearchQuery={setAugSearchQuery}
          augSearchResults={augSearchResults}
          onCollapse={onToggleShoppingDrawer}
          enterInteractive={enterInteractive}
          leaveInteractive={leaveInteractive}
          onCopyShopItemName={onCopyShopItemName}
        />
      )}
    </div>
  )
}
