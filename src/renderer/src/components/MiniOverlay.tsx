import React, { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Camera,
  Crown,
  Dices,
  ImagePlus,
  Loader2,
  Monitor,
  MousePointerClick,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  Sparkles,
  Trash2,
  Users,
  X
} from 'lucide-react'
import {
  clamp,
  CLIENT_BENCH_MAX_SLOTS,
  computeClientBenchSlotLayout,
  computeClientTeamSlotLayouts,
  computeGameAugmentCardBoxes,
  resolveClientEffectiveRect,
  SIMULATOR_RESOLUTION_PRESETS
} from '@shared/layoutGeometry'
import { TIER_STYLE } from './TierRadar'
import type {
  AugmentMeta,
  BenchSuggestion,
  GameLiveState,
  HeroMeta,
  ItemMeta,
  PlaystyleMode,
  TacticalAdvice,
  UserPreferences
} from '@shared/types'

const PLAYSTYLE_MODES: Array<{ key: PlaystyleMode; short: string; tip: string }> = [
  { key: 'steady', short: '⚖️ 稳健', tip: '综合高胜率核心与局势克制，求稳上分' },
  { key: 'counter', short: '🎯 针对', tip: '专治敌方人头大爹、重装坦克与强回血' },
  { key: 'team', short: '🤝 团队', tip: '缺前排补肉、全队偏AP自动转物理/减抗' },
  { key: 'yolo', short: '🔥 独爽', tip: '只顾自己爽！无视防守拉满核弹/暴击伤害上限' },
  { key: 'torment', short: '😈 折磨', tip: '无限灼烧减速或叠肉回血，不死恶心流' }
]

const TEN_BENCH_TEST_IDS = ['10', '223', '54', '222', '36', '14', '67', '238', '16', '51']

export const MiniOverlay: React.FC = () => {
  const [heroes, setHeroes] = useState<Record<string, HeroMeta>>({})
  const [augments, setAugments] = useState<Record<string, AugmentMeta>>({})
  const [items, setItems] = useState<Record<string, ItemMeta>>({})
  const [gameState, setGameState] = useState<GameLiveState | null>(null)
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [benchList, setBenchList] = useState<BenchSuggestion[]>([])
  const [advice, setAdvice] = useState<TacticalAdvice | null>(null)

  const [ocrBusy, setOcrBusy] = useState(false)
  const [aiBriefBusy, setAiBriefBusy] = useState(false)
  const [aiBrief, setAiBrief] = useState<string | null>(null)
  const [hoveredBar, setHoveredBar] = useState(false)
  const [copiedItemTip, setCopiedItemTip] = useState<string | null>(null)
  const [showAugPicker, setShowAugPicker] = useState(false)
  const [augSearchQuery, setAugSearchQuery] = useState('')
  const [augSearchResults, setAugSearchResults] = useState<AugmentMeta[]>([])

  // Live window dimensions (tracks real LoL window resize on Windows, or screen bounds in Simulator)
  const [hostSize, setHostSize] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080
  })

  // Calibration harness state (used in Simulator mode on macOS / desktop)
  const [simPresetId, setSimPresetId] = useState<string>('1920x1080')
  const [showWireframe, setShowWireframe] = useState<boolean>(true)
  const [customScreenshot, setCustomScreenshot] = useState<{
    url: string
    width: number
    height: number
    name: string
    ocrSummary?: string
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    document.body.style.backgroundColor = 'transparent'
    const onResize = (): void => {
      setHostSize({ w: window.innerWidth, h: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.hexbuddy.setHudInteractive(false)
    }
  }, [])

  useEffect(() => {
    window.hexbuddy.getHudBootstrap().then((boot) => {
      setHeroes(boot.heroes)
      setAugments(boot.augments)
      setItems(boot.items)
      setGameState(boot.gameState)
      setPrefs(boot.prefs)
    })

    const unsubState = window.hexbuddy.onGameStateUpdated((st) => {
      setGameState((prev) => {
        // Release decoded Blink PNG bitmaps when leaving Champ Select or closing 3-Pick cards!
        if (
          (prev?.connectionMode === 'lcu-champ-select' && st.connectionMode !== 'lcu-champ-select') ||
          ((prev?.cardSlots.length ?? 0) > 0 && st.cardSlots.length === 0)
        ) {
          setTimeout(() => window.hexbuddy.releaseRendererCache(), 500)
        }
        return st
      })
      setAiBrief(null)
    })
    const unsubPrefs = window.hexbuddy.onPrefsUpdated((p) => {
      setPrefs(p)
    })
    return () => {
      unsubState()
      unsubPrefs()
    }
  }, [])

  // Support optional automated resolution preset switching via custom DOM event / window helper for QA tests
  useEffect(() => {
    const w = window as unknown as {
      __setHexSimPreset?: (presetId: string, fullBench?: boolean) => void
    }
    w.__setHexSimPreset = (presetId: string, fullBench?: boolean) => {
      setSimPresetId(presetId)
      if (fullBench) {
        const validIds = TEN_BENCH_TEST_IDS.filter((id) => heroes[id])
        if (validIds.length > 0) {
          window.hexbuddy.updateAugments({ benchHeroIds: validIds })
        }
      }
    }
    return () => {
      delete w.__setHexSimPreset
    }
  }, [heroes])

  const heroId = gameState?.myHeroId || '1'
  const currentHero = heroes[heroId]

  useEffect(() => {
    if (!gameState) return
    window.hexbuddy.getTacticalAdvice(heroId).then(setAdvice)
    if (gameState.benchHeroIds.length > 0) {
      window.hexbuddy
        .getBenchSuggestions(gameState.myHeroId, gameState.allyHeroIds, gameState.benchHeroIds)
        .then(setBenchList)
    } else {
      setBenchList([])
    }
  }, [
    heroId,
    gameState?.playstyleMode,
    gameState?.enemyHeroIds,
    gameState?.allyHeroIds,
    gameState?.benchHeroIds,
    gameState?.pickedAugmentIds,
    gameState?.candidateAugmentIds,
    gameState?.currentItemIds,
    gameState?.currentGold,
    prefs?.favoriteHeroIds,
    prefs?.preferredRoles
  ])

  const enterInteractive = (): void => {
    setHoveredBar(true)
    window.hexbuddy.setHudInteractive(true)
  }

  const leaveInteractive = (): void => {
    setHoveredBar(false)
    setShowAugPicker(false)
    window.hexbuddy.setHudInteractive(false)
  }

  useEffect(() => {
    if (!showAugPicker) return
    window.hexbuddy.searchAugments(augSearchQuery).then(setAugSearchResults)
  }, [showAugPicker, augSearchQuery])

  const handleCopyShopItemName = (name: string): void => {
    window.hexbuddy.copyText(name)
    const msg = `✓ 已复制「${name}」，游戏商店 Ctrl+V 秒搜`
    setCopiedItemTip(msg)
    setTimeout(() => {
      setCopiedItemTip((prev) => (prev === msg ? null : prev))
    }, 2200)
  }

  if (!gameState) return null

  const isSimulator = gameState.connectionMode === 'simulator'
  const isChampSelect =
    gameState.connectionMode === 'lcu-champ-select' ||
    (isSimulator && gameState.simulatorScene === 'champ-select')
  const hasThreePick =
    gameState.cardSlots.length > 0 && (advice?.situationalCandidates.length ?? 0) > 0
  const showShoppingDrawer = Boolean(gameState.isDead && !hasThreePick) || hoveredBar

  const nextStep = advice?.immediateNextItem
  const nextItem = nextStep ? items[nextStep.itemId] : null
  const badgeAtBottom = prefs?.badgePosition === 'bottom'
  const offsetX = prefs?.hudOffsetX ?? 0
  const offsetY = prefs?.hudOffsetY ?? 0

  // =========================================================================
  // UNIFIED VIEWPORT RESOLUTION & STAGE FIT MATH
  // In real gameplay: 1:1 with hostSize (which matches LoL's DPI-aware client rect!).
  // In simulator: matches customScreenshot size OR selected resolution preset!
  // =========================================================================
  const activePreset = SIMULATOR_RESOLUTION_PRESETS.find((p) => p.id === simPresetId) || null
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

  // Exact spatial layouts computed from `(viewportW, viewportH)`
  const clientEffective = resolveClientEffectiveRect(viewportW, viewportH)
  const teamSlotLayouts = isChampSelect ? computeClientTeamSlotLayouts(viewportW, viewportH) : []
  const cardBoxes = computeGameAugmentCardBoxes(viewportW, viewportH, offsetX, offsetY)
  const hudUiScale = clamp(
    (isChampSelect ? clientEffective.height : viewportH) / 1080,
    0.66,
    2.15
  )

  const evalByAugId = new Map(
    (advice?.situationalCandidates || []).map((ev) => [ev.augmentId, ev])
  )
  const benchBySlot = new Map(benchList.map((b) => [b.benchIndex, b]))

  const handleSimPickCard = (augId: string): void => {
    const nextPicked = gameState.pickedAugmentIds.includes(augId)
      ? gameState.pickedAugmentIds
      : [...gameState.pickedAugmentIds, augId].slice(-4)
    window.hexbuddy.updateAugments({
      pickedAugmentIds: nextPicked,
      candidateAugmentIds: []
    })
  }

  const handleToggleFullBenchTest = (): void => {
    const isFull = gameState.benchHeroIds.length >= 8
    const targetIds = isFull
      ? TEN_BENCH_TEST_IDS.slice(0, 4).filter((id) => heroes[id])
      : TEN_BENCH_TEST_IDS.filter((id) => heroes[id])
    window.hexbuddy.updateAugments({ benchHeroIds: targetIds })
  }

  const handleNudgeOffset = (dx: number, dy: number, reset = false): void => {
    if (reset) {
      window.hexbuddy.savePrefs({ hudOffsetX: 0, hudOffsetY: 0 })
      return
    }
    const nx = Number(clamp(offsetX + dx, -8, 8).toFixed(1))
    const ny = Number(clamp(offsetY + dy, -8, 8).toFixed(1))
    window.hexbuddy.savePrefs({ hudOffsetX: nx, hudOffsetY: ny })
  }

  const handleUploadScreenshot = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const img = new Image()
      img.onload = async () => {
        const w = img.naturalWidth || 1920
        const h = img.naturalHeight || 1080
        setCustomScreenshot({
          url: dataUrl,
          width: w,
          height: h,
          name: file.name,
          ocrSummary: '正在执行窄带标题 OCR 识别...'
        })
        // Automatically run real OCR against the uploaded screenshot!
        setOcrBusy(true)
        const ocrRes = await window.hexbuddy.recognizeImageOcr(dataUrl)
        setOcrBusy(false)
        setCustomScreenshot((prev) =>
          prev
            ? {
                ...prev,
                ocrSummary:
                  ocrRes.matchedAugmentIds.length > 0
                    ? `OCR 识别命中 ${ocrRes.matchedAugmentIds.length} 张海克斯 (${ocrRes.elapsedMs}ms)`
                    : `未检出三选一文字（可切至对应选人/三选一场景比对坐标框）`
              }
            : null
        )
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Top Control Pill Y position:
  // In-Game: `8px * scale` at top-center sky.
  // Champ Select: `15.8%` of client height — cleanly BELOW the 10 Bench Portraits (1.5%..8.2%) & Bench Badges (8.6%..14.8%)!
  const topBarTopPx = isChampSelect
    ? Math.round(clientEffective.y + clientEffective.height * 0.158)
    : Math.round(8 * hudUiScale)
  const topBarCenterX = isChampSelect
    ? Math.round(clientEffective.x + clientEffective.width / 2)
    : Math.round(viewportW / 2)

  return (
    <div
      className={`w-screen h-screen pointer-events-none relative overflow-hidden select-none text-xs ${
        isSimulator ? 'bg-[#04070E]/88 backdrop-blur-[2px]' : 'bg-transparent'
      }`}
    >
      {/* =====================================================================
          VIRTUAL / NATIVE GAME STAGE
          In real Windows play: exact 100% 1:1 client area `(0, 0, viewportW, viewportH)`.
          In macOS simulator: scaled virtual monitor/window frame `(viewportW × viewportH)`!
          ===================================================================== */}
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
        {/* -------------------------------------------------------------------
            SIMULATOR UNDERLAY: Uploaded Real Screenshot OR 1:1 LoL Blueprint Wireframe
            ------------------------------------------------------------------- */}
        {isSimulator && customScreenshot && (
          <img
            src={customScreenshot.url}
            alt="Real Game Screenshot Underlay"
            className="absolute inset-0 w-full h-full object-fill pointer-events-none"
          />
        )}

        {isSimulator && showWireframe && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Resolution & Aspect Watermark Corner Tag */}
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

            {/* SCENE A BLUEPRINT: LOL Client (RCLIENT 16:9) 10 Bench Slots + 5 Team Slots */}
            {isChampSelect && (
              <>
                {/* If host viewport isn't 16:9 (e.g. testing RCLIENT inside 21:9/16:10), outline the 16:9 RCLIENT window */}
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

                {/* All 10 Fixed ARAM Bench Slots (i = 0..9) */}
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
                          <img src={hero.avatarUrl} alt={hero.name} className="w-full h-full object-cover" />
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

                {/* 5 Left-Side My-Team Portrait Slots (i = 0..4) */}
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
                        <img src={ah.avatarUrl} alt={ah.name} className="w-full h-full object-cover opacity-90" />
                      ) : (
                        <span className="text-[10px] text-[#C8AA6E]/80 font-mono">{tl.slotIndex + 1}L</span>
                      )}
                    </div>
                  )
                })}

                {/* Bottom Runes / Summoner Spells / Reroll Button Reference Zone */}
                {!customScreenshot && (
                  <div
                    style={{
                      left: `${Math.round(clientEffective.x + clientEffective.width * 0.28)}px`,
                      top: `${Math.round(clientEffective.y + clientEffective.height * 0.855)}px`,
                      width: `${Math.round(clientEffective.width * 0.44)}px`,
                      height: `${Math.round(clientEffective.height * 0.095)}px`
                    }}
                    className="absolute rounded border border-dashed border-white/20 bg-black/35 flex items-center justify-between px-4 text-[#94A3B8]"
                  >
                    <span style={{ fontSize: `${Math.max(10, Math.round(12 * hudUiScale))}px` }}>
                      [客户端符文 & 召唤师技能栏 · 0 遮挡]
                    </span>
                    <span
                      style={{ fontSize: `${Math.max(10, Math.round(12 * hudUiScale))}px` }}
                      className="px-2.5 py-1 rounded border border-[#0AC8B9]/40 text-[#5CF2E5]"
                    >
                      🎲 重新随机骰子区
                    </span>
                  </div>
                )}
              </>
            )}

            {/* SCENE B BLUEPRINT: In-Game 3-Pick Hextech Cards (Height-Scaled Around W/2) */}
            {hasThreePick && (
              <>
                {/* Ultrawide 21:9 Peripheral Indicator */}
                {viewportW / viewportH > 2.0 && !customScreenshot && (
                  <>
                    <div
                      style={{
                        left: 0,
                        top: 0,
                        width: `${Math.max(0, cardBoxes[0].cardFrame.x - Math.round(0.03 * viewportH))}px`,
                        height: '100%'
                      }}
                      className="absolute bg-[#0AC8B9]/[0.04] border-r border-dashed border-[#0AC8B9]/30 flex items-center justify-center"
                    >
                      <span className="text-[#5CF2E5]/70 text-xs px-3 text-center">
                        21:9 超宽屏左侧战场视野区
                        <br />
                        (海克斯卡牌按高度 H 锚定中央，不随宽度拉偏)
                      </span>
                    </div>
                    <div
                      style={{
                        left: `${cardBoxes[2].cardFrame.x + cardBoxes[2].cardFrame.width + Math.round(0.03 * viewportH)}px`,
                        top: 0,
                        right: 0,
                        height: '100%'
                      }}
                      className="absolute bg-[#0AC8B9]/[0.04] border-l border-dashed border-[#0AC8B9]/30 flex items-center justify-center"
                    >
                      <span className="text-[#5CF2E5]/70 text-xs px-3 text-center">
                        21:9 超宽屏右侧战场视野区
                      </span>
                    </div>
                  </>
                )}

                {gameState.cardSlots.map((slot) => {
                  const box = cardBoxes[slot.slotIndex]
                  const meta = augments[slot.augmentId]
                  if (!box || !meta) return null
                  return (
                    <React.Fragment key={`wire-card-${slot.slotIndex}`}>
                      {/* Exact Game Card Outer Frame */}
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
                            {/* Simulated Augment Icon Zone (0.255*H .. 0.365*H) */}
                            <div
                              style={{
                                top: '9%',
                                height: '24%'
                              }}
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

                            {/* Simulated Description Body (0.440*H .. 0.625*H) + Sim Pick Button */}
                            <div
                              style={{
                                top: '53%',
                                bottom: '5%'
                              }}
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

                      {/* Exact OCR Narrow Title Strip Box (0.3869*H .. 0.4335*H) */}
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
                        <span
                          style={{ fontSize: `${Math.max(8, Math.round(9 * box.uiScale))}px` }}
                          className="absolute -top-3.5 right-1 px-1 rounded bg-[#071B26] text-[#5CF2E5] font-mono"
                        >
                          OCR标题采样带
                        </span>
                      </div>

                      {/* Exact Reroll Button Box (0.665*H .. 0.725*H) */}
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
              </>
            )}
          </div>
        )}

        {/* ===================================================================
            PRODUCTION LAYER 1: TOP HUD CONTROL BAR + FOUNTAIN ROADMAP
            (Identical spatial math in Simulator & Real Windows Gameplay!)
            =================================================================== */}
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
            className={`px-3 py-1.5 rounded-full border flex items-center gap-2.5 transition-all shadow-xl ${
              hoveredBar || gameState.isDead || isSimulator
                ? 'bg-[#09101D]/95 border-[#C8AA6E]/55 opacity-100'
                : 'bg-[#09101D]/62 border-white/15 opacity-80'
            }`}
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

            {/* 5 Playstyle Mindset Switcher */}
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

            {/* Next Item + Live Gold Status */}
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

            {/* Picked Augment Mini Slots + `+` Quick Manual Add/Fix Popover */}
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

            {/* Utility Buttons */}
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

          {/* Fountain Shopping Roadmap Strip */}
          {showShoppingDrawer && !isChampSelect && advice && (
            <div className="mt-2 px-4 py-3 rounded-xl bg-[#09101D]/95 border border-[#C8AA6E]/45 shadow-2xl space-y-2.5 max-w-3xl whitespace-normal">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#F0E6D2]">{advice.headline}</span>
                  <span className="text-[11px] text-[#E2C992] tabular-nums">
                    当前金币: {gameState.currentGold}
                  </span>
                  {copiedItemTip ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#0AC8B9]/25 text-[#5CF2E5] border border-[#0AC8B9]/45">
                      {copiedItemTip}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#64748B]">（点击装备一键复制名称搜商店）</span>
                  )}
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
                    onClick={() =>
                      handleCopyShopItemName(items[advice.recommendedShoe!.itemId].name)
                    }
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
                        onClick={() => handleCopyShopItemName(im.name)}
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
                          <div className="text-[11px] font-semibold text-[#F0E6D2] mt-0.5">
                            {im.name}
                          </div>
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
          )}
        </div>

        {/* ===================================================================
            PRODUCTION LAYER 2: CHAMP SELECT IN-PLACE BENCH PORTRAIT BADGES
            Exact left-aligned 10-slot ARAM grid: cx = (564 + 88*i)/1920 * clientW!
            =================================================================== */}
        {isChampSelect && benchList.length > 0 && (
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
              const tagFontPx = Math.max(8, Math.round(10 * slot.uiScale))
              const wrFontPx = Math.max(9, Math.round(11 * slot.uiScale))

              return (
                <div
                  key={`bench-badge-${sug.heroId}-${sug.benchIndex}`}
                  style={{
                    left: `${slot.centerX}px`,
                    top: `${slot.badgeTopY}px`,
                    width: `${slot.badgeWidth}px`,
                    padding: `${Math.max(2, Math.round(3.5 * slot.uiScale))}px ${Math.max(2, Math.round(4 * slot.uiScale))}px`
                  }}
                  className={`absolute -translate-x-1/2 rounded border text-center shadow-xl ${
                    isHot
                      ? 'bg-[#07202E]/95 border-[#0AC8B9] shadow-[0_0_14px_rgba(10,200,185,0.3)]'
                      : 'bg-[#090F1A]/94 border-white/25'
                  }`}
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
                  <div
                    style={{ fontSize: `${Math.max(8, tagFontPx - 1)}px` }}
                    className={`font-semibold leading-tight tabular-nums ${
                      sug.deltaVsCurrent >= 0 ? 'text-[#0AC8B9]' : 'text-rose-400'
                    }`}
                  >
                    {sug.deltaVsCurrent >= 0 ? '+' : ''}
                    {(sug.deltaVsCurrent * 100).toFixed(1)}%
                  </div>
                </div>
              )
            })}

            {/* Left-side My Team Composition Callout (Positioned right of the 5 left team portraits: x=192/1920) */}
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

        {/* ===================================================================
            PRODUCTION LAYER 3: IN-GAME 3-CARD SPATIAL AUGMENT OVERLAY BADGES
            Height-scaled around W/2 (`cx_i = W/2 + (i-1)*0.3417*H`)!
            Works identically on 720p, 1080p, 2K, 4K, 16:10, and 21:9 ultrawide!
            =================================================================== */}
        {hasThreePick && (
          <div className="absolute inset-0 pointer-events-none z-30">
            {gameState.cardSlots.map((slot) => {
              const meta = augments[slot.augmentId]
              const ev = evalByAugId.get(slot.augmentId)
              const box = cardBoxes[slot.slotIndex]
              if (!meta || !ev || !box) return null

              const isBest = ev.isRecommendedPick
              const isTrap = ev.verdict === 'TRAP' || ev.hasConflict
              const anchorY = badgeAtBottom ? box.badgeBottomModeTopY : box.badgeTopModeBottomY

              return (
                <div
                  key={`aug-badge-${slot.slotIndex}-${slot.augmentId}`}
                  style={{
                    left: `${box.centerX}px`,
                    top: `${anchorY}px`,
                    width: '286px',
                    transform: badgeAtBottom
                      ? `translate(-50%, 0) scale(${box.uiScale})`
                      : `translate(-50%, -100%) scale(${box.uiScale})`,
                    transformOrigin: badgeAtBottom ? 'top center' : 'bottom center'
                  }}
                  className="absolute"
                >
                  <SpatialCardBadge meta={meta} ev={ev} isBest={isBest} isTrap={isTrap} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* =====================================================================
          SIMULATOR CALIBRATION DOCK (macOS / Desktop Verification Harness)
          Switch resolutions (720p / 1080p / 2K / 16:10 / 21:9), 10-slot bench,
          1:1 wireframe outlines, real LoL screenshot underlay + X/Y micro-offset!
          ===================================================================== */}
      {isSimulator && (
        <div
          onMouseEnter={enterInteractive}
          onMouseLeave={leaveInteractive}
          className="pointer-events-auto fixed bottom-2.5 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-2xl bg-[#09111F]/96 border border-[#C8AA6E]/50 shadow-2xl flex flex-col gap-1.5 max-w-[96vw]"
        >
          {/* Row 1: Scene Switcher + 10-Slot Bench Stress Test + Wireframe + Real Screenshot Upload */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#E2C992] font-bold">原位校准台：</span>
              {(
                [
                  { key: 'champ-select', label: '① 选人替补席 (10槽)' },
                  { key: 'level-7-pick', label: '② 局内三选一 + 刷新' },
                  { key: 'fountain-buy', label: '③ 阵亡逛商店出装' }
                ] as const
              ).map((sc) => (
                <button
                  key={sc.key}
                  onClick={() => window.hexbuddy.setSimulator(sc.key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] cursor-pointer transition ${
                    gameState.simulatorScene === sc.key
                      ? 'bg-[#C8AA6E] text-[#070B12] font-bold'
                      : 'bg-white/8 text-[#C8C1B2] hover:text-white'
                  }`}
                >
                  {sc.label}
                </button>
              ))}

              {isChampSelect && (
                <button
                  onClick={handleToggleFullBenchTest}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-[#0AC8B9]/20 hover:bg-[#0AC8B9]/30 text-[#5CF2E5] border border-[#0AC8B9]/45 flex items-center gap-1 cursor-pointer"
                >
                  <Users className="w-3 h-3" />
                  <span>
                    {gameState.benchHeroIds.length >= 8 ? '切回 4 人常规替补' : '塞满 10 格替补测试'}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowWireframe((v) => !v)}
                className={`px-2.5 py-1 rounded-full text-[11px] border flex items-center gap-1 cursor-pointer ${
                  showWireframe
                    ? 'bg-[#0AC8B9]/20 border-[#0AC8B9]/50 text-[#5CF2E5]'
                    : 'bg-white/5 border-white/15 text-[#94A3B8]'
                }`}
              >
                <Ruler className="w-3 h-3" />
                <span>标准游戏坐标线: {showWireframe ? '开' : '关'}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadScreenshot}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 rounded-full text-[11px] bg-[#16253B] hover:bg-[#1E324F] text-[#F0E6D2] border border-[#C8AA6E]/40 flex items-center gap-1 cursor-pointer"
              >
                <ImagePlus className="w-3 h-3 text-[#E2C992]" />
                <span>导入真实游戏截图叠底校验</span>
              </button>

              {customScreenshot && (
                <button
                  onClick={() => setCustomScreenshot(null)}
                  title={customScreenshot.ocrSummary || customScreenshot.name}
                  className="px-2 py-1 rounded-full text-[11px] bg-amber-500/20 text-amber-200 border border-amber-400/40 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>清除截图 ({customScreenshot.width}×{customScreenshot.height})</span>
                </button>
              )}

              <button
                onClick={() => {
                  leaveInteractive()
                  window.hexbuddy.setSimulator('off')
                  window.hexbuddy.toggleMiniOverlay(false)
                }}
                className="px-2.5 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-400/40 text-[11px] cursor-pointer"
              >
                退出演练
              </button>
            </div>
          </div>

          {/* Row 2: Multi-Resolution & Aspect-Ratio Presets + X/Y Fine-Tune Nudge */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-white/10">
            <div className="flex items-center gap-1 flex-wrap">
              <Monitor className="w-3.5 h-3.5 text-[#C8AA6E] mr-0.5" />
              <span className="text-[10px] text-[#94A3B8] mr-1">分辨率/比例测试:</span>
              <button
                onClick={() => {
                  setCustomScreenshot(null)
                  setSimPresetId('native')
                }}
                className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                  !customScreenshot && simPresetId === 'native'
                    ? 'bg-[#0AC8B9] text-[#070B12] font-bold'
                    : 'bg-white/8 text-[#94A3B8] hover:text-white'
                }`}
              >
                铺满当前屏 ({hostSize.w}×{hostSize.h})
              </button>
              {SIMULATOR_RESOLUTION_PRESETS.map((pr) => {
                const active = !customScreenshot && simPresetId === pr.id
                return (
                  <button
                    key={pr.id}
                    onClick={() => {
                      setCustomScreenshot(null)
                      setSimPresetId(pr.id)
                    }}
                    title={pr.label}
                    className={`px-2 py-0.5 rounded text-[10px] cursor-pointer transition ${
                      active
                        ? 'bg-[#0AC8B9] text-[#070B12] font-bold'
                        : 'bg-white/8 text-[#C8C1B2] hover:text-white'
                    }`}
                  >
                    {pr.shortLabel}
                  </button>
                )
              })}
            </div>

            {/* X / Y Fine-Tune Offset Controls */}
            <div className="flex items-center gap-1 text-[10px] text-[#94A3B8]">
              <span>微调({offsetX >= 0 ? `+${offsetX}` : offsetX}%, {offsetY >= 0 ? `+${offsetY}` : offsetY}%):</span>
              <button
                onClick={() => handleNudgeOffset(-0.5, 0)}
                className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[#F0E6D2] cursor-pointer"
              >
                ←
              </button>
              <button
                onClick={() => handleNudgeOffset(0.5, 0)}
                className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[#F0E6D2] cursor-pointer"
              >
                →
              </button>
              <button
                onClick={() => handleNudgeOffset(0, -0.5)}
                className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[#F0E6D2] cursor-pointer"
              >
                ↑
              </button>
              <button
                onClick={() => handleNudgeOffset(0, 0.5)}
                className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[#F0E6D2] cursor-pointer"
              >
                ↓
              </button>
              {(offsetX !== 0 || offsetY !== 0) && (
                <button
                  onClick={() => handleNudgeOffset(0, 0, true)}
                  title="重置偏移"
                  className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 flex items-center gap-0.5 cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>归零</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const SpatialCardBadge: React.FC<{
  meta: AugmentMeta
  ev: NonNullable<TacticalAdvice['situationalCandidates'][number]>
  isBest: boolean
  isTrap: boolean
}> = ({ meta, ev, isBest, isTrap }) => {
  return (
    <div
      className={`w-full rounded-xl px-3.5 py-2 border shadow-2xl backdrop-blur-md space-y-1 ${
        isBest
          ? 'bg-[#072230]/96 border-2 border-[#0AC8B9] shadow-[0_0_24px_rgba(10,200,185,0.38)]'
          : isTrap
            ? 'bg-[#240B15]/96 border border-rose-500/75'
            : 'bg-[#0A111E]/96 border border-[#C8AA6E]/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isBest ? (
            <span className="px-1.5 py-0.5 rounded bg-[#0AC8B9] text-[#070B12] text-[10px] font-extrabold flex items-center gap-0.5 shrink-0">
              <Crown className="w-3 h-3" />
              首选
            </span>
          ) : isTrap ? (
            <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold shrink-0">
              避坑
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-white/15 text-[#F0E6D2] text-[10px] font-semibold shrink-0">
              备选
            </span>
          )}
          <span className="font-bold text-[#F0E6D2] truncate">{meta.name}</span>
        </div>

        <div className="text-right tabular-nums shrink-0">
          <span className="font-extrabold text-sm text-[#F0E6D2]">
            {(ev.baseWinRate * 100).toFixed(1)}%
          </span>
          <span
            className={`ml-1 text-[11px] font-semibold ${
              ev.deltaWinRate >= 0 ? 'text-[#0AC8B9]' : 'text-rose-400'
            }`}
          >
            {ev.deltaWinRate >= 0 ? '+' : ''}
            {(ev.deltaWinRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className={`font-semibold truncate ${
            isBest ? 'text-[#5CF2E5]' : isTrap ? 'text-rose-300' : 'text-[#E2C992]'
          }`}
        >
          {ev.primaryTag}
        </span>

        {ev.pivotItem && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/45 text-[#E2C992] shrink-0">
            配装: {ev.pivotItem.name}
          </span>
        )}
      </div>

      {ev.situationReasons[0] && (
        <div className="text-[10px] text-[#C8C1B2] truncate">{ev.situationReasons[0]}</div>
      )}
    </div>
  )
}
