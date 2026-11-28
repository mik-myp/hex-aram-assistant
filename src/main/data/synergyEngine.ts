import type {
  AugmentHeroFit,
  AugmentPivotBuild,
  AugmentReverseDetail,
  AugmentVerdict,
  HeroAugmentStat,
  HeroDetailGuide,
  SeedBundle
} from '@shared/types'
import { deriveHeroArchetypes } from './archetypeBuilder'

export { computeBenchSuggestions } from './benchScoring'

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

const heroGuideCache = new WeakMap<SeedBundle, Map<string, HeroDetailGuide | null>>()

export function buildHeroDetailGuide(bundle: SeedBundle, heroId: string): HeroDetailGuide | null {
  let byHero = heroGuideCache.get(bundle)
  if (!byHero) {
    byHero = new Map<string, HeroDetailGuide | null>()
    heroGuideCache.set(bundle, byHero)
  }
  if (byHero.has(heroId)) {
    return byHero.get(heroId) ?? null
  }

  const hero = bundle.heroes[heroId]
  if (!hero) {
    byHero.set(heroId, null)
    return null
  }

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

  const result: HeroDetailGuide = {
    hero,
    bestSpells,
    augments,
    trapAugments,
    coreBuilds,
    augmentPivotBuilds,
    situationalItems,
    archetypes
  }
  byHero.set(heroId, result)
  return result
}

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
    .sort(
      (a, b) =>
        b.deltaWinRate * 0.65 +
        b.smoothedWinRate * 0.35 -
        (a.deltaWinRate * 0.65 + a.smoothedWinRate * 0.35)
    )
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
