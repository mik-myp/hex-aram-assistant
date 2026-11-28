import { buildHeroDetailGuide } from '../data/synergyEngine'
import type {
  ArchetypeCard,
  AugmentMeta,
  GameLiveState,
  HeroDetailGuide,
  PlaystyleMode,
  SeedBundle,
  SituationalAugmentEval,
  ThreatRadar
} from '@shared/types'
import {
  classifySampleConfidence,
  evaluateSpecialConflicts,
  findGoldenAugmentCombo
} from './augmentCombos'
import { analyzeMatchContext, type GlobalMatchContext } from './matchContext'

const CROSS_TAG_SYNERGY: Record<string, string[]> = {
  crit: ['haste', 'onhit'],
  burn: ['haste', 'tank'],
  haste: ['burn', 'crit', 'heal', 'shield'],
  tank: ['heal', 'shield', 'burn'],
  heal: ['tank', 'shield', 'haste'],
  shield: ['tank', 'heal', 'haste'],
  onhit: ['crit', 'mobility'],
  mobility: ['onhit', 'crit']
}

interface ScoreFactor {
  delta: number
  tag?: string
  reason: string
  priority: number
}

function classifyCardTraits(meta: AugmentMeta) {
  const text = `${meta.name} ${meta.desc}`
  const tags = meta.tags
  return {
    text,
    isExplosiveYolo:
      tags.includes('crit') ||
      tags.includes('onhit') ||
      /玻璃大炮|珠光|巨人杀手|双刀|瞄准镜|科学狂人|利刃华尔兹|核弹|毁灭|暴击/.test(text),
    isFragilePenalty: /玻璃大炮/.test(meta.name),
    isTankBuster:
      tags.includes('burn') ||
      tags.includes('onhit') ||
      /巨人杀手|侵蚀|腐蚀|真实伤害|炼狱导管|最大生命值(?:的)?(?:额外)?(?:魔法|物理|真实)?伤害|百分比(?:最大)?生命/.test(
        text
      ),
    isAntiDive:
      tags.includes('shield') ||
      tags.includes('heal') ||
      /无敌|金身|护盾|韧性|定身|歌利亚|泰坦|复活|减伤/.test(text),
    isSustainAntiPoke:
      tags.includes('heal') ||
      tags.includes('shield') ||
      tags.includes('mobility') ||
      /回复|吸血|治疗|护盾|雪球|突进|海洋/.test(text),
    isTormentCard:
      tags.includes('burn') ||
      tags.includes('haste') ||
      tags.includes('tank') ||
      tags.includes('heal') ||
      /冰|减速|灼烧|循环|折磨|心之钢|歌利亚|不灭|海洋/.test(text),
    isScalingQuest: /任务|层数|永久|无限叠加|心之钢|金币|发育|每击杀|每参与/.test(text),
    isTankCard: tags.includes('tank') || /最大生命|护甲|魔抗|体型|歌利亚|心之钢/.test(text),
    isApFriendly: tags.includes('burn') || tags.includes('haste') || /法术强度|技能暴击|珠光/.test(text),
    isAdFriendly: tags.includes('onhit') || tags.includes('crit') || /攻击速度|攻击力|射程|普攻/.test(text)
  }
}

export interface AugmentScoringOptions {
  activeArchetype?: ArchetypeCard | null
  favoriteAugmentIds?: string[]
  blacklistedAugmentIds?: string[]
}

export function evaluateSituationalAugments(
  bundle: SeedBundle,
  state: GameLiveState,
  heroId: string,
  threat: ThreatRadar,
  candidateIds: string[],
  precomputedGuide?: HeroDetailGuide | null,
  precomputedCtx?: GlobalMatchContext,
  options?: AugmentScoringOptions
): SituationalAugmentEval[] {
  const guide = precomputedGuide ?? buildHeroDetailGuide(bundle, heroId)
  if (!guide) return []

  const ctx = precomputedCtx ?? analyzeMatchContext(bundle, state, heroId)
  const mode: PlaystyleMode = state.playstyleMode || 'steady'
  const statMap = new Map(guide.augments.map((s) => [s.augmentId, s]))
  const slotByAugId = new Map(state.cardSlots.map((cs) => [cs.augmentId, cs.slotIndex]))
  const pickedMetas = ctx.pickedMetas
  const bossHero = ctx.fedBossHero
  const activeArchetype = options?.activeArchetype ?? null
  const archCoreSet = new Set(activeArchetype?.coreAugmentIds || [])
  const archTag = activeArchetype ? activeArchetype.id.split('-').pop() || '' : ''
  const favAugSet = new Set(options?.favoriteAugmentIds || [])
  const banAugSet = new Set(options?.blacklistedAugmentIds || [])

  const rawEvals = candidateIds
    .map((augId): Omit<SituationalAugmentEval, 'isRecommendedPick'> | null => {
      const meta = bundle.augments[augId]
      if (!meta) return null

      const stat = statMap.get(augId)
      const sampleGames = stat?.games ?? 0
      const confidenceLevel = classifySampleConfidence(sampleGames)
      const traits = classifyCardTraits(meta)

      let baseWr = stat?.smoothedWinRate ?? guide.hero.smoothedWinRate - 0.008
      const deltaWr = stat?.deltaWinRate ?? -0.008
      if (!stat) {
        if (ctx.effectiveStyle === 'TANK' && traits.isTankCard) baseWr += 0.008
        else if (ctx.effectiveStyle === 'AP' && traits.isApFriendly) baseWr += 0.008
        else if (
          (ctx.effectiveStyle === 'AD_CRIT' || ctx.effectiveStyle === 'AD_ONHIT') &&
          traits.isAdFriendly
        ) {
          baseWr += 0.008
        }
      }

      const factors: ScoreFactor[] = []
      let hasConflict = false
      let comboName: string | undefined
      const userPreference: 'favorite' | 'blacklisted' | undefined = favAugSet.has(augId)
        ? 'favorite'
        : banAugSet.has(augId)
          ? 'blacklisted'
          : undefined

      if (confidenceLevel === 'low' && deltaWr > 0.02) {
        factors.push({
          delta: -0.008,
          reason: `样本较少(${sampleGames}场)，胜率保守折算`,
          priority: 1
        })
      }

      // 1. Mechanic conflicts & wasted-stat checks
      const conflict = evaluateSpecialConflicts(pickedMetas, meta, guide.hero, ctx.isManalessHero)
      if (conflict) {
        hasConflict = conflict.hardConflict
        factors.push({
          delta: conflict.penalty,
          tag: conflict.tag,
          reason: conflict.reason,
          priority: conflict.hardConflict ? 100 : 85
        })
      }

      // 2. Golden pair combos (curated CN meta pairs) & tag synergy network
      if (!hasConflict && pickedMetas.length > 0) {
        const golden = findGoldenAugmentCombo(pickedMetas, meta)
        if (golden) {
          comboName = golden.comboName
          factors.push({
            delta: golden.bonus,
            tag: `⚡ 组合·${golden.comboName}`,
            reason: golden.reason,
            priority: 88
          })
        } else {
          const directMatches = pickedMetas.filter((pm) =>
            pm.tags.some((t) => t !== 'general' && meta.tags.includes(t))
          )
          if (directMatches.length > 0) {
            const synBonus = Math.min(0.03, 0.018 + (directMatches.length - 1) * 0.01)
            const names = directMatches.map((m) => m.name).slice(0, 2).join('+')
            factors.push({
              delta: synBonus,
              tag: `🔗 联动${directMatches[0].name}`,
              reason: `深度联动已拿【${names}】成体系`,
              priority: 72
            })
          } else {
            const crossMatch = pickedMetas.find((pm) =>
              pm.tags.some((t) => (CROSS_TAG_SYNERGY[t] || []).some((ct) => meta.tags.includes(ct)))
            )
            if (crossMatch) {
              factors.push({
                delta: 0.012,
                tag: `🔗 配合${crossMatch.name}`,
                reason: `跨系协同已拿【${crossMatch.name}】`,
                priority: 52
              })
            }
          }
        }
      }

      // 2b. Player-chosen archetype alignment & personal wishlist/blacklist markers
      if (!hasConflict && activeArchetype) {
        if (archCoreSet.has(augId)) {
          factors.push({
            delta: 0.024,
            tag: `🎯 契合${activeArchetype.title.slice(0, 6)}`,
            reason: `当前所选流派【${activeArchetype.title}】的核心质变卡`,
            priority: 76
          })
        } else if (archTag && archTag !== 'staple' && meta.tags.includes(archTag)) {
          factors.push({
            delta: 0.015,
            reason: `贴合当前所选【${activeArchetype.title}】机制`,
            priority: 58
          })
        }
      }
      if (userPreference === 'favorite' && !hasConflict) {
        factors.push({ delta: 0.014, reason: '已加入个人心愿单收藏', priority: 57 })
      } else if (userPreference === 'blacklisted') {
        factors.push({
          delta: -0.025,
          tag: '⊘ 个人避坑名单',
          reason: '已加入你的个人避坑海克斯名单',
          priority: 75
        })
      }

      // 3. Live purchased-item trajectory alignment
      if (!hasConflict && ctx.inferredFromItems) {
        if (ctx.builtTankCount >= 1 && traits.isTankCard) {
          factors.push({ delta: 0.02, tag: '🛡️ 契合已出肉装', reason: '已走坦克装路线，最大化生命/双抗联动', priority: 64 })
        } else if (ctx.builtBurnCount >= 1 && (meta.tags.includes('burn') || meta.tags.includes('haste'))) {
          factors.push({ delta: 0.022, tag: '🔥 放大灼烧出装', reason: '与已出灼烧/法强装备形成持续融化链', priority: 64 })
        } else if (ctx.builtApCount >= 1 && traits.isApFriendly) {
          factors.push({ delta: 0.018, tag: '✨ 契合已出法强装', reason: '本局已走 AP 输出路线，伤害收益放大', priority: 60 })
        } else if ((ctx.builtAdCritCount >= 1 || ctx.builtOnHitCount >= 1) && traits.isAdFriendly) {
          factors.push({ delta: 0.018, tag: '⚔️ 契合已出物理装', reason: '与已出暴击/攻速特效装高度契合', priority: 60 })
        } else if (ctx.builtTankCount >= 2 && traits.isFragilePenalty && mode !== 'yolo') {
          factors.push({ delta: -0.028, tag: '⚠️ 与已出肉装背离', reason: '已出多件肉装，再拿脆皮增伤互相抵消', priority: 66 })
        }
      }

      // 4. Game phase (early scaling vs late immediate fight value)
      if (!hasConflict) {
        if (ctx.gamePhase === 'early' && traits.isScalingQuest) {
          factors.push({ delta: 0.016, tag: '📈 前期发育上限高', reason: `Lv${state.currentLevel} 早拿成长/任务卡，中后期收益拉满`, priority: 48 })
        } else if (ctx.gamePhase === 'late' && traits.isScalingQuest) {
          factors.push({ delta: -0.022, tag: '⏳ 后期难叠满', reason: `已到 Lv${state.currentLevel} 后期，慢热成长卡来不及发力`, priority: 58 })
        }
      }

      // 5. Global matchup & team-comp weighting
      if (!hasConflict) {
        if (threat.enemyTankCount >= 2 && traits.isTankBuster) {
          factors.push({
            delta: mode === 'counter' ? 0.028 : mode === 'steady' ? 0.018 : 0.01,
            tag: `🎯 克制敌方${threat.enemyTankCount}前排`,
            reason: `针对敌方 ${threat.enemyTankCount} 名坦克/肉装前排`,
            priority: mode === 'counter' ? 78 : 62
          })
        }

        if (bossHero && (mode === 'counter' || mode === 'steady')) {
          const bossIsTank = bossHero.roles.includes('tank') || bossHero.damageType === 'TANK'
          const bossIsAssassinAd = bossHero.roles.includes('assassin') || bossHero.damageType === 'AD'
          if (bossIsTank && traits.isTankBuster) {
            factors.push({
              delta: mode === 'counter' ? 0.038 : 0.02,
              tag: `🎯 专治${threat.fedBossKills}杀${bossHero.name}`,
              reason: `针对敌方超神大肉【${bossHero.name}】`,
              priority: mode === 'counter' ? 86 : 68
            })
          } else if (bossIsAssassinAd && traits.isAntiDive) {
            factors.push({
              delta: mode === 'counter' ? 0.036 : 0.018,
              tag: `🎯 防${threat.fedBossKills}杀${bossHero.name}秒杀`,
              reason: `防敌方 ${threat.fedBossKills} 杀【${bossHero.name}】进场切杀`,
              priority: mode === 'counter' ? 86 : 68
            })
          } else if (bossIsAssassinAd && traits.isFragilePenalty) {
            factors.push({
              delta: mode === 'counter' ? -0.03 : -0.02,
              tag: `⚠️ 易被${bossHero.name}瞬秒`,
              reason: `敌方 ${threat.fedBossKills} 杀【${bossHero.name}】压制力极强，慎选减血卡`,
              priority: 82
            })
          }
        }

        if (threat.enemyDiveThreat >= 2 && mode !== 'yolo') {
          if (traits.isFragilePenalty) {
            factors.push({
              delta: mode === 'counter' ? -0.04 : -0.024,
              tag: '⚠️ 易被刺客秒杀',
              reason: `敌方 ${threat.enemyDiveThreat} 名突脸，拿脆皮自损极易暴毙`,
              priority: 74
            })
          } else if (traits.isAntiDive && (mode === 'steady' || mode === 'counter')) {
            factors.push({
              delta: 0.014,
              tag: '🛡️ 抗突脸容错高',
              reason: `面对敌方 ${threat.enemyDiveThreat} 突脸，大幅提升团战存活`,
              priority: 54
            })
          }
        }

        if (ctx.enemyPokeThreat >= 2 && traits.isSustainAntiPoke && mode !== 'yolo') {
          factors.push({
            delta: mode === 'torment' ? 0.022 : 0.016,
            tag: '💚 扛对面长手消耗',
            reason: `敌方 ${ctx.enemyPokeThreat} 长手 Poke，续航/开团容错大增`,
            priority: 56
          })
        }

        if (
          threat.enemyHealThreat >= 2 &&
          !traits.isFragilePenalty &&
          (meta.tags.includes('burn') || traits.isExplosiveYolo)
        ) {
          factors.push({ delta: 0.012, reason: '压制敌方高回复阵容，加快团战减员', priority: 44 })
        }

        if (ctx.allyHasNoTank && traits.isTankCard && (mode === 'team' || mode === 'steady')) {
          const canFrontline = guide.hero.roles.includes('tank') || guide.hero.roles.includes('fighter')
          if (canFrontline || mode === 'team') {
            factors.push({
              delta: mode === 'team' ? 0.038 : 0.016,
              tag: '🤝 补全队前排抗伤',
              reason: mode === 'team' ? '团队模式：弥补我方 0 前排短板' : '我方缺少前排，补坦度稳团战',
              priority: mode === 'team' ? 82 : 55
            })
          }
        }

        if (
          ctx.allyApCount >= 3 &&
          (meta.tags.includes('onhit') || /侵蚀|减抗/.test(traits.text)) &&
          (mode === 'team' || mode === 'steady')
        ) {
          factors.push({
            delta: mode === 'team' ? 0.032 : 0.015,
            tag: '🤝 破魔抗/混伤补位',
            reason: '缓解我方多 AP 怕敌方堆魔抗的困境',
            priority: mode === 'team' ? 80 : 52
          })
        }

        if (mode === 'yolo') {
          if (traits.isExplosiveYolo) {
            factors.push({
              delta: traits.isFragilePenalty ? 0.095 : 0.045,
              tag: '🔥 独爽极限上限',
              reason: '独爽模式：输出与爽感直接拉满！',
              priority: 90
            })
          } else if (meta.tags.includes('tank') && !meta.tags.includes('crit')) {
            factors.push({ delta: -0.025, reason: '独爽模式下纯肉卡爽感偏低', priority: 40 })
          }
        } else if (mode === 'torment') {
          if (traits.isTormentCard) {
            factors.push({ delta: 0.042, tag: '😈 折磨不死神卡', reason: '折磨模式：无限拉扯/灼烧/续航恶心对面！', priority: 90 })
          }
          if (traits.isFragilePenalty) {
            factors.push({ delta: -0.04, tag: '⚠️ 违背折磨坦度', reason: '折磨流怕暴毙，不选降血玻璃大炮', priority: 80 })
          }
        } else if (traits.isFragilePenalty && deltaWr <= -0.02) {
          factors.push({ delta: -0.018, reason: '该英雄拿玻璃大炮胜率偏低', priority: 45 })
        }
      }

      const bonus = factors.reduce((acc, f) => acc + f.delta, 0)
      const rankedFactors = [...factors].sort((a, b) => b.priority - a.priority)
      let primaryTag = rankedFactors.find((f) => f.tag)?.tag || ''
      const reasons = rankedFactors.map((f) => f.reason).filter((r, i, arr) => arr.indexOf(r) === i)

      if (!primaryTag) {
        if (deltaWr >= 0.03) primaryTag = `S+ 强力 (+${(deltaWr * 100).toFixed(1)}%)`
        else if (deltaWr <= -0.03 && mode !== 'yolo') primaryTag = '⚠️ 慎选陷阱'
        else primaryTag = stat?.verdictLabel || '稳健可用'
      }

      if (reasons.length === 0) {
        reasons.push(
          deltaWr >= 0
            ? `大数据相比英雄均值净增 +${(deltaWr * 100).toFixed(1)}%`
            : `大数据相比英雄均值 ${(deltaWr * 100).toFixed(1)}%`
        )
      }

      const topBound = stat?.boundItems?.[0]
      const effectiveVerdict = hasConflict
        ? 'TRAP'
        : mode === 'yolo' && traits.isExplosiveYolo && stat?.verdict === 'TRAP'
          ? 'S'
          : stat?.verdict || 'B'

      return {
        augmentId: augId,
        slotIndex: slotByAugId.get(augId),
        hasConflict,
        baseWinRate: Number(baseWr.toFixed(4)),
        deltaWinRate: deltaWr,
        situationalBonus: Number(bonus.toFixed(4)),
        situationalScore: Number((baseWr + bonus).toFixed(4)),
        verdict: effectiveVerdict,
        verdictLabel: stat?.verdictLabel || '可用',
        primaryTag,
        comboName,
        sampleGames,
        confidenceLevel,
        userPreference,
        situationReasons: reasons.slice(0, 2),
        pivotItem: topBound
          ? { itemId: topBound.itemId, name: topBound.name, winRate: topBound.winRate }
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
