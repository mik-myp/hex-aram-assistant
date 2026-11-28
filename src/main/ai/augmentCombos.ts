import type { AugmentMeta, HeroMeta } from '@shared/types'
import type { GlobalMatchContext } from './matchContext'

export interface GoldenComboHit {
  comboName: string
  partnerName: string
  bonus: number
  reason: string
}

export interface SpecialConflictHit {
  hardConflict: boolean
  penalty: number
  tag: string
  reason: string
}

interface ComboArchetypeRule {
  comboName: string
  bonus: number
  desc: string
  /** Names belonging to side A and side B (or same pool when symmetric) */
  groupA: RegExp
  groupB: RegExp
}

/**
 * Curated high-synergy Hextech ARAM augment pairs calibrated to real CN server augment names.
 */
const GOLDEN_COMBO_RULES: ComboArchetypeRule[] = [
  {
    comboName: '技能暴击核弹',
    bonus: 0.036,
    desc: '技能暴击+暴击倍率/续航形成毁灭级伤害质变',
    groupA: /珠光护手|珠光手镯/,
    groupB: /关键暴击|灵魂虹吸|易损|会心治疗|会心防御|暴击律动|升级：无尽之刃|升级：收集者/
  },
  {
    comboName: '炼狱无限火链',
    bonus: 0.035,
    desc: '高频技能刷新叠加无限灼烧，团战持续融化全队',
    groupA: /炼狱导管/,
    groupB: /魔法飞弹|尤里卡|秘术冲拳|循环往复|无限循环往复|面包和黄油|面包和果酱|面包和奶酪|回响施放|咒语裂变|火上浇油|升级：献祭|超负荷/
  },
  {
    comboName: '巨神叠血战神',
    bonus: 0.034,
    desc: '最大生命与护盾/伤害转化滚雪球，后期肉度无解',
    groupA: /歌利亚巨人|钢化你心|坦克引擎/,
    groupB: /巨像的勇气|重量级打击手|死亡之环|升级：献祭|尖端发明家|蛋白粉奶昔|海洋龙魂|不动如山|泰坦的坚决|星界躯体/
  },
  {
    comboName: '超远特效机关枪',
    bonus: 0.034,
    desc: '射程/攻速与双重特效叠加，安全距离极速融化前排',
    groupA: /双刀流|虚幻武器|台风|三重射击|多重射击|双发快射/,
    groupB: /万用瞄准镜|更万用的瞄准镜|最万用的瞄准镜|战争交响乐|踢踏舞|穿针引线|巨人杀手|神射法师|亮出你的剑/
  },
  {
    comboName: '永动机奶盾折磨',
    bonus: 0.032,
    desc: '治疗护盾相互放大或转化为范围真伤，拉扯打不死',
    groupA: /死亡之环|风语者的祝福|急救用具|全心为你|生机迸发/,
    groupB: /强力护盾|加固护盾|会心治疗|自然即是治愈|海洋龙魂|活力焕发|喂呜喂呜|拯救/
  },
  {
    comboName: '大招毁天灭地',
    bonus: 0.032,
    desc: '终极技能连发或爆发增伤，一波团战直接清屏',
    groupA: /终极刷新|终极唤醒|奥术公理|终极循环往复/,
    groupB: /终极不可阻挡|艾卡西亚的陷落|你摸不到|老练狙神|珠光护手|炼狱导管/
  },
  {
    comboName: '雪球飞雷神进场',
    bonus: 0.03,
    desc: '强化雪球无缝衔接进场控制或爆发，后排无处可逃',
    groupA: /史上最大雪球|神圣雪球|下雪天/,
    groupB: /利刃华尔兹|俯冲轰炸|小丑学院|大地苏醒|和我一起困在这里|闪闪现现/
  },
  {
    comboName: '法术暴走转换',
    bonus: 0.028,
    desc: '高法强/属性转换互相放大，属性面板突破天际',
    groupA: /物理转魔法|魔法转物理|物法皆修|沃格勒特的巫师帽|大法师/,
    groupB: /尤里卡|超凡邪恶|珠光护手|属性叠属性|全能龙魂|巫师式思考/
  },
  {
    comboName: '叠属性后期大核',
    bonus: 0.026,
    desc: '经济/属性叠加双引擎驱动，中后期数值碾压',
    groupA: /属性叠属性|属性！|叠角龙|海牛阿福的勇士|超凡邪恶/,
    groupB: /夺金|捐赠|牙仙子|飞升仪式|属性叠属性|属性！/
  }
]

export function findGoldenAugmentCombo(
  pickedMetas: AugmentMeta[],
  candidateMeta: AugmentMeta
): GoldenComboHit | null {
  if (pickedMetas.length === 0) return null
  const cName = candidateMeta.name

  let best: GoldenComboHit | null = null
  for (const pm of pickedMetas) {
    if (pm.id === candidateMeta.id) continue
    const pName = pm.name
    for (const rule of GOLDEN_COMBO_RULES) {
      const hitAB = rule.groupA.test(pName) && rule.groupB.test(cName)
      const hitBA = rule.groupB.test(pName) && rule.groupA.test(cName)
      if (!hitAB && !hitBA) continue
      if (!best || rule.bonus > best.bonus) {
        best = {
          comboName: rule.comboName,
          partnerName: pName,
          bonus: rule.bonus,
          reason: `黄金组合【${rule.comboName}】：与已拿【${pName}】${rule.desc}`
        }
      }
    }
  }
  return best
}

export function evaluateSpecialConflicts(
  pickedMetas: AugmentMeta[],
  candidateMeta: AugmentMeta,
  hero: HeroMeta,
  isManalessHero: boolean
): SpecialConflictHit | null {
  const text = `${candidateMeta.name} ${candidateMeta.desc}`
  const hasBackToBasics = pickedMetas.some((m) => m.name.includes('回归基本功'))
  const hasUltAugment = pickedMetas.some((m) => /终极|大招/.test(`${m.name} ${m.desc}`))

  if (
    (hasBackToBasics && /终极技能|施放终极|大招/.test(text)) ||
    (hasUltAugment && candidateMeta.name.includes('回归基本功'))
  ) {
    return {
      hardConflict: true,
      penalty: -0.16,
      tag: '⚠️ 机制冲突别选',
      reason: '与本局已选大招/封大招海克斯直接冲突！'
    }
  }

  const hasDrawSword = pickedMetas.some((m) => m.name.includes('亮出你的剑'))
  const hasScope = pickedMetas.some((m) => /瞄准镜|远射/.test(m.name))
  if (
    (hasDrawSword && /瞄准镜|远射/.test(candidateMeta.name)) ||
    (hasScope && candidateMeta.name.includes('亮出你的剑'))
  ) {
    return {
      hardConflict: true,
      penalty: -0.12,
      tag: '⚠️ 近战/射程冲突',
      reason: '【亮出你的剑】会变为近战，与射程类瞄准镜互相浪费！'
    }
  }

  const isManaOnly =
    (/法力值|法力回复|最大法力|回蓝/.test(text) || /溢流|由心及物|没法力/.test(candidateMeta.name)) &&
    !/生命|护盾|暴击/.test(text)
  if (isManalessHero && isManaOnly) {
    return {
      hardConflict: false,
      penalty: -0.05,
      tag: '⚠️ 无蓝条词条浪费',
      reason: `${hero.name}无蓝条，法力类海克斯收益极低`
    }
  }

  return null
}

export function classifySampleConfidence(games: number): 'high' | 'medium' | 'low' {
  if (games >= 1000) return 'high'
  if (games >= 200) return 'medium'
  return 'low'
}

/**
 * Recommends Stat Anvil (属性铁砧) priority tailored to live build trajectory & enemy comp.
 */
export function computeStatAnvilFocus(
  ctx: GlobalMatchContext
): { primary: string; secondary: string; reason: string } {
  const { threatRadar, effectiveStyle } = ctx

  if (effectiveStyle === 'TANK') {
    if (threatRadar.enemyApRatio >= 0.65) {
      return {
        primary: '魔法抗性 / 生命值',
        secondary: '技能急速 / 韧性',
        reason: `敌方 ${Math.round(threatRadar.enemyApRatio * 100)}% 法伤，优先补魔抗与血量`
      }
    }
    if (threatRadar.enemyAdRatio >= 0.68 || ctx.enemyCritThreats >= 2) {
      return {
        primary: '护甲 / 生命值',
        secondary: '技能急速 / 韧性',
        reason: '敌方物理/暴击火力强，铁砧优先护甲与最大生命'
      }
    }
    return {
      primary: '双抗 / 最大生命',
      secondary: '技能急速 / 移速',
      reason: '前排均衡抗伤，配合急速提高控制与留人频率'
    }
  }

  if (effectiveStyle === 'AD_ONHIT') {
    return {
      primary: ctx.enemyArmorStackers >= 2 ? '护甲穿透 / 攻速' : '攻击速度 / 攻击力',
      secondary: '全能吸血 / 移速',
      reason:
        ctx.enemyArmorStackers >= 2
          ? `敌方 ${ctx.enemyArmorStackers} 人堆护甲，铁砧优先破甲+攻速`
          : '特效流攻速收益最高，补吸血与移速拉扯前排'
    }
  }

  if (effectiveStyle === 'AD_CRIT') {
    return {
      primary: ctx.enemyArmorStackers >= 2 ? '暴击 / 穿甲' : '攻击力 / 暴击',
      secondary: '攻速 / 移速',
      reason:
        ctx.enemyArmorStackers >= 2
          ? '针对敌方护甲装，暴击配穿甲保证中期打肉效率'
          : '标准暴击 AD 面板最大化，补移速防突脸'
    }
  }

  if (effectiveStyle === 'SUPPORT') {
    return {
      primary: '治疗护盾强度 / 技能急速',
      secondary: '法强 / 移速',
      reason: '大乱斗辅助护盾回血与短 CD 收益远高于纯输出'
    }
  }

  // Default AP
  return {
    primary: ctx.enemyMrStackers >= 2 ? '法术穿透 / 法强' : '法术强度 / 技能急速',
    secondary: ctx.enemyPokeThreat >= 2 ? '移速 / 全能吸血' : '法穿 / 移速',
    reason:
      ctx.enemyMrStackers >= 2
        ? `敌方 ${ctx.enemyMrStackers} 人堆魔抗，法穿铁砧性价比极高`
        : '高法强配合技能急速，团战多打一套消耗与收割'
  }
}
