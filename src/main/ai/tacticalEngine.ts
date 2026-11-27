import { buildHeroDetailGuide } from '../data/synergyEngine'
import type {
  DynamicBuildStep,
  GameLiveState,
  HeroMeta,
  PlaystyleMode,
  SeedBundle,
  TacticalAdvice,
  ThreatRadar
} from '@shared/types'
import { evaluateSituationalAugments } from './augmentScoring'

const HEAVY_HEAL_HERO_IDS = new Set([
  '8', '16', '19', '27', '36', '37', '50', '114', '141',
  '154', '223', '233', '266', '267', '350', '517', '777', '895'
])

const HEARTSTEEL_OR_HEAL_ITEMS = new Set(['3084', '3065', '2502', '6617', '3153'])
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
  selectedHeroId: string | null
): TacticalAdvice {
  const mode: PlaystyleMode = state.playstyleMode || 'steady'
  const heroId = selectedHeroId || state.myHeroId || Object.keys(bundle.heroes)[0]
  const guide = buildHeroDetailGuide(bundle, heroId)
  const myHero: HeroMeta | undefined = bundle.heroes[heroId]

  const enemies = state.enemyHeroIds
    .map((id) => bundle.heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))
  const allies = state.allyHeroIds
    .map((id) => bundle.heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))

  const ownedSet = new Set(state.currentItemIds)
  const gold = state.currentGold ?? 1400

  const totalEnemies = Math.max(1, enemies.length)
  const adCount = enemies.filter((h) => h.damageType === 'AD').length
  const apCount = enemies.filter((h) => h.damageType === 'AP').length
  const mixedCount = enemies.length - adCount - apCount
  const enemyAdRatio =
    enemies.length === 0 ? 0.5 : Number(((adCount + mixedCount * 0.5) / totalEnemies).toFixed(2))
  const enemyApRatio =
    enemies.length === 0 ? 0.5 : Number(((apCount + mixedCount * 0.5) / totalEnemies).toFixed(2))

  const enemyItemTankCount = state.enemyPlayers.filter((ep) =>
    ep.itemIds.some((iid) => iid === '3084' || iid === '3075' || iid === '2502')
  ).length
  const enemyTankCount = Math.max(
    enemyItemTankCount,
    enemies.filter((h) => h.roles.includes('tank') || h.damageType === 'TANK').length
  )

  const enemyItemHealCount = state.enemyPlayers.filter((ep) =>
    ep.itemIds.some((iid) => HEARTSTEEL_OR_HEAL_ITEMS.has(iid))
  ).length
  const enemyHealThreat = Math.max(
    enemyItemHealCount >= 2 ? 2 : 0,
    enemies.filter((h) => HEAVY_HEAL_HERO_IDS.has(h.id)).length
  )

  const enemyDiveThreat = enemies.filter(
    (h) =>
      h.roles.includes('assassin') || (h.roles.includes('fighter') && !h.roles.includes('marksman'))
  ).length

  const fedBoss = state.enemyPlayers.find((ep) => ep.isFedBoss) || null
  const fedBossHero = fedBoss ? bundle.heroes[fedBoss.heroId] : null

  let allyDamageWarning: string | null = null
  const allyAp = allies.filter((h) => h.damageType === 'AP').length
  const allyAd = allies.filter((h) => h.damageType === 'AD').length
  const allyTank = allies.filter((h) => h.roles.includes('tank')).length
  if (allies.length >= 4) {
    if (allyAp >= 4) allyDamageWarning = '我方 4+ AP 偏法伤'
    else if (allyAd >= 4) allyDamageWarning = '我方纯物理菜刀队'
    else if (allyTank === 0) allyDamageWarning = '我方无坦克前排'
  }

  const threatRadar: ThreatRadar = {
    enemyAdRatio,
    enemyApRatio,
    enemyTankCount,
    enemyHealThreat,
    enemyDiveThreat,
    fedBossHeroId: fedBoss?.heroId || null,
    fedBossKills: fedBoss?.kills || 0,
    allyDamageWarning
  }

  const ownedBootId = state.currentItemIds.find((id) => BOOT_IDS.has(id))
  let recommendedShoe: TacticalAdvice['recommendedShoe'] = null
  if (mode === 'yolo') {
    const offShoe = myHero?.damageType === 'AD' ? '3006' : '3020'
    if (bundle.items[offShoe]) {
      recommendedShoe = {
        itemId: offShoe,
        owned: Boolean(ownedBootId),
        reason: '独爽模式：输出穿透/攻速拉满'
      }
    }
  } else if (enemies.length >= 3 && enemyApRatio >= 0.68 && bundle.items['3111']) {
    recommendedShoe = {
      itemId: '3111',
      owned: Boolean(ownedBootId),
      reason: `防敌方 ${Math.round(enemyApRatio * 100)}% 高法伤与控制`
    }
  } else if (enemies.length >= 3 && enemyAdRatio >= 0.72 && bundle.items['3047']) {
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

  const myType = myHero?.damageType || 'AP'
  const isTank = myHero?.roles.includes('tank') || myType === 'TANK'
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
  const pickedMetas = state.pickedAugmentIds
    .map((id) => bundle.augments[id])
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
  const pickedTags = new Set(pickedMetas.flatMap((m) => m.tags))
  const counterItemIds: Array<{ itemId: string; reason: string }> = []

  if (mode === 'yolo') {
    if (myType === 'AP' || isTank) {
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
    if (isTank || myHero?.roles.includes('fighter')) {
      for (const [id, why] of [
        ['3084', '无限叮叮叠体型与生命，越打越绝望'],
        ['2502', '团战每4秒全屏吸甲回血打不死'],
        ['3065', '大幅放大回血与护盾，残血反吸'],
        ['3075', '反弹伤害顺带挂重伤恶心对面AD']
      ] as const) {
        pushStep(id, '折磨恶心', why)
      }
    } else if (myType === 'AP') {
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
      allyTank === 0 &&
      (isTank || myHero?.roles.includes('fighter') || myHero?.roles.includes('support'))
    ) {
      for (const [id, why] of [
        ['3084', '替全队撑起第一前排吸收火力'],
        ['2502', '站场持久承伤保护后排双C'],
        ['3109', '绑定我方核心C位分摊伤害']
      ] as const) {
        pushStep(id, '团队补位', why)
      }
    } else if (
      allyAp >= 4 &&
      (myHero?.roles.includes('marksman') || myHero?.id === '10' || myHero?.id === '4')
    ) {
      for (const [id, why] of [
        ['3153', '全队4AP缺物理，转AD破败针对魔抗装'],
        ['3124', '双修鬼索高频触发攻击特效'],
        ['3302', '界弓提供双抗穿透支撑持续DPS']
      ] as const) {
        pushStep(id, '团队补位', why)
      }
    } else if (myType === 'AP') {
      pushStep('3116', '团队补位', '群体减速帮队友留人拉扯')
      pushStep('3165', '团队补位', '主动为全队承担群体挂重伤任务')
    }
  }

  for (const pst of pickedAugStats) {
    if (pst.boundItems?.[0]) {
      const amName = bundle.augments[pst.augmentId]?.name || '已拿海克斯'
      pushStep(pst.boundItems[0].itemId, '海克斯变阵', `联动已选【${amName}】`)
    }
  }
  if (pickedTags.has('crit') && myType === 'AP') {
    pushStep('4645', '海克斯变阵', '配合暴击海克斯放大斩杀')
  }

  if (mode === 'steady' && baseCore[0]) {
    pushStep(baseCore[0], '常规核心', bundle.items[baseCore[0]]?.brief || '起手第一核心大件')
  }

  if (fedBossHero && (mode === 'counter' || mode === 'steady')) {
    if (fedBossHero.roles.includes('assassin') || fedBossHero.damageType === 'AD') {
      const bossDef = isTank
        ? pickFirstExistingItem(bundle, ['3143', '3075'])
        : myType === 'AP'
          ? pickFirstExistingItem(bundle, ['3157'])
          : pickFirstExistingItem(bundle, ['6333', '3026'])
      if (bossDef) {
        const why = `专防敌方 ${fedBoss!.kills} 杀大爹【${fedBossHero.name}】切入秒杀`
        counterItemIds.push({ itemId: bossDef, reason: why })
        if (mode === 'counter') pushStep(bossDef, '专治大爹', why)
      }
    } else if (fedBossHero.roles.includes('tank') || fedBossHero.damageType === 'TANK') {
      const bossBuster =
        myType === 'AP'
          ? pickFirstExistingItem(bundle, ['6653', '3135'])
          : pickFirstExistingItem(bundle, ['3153', '3036'])
      if (bossBuster) {
        const why = `专克敌方 ${fedBoss!.kills} 杀大肉【${fedBossHero.name}】`
        counterItemIds.push({ itemId: bossBuster, reason: why })
        if (mode === 'counter') pushStep(bossBuster, '专治大爹', why)
      }
    }
  }

  if (enemyHealThreat >= 2) {
    const antiHealId = isTank
      ? pickFirstExistingItem(bundle, ['3075'])
      : myType === 'AP'
        ? pickFirstExistingItem(bundle, ['3165'])
        : pickFirstExistingItem(bundle, ['3033', '6609'])
    if (antiHealId) {
      const why = '敌方回血极猛，必挂重伤压制续航'
      counterItemIds.push({ itemId: antiHealId, reason: why })
      pushStep(antiHealId, '重伤克制', why)
    }
  }

  if (enemyTankCount >= 2 && !isTank) {
    const penId =
      myType === 'AP'
        ? pickFirstExistingItem(bundle, ['6653', '3135'])
        : pickFirstExistingItem(bundle, ['3153', '3036'])
    if (penId) {
      const why = `打穿敌方 ${enemyTankCount} 名重装前排`
      counterItemIds.push({ itemId: penId, reason: why })
      pushStep(penId, '打坦穿透', why)
    }
  }

  if (enemyApRatio >= 0.65) {
    const mrId = isTank
      ? pickFirstExistingItem(bundle, ['2504', '3065'])
      : myType === 'AD'
        ? pickFirstExistingItem(bundle, ['3156'])
        : pickFirstExistingItem(bundle, ['3102'])
    if (mrId) {
      const why = `敌方 ${Math.round(enemyApRatio * 100)}% 法伤，补魔抗防消耗`
      counterItemIds.push({ itemId: mrId, reason: why })
      pushStep(mrId, '防秒抗性', why)
    }
  }

  for (const cid of baseCore) {
    pushStep(cid, '常规核心', bundle.items[cid]?.brief || '高胜率成型核心件')
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

  const situationalCandidates = evaluateSituationalAugments(
    bundle,
    state,
    heroId,
    threatRadar,
    state.candidateAugmentIds
  )

  const MODE_HEADLINES: Record<PlaystyleMode, string> = {
    steady: fedBossHero
      ? `稳健推进 · 留意敌方 ${fedBoss!.kills} 杀【${fedBossHero.name}】威胁`
      : '稳健上分路线 · 兼顾高胜率核心与局势克制',
    counter: fedBossHero
      ? `专治敌方 ${fedBoss!.kills} 杀大爹【${fedBossHero.name}】与前排回血`
      : '针对克制模式 · 按敌方阵容弱点精准出装',
    team: allyDamageWarning
      ? `团队补位（${allyDamageWarning}）· 已为你调整补位路线`
      : '团队协作模式 · 优先保障全队控制与前排均衡',
    yolo: '只顾自己爽模式 · 放弃保守防御，伤害上限与快乐拉满！',
    torment: '不死折磨模式 · 持续灼烧减速与续航拉满，恶心死对面！'
  }

  return {
    playstyleMode: mode,
    headline: MODE_HEADLINES[mode],
    threatRadar,
    recommendedShoe,
    immediateNextItem,
    dynamicBuildPlan,
    situationalCandidates,
    counterItemIds: counterItemIds.slice(0, 3),
    nextAugmentFocus: MODE_HEADLINES[mode],
    playstyleTips: allyDamageWarning ? [allyDamageWarning] : []
  }
}
