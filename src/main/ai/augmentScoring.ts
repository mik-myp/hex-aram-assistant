import { buildHeroDetailGuide } from '../data/synergyEngine'
import type {
  GameLiveState,
  HeroMeta,
  PlaystyleMode,
  SeedBundle,
  SituationalAugmentEval,
  ThreatRadar
} from '@shared/types'

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

      if (
        (hasBackToBasics && /终极技能|施放终极|大招/.test(text)) ||
        (hasUltAugment && meta.name.includes('回归基本功'))
      ) {
        hasConflict = true
        bonus -= 0.15
        primaryTag = '⚠️ 机制冲突别选'
        reasons.push('与本局已选大招/封大招海克斯直接冲突！')
      }

      const matchedPicked = pickedMetas.find((pm) =>
        pm.tags.some((t) => t !== 'general' && meta.tags.includes(t))
      )
      if (matchedPicked && !hasConflict) {
        bonus += 0.018
        reasons.push(`联动已拿【${matchedPicked.name}】`)
        primaryTag = `🔗 联动${matchedPicked.name}`
      }

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
