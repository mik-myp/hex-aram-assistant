import type {
  ArchetypeCard,
  AugmentMeta,
  HeroAugmentStat,
  HeroMeta,
  SeedBundle
} from '@shared/types'

interface ArchetypeTemplate {
  tag: string
  title: string
  badge: string
  summaryFn: (hero: HeroMeta, augNames: string[]) => string
  pivotFn: (hero: HeroMeta, itemNames: string[]) => string
  itemsFn: (hero: HeroMeta) => string[]
}

function isHeroApLike(hero: HeroMeta): boolean {
  return hero.damageType === 'AP' || hero.roles.includes('mage') || hero.roles.includes('support')
}

function isHeroTankLike(hero: HeroMeta): boolean {
  return hero.damageType === 'TANK' || hero.roles.includes('tank')
}

const ARCHETYPE_TEMPLATES: ArchetypeTemplate[] = [
  {
    tag: 'crit',
    title: '暴击核弹爆发流',
    badge: '质变爽局',
    summaryFn: (hero, names) =>
      `拿到【${names.slice(0, 2).join(' / ')}】后，${hero.name}伤害机制产生质变，暴击加成可瞬间融化后排。`,
    pivotFn: (_, items) => `流派出装：优先补【${items.slice(0, 3).join('、')}】放大暴击斩杀倍率。`,
    itemsFn: (hero) =>
      isHeroApLike(hero)
        ? ['4645', '3089', '3118', '4646', '3135']
        : ['3031', '6676', '3094', '3036', '3085']
  },
  {
    tag: 'tank',
    title: '巨神叠肉战神流',
    badge: '极高容错',
    summaryFn: (_, names) =>
      `围绕【${names.slice(0, 2).join(' / ')}】叠加体型、最大生命与双抗，越拖后期越肉且兼具范围压制力。`,
    pivotFn: (_, items) => `流派出装：优先合成【${items.slice(0, 3).join('、')}】把生命值转化为承伤与回复。`,
    itemsFn: () => ['3084', '2502', '3065', '3075', '3143']
  },
  {
    tag: 'burn',
    title: '炼狱灼烧折磨流',
    badge: '融化前排',
    summaryFn: (_, names) =>
      `依靠【${names.slice(0, 2).join(' / ')}】高频挂百分比持续灼烧或减抗，狭窄地形让敌方全队血线崩溃。`,
    pivotFn: (_, items) => `流派出装：改走【${items.slice(0, 3).join('、')}】打双重持续灼烧与减速拉扯。`,
    itemsFn: (hero) =>
      isHeroApLike(hero) || isHeroTankLike(hero)
        ? ['2503', '6653', '3116', '3118', '3135']
        : ['6694', '3153', '3033', '6333', '3071']
  },
  {
    tag: 'haste',
    title: '无限火力急速流',
    badge: '丝滑连招',
    summaryFn: (_, names) =>
      `通过【${names.slice(0, 2).join(' / ')}】大幅压缩技能真空期，团战可连续打出多套控制与消耗。`,
    pivotFn: (_, items) => `流派出装：优先【${items.slice(0, 3).join('、')}】兼顾蓝量续航与极限冷却缩减。`,
    itemsFn: (hero) =>
      isHeroApLike(hero)
        ? ['3118', '2503', '4629', '3157', '3089']
        : ['3161', '6692', '3071', '6333', '3110']
  },
  {
    tag: 'onhit',
    title: '攻速特效机关枪',
    badge: '打坦神器',
    summaryFn: (_, names) =>
      `借助【${names.slice(0, 2).join(' / ')}】强化射程、攻速或普攻特效，安全距离快速处理重装前排。`,
    pivotFn: (_, items) => `流派出装：转为【${items.slice(0, 3).join('、')}】高频特效流。`,
    itemsFn: () => ['3153', '3124', '3302', '6672', '3085']
  },
  {
    tag: 'heal',
    title: '永动机续航护盾流',
    badge: '残血反杀',
    summaryFn: (_, names) =>
      `利用【${names.slice(0, 2).join(' / ')}】在禁回城的大乱斗建立夸张的换血与持续作战优势。`,
    pivotFn: (_, items) => `流派出装：围绕【${items.slice(0, 3).join('、')}】放大每次回复与护盾量。`,
    itemsFn: (hero) =>
      hero.roles.includes('support')
        ? ['6617', '3107', '3504', '3065', '3118']
        : ['3065', '2502', '3084', '6610', '6333']
  },
  {
    tag: 'mobility',
    title: '雪球切入爆发流',
    badge: '进场质变',
    summaryFn: (hero, names) =>
      `凭借【${names.slice(0, 2).join(' / ')}】补齐${hero.name}机动性与进场手段，轻松威胁敌方后排核心。`,
    pivotFn: (_, items) => `流派出装：优先【${items.slice(0, 3).join('、')}】兼顾进场秒杀与团战保命。`,
    itemsFn: (hero) =>
      isHeroApLike(hero)
        ? ['3152', '4645', '3157', '3089', '3135']
        : ['3142', '6692', '6333', '3026', '3071']
  }
]

function buildDistinctItems(
  boundIds: string[],
  templateIds: string[],
  fallbackCore: string[],
  bundle: SeedBundle
): string[] {
  const result: string[] = []
  const pushValid = (id: string): void => {
    if (result.length >= 4) return
    if (bundle.items[id] && !result.includes(id)) {
      result.push(id)
    }
  }
  for (const id of boundIds) pushValid(id)
  for (const id of templateIds) pushValid(id)
  for (const id of fallbackCore) pushValid(id)
  return result
}

export function deriveHeroArchetypes(
  hero: HeroMeta,
  augments: HeroAugmentStat[],
  bundle: SeedBundle
): ArchetypeCard[] {
  const strongAugs = augments.filter((a) => a.deltaWinRate >= 0.01 && a.games >= 80)
  const byTag = new Map<string, HeroAugmentStat[]>()

  for (const stat of strongAugs) {
    const meta: AugmentMeta | undefined = bundle.augments[stat.augmentId]
    if (!meta) continue
    for (const tag of meta.tags) {
      if (tag === 'general') continue
      const list = byTag.get(tag) || []
      list.push(stat)
      byTag.set(tag, list)
    }
  }

  const defaultCoreItems = bundle.coreBuilds[hero.id]?.[0]?.items || []
  const cards: ArchetypeCard[] = []
  const seenBuildSignatures = new Set<string>()

  for (const tpl of ARCHETYPE_TEMPLATES) {
    if (
      tpl.tag === 'tank' &&
      !hero.roles.includes('tank') &&
      !hero.roles.includes('fighter')
    ) {
      continue
    }
    if (
      tpl.tag === 'onhit' &&
      !hero.roles.includes('marksman') &&
      !hero.roles.includes('fighter') &&
      hero.damageType !== 'AD'
    ) {
      continue
    }
    const matched = byTag.get(tpl.tag) || []
    if (matched.length < 2 && !(matched.length === 1 && matched[0].deltaWinRate >= 0.035)) {
      continue
    }
    const topAugs = matched.slice(0, 4)
    const avgDelta =
      topAugs.reduce((sum, x) => sum + x.deltaWinRate, 0) / Math.max(1, topAugs.length)

    const boundItems = topAugs
      .flatMap((x) => x.boundItems || [])
      .sort((a, b) => b.winRate - a.winRate)
    const uniqueBoundIds = [...new Set(boundItems.map((b) => b.itemId))].slice(0, 2)
    const recItems = buildDistinctItems(uniqueBoundIds, tpl.itemsFn(hero), defaultCoreItems, bundle)
    if (recItems.length === 0) continue

    const sig = recItems.slice(0, 3).join(',')
    if (seenBuildSignatures.has(sig)) continue
    seenBuildSignatures.add(sig)

    const recNames = recItems
      .map((id) => bundle.items[id]?.name)
      .filter((n): n is string => Boolean(n))
    const augNames = topAugs.map((a) => bundle.augments[a.augmentId]?.name || a.augmentId)

    cards.push({
      id: `${hero.id}-${tpl.tag}`,
      title: tpl.title,
      badge: tpl.badge,
      summary: tpl.summaryFn(hero, augNames),
      coreAugmentIds: topAugs.map((a) => a.augmentId),
      recommendedItems: recItems,
      itemPivotTip: tpl.pivotFn(hero, recNames),
      avgDeltaWinRate: Number(avgDelta.toFixed(4))
    })
  }

  cards.sort((a, b) => b.avgDeltaWinRate - a.avgDeltaWinRate)

  if (cards.length < 2) {
    const topOverall = augments.slice(0, 4)
    const defaultSig = defaultCoreItems.slice(0, 3).join(',')
    if (topOverall.length > 0 && !seenBuildSignatures.has(defaultSig)) {
      const names = topOverall.map((a) => bundle.augments[a.augmentId]?.name || '')
      cards.push({
        id: `${hero.id}-staple`,
        title: '常规高胜率稳健流',
        badge: '稳健上分',
        summary: `优先拿【${names.slice(0, 3).join(' / ')}】等高净增幅海克斯，沿常规核心三件套平滑发力。`,
        coreAugmentIds: topOverall.map((a) => a.augmentId),
        recommendedItems: defaultCoreItems.slice(0, 4),
        itemPivotTip: '按大数据常规核心顺序做装；遇多前排或高回血自动插入重伤/穿透克制装。',
        avgDeltaWinRate: Number(
          (
            topOverall.reduce((s, x) => s + x.deltaWinRate, 0) / Math.max(1, topOverall.length)
          ).toFixed(4)
        )
      })
    }
  }

  return cards.slice(0, 3)
}
