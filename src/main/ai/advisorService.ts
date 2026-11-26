import { buildHeroDetailGuide } from '../data/synergyEngine'
import type {
  AiSettings,
  GameLiveState,
  HeroMeta,
  SeedBundle,
  TacticalAdvice,
  ThreatRadar
} from '@shared/types'

// Champions notorious for heavy healing / sustain in ARAM Mayhem
const HEAVY_HEAL_HERO_IDS = new Set([
  '8', // Vladimir
  '16', // Soraka
  '19', // Warwick
  '27', // Singed
  '36', // DrMundo
  '37', // Sona
  '50', // Swain
  '114', // Fiora
  '141', // Kayn
  '154', // Zac
  '223', // TahmKench
  '233', // Briar
  '266', // Aatrox
  '267', // Nami
  '350', // Yuumi
  '517', // Sylas
  '777', // Yone
  '895' // Nilah
])

function pickFirstExistingItem(bundle: SeedBundle, candidates: string[]): string | null {
  for (const id of candidates) {
    if (bundle.items[id]) return id
  }
  return null
}

export function computeLocalTacticalAdvice(
  bundle: SeedBundle,
  state: GameLiveState,
  selectedHeroId: string | null
): TacticalAdvice {
  const heroId = selectedHeroId || state.myHeroId || Object.keys(bundle.heroes)[0]
  const myHero: HeroMeta | undefined = bundle.heroes[heroId]
  const enemies = state.enemyHeroIds
    .map((id) => bundle.heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))
  const allies = state.allyHeroIds
    .map((id) => bundle.heroes[id])
    .filter((h): h is HeroMeta => Boolean(h))

  const totalEnemies = Math.max(1, enemies.length)
  const adCount = enemies.filter((h) => h.damageType === 'AD').length
  const apCount = enemies.filter((h) => h.damageType === 'AP').length
  const mixedCount = enemies.length - adCount - apCount
  const enemyAdRatio =
    enemies.length === 0 ? 0.5 : Number(((adCount + mixedCount * 0.5) / totalEnemies).toFixed(2))
  const enemyApRatio =
    enemies.length === 0 ? 0.5 : Number(((apCount + mixedCount * 0.5) / totalEnemies).toFixed(2))

  const enemyTankCount = enemies.filter(
    (h) => h.roles.includes('tank') || h.damageType === 'TANK'
  ).length
  const enemyHealThreat = enemies.filter((h) => HEAVY_HEAL_HERO_IDS.has(h.id)).length
  const enemyDiveThreat = enemies.filter(
    (h) => h.roles.includes('assassin') || (h.roles.includes('fighter') && !h.roles.includes('marksman'))
  ).length

  let allyDamageWarning: string | null = null
  if (allies.length >= 4) {
    const allyAp = allies.filter((h) => h.damageType === 'AP').length
    const allyAd = allies.filter((h) => h.damageType === 'AD').length
    const allyTank = allies.filter((h) => h.roles.includes('tank')).length
    if (allyAp >= 4) {
      allyDamageWarning = '我方 4+ 法伤阵容，敌方极易堆魔抗，中期必须优先做百分比法穿或走普攻特效流'
    } else if (allyAd >= 4) {
      allyDamageWarning = '我方纯物理菜刀队，敌方叠护甲收益极高，第 2~3 件务必补百分比穿甲或黑切'
    } else if (allyTank === 0) {
      allyDamageWarning = '我方无正统前排坦克，团战切忌盲目先手开团，优先选保命/拉扯类海克斯'
    }
  }

  const threatRadar: ThreatRadar = {
    enemyAdRatio,
    enemyApRatio,
    enemyTankCount,
    enemyHealThreat,
    enemyDiveThreat,
    allyDamageWarning
  }

  const counterItemIds: Array<{ itemId: string; reason: string }> = []
  const myType = myHero?.damageType || 'AP'
  const isTank = myHero?.roles.includes('tank') || myType === 'TANK'

  // 1. Anti-heal check
  if (enemyHealThreat >= 2) {
    const antiHealId = isTank
      ? pickFirstExistingItem(bundle, ['3075']) // 荆棘之甲
      : myType === 'AP'
        ? pickFirstExistingItem(bundle, ['3165']) // 莫雷洛秘典
        : pickFirstExistingItem(bundle, ['3033', '6609']) // 凡性的提醒 / 链锯剑
    if (antiHealId && !state.currentItemIds.includes(antiHealId)) {
      const healNames = enemies
        .filter((h) => HEAVY_HEAL_HERO_IDS.has(h.id))
        .map((h) => h.name)
        .slice(0, 3)
        .join('、')
      counterItemIds.push({
        itemId: antiHealId,
        reason: `敌方拥有【${healNames}】等强回血点，尽早挂重伤可大幅压制团战续航`
      })
    }
  }

  // 2. Tank-busting check
  if (enemyTankCount >= 2 && !isTank) {
    const penId =
      myType === 'AP'
        ? pickFirstExistingItem(bundle, ['6653', '3135', '3137']) // 兰德里 / 法穿棒 / 陨星
        : pickFirstExistingItem(bundle, ['3153', '3036']) // 破败 / 多米尼克
    if (penId && !state.currentItemIds.includes(penId)) {
      counterItemIds.push({
        itemId: penId,
        reason: `敌方有 ${enemyTankCount} 名重装前排（海斗叠肉极厚），需百分比最大生命伤害与穿透`
      })
    }
  }

  // 3. Heavy AP / Heavy AD / Dive defense
  if (enemyApRatio >= 0.65) {
    const mrId = isTank
      ? pickFirstExistingItem(bundle, ['2504', '3065', '4401']) // 璀璨回响/败魔 / 振奋 / 自然之力
      : myType === 'AD'
        ? pickFirstExistingItem(bundle, ['3156', '3139']) // 饮魔刀 / 水银弯刀
        : pickFirstExistingItem(bundle, ['3102']) // 女妖面纱
    if (mrId && !state.currentItemIds.includes(mrId)) {
      counterItemIds.push({
        itemId: mrId,
        reason: `敌方法术伤害占比高达 ${Math.round(enemyApRatio * 100)}%，补一件魔抗装防被远程消耗秒杀`
      })
    }
  } else if (enemyDiveThreat >= 2 && !isTank) {
    const surviveId =
      myType === 'AP'
        ? pickFirstExistingItem(bundle, ['3157']) // 中娅沙漏
        : pickFirstExistingItem(bundle, ['6333', '3026']) // 死亡之舞 / 复活甲
    if (surviveId && !state.currentItemIds.includes(surviveId)) {
      counterItemIds.push({
        itemId: surviveId,
        reason: `敌方有 ${enemyDiveThreat} 名突进/刺客，雪球贴脸威胁大，补保命装提高容错`
      })
    }
  }

  // Fallback core item recommendation when no enemy comp is loaded yet
  if (counterItemIds.length === 0 && myHero) {
    const firstBuild = bundle.coreBuilds[myHero.id]?.[0]
    for (const id of (firstBuild?.items || []).slice(0, 2)) {
      if (bundle.items[id] && !state.currentItemIds.includes(id)) {
        counterItemIds.push({
          itemId: id,
          reason: `${myHero.name}国服最高胜率核心成型装（胜率 ${(firstBuild.winRate * 100).toFixed(1)}%）`
        })
      }
    }
  }

  // Picked augment synergy analysis
  const pickedMetas = state.pickedAugmentIds
    .map((id) => bundle.augments[id])
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
  const pickedTags = new Set(pickedMetas.flatMap((m) => m.tags))

  let nextAugmentFocus = '下一轮海克斯优先挑选该英雄「S+ 必拿 / S 流派核心」且净胜率 ΔWR > +2% 的强化。'
  if (pickedTags.has('crit')) {
    nextAugmentFocus =
      '你已拿到暴击体系符文！后续海克斯优先找暴击率、暴击伤害或技能急速词条，把爆发拉满。'
  } else if (pickedTags.has('tank')) {
    nextAugmentFocus =
      '你已开启叠肉体系！后续优先拿生命转化伤害、双抗或回血护盾符文，化身打不死的团战战神。'
  } else if (pickedTags.has('burn') || enemyTankCount >= 2) {
    nextAugmentFocus =
      '面对多前排阵容，下一轮海克斯强烈建议留意「持续灼烧 / 技能急速 / 百分比穿透」类词条。'
  }

  const tips: string[] = []
  if (enemies.length > 0) {
    tips.push(
      `敌方阵容构成：物理威胁 ${Math.round(enemyAdRatio * 100)}% / 法术威胁 ${Math.round(enemyApRatio * 100)}%，前排坦克 ${enemyTankCount} 人，强回复点 ${enemyHealThreat} 人。`
    )
  } else {
    tips.push(
      `当前为静态备战模式：进入对局（或开启上方 5v5 模拟器）后将自动读取敌方 5 人阵容实时调整针对装。`
    )
  }
  if (allyDamageWarning) tips.push(allyDamageWarning)
  if (pickedMetas.length > 0) {
    tips.push(
      `本局已锁海克斯【${pickedMetas.map((m) => m.name).join(' + ')}】，注意围绕已选词条买核心联动装备，切勿半肉半输出混搭刮痧。`
    )
  } else {
    tips.push(
      `海克斯大乱斗移除了虚弱且保留雪球，脆皮英雄站位注意躲草丛雪球，阵亡回泉水前想好下一件装备。`
    )
  }

  const headline =
    enemies.length > 0
      ? enemyHealThreat >= 2 && enemyTankCount >= 2
        ? '敌方属于「多前排 + 强回血」肉搏铁桶阵，切忌纯堆固定爆发，重伤与百分比打肉是胜负手！'
        : enemyApRatio >= 0.65
          ? '敌方高占比法系消耗/爆发阵容，走位避开群体 AOE，中期补一件魔抗装性价比极高！'
          : enemyDiveThreat >= 2
            ? '敌方雪球突进冲脸极强，留好控制技能反手保护后排，优先保证团战存活率！'
            : `${myHero?.name || '当前英雄'}本局阵容均衡，按高胜率流派节奏稳步推进即可接管比赛。`
      : `${myHero?.name || '当前英雄'}（${myHero?.tier || 'T2'} · 胜率 ${((myHero?.smoothedWinRate || 0.5) * 100).toFixed(1)}%）标准备战方案`

  return {
    headline,
    threatRadar,
    counterItemIds: counterItemIds.slice(0, 3),
    nextAugmentFocus,
    playstyleTips: tips
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
      content: '尚未配置大模型 API Key，请点击右上角「设置」填入 DeepSeek / 通义千问 / OpenAI / Ollama 接口信息。'
    }
  }

  const heroId = selectedHeroId || state.myHeroId || Object.keys(bundle.heroes)[0]
  const guide = buildHeroDetailGuide(bundle, heroId)
  if (!guide) {
    return { ok: false, content: '未找到当前英雄统计数据。' }
  }

  const topAugText = guide.augments
    .slice(0, 6)
    .map((a) => {
      const m = bundle.augments[a.augmentId]
      return `${m?.name}(${m?.rarity}, 胜率${(a.smoothedWinRate * 100).toFixed(1)}%, Δ${a.deltaWinRate >= 0 ? '+' : ''}${(a.deltaWinRate * 100).toFixed(1)}%)`
    })
    .join('；')

  const pickedNames = state.pickedAugmentIds
    .map((id) => bundle.augments[id]?.name)
    .filter(Boolean)
    .join('、')
  const candidateNames = state.candidateAugmentIds
    .map((id) => {
      const m = bundle.augments[id]
      const st = guide.augments.find((x) => x.augmentId === id)
      return m
        ? `${m.name}[${st ? `胜率${(st.smoothedWinRate * 100).toFixed(1)}%` : '暂无大样本'}]`
        : ''
    })
    .filter(Boolean)
    .join(' vs ')

  const allyNames = state.allyHeroIds.map((id) => bundle.heroes[id]?.name).filter(Boolean).join('、')
  const enemyNames = state.enemyHeroIds.map((id) => bundle.heroes[id]?.name).filter(Boolean).join('、')
  const itemNames = state.currentItemIds.map((id) => bundle.items[id]?.name).filter(Boolean).join('、')
  const coreBuildNames = (guide.coreBuilds[0]?.items || [])
    .map((id) => bundle.items[id]?.name)
    .filter(Boolean)
    .join(' → ')

  const isCompactBrief = userQuestion === '__MINI_BRIEF__'
  const systemPrompt = isCompactBrief
    ? '你是英雄联盟海克斯大乱斗局内速查军师。请用极简3行（总字数严格不超过80字）输出本局锦囊：1.海克斯倾向；2.必买针对装；3.团战一句话注意。不要寒暄。'
    : '你是《英雄联盟》端游「海克斯大乱斗（ARAM: Mayhem）」资深教练，专门给熟悉LOL但刚接触海斗/新装备的玩家提供简洁、直白、结论先行的局内决策建议。控制在 220 字以内，使用短要点输出：1）海克斯怎么选/联动；2）下一件装备买什么（说明针对谁及新装备效果）；3）团战一句话打法。'

  const contextPrompt = [
    `我使用的英雄：${guide.hero.name}（${guide.hero.title}，当前版本 ${guide.hero.tier}，基准胜率 ${(guide.hero.smoothedWinRate * 100).toFixed(1)}%）`,
    `当前等级：${state.currentLevel}级`,
    `我方阵容：${allyNames || '暂未进入对局'}`,
    `敌方阵容：${enemyNames || '暂未进入对局'}`,
    `我已选的海克斯：${pickedNames || '暂未选定'}`,
    candidateNames ? `当前三选一待选海克斯：${candidateNames}` : '',
    `我当前已出装备：${itemNames || '出门装'}`,
    `国服大数据该英雄最强海克斯参考：${topAugText}`,
    `国服常规高胜率三件套：${coreBuildNames || '暂无'}`,
    isCompactBrief
      ? '请输出不超过80字的3条极简本局战术锦囊。'
      : userQuestion?.trim()
        ? `玩家追问：${userQuestion.trim()}`
        : '请给出本局针对性的海克斯与下一件出装建议。'
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
        max_tokens: 500
      }),
      signal: AbortSignal.timeout(25000)
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return {
        ok: false,
        content: `大模型请求失败（HTTP ${res.status}）：${errBody.slice(0, 140) || '请检查 Base URL、API Key 与模型名称'}`
      }
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const answer = json.choices?.[0]?.message?.content?.trim()
    return {
      ok: Boolean(answer),
      content: answer || '模型返回内容为空，请重试。'
    }
  } catch (err) {
    return {
      ok: false,
      content: `调用大模型接口超时或网络错误：${err instanceof Error ? err.message : String(err)}`
    }
  }
}
