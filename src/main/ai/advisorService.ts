import { buildHeroDetailGuide } from '../data/synergyEngine'
import type {
  AiSettings,
  DynamicBuildStep,
  GameLiveState,
  HeroMeta,
  PlaystyleMode,
  SeedBundle,
  SituationalAugmentEval,
  TacticalAdvice,
  ThreatRadar
} from '@shared/types'

const HEAVY_HEAL_HERO_IDS = new Set([
  '8', '16', '19', '27', '36', '37', '50', '114', '141',
  '154', '223', '233', '266', '267', '350', '517', '777', '895'
])

const HEARTSTEEL_OR_HEAL_ITEMS = new Set(['3084', '3065', '2502', '6617', '3153'])

function pickFirstExistingItem(bundle: SeedBundle, candidates: string[]): string | null {
  for (const id of candidates) {
    if (bundle.items[id]) return id
  }
  return null
}

/**
 * 5-Mindset Situational Augment Evaluator:
 * Dynamically shifts card rankings & primary tags across:
 * - steady  (⚖️ 稳健)
 * - counter (🎯 针对敌方大爹)
 * - team    (🤝 团队补位)
 * - yolo    (🔥 只顾自己爽)
 * - torment (😈 不死折磨恶心流)
 */
export function evaluateSituationalAugments(
  bundle: SeedBundle,
  state: GameLiveState,
  heroId: string,
  threat: ThreatRadar,
  candidateIds: string[]
): SituationalAugmentEval[] {
  const guide = buildHeroDetailGuide(bundle, heroId)
  if (!guide) return []

  const mode: PlaystyleMode = state.playstyleMode || 'steady'
  const statMap = new Map(guide.augments.map((s) => [s.augmentId, s]))
  const slotByAugId = new Map(state.cardSlots.map((cs) => [cs.augmentId, cs.slotIndex]))

  const pickedMetas = state.pickedAugmentIds
    .map((id) => bundle.augments[id])
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
  const hasBackToBasics = pickedMetas.some((m) => m.name.includes('回归基本功'))
  const hasUltAugment = pickedMetas.some((m) => /终极|大招/.test(`${m.name} ${m.desc}`))

  const allies = state.allyHeroIds
    .map((id) => bundle.heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))
  const allyApCount = allies.filter((h) => h.damageType === 'AP').length
  const allyHasNoTank = allies.length >= 4 && !allies.some((h) => h.roles.includes('tank'))
  const bossHero = threat.fedBossHeroId ? bundle.heroes[threat.fedBossHeroId] : null

  const rawEvals = candidateIds
    .map((augId): Omit<SituationalAugmentEval, 'isRecommendedPick'> | null => {
      const meta = bundle.augments[augId]
      if (!meta) return null
      const stat = statMap.get(augId)
      const baseWr = stat?.smoothedWinRate ?? guide.hero.smoothedWinRate - 0.008
      const deltaWr = stat?.deltaWinRate ?? -0.008
      const text = `${meta.name} ${meta.desc}`

      let bonus = 0
      let hasConflict = false
      let primaryTag = ''
      const reasons: string[] = []

      // 1. Hard Mechanic Conflict Check (Always enforced!)
      if (
        (hasBackToBasics && /终极技能|施放终极|大招/.test(text)) ||
        (hasUltAugment && meta.name.includes('回归基本功'))
      ) {
        hasConflict = true
        bonus -= 0.15
        primaryTag = '⚠️ 机制冲突别选'
        reasons.push('与本局已选大招/封大招海克斯直接冲突！')
      }

      // 2. Synergy with already-picked augments
      const matchedPicked = pickedMetas.find((pm) =>
        pm.tags.some((t) => t !== 'general' && meta.tags.includes(t))
      )
      if (matchedPicked && !hasConflict) {
        bonus += 0.018
        reasons.push(`联动已拿【${matchedPicked.name}】`)
        primaryTag = `🔗 联动${matchedPicked.name}`
      }

      // 3. Mindset-Specific Weighting
      const isExplosiveYolo =
        meta.tags.includes('crit') ||
        meta.tags.includes('onhit') ||
        /玻璃大炮|珠光|巨人杀手|双刀|瞄准镜|科学狂人|利刃华尔兹|核弹|毁灭|暴击/.test(text)
      const isFragilePenalty = /玻璃大炮/.test(meta.name)
      const isTankBuster =
        meta.tags.includes('burn') ||
        meta.tags.includes('onhit') ||
        /巨人杀手|侵蚀|腐蚀|最大生命|真实伤害|炼狱导管/.test(text)
      const isAntiDive =
        meta.tags.includes('shield') ||
        meta.tags.includes('heal') ||
        /无敌|金身|护盾|韧性|定身|歌利亚|泰坦/.test(text)
      const isTormentCard =
        meta.tags.includes('burn') ||
        meta.tags.includes('haste') ||
        meta.tags.includes('tank') ||
        meta.tags.includes('heal') ||
        /冰|减速|灼烧|循环|折磨|心之钢|歌利亚|不灭|海洋/.test(text)

      if (!hasConflict) {
        if (mode === 'yolo') {
          if (isExplosiveYolo) {
            bonus += isFragilePenalty ? 0.095 : 0.045
            primaryTag = '🔥 独爽极限上限'
            reasons.unshift('独爽模式：输出与爽感直接拉满！')
          } else if (meta.tags.includes('tank') && !meta.tags.includes('crit')) {
            bonus -= 0.025
          }
        } else if (mode === 'torment') {
          if (isTormentCard) {
            bonus += 0.042
            primaryTag = '😈 折磨不死神卡'
            reasons.unshift('折磨模式：无限拉扯/灼烧/续航恶心对面！')
          }
          if (isFragilePenalty) {
            bonus -= 0.04
          }
        } else if (mode === 'counter') {
          if (bossHero) {
            if (
              (bossHero.roles.includes('tank') || bossHero.damageType === 'TANK') &&
              isTankBuster
            ) {
              bonus += 0.038
              primaryTag = `🎯 专治${threat.fedBossKills}杀${bossHero.name}`
              reasons.unshift(`针对敌方超神大肉【${bossHero.name}】`)
            } else if (
              (bossHero.roles.includes('assassin') || bossHero.damageType === 'AD') &&
              isAntiDive
            ) {
              bonus += 0.034
              primaryTag = `🎯 防${threat.fedBossKills}杀${bossHero.name}秒杀`
              reasons.unshift(`防敌方大爹【${bossHero.name}】进场秒人`)
            }
          }
          if (threat.enemyTankCount >= 2 && isTankBuster) {
            bonus += 0.025
            if (!primaryTag) primaryTag = `🎯 克制敌方${threat.enemyTankCount}前排`
            reasons.push(`克制敌方 ${threat.enemyTankCount} 名大肉前排`)
          }
          if (threat.enemyDiveThreat >= 2 && isFragilePenalty) {
            bonus -= 0.035
            primaryTag = '⚠️ 易被刺客秒杀'
            reasons.push('对面突脸多，拿脆皮增伤极易暴毙')
          }
        } else if (mode === 'team') {
          if (allyHasNoTank && (meta.tags.includes('tank') || meta.tags.includes('shield'))) {
            bonus += 0.035
            primaryTag = '🤝 补全队前排抗伤'
            reasons.unshift('团队模式：弥补我方 0 前排短板')
          } else if (allyApCount >= 3 && (meta.tags.includes('onhit') || /侵蚀|减抗/.test(text))) {
            bonus += 0.032
            primaryTag = '🤝 破魔抗/混伤补位'
            reasons.unshift('团队模式：缓解我方多 AP 刮痧困境')
          }
        } else {
          // steady mode
          if (threat.enemyTankCount >= 2 && isTankBuster) {
            bonus += 0.015
            if (!primaryTag) primaryTag = `克制${threat.enemyTankCount}前排`
          }
          if (isFragilePenalty && deltaWr <= -0.02) {
            bonus -= 0.02
          }
        }
      }

      if (!primaryTag) {
        if (deltaWr >= 0.03) primaryTag = `S+ 强力 (+${(deltaWr * 100).toFixed(1)}%)`
        else if (deltaWr <= -0.03 && mode !== 'yolo') primaryTag = '⚠️ 慎选陷阱'
        else primaryTag = stat?.verdictLabel || '稳健可用'
      }

      if (reasons.length === 0) {
        reasons.push(
          deltaWr >= 0
            ? `相比英雄均值净增 +${(deltaWr * 100).toFixed(1)}%`
            : `相比英雄均值 ${(deltaWr * 100).toFixed(1)}%`
        )
      }

      const topBound = stat?.boundItems?.[0]

      const effectiveVerdict = hasConflict
        ? 'TRAP'
        : mode === 'yolo' && isExplosiveYolo && stat?.verdict === 'TRAP'
          ? 'S'
          : stat?.verdict || 'B'

      return {
        augmentId: augId,
        slotIndex: slotByAugId.get(augId),
        hasConflict,
        baseWinRate: baseWr,
        deltaWinRate: deltaWr,
        situationalBonus: Number(bonus.toFixed(4)),
        situationalScore: Number((baseWr + bonus).toFixed(4)),
        verdict: effectiveVerdict,
        verdictLabel: stat?.verdictLabel || '可用',
        primaryTag,
        situationReasons: reasons.slice(0, 2),
        pivotItem: topBound
          ? {
              itemId: topBound.itemId,
              name: topBound.name,
              winRate: topBound.winRate
            }
          : undefined
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const sortedByScore = [...rawEvals].sort((a, b) => b.situationalScore - a.situationalScore)
  const winnerId = sortedByScore[0]?.augmentId

  return rawEvals.map((ev) => ({
    ...ev,
    isRecommendedPick: rawEvals.length >= 2 && ev.augmentId === winnerId && !ev.hasConflict
  }))
}

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

  // Also detect real enemy tank/heal items from Live 2999!
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

  // Situational Shoe
  const BOOT_IDS = new Set(['3020', '3111', '3047', '3158', '3006', '3009', '3008'])
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

  // ==================== MODE 1: YOLO (🔥 独爽核弹/极限攻速) ====================
  if (mode === 'yolo') {
    if (myType === 'AP' || isTank) {
      // Even Malphite / Cho'Gath / Blitz / Amumu go full AP Nuke in YOLO mode!
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

  // ==================== MODE 2: TORMENT (😈 不死折磨恶心流) ====================
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

  // ==================== MODE 3: TEAM (🤝 团队补位好大哥) ====================
  if (mode === 'team') {
    if (allyTank === 0 && (isTank || myHero?.roles.includes('fighter') || myHero?.roles.includes('support'))) {
      for (const [id, why] of [
        ['3084', '替全队撑起第一前排吸收火力'],
        ['2502', '站场持久承伤保护后排双C'],
        ['3109', '绑定我方核心C位分摊伤害']
      ] as const) {
        pushStep(id, '团队补位', why)
      }
    } else if (allyAp >= 4 && (myHero?.roles.includes('marksman') || myHero?.id === '10' || myHero?.id === '4')) {
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

  // ==================== MODE 4 & 5: COUNTER (🎯 针对) & STEADY (⚖️ 稳健) ====================
  // Picked augment bound items first
  for (const pst of pickedAugStats) {
    if (pst.boundItems?.[0]) {
      const amName = bundle.augments[pst.augmentId]?.name || '已拿海克斯'
      pushStep(pst.boundItems[0].itemId, '海克斯变阵', `联动已选【${amName}】`)
    }
  }
  if (pickedTags.has('crit') && myType === 'AP') {
    pushStep('4645', '海克斯变阵', '配合暴击海克斯放大斩杀')
  }

  // In 'steady', put 1st core starter first before counters; in 'counter', put counters right at front!
  if (mode === 'steady' && baseCore[0]) {
    pushStep(baseCore[0], '常规核心', bundle.items[baseCore[0]]?.brief || '起手第一核心大件')
  }

  // Fed Boss specific counter!
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

  // Anti-heal & Tank-busting
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

  // Fill remaining slots up to 5 items from hero core build & situational pool
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

export async function askCustomLlmAdvisor(params: {
  bundle: SeedBundle
  state: GameLiveState
  selectedHeroId: string | null
  settings: AiSettings
  userQuestion?: string
}): Promise<{ ok: boolean; content: string }> {
  const { bundle, state, selectedHeroId, settings, userQuestion } = params
  if (!settings.apiKey.trim() || !settings.baseUrl.trim()) {
    return {
      ok: false,
      content: '请先在主窗口右上角「设置」中填入 DeepSeek / 硅基流动 / 通义千问 / Ollama 接口。'
    }
  }

  const heroId = selectedHeroId || state.myHeroId || Object.keys(bundle.heroes)[0]
  const guide = buildHeroDetailGuide(bundle, heroId)
  if (!guide) return { ok: false, content: '未找到当前英雄统计数据。' }

  const modeNameMap: Record<PlaystyleMode, string> = {
    steady: '稳健上分',
    counter: '针对敌方大爹',
    team: '团队补位牺牲',
    yolo: '只顾自己爽（极限输出整活）',
    torment: '不死折磨恶心对面'
  }

  const pickedNames = state.pickedAugmentIds
    .map((id) => bundle.augments[id]?.name)
    .filter(Boolean)
    .join('、')
  const enemySummary = state.enemyPlayers
    .map((ep) => {
      const h = bundle.heroes[ep.heroId]
      return h ? `${h.name}(${ep.kills}/${ep.deaths})` : ''
    })
    .filter(Boolean)
    .join('、')

  const systemPrompt =
    '你是英雄联盟海克斯大乱斗局内原位HUD军师。严格按玩家当前选择的【心态模式】在 80 字内用 3 条极简短句输出：1.海克斯思路；2.下一件必出装备；3.一句话打法。绝不废话。'

  const contextPrompt = [
    `玩家英雄：${guide.hero.name}（心态模式：【${modeNameMap[state.playstyleMode]}】）`,
    `等级：${state.currentLevel}级，当前金币：${state.currentGold}`,
    `敌方战况：${enemySummary || state.enemyHeroIds.map((id) => bundle.heroes[id]?.name).join('、') || '未知'}`,
    `已拿海克斯：${pickedNames || '暂无'}`,
    userQuestion && userQuestion !== '__MINI_BRIEF__' ? `补充诉求：${userQuestion}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  const cleanBase = settings.baseUrl.replace(/\/+$/, '')
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`
      },
      body: JSON.stringify({
        model: settings.model.trim() || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextPrompt }
        ],
        temperature: 0.4,
        max_tokens: 260
      }),
      signal: AbortSignal.timeout(20000)
    })

    if (!res.ok) {
      return { ok: false, content: `请求失败（HTTP ${res.status}），请检查设置里的 API Key。` }
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const answer = json.choices?.[0]?.message?.content?.trim()
    return { ok: Boolean(answer), content: answer || '返回为空' }
  } catch (err) {
    return { ok: false, content: `接口超时：${err instanceof Error ? err.message : String(err)}` }
  }
}
