import { buildHeroDetailGuide } from '../data/synergyEngine'
import type {
  DynamicBuildStep,
  GameLiveState,
  SeedBundle,
  TacticalAdvice,
  UserPreferences
} from '@shared/types'
import { computeStatAnvilFocus } from './augmentCombos'
import { evaluateSituationalAugments } from './augmentScoring'
import { analyzeMatchContext } from './matchContext'
import { evaluateRerollExpectation } from './rerollAdvisor'

const BOOT_IDS = new Set(['3020', '3111', '3047', '3158', '3006', '3009', '3008'])

function pickFirstExistingItem(bundle: SeedBundle, candidates: string[]): string | null {
  for (const id of candidates) {
    if (bundle.items[id]) return id
  }
  return null
}

export { evaluateSituationalAugments }

export function computeLocalTacticalAdvice(
  bundle: SeedBundle,
  state: GameLiveState,
  selectedHeroId: string | null,
  prefs?: Pick<UserPreferences, 'favoriteAugmentIds' | 'blacklistedAugmentIds'>
): TacticalAdvice {
  const heroId = selectedHeroId || state.myHeroId || Object.keys(bundle.heroes)[0]
  const guide = buildHeroDetailGuide(bundle, heroId)
  const ctx = analyzeMatchContext(bundle, state, heroId)
  const { myHero, threatRadar, fedBoss, fedBossHero } = ctx
  const availableArchetypes = (guide?.archetypes || []).map((a) => ({
    id: a.id,
    title: a.title,
    badge: a.badge,
    itemPivotTip: a.itemPivotTip
  }))
  const activeArchetype =
    guide?.archetypes.find((a) => a.id === state.selectedArchetypeId) || null

  const ownedSet = new Set(state.currentItemIds)
  const gold = state.currentGold ?? 1400

  const isEffectiveAp = ctx.effectiveStyle === 'AP' || ctx.effectiveStyle === 'SUPPORT'
  const isEffectiveTank = ctx.effectiveStyle === 'TANK'
  const isEffectiveAd = ctx.effectiveStyle === 'AD_CRIT' || ctx.effectiveStyle === 'AD_ONHIT'

  // 1. Dynamic Boots recommendation
  const ownedBootId = state.currentItemIds.find((id) => BOOT_IDS.has(id))
  let recommendedShoe: TacticalAdvice['recommendedShoe'] = null
  if (ctx.enemies.length >= 3 && threatRadar.enemyApRatio >= 0.68 && bundle.items['3111']) {
    recommendedShoe = {
      itemId: '3111',
      owned: Boolean(ownedBootId),
      reason: `防敌方 ${Math.round(threatRadar.enemyApRatio * 100)}% 高法伤与控制`
    }
  } else if (ctx.enemies.length >= 3 && threatRadar.enemyAdRatio >= 0.72 && bundle.items['3047']) {
    recommendedShoe = {
      itemId: '3047',
      owned: Boolean(ownedBootId),
      reason: '克制敌方物理菜刀队普攻'
    }
  } else if (myHero?.topShoes?.[0] && bundle.items[myHero.topShoes[0].itemId]) {
    recommendedShoe = {
      itemId: myHero.topShoes[0].itemId,
      owned: Boolean(ownedBootId),
      reason: '高胜率常规首选鞋'
    }
  }

  // 2. Dynamic 5-item build plan driven by chosen archetype OR live inferred style + augments + enemy items
  const baseCore = guide?.coreBuilds[0]?.items || []
  const planMap = new Map<string, DynamicBuildStep>()

  const pushStep = (
    itemId: string | null,
    sourceTag: DynamicBuildStep['sourceTag'],
    reason: string
  ): void => {
    if (!itemId || !bundle.items[itemId] || planMap.has(itemId)) return
    const totalCost = bundle.items[itemId].totalGold || 3000
    const owned = ownedSet.has(itemId)
    const rem = owned ? 0 : Math.max(0, totalCost - gold)
    planMap.set(itemId, {
      itemId,
      owned,
      affordableNow: !owned && gold >= totalCost && totalCost > 0,
      goldRemaining: rem,
      sourceTag,
      reason
    })
  }

  const pickedAugStats = state.pickedAugmentIds
    .map((aid) => guide?.augments.find((a) => a.augmentId === aid))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
  const pickedTags = new Set(ctx.pickedMetas.flatMap((m) => m.tags))
  const counterItemIds: Array<{ itemId: string; reason: string }> = []

  // When the player explicitly picks a build archetype, lead directly with its 4 distinct core items!
  if (activeArchetype) {
    for (const itemId of activeArchetype.recommendedItems.slice(0, 4)) {
      pushStep(itemId, '流派定制', `流派【${activeArchetype.title}】核心装`)
    }
  } else {
    // Auto global推演: augment-bound pivot items + inferred build trajectory + standard core
    for (const pst of pickedAugStats) {
      if (pst.boundItems?.[0]) {
        const amName = bundle.augments[pst.augmentId]?.name || '已拿海克斯'
        pushStep(pst.boundItems[0].itemId, '海克斯变阵', `联动已选【${amName}】`)
      }
    }
    if (pickedTags.has('crit') && isEffectiveAp) {
      pushStep('4645', '海克斯变阵', '配合暴击海克斯放大斩杀')
    }
    if (ctx.inferredFromItems && isEffectiveAp && myHero?.damageType !== 'AP') {
      for (const [id, why] of [
        ['4645', '顺应已出法强装，压低血线爆发斩杀'],
        ['3089', '已走法强路线，大帽放大整套爆发'],
        ['3135', '补充法穿打穿敌方魔抗']
      ] as const) {
        pushStep(id, '海克斯变阵', why)
      }
    } else if (baseCore[0]) {
      pushStep(baseCore[0], '常规核心', bundle.items[baseCore[0]]?.brief || '起手第一核心大件')
    }
  }

  // Anti-fed-boss counter
  if (fedBossHero) {
    if (fedBossHero.roles.includes('assassin') || fedBossHero.damageType === 'AD') {
      const bossDef = isEffectiveTank
        ? pickFirstExistingItem(bundle, ['3143', '3075'])
        : isEffectiveAp
          ? pickFirstExistingItem(bundle, ['3157'])
          : pickFirstExistingItem(bundle, ['6333', '3026'])
      if (bossDef) {
        const why = `专防敌方 ${fedBoss!.kills} 杀大爹【${fedBossHero.name}】切入秒杀`
        counterItemIds.push({ itemId: bossDef, reason: why })
        if (!activeArchetype && state.currentItemIds.length >= 1) {
          pushStep(bossDef, '专治大爹', why)
        }
      }
    } else if (fedBossHero.roles.includes('tank') || fedBossHero.damageType === 'TANK') {
      const bossBuster = isEffectiveAp
        ? pickFirstExistingItem(bundle, ['6653', '3135'])
        : pickFirstExistingItem(bundle, ['3153', '3036'])
      if (bossBuster) {
        const why = `专克敌方 ${fedBoss!.kills} 杀大肉【${fedBossHero.name}】`
        counterItemIds.push({ itemId: bossBuster, reason: why })
        if (!activeArchetype && state.currentItemIds.length >= 1) {
          pushStep(bossBuster, '专治大爹', why)
        }
      }
    }
  }

  // Anti-heal counter
  if (threatRadar.enemyHealThreat >= 2) {
    const antiHealId = isEffectiveTank
      ? pickFirstExistingItem(bundle, ['3075'])
      : isEffectiveAp
        ? pickFirstExistingItem(bundle, ['3165'])
        : pickFirstExistingItem(bundle, ['3033', '6609'])
    if (antiHealId) {
      const why = '敌方回血极猛，必挂重伤压制续航'
      counterItemIds.push({ itemId: antiHealId, reason: why })
      pushStep(antiHealId, '重伤克制', why)
    }
  }

  // Tank-buster & enemy armor/MR stacking counters
  if ((threatRadar.enemyTankCount >= 2 || ctx.enemyArmorStackers >= 2 || ctx.enemyMrStackers >= 2) && !isEffectiveTank) {
    const penId = isEffectiveAp
      ? ctx.enemyMrStackers >= 2
        ? pickFirstExistingItem(bundle, ['3135', '6653'])
        : pickFirstExistingItem(bundle, ['6653', '3135'])
      : ctx.enemyArmorStackers >= 2
        ? pickFirstExistingItem(bundle, ['3036', '3033', '3153'])
        : pickFirstExistingItem(bundle, ['3153', '3036'])
    if (penId) {
      const why =
        ctx.enemyArmorStackers >= 2 && isEffectiveAd
          ? `敌方 ${ctx.enemyArmorStackers} 人已堆护甲，优先补穿甲`
          : ctx.enemyMrStackers >= 2 && isEffectiveAp
            ? `敌方 ${ctx.enemyMrStackers} 人已堆魔抗，优先补法穿`
            : `打穿敌方 ${threatRadar.enemyTankCount} 名重装前排`
      counterItemIds.push({ itemId: penId, reason: why })
      pushStep(penId, '打坦穿透', why)
    }
  }

  // Tank anti-crit & High AP MR counters
  if (isEffectiveTank && ctx.enemyCritThreats >= 2) {
    const randuin = pickFirstExistingItem(bundle, ['3143'])
    if (randuin) {
      const why = `敌方 ${ctx.enemyCritThreats} 名暴击输出，兰顿大幅减伤`
      counterItemIds.push({ itemId: randuin, reason: why })
      pushStep(randuin, '防秒抗性', why)
    }
  }

  if (threatRadar.enemyApRatio >= 0.65 || (isEffectiveTank && ctx.enemyPokeThreat >= 3)) {
    const mrId = isEffectiveTank
      ? pickFirstExistingItem(bundle, ['2504', '3065'])
      : isEffectiveAd
        ? pickFirstExistingItem(bundle, ['3156'])
        : pickFirstExistingItem(bundle, ['3102'])
    if (mrId) {
      const why = `敌方 ${Math.round(threatRadar.enemyApRatio * 100)}% 法伤/消耗，补魔抗防压血`
      counterItemIds.push({ itemId: mrId, reason: why })
      pushStep(mrId, '防秒抗性', why)
    }
  }

  // Fill remaining slots up to 5
  if (!activeArchetype && !(ctx.inferredFromItems && isEffectiveAp && myHero?.damageType === 'TANK')) {
    for (const cid of baseCore) {
      pushStep(cid, '常规核心', bundle.items[cid]?.brief || '高胜率成型核心件')
    }
  }
  for (const sit of (guide?.situationalItems || []).slice(0, 4)) {
    if (planMap.size >= 5) break
    pushStep(sit.itemId, '常规核心', bundle.items[sit.itemId]?.brief || '后期补强神装')
  }

  const dynamicBuildPlan = [...planMap.values()].slice(0, 5)
  const immediateNextItem = dynamicBuildPlan.find((s) => !s.owned) || dynamicBuildPlan[0] || null

  if (counterItemIds.length === 0 && immediateNextItem) {
    counterItemIds.push({
      itemId: immediateNextItem.itemId,
      reason: immediateNextItem.reason
    })
  }

  const rawSituationalCandidates = evaluateSituationalAugments(
    bundle,
    state,
    heroId,
    threatRadar,
    state.candidateAugmentIds,
    guide,
    ctx,
    {
      activeArchetype,
      favoriteAugmentIds: prefs?.favoriteAugmentIds,
      blacklistedAugmentIds: prefs?.blacklistedAugmentIds
    }
  )
  const { annotatedCandidates: situationalCandidates, rerollAdvice } = evaluateRerollExpectation(
    bundle,
    guide,
    state.pickedAugmentIds,
    rawSituationalCandidates
  )

  const headline = activeArchetype
    ? `流派路线 · ${activeArchetype.title}（${activeArchetype.badge}）`
    : fedBossHero
      ? `综合全局 · 留意敌方 ${fedBoss!.kills} 杀【${fedBossHero.name}】威胁`
      : ctx.inferredFromItems && isEffectiveAp && myHero?.damageType === 'TANK'
        ? '综合全局 · 已识别法强变阵，联动出装与海克斯推荐'
        : '综合全局 · 联动已出装备、海克斯与敌我阵容动态推演'

  const playstyleTips: string[] = []
  if (threatRadar.allyDamageWarning) playstyleTips.push(threatRadar.allyDamageWarning)
  if (ctx.enemyPokeThreat >= 2) {
    playstyleTips.push(`敌方 ${ctx.enemyPokeThreat} 长手消耗，优先续航或果断开团`)
  }
  if (ctx.enemyShieldThreat >= 2) {
    playstyleTips.push('敌方护盾较厚，AD 刺客/战士可考虑巨蛇之牙破盾')
  }

  const anvilFocus = computeStatAnvilFocus(ctx)

  return {
    headline,
    threatRadar,
    recommendedSpells: guide?.bestSpells?.[0]?.label || null,
    availableArchetypes,
    activeArchetypeId: activeArchetype?.id ?? null,
    recommendedShoe,
    immediateNextItem,
    dynamicBuildPlan,
    situationalCandidates,
    rerollAdvice,
    counterItemIds: counterItemIds.slice(0, 3),
    anvilFocus,
    nextAugmentFocus: headline,
    playstyleTips: playstyleTips.slice(0, 2)
  }
}
