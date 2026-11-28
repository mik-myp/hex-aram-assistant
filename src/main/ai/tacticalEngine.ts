import { buildHeroDetailGuide } from '../data/synergyEngine'
import type {
  DynamicBuildStep,
  GameLiveState,
  PlaystyleMode,
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
  const mode: PlaystyleMode = state.playstyleMode || 'steady'
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
  if (mode === 'yolo') {
    const offShoe = isEffectiveAd ? '3006' : '3020'
    if (bundle.items[offShoe]) {
      recommendedShoe = {
        itemId: offShoe,
        owned: Boolean(ownedBootId),
        reason: '独爽模式：输出穿透/攻速拉满'
      }
    }
  } else if (ctx.enemies.length >= 3 && threatRadar.enemyApRatio >= 0.68 && bundle.items['3111']) {
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

  // 2. Dynamic 5-item build plan driven by inferred style + picked augments + live enemy items
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

  if (mode === 'yolo') {
    if (isEffectiveAp || isEffectiveTank) {
      for (const [id, why] of [
        ['3118', '大招落地减魔抗灼烧，核弹起手第一件'],
        ['4645', '低血量技能直接暴击秒脆皮'],
        ['3089', '最大化法强斩杀线，一发清屏'],
        ['4646', '高额法穿与电击斩杀滚雪球'],
        ['3135', '无视魔抗灌满核弹伤害']
      ] as const) {
        pushStep(id, '独爽核弹', why)
      }
    } else {
      for (const [id, why] of [
        ['3031', '极限暴击伤害核心'],
        ['3094', '超远距离先手暴击点脆皮'],
        ['3036', '无视护甲刀刀见肉'],
        ['3153', '高攻速百分比抽血爽感拉满'],
        ['6672', '极限攻速特效连射']
      ] as const) {
        pushStep(id, '独爽核弹', why)
      }
    }
  }

  if (mode === 'torment') {
    if (isEffectiveTank || (!ctx.inferredFromItems && myHero?.roles.includes('fighter'))) {
      for (const [id, why] of [
        ['3084', '无限叮叮叠体型与生命，越打越绝望'],
        ['2502', '团战每4秒全屏吸甲回血打不死'],
        ['3065', '大幅放大回血与护盾，残血反吸'],
        ['3075', '反弹伤害顺带挂重伤恶心对面AD']
      ] as const) {
        pushStep(id, '折磨恶心', why)
      }
    } else if (isEffectiveAp) {
      for (const [id, why] of [
        ['2503', '群体技能挂火持续折磨'],
        ['6653', '百分比最大生命灼烧融化全队'],
        ['3116', '技能无限群体减速留人恶心死对面'],
        ['3157', '残血开金身规避集火继续折磨']
      ] as const) {
        pushStep(id, '折磨恶心', why)
      }
    } else {
      for (const [id, why] of [
        ['3153', '吸血减速拉扯前排'],
        ['3085', '分裂箭群体挂特效消耗'],
        ['6333', '团战减伤回血死不掉']
      ] as const) {
        pushStep(id, '折磨恶心', why)
      }
    }
  }

  if (mode === 'team') {
    if (
      ctx.allyTankCount === 0 &&
      (isEffectiveTank || myHero?.roles.includes('fighter') || myHero?.roles.includes('support'))
    ) {
      for (const [id, why] of [
        ['3084', '替全队撑起第一前排吸收火力'],
        ['2502', '站场持久承伤保护后排双C'],
        ['3109', '绑定我方核心C位分摊伤害']
      ] as const) {
        pushStep(id, '团队补位', why)
      }
    } else if (
      ctx.allyApCount >= 4 &&
      (myHero?.roles.includes('marksman') || myHero?.id === '10' || myHero?.id === '4')
    ) {
      for (const [id, why] of [
        ['3153', '全队4AP缺物理，转AD破败针对魔抗装'],
        ['3124', '双修鬼索高频触发攻击特效'],
        ['3302', '界弓提供双抗穿透支撑持续DPS']
      ] as const) {
        pushStep(id, '团队补位', why)
      }
    } else if (isEffectiveAp) {
      pushStep('3116', '团队补位', '群体减速帮队友留人拉扯')
      pushStep('3165', '团队补位', '主动为全队承担群体挂重伤任务')
    }
  }

  // Augment-bound pivot items always carry strong synergy
  for (const pst of pickedAugStats) {
    if (pst.boundItems?.[0]) {
      const amName = bundle.augments[pst.augmentId]?.name || '已拿海克斯'
      pushStep(pst.boundItems[0].itemId, '海克斯变阵', `联动已选【${amName}】`)
    }
  }
  if (pickedTags.has('crit') && isEffectiveAp) {
    pushStep('4645', '海克斯变阵', '配合暴击海克斯放大斩杀')
  }

  // Player-selected in-game archetype override takes priority over generic core builds
  if (activeArchetype) {
    for (const aid of activeArchetype.recommendedItems) {
      pushStep(aid, '流派定制', `流派路线【${activeArchetype.title}】核心装`)
    }
  }

  // If player pivoted to AP on a tank/mixed champ via purchased items (e.g. AP Malphite), keep AP follow-ups
  if (mode === 'steady' && ctx.inferredFromItems && isEffectiveAp && myHero?.damageType !== 'AP') {
    for (const [id, why] of [
      ['4645', '顺应已出法强装，压低血线爆发斩杀'],
      ['3089', '已走法强路线，大帽放大整套爆发'],
      ['3135', '补充法穿打穿敌方魔抗']
    ] as const) {
      pushStep(id, '海克斯变阵', why)
    }
  } else if (mode === 'steady' && baseCore[0]) {
    pushStep(baseCore[0], '常规核心', bundle.items[baseCore[0]]?.brief || '起手第一核心大件')
  }

  // Anti-fed-boss counter
  if (fedBossHero && (mode === 'counter' || mode === 'steady')) {
    if (fedBossHero.roles.includes('assassin') || fedBossHero.damageType === 'AD') {
      const bossDef = isEffectiveTank
        ? pickFirstExistingItem(bundle, ['3143', '3075'])
        : isEffectiveAp
          ? pickFirstExistingItem(bundle, ['3157'])
          : pickFirstExistingItem(bundle, ['6333', '3026'])
      if (bossDef) {
        const why = `专防敌方 ${fedBoss!.kills} 杀大爹【${fedBossHero.name}】切入秒杀`
        counterItemIds.push({ itemId: bossDef, reason: why })
        if (mode === 'counter' || state.currentItemIds.length >= 1) {
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
        if (mode === 'counter' || state.currentItemIds.length >= 1) {
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

  // Tank anti-crit counter
  if (isEffectiveTank && ctx.enemyCritThreats >= 2) {
    const randuin = pickFirstExistingItem(bundle, ['3143'])
    if (randuin) {
      const why = `敌方 ${ctx.enemyCritThreats} 名暴击输出，兰顿大幅减伤`
      counterItemIds.push({ itemId: randuin, reason: why })
      pushStep(randuin, '防秒抗性', why)
    }
  }

  // High AP / Poke MR counter
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

  // Fill remaining slots with hero core & situational high-WR items
  if (!(ctx.inferredFromItems && isEffectiveAp && myHero?.damageType === 'TANK')) {
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

  const MODE_HEADLINES: Record<PlaystyleMode, string> = {
    steady: fedBossHero
      ? `综合全局 · 留意敌方 ${fedBoss!.kills} 杀【${fedBossHero.name}】威胁`
      : ctx.inferredFromItems && isEffectiveAp && myHero?.damageType === 'TANK'
        ? '综合全局 · 已识别法强变阵，联动出装与海克斯推荐'
        : '综合全局上分 · 联动海克斯、已出装备与敌我阵容动态推演',
    counter: fedBossHero
      ? `专治敌方 ${fedBoss!.kills} 杀大爹【${fedBossHero.name}】与前排回血`
      : '针对克制模式 · 按敌方阵容与实际出装精准反制',
    team: threatRadar.allyDamageWarning
      ? `团队补位（${threatRadar.allyDamageWarning}）· 已为你调整补位路线`
      : '团队协作模式 · 优先保障全队控制与前排均衡',
    yolo: '只顾自己爽模式 · 放弃保守防御，伤害上限与快乐拉满！',
    torment: '不死折磨模式 · 持续灼烧减速与续航拉满，恶心死对面！'
  }

  const playstyleTips: string[] = []
  if (threatRadar.allyDamageWarning) playstyleTips.push(threatRadar.allyDamageWarning)
  if (ctx.enemyPokeThreat >= 2) {
    playstyleTips.push(`敌方 ${ctx.enemyPokeThreat} 长手消耗，优先续航或果断开团`)
  }
  if (ctx.enemyShieldThreat >= 2) {
    playstyleTips.push('敌方护盾较厚，AD 刺客/战士可考虑巨蛇之牙破盾')
  }

  const anvilFocus = computeStatAnvilFocus(ctx, mode)

  return {
    playstyleMode: mode,
    headline: activeArchetype
      ? `流派路线 · ${activeArchetype.title}（${activeArchetype.badge}）`
      : MODE_HEADLINES[mode],
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
    nextAugmentFocus: MODE_HEADLINES[mode],
    playstyleTips: playstyleTips.slice(0, 2)
  }
}
