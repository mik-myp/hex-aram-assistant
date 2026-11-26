import type {
  ArchetypeCard,
  AugmentMeta,
  AugmentVerdict,
  BenchSuggestion,
  HeroAugmentStat,
  HeroDetailGuide,
  HeroMeta,
  SeedBundle
} from '@shared/types'

const BAYES_K = 300

const SPELL_NAMES: Record<string, string> = {
  '1': '净化',
  '3': '虚弱',
  '4': '闪现',
  '6': '疾跑',
  '7': '治疗',
  '11': '惩戒',
  '13': '清晰术',
  '14': '引燃',
  '21': '屏障',
  '32': '雪球'
}

export function smoothWinRate(wins: number, games: number, prior = 0.5, k = BAYES_K): number {
  if (games <= 0) return prior
  return (wins + prior * k) / (games + k)
}

export function classifyAugmentVerdict(
  deltaWr: number,
  games: number,
  rankIndex: number
): { verdict: AugmentVerdict; label: string } {
  if (deltaWr <= -0.032 && games >= 220) {
    return { verdict: 'TRAP', label: '新手避坑 · 胜率倒挂' }
  }
  if ((deltaWr >= 0.042 && games >= 100) || (rankIndex < 3 && deltaWr >= 0.028)) {
    return { verdict: 'S+', label: 'S+ 必拿神卡' }
  }
  if (deltaWr >= 0.018) {
    return { verdict: 'S', label: 'S 流派核心' }
  }
  if (deltaWr >= -0.008) {
    return { verdict: 'A', label: 'A 稳健可用' }
  }
  if (deltaWr <= -0.025) {
    return { verdict: 'TRAP', label: '慎选陷阱' }
  }
  return { verdict: 'B', label: 'B 过渡备选' }
}

const ARCHETYPE_TEMPLATES: Array<{
  tag: string
  title: string
  badge: string
  summaryFn: (hero: HeroMeta, augNames: string[]) => string
  pivotFn: (hero: HeroMeta, boundItemNames: string[]) => string
}> = [
  {
    tag: 'crit',
    title: '技能/特效暴击爆发流',
    badge: '质变爽局',
    summaryFn: (hero, names) =>
      `拿到【${names.slice(0, 2).join(' / ')}】后，${hero.name}的伤害上限会产生质变，单套爆发可直接融化后排。`,
    pivotFn: (hero, bound) =>
      bound.length > 0
        ? `拿到核心暴击符文后，优先补出【${bound.slice(0, 2).join('、')}】放大暴击倍率。`
        : hero.damageType === 'AP'
          ? '拿到珠光护手后建议补【影焰】或【无尽之刃/灭世者的死亡之帽】，最大化法术暴击斩杀线。'
          : '优先叠满暴击率与暴击伤害（无尽之刃 / 多米尼克领主的致意）。'
  },
  {
    tag: 'tank',
    title: '巨神叠肉战神流',
    badge: '新手最稳',
    summaryFn: (hero, names) =>
      `围绕【${names.slice(0, 2).join(' / ')}】堆叠体型、生命值与双抗，容错率极高，新手站桩也能打出成吨控制与承伤。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `核心绑定装备推荐【${bound.slice(0, 2).join('、')}】，把最大生命值转化为额外收益。`
        : '优先选择【心之钢 / 璀璨回响 / 无终恨意】等成长生命双抗装，越拖后期越无解。'
  },
  {
    tag: 'burn',
    title: '炼狱灼烧消耗流',
    badge: '团战折磨',
    summaryFn: (hero, names) =>
      `依靠【${names.slice(0, 2).join(' / ')}】高频挂上百分比灼烧与持续伤害，在单线狭窄地形让敌方全队血线持续崩溃。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `搭配【${bound.slice(0, 2).join('、')}】实现双重灼烧联动。`
        : '强烈建议联动【兰德里的折磨 + 黑色火炬 + 瑞莱的冰晶节杖】，拉扯消耗无解。'
  },
  {
    tag: 'haste',
    title: '无限火力急速流',
    badge: '丝滑连招',
    summaryFn: (hero, names) =>
      `通过【${names.slice(0, 2).join(' / ')}】大幅压缩关键技能真空期，团战可连续打出多轮控制或消耗。`,
    pivotFn: (hero, bound) =>
      bound.length > 0
        ? `推荐首件选择【${bound.slice(0, 2).join('、')}】保证蓝量与技能循环。`
        : hero.damageType === 'AP'
          ? '注意前两件必须带回蓝装（如卢登/炽天使/黑色火炬），避免冷却极短却空蓝尴尬。'
          : '搭配星蚀/朔极之矛进一步加快技能回转。'
  },
  {
    tag: 'onhit',
    title: '超远射程特效机关枪',
    badge: '极致拉扯',
    summaryFn: (hero, names) =>
      `借助【${names.slice(0, 2).join(' / ')}】强化射程、攻速或攻击特效，安全距离持续倾泻火力，前排也扛不住。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `优先合成【${bound.slice(0, 2).join('、')}】触发高频普攻特效。`
        : '优先走【破败王者之刃 / 鬼索的狂暴之刃 / 界弓】攻速特效路线。'
  },
  {
    tag: 'heal',
    title: '永动机续航护盾流',
    badge: '残血反杀',
    summaryFn: (_, names) =>
      `利用【${names.slice(0, 2).join(' / ')}】在不能回城补血的大乱斗里建立恐怖的赖线与团战续航优势。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `配合【${bound.slice(0, 2).join('、')}】让每次换血都稳赚不亏。`
        : '建议补出【振奋盔甲】或护盾治疗加成装备，注意提防敌方先出重伤装。'
  },
  {
    tag: 'mobility',
    title: '雪球飞雷神突进流',
    badge: '切后排利器',
    summaryFn: (hero, names) =>
      `凭借【${names.slice(0, 2).join(' / ')}】解决${hero.name}进场或拉扯短板，配合雪球轻松贴脸敌方核心输出。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `进场装优先【${bound.slice(0, 2).join('、')}】兼顾爆发与容错。`
        : '建议第 2~3 件补出金身（中娅沙漏）或死亡之舞，确保进场打完一套能活下来。'
  }
]

export function buildHeroDetailGuide(bundle: SeedBundle, heroId: string): HeroDetailGuide | null {
  const hero = bundle.heroes[heroId]
  if (!hero) return null

  const rawRows = bundle.heroAugments[heroId] || []
  const boundMap = bundle.heroAugmentItems[heroId] || {}

  const tempStats = rawRows
    .map(([augId, games, wins, lowSampleNum]) => {
      const augMeta = bundle.augments[augId]
      if (!augMeta) return null
      const swr = smoothWinRate(wins, games, hero.smoothedWinRate, BAYES_K)
      const delta = swr - hero.smoothedWinRate
      const boundRaw = boundMap[augId] || []
      const boundItems = boundRaw.map(([itemId, name, bGames, bWins]) => ({
        itemId,
        name: name || bundle.items[itemId]?.name || itemId,
        games: bGames,
        winRate: Number((bWins / Math.max(1, bGames)).toFixed(4))
      }))
      return {
        augmentId: augId,
        games,
        wins,
        rawWinRate: Number((wins / Math.max(1, games)).toFixed(4)),
        smoothedWinRate: Number(swr.toFixed(4)),
        deltaWinRate: Number(delta.toFixed(4)),
        pickShare: Number((games / Math.max(1, hero.games)).toFixed(4)),
        lowSample: Boolean(lowSampleNum) || games < 180,
        boundItems: boundItems.length > 0 ? boundItems : undefined
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.smoothedWinRate - a.smoothedWinRate)

  const augments: HeroAugmentStat[] = tempStats.map((st, idx) => {
    const { verdict, label } = classifyAugmentVerdict(st.deltaWinRate, st.games, idx)
    return {
      ...st,
      verdict,
      verdictLabel: label
    }
  })

  const trapAugments = [...augments]
    .filter((a) => a.verdict === 'TRAP' || (a.deltaWinRate <= -0.025 && a.games >= 180))
    .sort((a, b) => a.deltaWinRate - b.deltaWinRate)
    .slice(0, 6)

  // Derive 2-3 Archetype Cards dynamically
  const archetypes = deriveHeroArchetypes(hero, augments, bundle)

  // Spells
  const spellRows = bundle.heroSpells[heroId] || []
  const bestSpells = spellRows.map(([combo, games, wins]) => {
    const ids = combo.split('+')
    const label = ids.map((id) => SPELL_NAMES[id] || `技能${id}`).join(' + ')
    return {
      spellIds: ids,
      label,
      games,
      winRate: Number((wins / Math.max(1, games)).toFixed(4))
    }
  })

  // Core builds & situational items
  const coreBuilds = bundle.coreBuilds[heroId] || []
  const coreItemSet = new Set(coreBuilds[0]?.items || [])
  const situationalItems = (bundle.heroItems[heroId] || [])
    .map(([itemId, games, wins]) => {
      const wr = smoothWinRate(wins, games, hero.smoothedWinRate, 200)
      return {
        itemId,
        games,
        winRate: Number(wr.toFixed(4)),
        deltaWinRate: Number((wr - hero.smoothedWinRate).toFixed(4))
      }
    })
    .filter((it) => !coreItemSet.has(it.itemId) && bundle.items[it.itemId])
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 8)

  return {
    hero,
    bestSpells,
    augments,
    trapAugments,
    coreBuilds,
    situationalItems,
    archetypes
  }
}

function deriveHeroArchetypes(
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

  for (const tpl of ARCHETYPE_TEMPLATES) {
    if (
      tpl.tag === 'tank' &&
      !hero.roles.includes('tank') &&
      !hero.roles.includes('fighter')
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
    const uniqueBoundIds = [...new Set(boundItems.map((b) => b.itemId))].slice(0, 3)
    const uniqueBoundNames = uniqueBoundIds
      .map((id) => bundle.items[id]?.name)
      .filter((n): n is string => Boolean(n))

    const recItems =
      uniqueBoundIds.length >= 2
        ? [...uniqueBoundIds, ...defaultCoreItems.filter((id) => !uniqueBoundIds.includes(id))].slice(0, 3)
        : defaultCoreItems.slice(0, 3)

    const augNames = topAugs.map((a) => bundle.augments[a.augmentId]?.name || a.augmentId)

    cards.push({
      id: `${hero.id}-${tpl.tag}`,
      title: tpl.title,
      badge: tpl.badge,
      summary: tpl.summaryFn(hero, augNames),
      coreAugmentIds: topAugs.map((a) => a.augmentId),
      recommendedItems: recItems,
      itemPivotTip: tpl.pivotFn(hero, uniqueBoundNames),
      avgDeltaWinRate: Number(avgDelta.toFixed(4))
    })
  }

  cards.sort((a, b) => b.avgDeltaWinRate - a.avgDeltaWinRate)

  // Always guarantee at least 2 helpful beginner cards even for niche champions
  if (cards.length < 2) {
    const topOverall = augments.slice(0, 4)
    if (topOverall.length > 0) {
      const names = topOverall.map((a) => bundle.augments[a.augmentId]?.name || '')
      cards.push({
        id: `${hero.id}-staple`,
        title: '高胜率万金油稳健流',
        badge: '新手闭眼选',
        summary: `不挑严苛联动，直接优先拿【${names.slice(0, 3).join(' / ')}】等高净胜率强化，按标准三件套成型即可稳定发力。`,
        coreAugmentIds: topOverall.map((a) => a.augmentId),
        recommendedItems: defaultCoreItems.slice(0, 3),
        itemPivotTip: '严格按照推荐三件套先后顺序出装，阵亡回泉水优先合成大件。',
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

export function computeBenchSuggestions(
  bundle: SeedBundle,
  myHeroId: string | null,
  allyHeroIds: string[],
  benchHeroIds: string[]
): BenchSuggestion[] {
  if (benchHeroIds.length === 0) return []
  const myHero = myHeroId ? bundle.heroes[myHeroId] : null
  const myWr = myHero ? myHero.smoothedWinRate : 0.5

  const allyHeroes = allyHeroIds
    .map((id) => bundle.heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))

  const apCount = allyHeroes.filter((h) => h.damageType === 'AP').length
  const adCount = allyHeroes.filter((h) => h.damageType === 'AD').length
  const tankCount = allyHeroes.filter((h) => h.roles.includes('tank')).length

  return benchHeroIds
    .map((id) => {
      const h = bundle.heroes[id]
      if (!h) return null
      const delta = h.smoothedWinRate - myWr
      const reasons: string[] = []
      if (h.tier === 'T0') reasons.push('当前版本 T0 霸主')
      else if (h.tier === 'T1') reasons.push('版本 T1 强势英雄')

      if (tankCount === 0 && h.roles.includes('tank')) {
        reasons.push('补足全队缺失前排')
      } else if (apCount >= 3 && h.damageType === 'AD') {
        reasons.push('全队偏 AP，急需补 AD 输出')
      } else if (adCount >= 3 && h.damageType === 'AP') {
        reasons.push('全队菜刀队，推荐补 AP 伤害')
      }

      if (delta >= 0.025) {
        reasons.push(`比当前英雄胜率高 +${(delta * 100).toFixed(1)}%`)
      }
      if (reasons.length === 0) {
        reasons.push(`国服胜率 ${(h.smoothedWinRate * 100).toFixed(1)}%`)
      }

      return {
        heroId: id,
        tier: h.tier,
        winRate: h.smoothedWinRate,
        deltaVsCurrent: Number(delta.toFixed(4)),
        reason: reasons.join(' · ')
      }
    })
    .filter((x): x is BenchSuggestion => x !== null)
    .sort((a, b) => b.winRate - a.winRate)
}
