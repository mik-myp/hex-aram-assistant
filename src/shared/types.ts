export type AugmentRarity = 'silver' | 'gold' | 'prismatic'

export type TierGrade = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

export type AugmentVerdict = 'S+' | 'S' | 'A' | 'B' | 'TRAP'

export type HeroRole = 'mage' | 'marksman' | 'tank' | 'fighter' | 'assassin' | 'support'

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

export interface HeroDetailGuide {
  hero: HeroMeta
  bestSpells: Array<{ spellIds: string[]; label: string; winRate: number; games: number }>
  augments: HeroAugmentStat[]
  trapAugments: HeroAugmentStat[]
  coreBuilds: CoreBuild[]
  situationalItems: Array<{ itemId: string; winRate: number; deltaWinRate: number; games: number }>
  archetypes: ArchetypeCard[]
}

export interface DatasetMetadata {
  patch: string
  mode: string
  modeLabel: string
  seq: number
  matchesValid: number
  snapshotAt: string
  sourceRepo: string
  license: string
  syncedAt: string
  fromSource: 'bundled' | 'cache' | 'mirror' | 'github'
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

export interface BenchSuggestion {
  heroId: string
  tier: TierGrade
  winRate: number
  deltaVsCurrent: number
  reason: string
}

export interface GameLiveState {
  connectionMode: 'disconnected' | 'lcu-champ-select' | 'live-in-game' | 'simulator'
  simulatorScene?: 'champ-select' | 'level-7-pick' | 'teamfight-5v5'
  myHeroId: string | null
  allyHeroIds: string[]
  benchHeroIds: string[]
  enemyHeroIds: string[]
  currentLevel: number
  isAugmentMilestone: boolean
  currentItemIds: string[]
  pickedAugmentIds: string[]
  candidateAugmentIds: string[]
  lastUpdatedAt: number
}

export interface OcrRecognizeResult {
  success: boolean
  matchedAugmentIds: string[]
  rawTexts: string[]
  confidence: number
  elapsedMs: number
  error?: string
}

export interface ThreatRadar {
  enemyAdRatio: number
  enemyApRatio: number
  enemyTankCount: number
  enemyHealThreat: number
  enemyDiveThreat: number
  allyDamageWarning: string | null
}

export interface TacticalAdvice {
  headline: string
  threatRadar: ThreatRadar
  counterItemIds: Array<{ itemId: string; reason: string }>
  nextAugmentFocus: string
  playstyleTips: string[]
}

export interface AiSettings {
  enabled: boolean
  providerName: string
  baseUrl: string
  apiKey: string
  model: string
  shortcutOverlay: string
  shortcutOcr: string
}
