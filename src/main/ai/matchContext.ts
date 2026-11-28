import type {
  AugmentMeta,
  EnemyPlayerLiveInfo,
  GameLiveState,
  HeroMeta,
  SeedBundle,
  ThreatRadar
} from '@shared/types'

export const HEAVY_HEAL_HERO_IDS = new Set([
  '8', '16', '19', '27', '36', '37', '50', '114', '141',
  '154', '223', '233', '266', '267', '350', '517', '777', '895'
])

export const HEAVY_POKE_HERO_IDS = new Set([
  '101', '115', '99', '126', '76', '110', '96', '910', '81', '161', '142', '45', '74', '143', '63', '30'
])

export const HEAVY_SHIELD_HERO_IDS = new Set([
  '40', '43', '117', '147', '497', '98', '223', '89', '111', '82', '875', '61', '16'
])

export const MANALESS_HERO_IDS = new Set([
  '238', '157', '777', '86', '36', '55', '84', '64', '85', '68', '58', '23', '98', '107',
  '266', '82', '875', '234', '233', '154', '8', '102', '150', '240', '222'
])

export const TANK_ITEMS = new Set(['3084', '3075', '2502', '3068', '3065', '2504', '3143', '3110', '3076', '3742', '6665'])
export const ARMOR_ITEMS = new Set(['3075', '3143', '3110', '3068', '3742', '2502', '6333', '3157', '3026', '3047'])
export const MR_ITEMS = new Set(['3065', '2504', '3102', '3156', '4401', '3091', '3111', '8020', '3119'])
export const HEAL_ITEMS = new Set(['3084', '3065', '2502', '6617', '3153', '3072', '6610', '3147'])
export const CRIT_ITEMS = new Set(['3031', '3094', '3085', '3046', '3036', '3033', '6676', '3032', '6675'])
export const ONHIT_ITEMS = new Set(['3153', '3124', '3302', '6672', '3091', '3115'])
export const AP_ITEMS = new Set(['3118', '4645', '3089', '4646', '3135', '6653', '2503', '3116', '3157', '3165', '6655', '3102', '3152', '4628'])
export const BURN_ITEMS = new Set(['6653', '2503', '3118'])

export type EffectiveBuildStyle = 'AP' | 'AD_CRIT' | 'AD_ONHIT' | 'TANK' | 'SUPPORT'
export type GamePhase = 'early' | 'mid' | 'late'

export interface GlobalMatchContext {
  myHero: HeroMeta | undefined
  allies: HeroMeta[]
  otherAllies: HeroMeta[]
  enemies: HeroMeta[]
  pickedMetas: AugmentMeta[]
  threatRadar: ThreatRadar
  fedBoss: EnemyPlayerLiveInfo | null
  fedBossHero: HeroMeta | null
  effectiveStyle: EffectiveBuildStyle
  inferredFromItems: boolean
  isManalessHero: boolean
  gamePhase: GamePhase
  allyApCount: number
  allyAdCount: number
  allyTankCount: number
  allyHasNoTank: boolean
  enemyPokeThreat: number
  enemyShieldThreat: number
  enemyArmorStackers: number
  enemyMrStackers: number
  enemyCritThreats: number
  builtTankCount: number
  builtApCount: number
  builtAdCritCount: number
  builtOnHitCount: number
  builtBurnCount: number
}

function inferPlayerBuildStyle(
  myHero: HeroMeta | undefined,
  bundle: SeedBundle,
  currentItemIds: string[],
  pickedMetas: AugmentMeta[]
): {
  effectiveStyle: EffectiveBuildStyle
  inferredFromItems: boolean
  builtTankCount: number
  builtApCount: number
  builtAdCritCount: number
  builtOnHitCount: number
  builtBurnCount: number
} {
  let builtTankCount = 0
  let builtApCount = 0
  let builtAdCritCount = 0
  let builtOnHitCount = 0
  let builtBurnCount = 0

  for (const id of currentItemIds) {
    if (TANK_ITEMS.has(id)) builtTankCount++
    if (AP_ITEMS.has(id)) builtApCount++
    if (CRIT_ITEMS.has(id)) builtAdCritCount++
    if (ONHIT_ITEMS.has(id)) builtOnHitCount++
    if (BURN_ITEMS.has(id)) builtBurnCount++

    const item = bundle.items[id]
    if (!item) continue
    if (!TANK_ITEMS.has(id) && item.category === 'tank') builtTankCount++
    if (!AP_ITEMS.has(id) && item.category === 'mage') builtApCount++
  }

  // Respect the player's actual purchased items first (solves AP Malphite, AP Kayle/Kai'Sa, Tank bruisers)
  if (builtApCount >= 1 && builtApCount > builtTankCount && builtApCount >= builtAdCritCount + builtOnHitCount) {
    return {
      effectiveStyle: 'AP',
      inferredFromItems: true,
      builtTankCount,
      builtApCount,
      builtAdCritCount,
      builtOnHitCount,
      builtBurnCount
    }
  }
  if (builtTankCount >= 1 && builtTankCount > builtApCount && builtTankCount >= builtAdCritCount + builtOnHitCount) {
    return {
      effectiveStyle: 'TANK',
      inferredFromItems: true,
      builtTankCount,
      builtApCount,
      builtAdCritCount,
      builtOnHitCount,
      builtBurnCount
    }
  }
  if (builtOnHitCount >= 1 && builtOnHitCount >= builtAdCritCount) {
    return {
      effectiveStyle: 'AD_ONHIT',
      inferredFromItems: true,
      builtTankCount,
      builtApCount,
      builtAdCritCount,
      builtOnHitCount,
      builtBurnCount
    }
  }
  if (builtAdCritCount >= 1) {
    return {
      effectiveStyle: 'AD_CRIT',
      inferredFromItems: true,
      builtTankCount,
      builtApCount,
      builtAdCritCount,
      builtOnHitCount,
      builtBurnCount
    }
  }

  // Fallback to hero archetype + picked augments
  const pickedTags = new Set(pickedMetas.flatMap((m) => m.tags))
  const baseType = myHero?.damageType || 'AP'
  if (myHero?.roles.includes('tank') || baseType === 'TANK') {
    return {
      effectiveStyle: 'TANK',
      inferredFromItems: false,
      builtTankCount,
      builtApCount,
      builtAdCritCount,
      builtOnHitCount,
      builtBurnCount
    }
  }
  if (baseType === 'AD') {
    const prefersOnHit = pickedTags.has('onhit') && !pickedTags.has('crit')
    return {
      effectiveStyle: prefersOnHit ? 'AD_ONHIT' : 'AD_CRIT',
      inferredFromItems: false,
      builtTankCount,
      builtApCount,
      builtAdCritCount,
      builtOnHitCount,
      builtBurnCount
    }
  }
  if (myHero?.roles.includes('support') && !myHero?.roles.includes('mage')) {
    return {
      effectiveStyle: 'SUPPORT',
      inferredFromItems: false,
      builtTankCount,
      builtApCount,
      builtAdCritCount,
      builtOnHitCount,
      builtBurnCount
    }
  }
  return {
    effectiveStyle: 'AP',
    inferredFromItems: false,
    builtTankCount,
    builtApCount,
    builtAdCritCount,
    builtOnHitCount,
    builtBurnCount
  }
}

export function analyzeMatchContext(
  bundle: SeedBundle,
  state: GameLiveState,
  heroId: string
): GlobalMatchContext {
  const myHero = bundle.heroes[heroId]
  const enemies = state.enemyHeroIds
    .map((id) => bundle.heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))
  const allies = state.allyHeroIds
    .map((id) => bundle.heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))

  let removedSelf = false
  const otherAllies = allies.filter((h) => {
    if (!removedSelf && h.id === heroId) {
      removedSelf = true
      return false
    }
    return true
  })

  const pickedMetas = state.pickedAugmentIds
    .map((id) => bundle.augments[id])
    .filter((x): x is AugmentMeta => Boolean(x))

  const totalEnemies = Math.max(1, enemies.length)
  const adCount = enemies.filter((h) => h.damageType === 'AD').length
  const apCount = enemies.filter((h) => h.damageType === 'AP').length
  const mixedCount = enemies.length - adCount - apCount
  const enemyAdRatio =
    enemies.length === 0 ? 0.5 : Number(((adCount + mixedCount * 0.5) / totalEnemies).toFixed(2))
  const enemyApRatio =
    enemies.length === 0 ? 0.5 : Number(((apCount + mixedCount * 0.5) / totalEnemies).toFixed(2))

  const enemyItemTankCount = state.enemyPlayers.filter((ep) =>
    ep.itemIds.some((iid) => TANK_ITEMS.has(iid))
  ).length
  const enemyTankCount = Math.max(
    enemyItemTankCount,
    enemies.filter((h) => h.roles.includes('tank') || h.damageType === 'TANK').length
  )

  const enemyItemHealCount = state.enemyPlayers.filter((ep) =>
    ep.itemIds.some((iid) => HEAL_ITEMS.has(iid))
  ).length
  const enemyHealThreat = Math.max(
    enemyItemHealCount >= 2 ? 2 : 0,
    enemies.filter((h) => HEAVY_HEAL_HERO_IDS.has(h.id)).length
  )

  const enemyDiveThreat = enemies.filter(
    (h) =>
      h.roles.includes('assassin') || (h.roles.includes('fighter') && !h.roles.includes('marksman'))
  ).length

  const enemyPokeThreat = enemies.filter((h) => HEAVY_POKE_HERO_IDS.has(h.id)).length
  const enemyShieldThreat = enemies.filter((h) => HEAVY_SHIELD_HERO_IDS.has(h.id)).length
  const enemyArmorStackers = state.enemyPlayers.filter(
    (ep) => ep.itemIds.filter((iid) => ARMOR_ITEMS.has(iid)).length >= 1
  ).length
  const enemyMrStackers = state.enemyPlayers.filter(
    (ep) => ep.itemIds.filter((iid) => MR_ITEMS.has(iid)).length >= 1
  ).length
  const enemyCritThreats = Math.max(
    enemies.filter((h) => h.roles.includes('marksman')).length,
    state.enemyPlayers.filter((ep) => ep.itemIds.some((iid) => CRIT_ITEMS.has(iid))).length
  )

  const fedBoss = state.enemyPlayers.find((ep) => ep.isFedBoss) || null
  const fedBossHero = fedBoss ? bundle.heroes[fedBoss.heroId] || null : null

  const allyApCount = allies.filter((h) => h.damageType === 'AP').length
  const allyAdCount = allies.filter((h) => h.damageType === 'AD').length
  const allyTankCount = allies.filter((h) => h.roles.includes('tank')).length
  const otherAllyTankCount = otherAllies.filter((h) => h.roles.includes('tank')).length
  const allyHasNoTank = allies.length >= 4 && otherAllyTankCount === 0

  let allyDamageWarning: string | null = null
  if (allies.length >= 4) {
    if (allyApCount >= 4) allyDamageWarning = '我方 4+ AP 偏法伤'
    else if (allyAdCount >= 4) allyDamageWarning = '我方纯物理菜刀队'
    else if (allyTankCount === 0) allyDamageWarning = '我方无坦克前排'
  }

  const threatRadar: ThreatRadar = {
    enemyAdRatio,
    enemyApRatio,
    enemyTankCount,
    enemyHealThreat,
    enemyDiveThreat,
    enemyPokeThreat,
    enemyShieldThreat,
    enemyArmorStackers,
    enemyMrStackers,
    allyApCount,
    allyAdCount,
    allyTankCount,
    fedBossHeroId: fedBoss?.heroId || null,
    fedBossKills: fedBoss?.kills || 0,
    allyDamageWarning
  }

  const styleInfo = inferPlayerBuildStyle(myHero, bundle, state.currentItemIds, pickedMetas)
  const level = state.currentLevel ?? 3
  const gamePhase: GamePhase = level <= 6 ? 'early' : level <= 10 ? 'mid' : 'late'

  return {
    myHero,
    allies,
    otherAllies,
    enemies,
    pickedMetas,
    threatRadar,
    fedBoss,
    fedBossHero,
    ...styleInfo,
    isManalessHero: Boolean(myHero && MANALESS_HERO_IDS.has(myHero.id)),
    gamePhase,
    allyApCount,
    allyAdCount,
    allyTankCount,
    allyHasNoTank,
    enemyPokeThreat,
    enemyShieldThreat,
    enemyArmorStackers,
    enemyMrStackers,
    enemyCritThreats
  }
}
