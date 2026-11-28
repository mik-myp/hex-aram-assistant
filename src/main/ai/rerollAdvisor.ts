import type {
  AugmentRarity,
  HeroDetailGuide,
  RerollAction,
  RerollOfferAdvice,
  SeedBundle,
  SituationalAugmentEval
} from '@shared/types'

const RARITY_LABELS: Record<AugmentRarity, string> = {
  prismatic: '棱彩',
  gold: '黄金',
  silver: '白银'
}

interface PoolStats {
  rarity: AugmentRarity
  remainingRates: number[]
  poolAvg: number
  topQuartile: number
}

function buildRemainingRarityPool(
  bundle: SeedBundle,
  guide: HeroDetailGuide,
  rarity: AugmentRarity,
  excludedIds: Set<string>
): PoolStats {
  const remainingRates = guide.augments
    .filter((stat) => {
      if (excludedIds.has(stat.augmentId)) return false
      const meta = bundle.augments[stat.augmentId]
      return meta?.rarity === rarity
    })
    .map((stat) => stat.smoothedWinRate)
    .sort((a, b) => b - a)

  if (remainingRates.length === 0) {
    const fallbackAvg = guide.hero.smoothedWinRate
    return {
      rarity,
      remainingRates: [],
      poolAvg: fallbackAvg,
      topQuartile: fallbackAvg + 0.025
    }
  }

  const sum = remainingRates.reduce((acc, v) => acc + v, 0)
  const poolAvg = sum / remainingRates.length
  const qIdx = Math.min(remainingRates.length - 1, Math.floor(remainingRates.length * 0.25))
  const topQuartile = remainingRates[qIdx]

  return {
    rarity,
    remainingRates,
    poolAvg,
    topQuartile
  }
}

function resolveDominantRarity(
  bundle: SeedBundle,
  candidates: SituationalAugmentEval[]
): AugmentRarity {
  const counts: Record<AugmentRarity, number> = { silver: 0, gold: 0, prismatic: 0 }
  for (const c of candidates) {
    const r = bundle.augments[c.augmentId]?.rarity
    if (r) counts[r]++
  }
  if (counts.prismatic >= counts.gold && counts.prismatic >= counts.silver) return 'prismatic'
  if (counts.gold >= counts.silver) return 'gold'
  return 'silver'
}

/**
 * Evaluates mathematical Reroll EV for the current 2/3/4-card augment offer against
 * the remaining same-rarity pool for this champion.
 * Annotates each candidate with a `rerollAction` ('keep' | 'consider' | 'reroll')
 * and produces a concise offer-level `RerollOfferAdvice`.
 */
export function evaluateRerollExpectation(
  bundle: SeedBundle,
  guide: HeroDetailGuide | null,
  pickedAugmentIds: string[],
  candidates: SituationalAugmentEval[]
): {
  annotatedCandidates: SituationalAugmentEval[]
  rerollAdvice: RerollOfferAdvice | null
} {
  if (!guide || candidates.length < 2) {
    return { annotatedCandidates: candidates, rerollAdvice: null }
  }

  const excluded = new Set<string>([
    ...pickedAugmentIds,
    ...candidates.map((c) => c.augmentId)
  ])
  const poolCache = new Map<AugmentRarity, PoolStats>()
  const getPool = (rarity: AugmentRarity): PoolStats => {
    const cached = poolCache.get(rarity)
    if (cached) return cached
    const built = buildRemainingRarityPool(bundle, guide, rarity, excluded)
    poolCache.set(rarity, built)
    return built
  }

  const annotatedCandidates: SituationalAugmentEval[] = candidates.map((ev) => {
    const meta = bundle.augments[ev.augmentId]
    const rarity: AugmentRarity = meta?.rarity || 'gold'
    const pool = getPool(rarity)

    let rerollAction: RerollAction = 'consider'
    let rerollReason = '中等可用，可先刷其他弱卡'

    if (ev.hasConflict || ev.verdict === 'TRAP' || ev.userPreference === 'blacklisted') {
      rerollAction = 'reroll'
      rerollReason = ev.hasConflict
        ? '机制冲突，建议直接刷掉'
        : ev.userPreference === 'blacklisted'
          ? '个人避坑名单，建议刷掉'
          : '低胜率陷阱，建议重随'
    } else if (
      ev.comboName ||
      ev.userPreference === 'favorite' ||
      ev.verdict === 'S+' ||
      ev.situationalScore >= Math.max(pool.topQuartile, pool.poolAvg + 0.018)
    ) {
      rerollAction = 'keep'
      rerollReason = ev.comboName
        ? '天胡组合核心，直接锁定'
        : ev.userPreference === 'favorite'
          ? '心愿单必抢卡，建议锁定'
          : '同阶前25%强卡，勿刷'
    } else if (ev.situationalScore < pool.poolAvg - 0.004 && pool.remainingRates.length >= 4) {
      rerollAction = 'reroll'
      rerollReason = `低于同阶均胜(${(pool.poolAvg * 100).toFixed(1)}%)，重随期望更高`
    }

    return {
      ...ev,
      rerollAction,
      rerollReason
    }
  })

  const dominantRarity = resolveDominantRarity(bundle, annotatedCandidates)
  const dominantPool = getPool(dominantRarity)
  const rarityLabel = RARITY_LABELS[dominantRarity]

  const ranked = [...annotatedCandidates].sort((a, b) => b.situationalScore - a.situationalScore)
  const best = ranked[0]
  const bestName = bundle.augments[best.augmentId]?.name || '当前最高卡'

  const betterRemainingCount = dominantPool.remainingRates.filter(
    (wr) => wr > best.situationalScore + 0.005
  ).length

  const suggestedRerollList = [...annotatedCandidates]
    .filter((c) => c.rerollAction === 'reroll')
    .sort((a, b) => a.situationalScore - b.situationalScore)
  const suggestedRerollIds = suggestedRerollList.map((c) => c.augmentId)

  const shouldReroll =
    best.hasConflict ||
    best.verdict === 'TRAP' ||
    (best.situationalScore < dominantPool.poolAvg - 0.003 && betterRemainingCount >= 4)

  let summary: string
  if (shouldReroll) {
    const worstName =
      bundle.augments[suggestedRerollIds[0] || best.augmentId]?.name || bestName
    summary = `建议重随！当前最高 ${(best.situationalScore * 100).toFixed(1)}% < 同阶${rarityLabel}均胜 ${(dominantPool.poolAvg * 100).toFixed(1)}%，池内还有 ${betterRemainingCount} 张更强卡，优先刷【${worstName}】`
  } else if (best.rerollAction === 'keep') {
    summary = `已出强力${rarityLabel}卡【${bestName}】（${(best.situationalScore * 100).toFixed(1)}%），直接锁定无需重随`
  } else if (suggestedRerollIds.length > 0) {
    const worstName = bundle.augments[suggestedRerollIds[0]]?.name || '弱卡'
    summary = `保底可拿【${bestName}】，建议先重随【${worstName}】博更高上限（同阶剩余 ${betterRemainingCount} 张更强卡）`
  } else {
    summary = `本轮${rarityLabel}质量均衡，按首选【${bestName}】直接拿即可`
  }

  return {
    annotatedCandidates,
    rerollAdvice: {
      shouldReroll,
      rarityLabel,
      poolAvgWinRate: Number(dominantPool.poolAvg.toFixed(4)),
      bestCandidateWinRate: Number(best.situationalScore.toFixed(4)),
      betterRemainingCount,
      suggestedRerollIds,
      summary
    }
  }
}
