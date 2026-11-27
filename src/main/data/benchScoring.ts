import type {
  BenchSuggestion,
  HeroMeta,
  SeedBundle,
  UserPreferences
} from '@shared/types'

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
      const matchesPreferredRole = prefRoles.size > 0 && h.roles.some((r) => prefRoles.has(r))
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
