export type AugmentRarity = 'silver' | 'gold' | 'prismatic'

export type TierGrade = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

export type AugmentVerdict = 'S+' | 'S' | 'A' | 'B' | 'TRAP'

export type HeroRole = 'mage' | 'marksman' | 'tank' | 'fighter' | 'assassin' | 'support'

export type OverlayOpacityMode = 'solid' | 'glass' | 'clear'

export type HudDensityMode = 'detailed' | 'compact'

export type UiFontScale = 'normal' | 'comfortable' | 'large'

export type OcrEngineMode = 'auto' | 'tesseract'

export type AiToneStyle = 'concise' | 'witty' | 'beginner'

export type PlaystyleMode = 'steady' | 'counter' | 'team' | 'yolo' | 'torment'

export type MainViewTab = 'heroes' | 'augments' | 'history' | 'settings'

export type SettingsSectionId =
  | 'general'
  | 'hud'
  | 'hotkeys'
  | 'data'
  | 'ai'
  | 'about'

export interface HeroMeta {
  id: string
  alias: string
  name: string
  title: string
  roles: HeroRole[]
  damageType: 'AD' | 'AP' | 'MIXED' | 'TANK'
  avatarUrl: string
  games: number
  wins: number
  winRate: number
  smoothedWinRate: number
  pickRate: number
  rank: number
  tier: TierGrade
  skillOrder?: string
  topShoes?: Array<{ itemId: string; pickRate: number; winRate: number }>
  pinyinFull: string
  pinyinInitials: string
}

export interface AugmentMeta {
  id: string
  name: string
  rarity: AugmentRarity
  desc: string
  iconUrl: string
  tags: string[]
  pinyinFull: string
  pinyinInitials: string
}

export interface ItemMeta {
  id: string
  name: string
  iconUrl: string
  category: string
  types: string[]
  totalGold: number
  brief: string
  fullDesc: string
}

export interface HeroAugmentStat {
  augmentId: string
  games: number
  wins: number
  rawWinRate: number
  smoothedWinRate: number
  deltaWinRate: number
  pickShare: number
  lowSample: boolean
  verdict: AugmentVerdict
  verdictLabel: string
  boundItems?: Array<{
    itemId: string
    name: string
    winRate: number
    games: number
  }>
}

export interface CoreBuild {
  items: string[]
  ordered: boolean
  games: number
  winRate: number
  pickRate: number
}

export interface ArchetypeCard {
  id: string
  title: string
  badge: string
  summary: string
  coreAugmentIds: string[]
  recommendedItems: string[]
  itemPivotTip: string
  avgDeltaWinRate: number
}

export interface AugmentPivotBuild {
  augmentId: string
  items: Array<{
    itemId: string
    name: string
    winRate: number
    games: number
  }>
}

export interface HeroDetailGuide {
  hero: HeroMeta
  bestSpells: Array<{ spellIds: string[]; label: string; winRate: number; games: number }>
  augments: HeroAugmentStat[]
  trapAugments: HeroAugmentStat[]
  coreBuilds: CoreBuild[]
  augmentPivotBuilds: AugmentPivotBuild[]
  situationalItems: Array<{ itemId: string; winRate: number; deltaWinRate: number; games: number }>
  archetypes: ArchetypeCard[]
}

export interface AugmentHeroFit {
  heroId: string
  games: number
  smoothedWinRate: number
  deltaWinRate: number
  verdict: AugmentVerdict
}

export interface AugmentReverseDetail {
  augment: AugmentMeta
  avgWinRate: number
  totalPickGames: number
  bestHeroes: AugmentHeroFit[]
  trapHeroes: AugmentHeroFit[]
}

export interface DatasetOption {
  id: string
  patch: string
  mode: string
  modeLabel: string
  path: string
  bandsAvailable: boolean
  activeBand: 'all' | 'high'
  matchesValid: number
}

export interface DatasetMetadata {
  patch: string
  mode: string
  modeLabel: string
  activeBand: 'all' | 'high'
  bandsAvailable: boolean
  seq: number
  matchesValid: number
  snapshotAt: string
  sourceRepo: string
  license: string
  syncedAt: string
  fromSource: 'bundled' | 'cache' | 'mirror' | 'github'
  availableDatasets?: DatasetOption[]
}

export interface SeedBundle {
  meta: DatasetMetadata
  heroes: Record<string, HeroMeta>
  augments: Record<string, AugmentMeta>
  items: Record<string, ItemMeta>
  heroAugments: Record<string, Array<[string, number, number, number]>>
  coreBuilds: Record<string, CoreBuild[]>
  heroItems: Record<string, Array<[string, number, number]>>
  heroAugmentItems: Record<string, Record<string, Array<[string, string, number, number]>>>
  heroSpells: Record<string, Array<[string, number, number]>>
}

export interface UserPreferences {
  schemaVersion: number
  uiFontScale: UiFontScale
  preferredRoles: HeroRole[]
  favoriteHeroIds: string[]
  favoriteAugmentIds?: string[]
  blacklistedAugmentIds?: string[]
  overlayOpacity: OverlayOpacityMode
  hudScale: number
  hudDensity: HudDensityMode
  enableBenchBadges: boolean
  enableThreePickBadges: boolean
  enableFountainStrip: boolean
  defaultPlaystyle: PlaystyleMode
  autoSyncDataOnBoot: boolean
  restoreClipboardAfterCopy: boolean
  ocrEngineMode: OcrEngineMode
  onboardingDismissed: boolean
  autoOcrOnMilestone: boolean
  minimizeToTray: boolean
  releaseMainOnMatch?: boolean
  launchAtLogin?: boolean
  badgePosition: 'top' | 'bottom'
  autoHideWhenUnfocused: boolean
  excludeHudFromCapture?: boolean
  hudOffsetX: number
  hudOffsetY: number
}

export interface BenchSuggestion {
  heroId: string
  benchIndex: number
  tier: TierGrade
  winRate: number
  deltaVsCurrent: number
  isFavorite: boolean
  matchesPreferredRole: boolean
  isMayhemBonusHero: boolean
  score: number
  shortTag: string
  reason: string
}

export interface EnemyPlayerLiveInfo {
  heroId: string
  kills: number
  deaths: number
  assists: number
  itemIds: string[]
  isFedBoss: boolean
}

export type AugmentOfferSlotIndex = 0 | 1 | 2 | 3

export interface CardSlotAnchor {
  slotIndex: AugmentOfferSlotIndex
  totalSlots?: 2 | 3 | 4
  augmentId: string
  xRatio: number
  yRatio: number
  cardWidthRatio?: number
}

export interface WindowBoundsRect {
  x: number
  y: number
  width: number
  height: number
}

export interface GameLiveState {
  connectionMode: 'disconnected' | 'lcu-champ-select' | 'live-in-game' | 'simulator'
  simulatorScene?: 'champ-select' | 'level-7-pick' | 'fountain-buy'
  playstyleMode: PlaystyleMode
  selectedArchetypeId?: string | null
  myHeroId: string | null
  allyHeroIds: string[]
  benchHeroIds: string[]
  enemyHeroIds: string[]
  enemyPlayers: EnemyPlayerLiveInfo[]
  currentLevel: number
  currentGold: number
  isDead: boolean
  isAugmentMilestone: boolean
  currentItemIds: string[]
  pickedAugmentIds: string[]
  candidateAugmentIds: string[]
  cardSlots: CardSlotAnchor[]
  targetBounds?: WindowBoundsRect
  targetWindowKind?: 'client' | 'game'
  lastUpdatedAt: number
}

export interface OcrRecognizeResult {
  success: boolean
  matchedAugmentIds: string[]
  cardSlots: CardSlotAnchor[]
  rawTexts: string[]
  confidence: number
  elapsedMs: number
  error?: string
}

export type {
  ArchetypeOption,
  DiagnosticSummary,
  DynamicBuildStep,
  LocalMatchHistoryRecord,
  LocalMatchHistorySummary,
  MatchOutcome,
  RerollAction,
  RerollOfferAdvice,
  SituationalAugmentEval,
  TacticalAdvice,
  ThreatRadar
} from './tacticalTypes'

export interface AiSettings {
  enabled: boolean
  providerName: string
  baseUrl: string
  apiKey: string
  model: string
  toneStyle: AiToneStyle
  shortcutOverlay: string
  shortcutOcr: string
  shortcutCycleMindset: string
}

export interface ShortcutSlotStatus {
  accelerator: string
  registered: boolean
  error?: string
}

export interface ShortcutStatusMap {
  overlay: ShortcutSlotStatus
  ocr: ShortcutSlotStatus
  cycleMindset: ShortcutSlotStatus
}

export interface CacheStatsInfo {
  bundleBytes: number
  logBytes: number
  chromiumCacheBytes: number
  totalBytes: number
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface AppUpdateState {
  phase: UpdatePhase
  currentVersion: string
  isPortable: boolean
  latestVersion: string | null
  hasUpdate: boolean
  releaseNotes: string
  publishedAt: string | null
  releasePageUrl: string
  assetName: string | null
  assetSize: number
  downloadPercent: number
  transferredBytes: number
  downloadedFilePath: string | null
  errorMessage?: string
  checkedAt: number | null
}
