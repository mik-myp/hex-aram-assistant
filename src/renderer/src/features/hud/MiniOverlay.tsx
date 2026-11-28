import React, { useState } from 'react'
import {
  clamp,
  computeGameAugmentCardBoxesForCount,
  resolveClientEffectiveRect,
  SIMULATOR_RESOLUTION_PRESETS
} from '@shared/layoutGeometry'
import type { HudDensityMode, OverlayOpacityMode } from '@shared/types'
import { HudSimulatorDock } from './components/HudSimulatorDock'
import { HudSimulatorUnderlay } from './components/HudSimulatorUnderlay'
import { HudSpatialBadgesLayer } from './components/HudSpatialBadgesLayer'
import { HudTopControlBar } from './components/HudTopControlBar'
import { useHudSession, type CustomScreenshotState } from './useHudSession'

export const MiniOverlay: React.FC = () => {
  const session = useHudSession()
  const [showWireframe, setShowWireframe] = useState<boolean>(true)
  const [customScreenshot, setCustomScreenshot] = useState<CustomScreenshotState | null>(null)

  const { gameState, prefs, heroes, augments, items, benchList, advice, hostSize } = session
  if (!gameState) return null

  const isSimulator = gameState.connectionMode === 'simulator'
  const isChampSelect =
    gameState.connectionMode === 'lcu-champ-select' ||
    (isSimulator && gameState.simulatorScene === 'champ-select')
  const hasThreePick =
    gameState.cardSlots.length > 0 && (advice?.situationalCandidates.length ?? 0) > 0

  const enableBenchBadges = prefs?.enableBenchBadges ?? true
  const enableThreePickBadges = prefs?.enableThreePickBadges ?? true
  const enableFountainStrip = prefs?.enableFountainStrip ?? true
  const userHudScale = prefs?.hudScale ?? 1
  const opacityMode: OverlayOpacityMode = prefs?.overlayOpacity || 'solid'
  const densityMode: HudDensityMode = prefs?.hudDensity || 'detailed'
  const badgeAtBottom = prefs?.badgePosition === 'bottom'
  const offsetX = prefs?.hudOffsetX ?? 0
  const offsetY = prefs?.hudOffsetY ?? 0

  const showShoppingDrawer =
    enableFountainStrip && (Boolean(gameState.isDead && !hasThreePick) || session.hoveredBar)

  const activePreset =
    SIMULATOR_RESOLUTION_PRESETS.find((p) => p.id === session.simPresetId) || null
  let viewportW = hostSize.w
  let viewportH = hostSize.h
  let stageFitScale = 1

  if (isSimulator) {
    if (customScreenshot) {
      viewportW = customScreenshot.width
      viewportH = customScreenshot.height
    } else if (activePreset) {
      viewportW = activePreset.width
      viewportH = activePreset.height
    }
    const availW = Math.max(320, hostSize.w - (activePreset || customScreenshot ? 40 : 0))
    const availH = Math.max(240, hostSize.h - (activePreset || customScreenshot ? 118 : 0))
    if (activePreset || customScreenshot) {
      stageFitScale = Math.min(availW / viewportW, availH / viewportH, 1)
    }
  }

  const offerCardCount: 2 | 3 | 4 =
    gameState.cardSlots[0]?.totalSlots ??
    (gameState.cardSlots.length >= 4 || gameState.cardSlots.some((s) => s.slotIndex >= 3)
      ? 4
      : gameState.cardSlots.length === 2
        ? 2
        : 3)
  const clientEffective = resolveClientEffectiveRect(viewportW, viewportH)
  const cardBoxes = computeGameAugmentCardBoxesForCount(
    viewportW,
    viewportH,
    offerCardCount,
    offsetX,
    offsetY
  )
  const hudUiScale =
    clamp((isChampSelect ? clientEffective.height : viewportH) / 1080, 0.66, 2.15) * userHudScale

  const topBarTopPx = isChampSelect
    ? Math.round(clientEffective.y + clientEffective.height * 0.158)
    : Math.round(8 * hudUiScale)
  const topBarCenterX = isChampSelect
    ? Math.round(clientEffective.x + clientEffective.width / 2)
    : Math.round(viewportW / 2)

  return (
    <div
      className={`hud-crisp-text w-screen h-screen pointer-events-none relative overflow-hidden select-none text-xs ${
        isSimulator ? 'bg-[#04070E]/88 backdrop-blur-[2px]' : 'bg-transparent'
      }`}
    >
      <div
        style={
          isSimulator && (activePreset || customScreenshot)
            ? {
                width: `${viewportW}px`,
                height: `${viewportH}px`,
                left: '50%',
                top: 'calc(50% - 46px)',
                transform: `translate(-50%, -50%) scale(${stageFitScale})`,
                transformOrigin: 'center center'
              }
            : {
                width: `${viewportW}px`,
                height: `${viewportH}px`,
                left: 0,
                top: 0
              }
        }
        className={`absolute overflow-hidden ${
          isSimulator
            ? 'bg-[#070E1A] shadow-[0_0_60px_rgba(0,0,0,0.85)] ring-2 ring-[#C8AA6E]/45 rounded-sm'
            : ''
        }`}
      >
        {isSimulator && (
          <HudSimulatorUnderlay
            viewportW={viewportW}
            viewportH={viewportH}
            hudUiScale={hudUiScale}
            offsetX={offsetX}
            offsetY={offsetY}
            isChampSelect={isChampSelect}
            hasThreePick={hasThreePick}
            showWireframe={showWireframe}
            customScreenshot={customScreenshot}
            clientEffective={clientEffective}
            cardBoxes={cardBoxes}
            gameState={gameState}
            heroes={heroes}
            augments={augments}
            benchList={benchList}
            enterInteractive={session.enterInteractive}
            leaveInteractive={session.leaveInteractive}
          />
        )}

        <HudTopControlBar
          heroId={session.heroId}
          currentHero={heroes[session.heroId]}
          heroes={heroes}
          gameState={gameState}
          augments={augments}
          items={items}
          advice={advice}
          isChampSelect={isChampSelect}
          isSimulator={isSimulator}
          showShoppingDrawer={showShoppingDrawer}
          hoveredBar={session.hoveredBar}
          topBarCenterX={topBarCenterX}
          topBarTopPx={topBarTopPx}
          hudUiScale={hudUiScale}
          opacityMode={opacityMode}
          densityMode={densityMode}
          ocrBusy={session.ocrBusy}
          setOcrBusy={session.setOcrBusy}
          aiBriefBusy={session.aiBriefBusy}
          setAiBriefBusy={session.setAiBriefBusy}
          aiBrief={session.aiBrief}
          setAiBrief={session.setAiBrief}
          copiedItemTip={session.copiedItemTip}
          showAugPicker={session.showAugPicker}
          setShowAugPicker={session.setShowAugPicker}
          augSearchQuery={session.augSearchQuery}
          setAugSearchQuery={session.setAugSearchQuery}
          augSearchResults={session.augSearchResults}
          enterInteractive={session.enterInteractive}
          leaveInteractive={session.leaveInteractive}
          onCopyShopItemName={session.handleCopyShopItemName}
        />

        <HudSpatialBadgesLayer
          isChampSelect={isChampSelect}
          enableBenchBadges={enableBenchBadges}
          hasThreePick={hasThreePick}
          enableThreePickBadges={enableThreePickBadges}
          benchList={benchList}
          heroes={heroes}
          augments={augments}
          gameState={gameState}
          advice={advice}
          viewportW={viewportW}
          viewportH={viewportH}
          offsetX={offsetX}
          offsetY={offsetY}
          userHudScale={userHudScale}
          hudUiScale={hudUiScale}
          badgeAtBottom={badgeAtBottom}
          opacityMode={opacityMode}
          densityMode={densityMode}
          clientEffective={clientEffective}
          cardBoxes={cardBoxes}
        />
      </div>

      {isSimulator && (
        <HudSimulatorDock
          gameState={gameState}
          heroes={heroes}
          isChampSelect={isChampSelect}
          hostSize={hostSize}
          simPresetId={session.simPresetId}
          setSimPresetId={session.setSimPresetId}
          showWireframe={showWireframe}
          setShowWireframe={setShowWireframe}
          customScreenshot={customScreenshot}
          setCustomScreenshot={setCustomScreenshot}
          setOcrBusy={session.setOcrBusy}
          offsetX={offsetX}
          offsetY={offsetY}
          enterInteractive={session.enterInteractive}
          leaveInteractive={session.leaveInteractive}
        />
      )}
    </div>
  )
}
