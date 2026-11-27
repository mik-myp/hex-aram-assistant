import type {
  ArchetypeCard,
  AugmentHeroFit,
  AugmentMeta,
  AugmentPivotBuild,
  AugmentReverseDetail,
  AugmentVerdict,
  BenchSuggestion,
  HeroAugmentStat,
  HeroDetailGuide,
  HeroMeta,
  SeedBundle,
  UserPreferences
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

// Champions notoriously stronger in Hextech ARAM than classic ARAM (scaling/melee/augment abusers)
const MAYHEM_DIVIDEND_HERO_IDS = new Set([
  '10', // Kayle
  '157', // Yasuo
  '4', // TwistedFate
  '114', // Fiora
  '200', // Belveth
  '5', // XinZhao
  '223', // TahmKench
  '887', // Gwen
  '526', // Rell
  '67', // Vayne
  '24', // Jax
  '11' // MasterYi
])

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
    return { verdict: 'TRAP', label: '避坑 · 胜率倒挂' }
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
      `拿到【${names.slice(0, 2).join(' / ')}】后，${hero.name}伤害机制产生质变，暴击加成可瞬间融化后排。`,
    pivotFn: (hero, bound) =>
      bound.length > 0
        ? `变阵出装：优先补【${bound.slice(0, 2).join('、')}】放大暴击斩杀倍率。`
        : hero.damageType === 'AP'
          ? '变阵出装：法系拿珠光护手后建议补【影焰 + 灭世者的死亡之帽/无尽之刃】，最大化技能暴击。'
          : '变阵出装：优先拉满暴击率与暴击伤害（无尽之刃 / 多米尼克领主的致意）。'
  },
  {
    tag: 'tank',
    title: '巨神叠肉战神流',
    badge: '极高容错',
    summaryFn: (_, names) =>
      `围绕【${names.slice(0, 2).join(' / ')}】叠加体型、最大生命与双抗，越拖后期越肉且兼具范围压制力。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `变阵出装：优先合成【${bound.slice(0, 2).join('、')}】把额外生命值转化为伤害与回复。`
        : '变阵出装：优先做【心之钢 / 无终恨意 / 璀璨回响】等额外生命收益装。'
  },
  {
    tag: 'burn',
    title: '炼狱灼烧折磨流',
    badge: '团战融化前排',
    summaryFn: (_, names) =>
      `依靠【${names.slice(0, 2).join(' / ')}】高频挂百分比持续灼烧或减抗，狭窄单线地形让敌方全队血线崩溃。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `变阵出装：联动【${bound.slice(0, 2).join('、')}】实现双重持续伤害叠加。`
        : '变阵出装：放弃纯固定法穿，改走【黑色火炬 + 兰德里的折磨 + 瑞莱的冰晶节杖】拉扯消耗。'
  },
  {
    tag: 'haste',
    title: '无限火力高频急速流',
    badge: '丝滑连招',
    summaryFn: (_, names) =>
      `通过【${names.slice(0, 2).join(' / ')}】大幅压缩技能真空期，团战可连续打出多套控制与消耗。`,
    pivotFn: (hero, bound) =>
      bound.length > 0
        ? `变阵出装：首件推荐【${bound.slice(0, 2).join('、')}】兼顾续航与技能回转。`
        : hero.damageType === 'AP'
          ? '变阵出装：前两件务必确保蓝量续航（残疫/黑色火炬/炽天使），避免短CD空蓝。'
          : '变阵出装：搭配朔极之矛/星蚀把高频技能优势滚到最大。'
  },
  {
    tag: 'onhit',
    title: '超远射程特效机关枪',
    badge: '打坦神器',
    summaryFn: (_, names) =>
      `借助【${names.slice(0, 2).join(' / ')}】强化射程、攻速或普攻特效，安全距离快速处理海斗大肉前排。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `变阵出装：优先做出【${bound.slice(0, 2).join('、')}】放大高频攻击特效。`
        : '变阵出装：从传统暴击改为【破败王者之刃 + 鬼索的狂暴之刃 + 界弓】特效流。'
  },
  {
    tag: 'heal',
    title: '永动机续航护盾流',
    badge: '残血反杀',
    summaryFn: (_, names) =>
      `利用【${names.slice(0, 2).join(' / ')}】在禁回城补给的大乱斗建立夸张的换血与持续作战优势。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `变阵出装：配合【${bound.slice(0, 2).join('、')}】放大每次技能回复与护盾量。`
        : '变阵出装：补出【振奋盔甲】或治疗护盾强度装，团战拉扯换血无解。'
  },
  {
    tag: 'mobility',
    title: '雪球飞雷神切入流',
    badge: '进场质变',
    summaryFn: (hero, names) =>
      `凭借【${names.slice(0, 2).join(' / ')}】补齐${hero.name}机动性与进场手段，轻松威胁敌方后排核心。`,
    pivotFn: (_, bound) =>
      bound.length > 0
        ? `变阵出装：优先【${bound.slice(0, 2).join('、')}】兼顾进场爆发与自保。`
        : '变阵出装：第 2~3 件务必补【中娅沙漏】或【死亡之舞】，防止进场被集火瞬秒。'
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

  const archetypes = deriveHeroArchetypes(hero, augments, bundle)

  const augmentPivotBuilds: AugmentPivotBuild[] = Object.entries(boundMap)
    .map(([augId, rows]) => ({
      augmentId: augId,
      items: rows.map(([itemId, name, bGames, bWins]) => ({
        itemId,
        name: name || bundle.items[itemId]?.name || itemId,
        games: bGames,
        winRate: Number((bWins / Math.max(1, bGames)).toFixed(4))
      }))
    }))
    .filter((p) => p.items.length > 0 && bundle.augments[p.augmentId])
    .sort((a, b) => (b.items[0]?.games || 0) - (a.items[0]?.games || 0))
    .slice(0, 6)

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
    augmentPivotBuilds,
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
        ? [
            ...uniqueBoundIds,
            ...defaultCoreItems.filter((id) => !uniqueBoundIds.includes(id))
          ].slice(0, 3)
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

  if (cards.length < 2) {
    const topOverall = augments.slice(0, 4)
    if (topOverall.length > 0) {
      const names = topOverall.map((a) => bundle.augments[a.augmentId]?.name || '')
      cards.push({
        id: `${hero.id}-staple`,
        title: '高胜率万金油稳健流',
        badge: '稳健上分',
        summary: `不强求苛刻词条组合，优先拿【${names.slice(0, 3).join(' / ')}】等高净增幅海克斯，沿常规三件套平滑发力。`,
        coreAugmentIds: topOverall.map((a) => a.augmentId),
        recommendedItems: defaultCoreItems.slice(0, 3),
        itemPivotTip: '常规对局按标准三件套顺序做装；遇多前排或强回血时参考右侧动态克制装替换第 2~3 件。',
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

/**
 * Reverse lookup for the Augment Encyclopedia:
 * Given an augmentId, computes its global stats, Top 10 "天选英雄" (highest positive ΔWR & high WR),
 * and Top 5 "避坑英雄" (worst negative ΔWR).
 */
export function buildAugmentReverseDetail(
  bundle: SeedBundle,
  augmentId: string
): AugmentReverseDetail | null {
  const augment = bundle.augments[augmentId]
  if (!augment) return null

  let totalGames = 0
  let totalWins = 0
  const fits: AugmentHeroFit[] = []

  for (const [heroId, rows] of Object.entries(bundle.heroAugments)) {
    const hero = bundle.heroes[heroId]
    if (!hero) continue
    const hit = rows.find((r) => r[0] === augmentId)
    if (!hit) continue
    const [, games, wins] = hit
    totalGames += games
    totalWins += wins
    if (games < 80) continue

    const swr = smoothWinRate(wins, games, hero.smoothedWinRate, BAYES_K)
    const delta = swr - hero.smoothedWinRate
    const { verdict } = classifyAugmentVerdict(delta, games, 5)
    fits.push({
      heroId,
      games,
      smoothedWinRate: Number(swr.toFixed(4)),
      deltaWinRate: Number(delta.toFixed(4)),
      verdict
    })
  }

  const bestHeroes = [...fits]
    .sort((a, b) => b.deltaWinRate * 0.65 + b.smoothedWinRate * 0.35 - (a.deltaWinRate * 0.65 + a.smoothedWinRate * 0.35))
    .slice(0, 10)

  const trapHeroes = [...fits]
    .filter((f) => f.deltaWinRate <= -0.02 && f.games >= 150)
    .sort((a, b) => a.deltaWinRate - b.deltaWinRate)
    .slice(0, 6)

  return {
    augment,
    avgWinRate: totalGames > 0 ? Number((totalWins / totalGames).toFixed(4)) : 0.5,
    totalPickGames: totalGames,
    bestHeroes,
    trapHeroes
  }
}

export function computeBenchSuggestions(
  bundle: SeedBundle,
  myHeroId: string | null,
  allyHeroIds: string[],
  benchHeroIds: string[],
  prefs?: UserPreferences
): BenchSuggestion[] {
  if (benchHeroIds.length === 0) return []
  const myHero = myHeroId ? bundle.heroes[myHeroId] : null
  const myWr = myHero ? myHero.smoothedWinRate : 0.5
  const favSet = new Set(prefs?.favoriteHeroIds || [])
  const prefRoles = new Set(prefs?.preferredRoles || [])

  const allyHeroes = allyHeroIds
    .map((id) => bundle.heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))

  const apCount = allyHeroes.filter((h) => h.damageType === 'AP').length
  const adCount = allyHeroes.filter((h) => h.damageType === 'AD').length
  const tankCount = allyHeroes.filter((h) => h.roles.includes('tank')).length

  return benchHeroIds
    .map((id, benchIndex) => {
      const h = bundle.heroes[id]
      if (!h) return null
      const delta = h.smoothedWinRate - myWr
      const isFavorite = favSet.has(id)
      const matchesPreferredRole =
        prefRoles.size > 0 && h.roles.some((r) => prefRoles.has(r))
      const isMayhemBonusHero =
        MAYHEM_DIVIDEND_HERO_IDS.has(id) || (h.tier === 'T0' && h.smoothedWinRate >= 0.545)

      const reasons: string[] = []
      let shortTag = `${h.tier}`
      if (isFavorite) {
        reasons.push('★ 本命收藏')
        shortTag = '★ 本命必拿'
      }
      if (isMayhemBonusHero) {
        reasons.push('海斗版本红利')
        if (!isFavorite) shortTag = '👑 海斗战神'
      } else if (h.tier === 'T0' || h.tier === 'T1') {
        reasons.push(`版本 ${h.tier}`)
        if (!isFavorite) shortTag = `${h.tier} 强势`
      }

      if (matchesPreferredRole) reasons.push('常玩定位')

      let compBonus = 0
      if (tankCount === 0 && h.roles.includes('tank')) {
        reasons.push('补前排')
        if (shortTag === h.tier) shortTag = '补关键前排'
        compBonus += 0.015
      } else if (apCount >= 3 && h.damageType === 'AD') {
        reasons.push('缺AD补伤')
        if (shortTag === h.tier) shortTag = '补关键AD'
        compBonus += 0.015
      } else if (adCount >= 3 && h.damageType === 'AP') {
        reasons.push('菜刀补AP')
        if (shortTag === h.tier) shortTag = '补关键AP'
        compBonus += 0.015
      }

      if (reasons.length === 0) {
        reasons.push(`胜率 ${(h.smoothedWinRate * 100).toFixed(1)}%`)
      }

      const score =
        h.smoothedWinRate +
        (isFavorite ? 0.045 : 0) +
        (matchesPreferredRole ? 0.02 : 0) +
        compBonus

      return {
        heroId: id,
        benchIndex,
        tier: h.tier,
        winRate: h.smoothedWinRate,
        deltaVsCurrent: Number(delta.toFixed(4)),
        isFavorite,
        matchesPreferredRole,
        isMayhemBonusHero,
        score: Number(score.toFixed(4)),
        shortTag,
        reason: reasons.join(' · ')
      }
    })
    .filter((x): x is BenchSuggestion => x !== null)
}
