import type {
  AugmentOfferSlotIndex,
  AugmentVerdict,
  GameLiveState,
  PlaystyleMode
} from './types'

export interface ThreatRadar {
  enemyAdRatio: number
  enemyApRatio: number
  enemyTankCount: number
  enemyHealThreat: number
  enemyDiveThreat: number
  enemyPokeThreat?: number
  enemyShieldThreat?: number
  enemyArmorStackers?: number
  enemyMrStackers?: number
  allyApCount?: number
  allyAdCount?: number
  allyTankCount?: number
  fedBossHeroId: string | null
  fedBossKills: number
  allyDamageWarning: string | null
}

export type RerollAction = 'keep' | 'consider' | 'reroll'

export interface RerollOfferAdvice {
  shouldReroll: boolean
  rarityLabel: string
  poolAvgWinRate: number
  bestCandidateWinRate: number
  betterRemainingCount: number
  suggestedRerollIds: string[]
  summary: string
}

export interface ArchetypeOption {
  id: string
  title: string
  badge: string
  itemPivotTip: string
}

export interface SituationalAugmentEval {
  augmentId: string
  slotIndex?: AugmentOfferSlotIndex
  isRecommendedPick: boolean
  hasConflict: boolean
  baseWinRate: number
  deltaWinRate: number
  situationalScore: number
  situationalBonus: number
  verdict: AugmentVerdict
  verdictLabel: string
  primaryTag: string
  comboName?: string
  sampleGames?: number
  confidenceLevel?: 'high' | 'medium' | 'low'
  userPreference?: 'favorite' | 'blacklisted'
  rerollAction?: RerollAction
  rerollReason?: string
  situationReasons: string[]
  pivotItem?: {
    itemId: string
    name: string
    winRate: number
  }
}

export interface DynamicBuildStep {
  itemId: string
  owned: boolean
  affordableNow: boolean
  goldRemaining: number
  sourceTag:
    | '常规核心'
    | '流派定制'
    | '海克斯变阵'
    | '专治大爹'
    | '重伤克制'
    | '打坦穿透'
    | '防秒抗性'
    | '独爽核弹'
    | '折磨恶心'
    | '团队补位'
  reason: string
}

export interface TacticalAdvice {
  playstyleMode: PlaystyleMode
  headline: string
  threatRadar: ThreatRadar
  recommendedSpells?: string | null
  availableArchetypes?: ArchetypeOption[]
  activeArchetypeId?: string | null
  recommendedShoe: { itemId: string; owned: boolean; reason: string } | null
  immediateNextItem: DynamicBuildStep | null
  dynamicBuildPlan: DynamicBuildStep[]
  situationalCandidates: SituationalAugmentEval[]
  rerollAdvice?: RerollOfferAdvice | null
  counterItemIds: Array<{ itemId: string; reason: string }>
  anvilFocus?: { primary: string; secondary: string; reason: string }
  nextAugmentFocus: string
  playstyleTips: string[]
}

export type MatchOutcome = 'win' | 'loss' | 'unknown'

export interface LocalMatchHistoryRecord {
  id: string
  endedAt: string
  durationSec: number
  heroId: string
  playstyleMode: PlaystyleMode
  finalLevel: number
  pickedAugmentIds: string[]
  finalItemIds: string[]
  kills?: number
  deaths?: number
  assists?: number
  result?: MatchOutcome
}

export interface LocalMatchHistorySummary {
  totalMatches: number
  wins: number
  losses: number
  decidedMatches: number
  records: LocalMatchHistoryRecord[]
  topHeroes: Array<{ heroId: string; count: number; wins: number; decided: number }>
  topAugments: Array<{ augmentId: string; count: number; wins: number; decided: number }>
}

export interface DiagnosticSummary {
  isWindows: boolean
  isSelfElevated: boolean
  leagueElevatedMismatch: boolean
  exclusiveFullscreenSuspected?: boolean
  localMatchesRecorded?: number
  connectionMode: GameLiveState['connectionMode']
  trackedWindowSummary: string
  ocrEngineSummary: string
  datasetSummary: string
  memoryRssMb: number
  logDirPath: string
  formattedReport: string
}
