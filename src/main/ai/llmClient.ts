import { buildHeroDetailGuide } from '../data/synergyEngine'
import type { AiSettings, GameLiveState, SeedBundle } from '@shared/types'
import { computeLocalTacticalAdvice } from './tacticalEngine'

export async function testLlmConnection(
  settings: AiSettings
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const start = Date.now()
  if (!settings.baseUrl.trim()) {
    return { ok: false, latencyMs: 0, message: '请先填写接口 Base URL' }
  }
  const isLocalOllama = /127\.0\.0\.1:11434|localhost:11434/i.test(settings.baseUrl)
  if (!settings.apiKey.trim() && !isLocalOllama) {
    return { ok: false, latencyMs: 0, message: '请先填写 API Key（本地 Ollama 可填 ollama）' }
  }

  const cleanBase = settings.baseUrl.trim().replace(/\/+$/, '')
  const endpoint = cleanBase.endsWith('/chat/completions')
    ? cleanBase
    : `${cleanBase}/chat/completions`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim() || 'ollama'}`
      },
      body: JSON.stringify({
        model: settings.model.trim() || 'deepseek-chat',
        messages: [{ role: 'user', content: '请仅回复OK两个字母' }],
        temperature: 0,
        max_tokens: 12
      }),
      signal: AbortSignal.timeout(12000)
    })

    const latencyMs = Date.now() - start
    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        message: `连接失败（HTTP ${res.status}），请检查 API Key、Base URL 或模型名是否正确`
      }
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const reply = json.choices?.[0]?.message?.content?.trim() || ''
    return {
      ok: true,
      latencyMs,
      message: `✓ 连通正常（耗时 ${latencyMs}ms · 模型返回: ${reply.slice(0, 18) || 'OK'}）`
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: `连接异常：${err instanceof Error ? err.message : String(err)}`
    }
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
  if (!settings.enabled) {
    return {
      ok: false,
      content: 'AI 战局锦囊当前已在「助手设置 → AI 战局锦囊」中停用，开启总开关后即可使用。'
    }
  }
  const isLocalOllama = /127\.0\.0\.1:11434|localhost:11434/i.test(settings.baseUrl)
  if ((!settings.apiKey.trim() && !isLocalOllama) || !settings.baseUrl.trim()) {
    return {
      ok: false,
      content:
        '请先在主窗口「助手设置 → AI 战局锦囊」中配置 DeepSeek / 硅基流动 / 通义千问 / Ollama 接口。'
    }
  }

  const heroId = selectedHeroId || state.myHeroId || Object.keys(bundle.heroes)[0]
  const guide = buildHeroDetailGuide(bundle, heroId)
  if (!guide) return { ok: false, content: '未找到当前英雄统计数据。' }

  const pickedNames = state.pickedAugmentIds
    .map((id) => bundle.augments[id]?.name)
    .filter(Boolean)
    .join('、')
  const myItemNames = state.currentItemIds
    .map((id) => bundle.items[id]?.name)
    .filter(Boolean)
    .join('、')
  const allyNames = state.allyHeroIds
    .map((id) => bundle.heroes[id]?.name)
    .filter(Boolean)
    .join('、')
  const enemySummary = state.enemyPlayers
    .map((ep) => {
      const h = bundle.heroes[ep.heroId]
      if (!h) return ''
      const keyItems = ep.itemIds
        .map((iid) => bundle.items[iid]?.name)
        .filter(Boolean)
        .slice(0, 2)
        .join('/')
      return `${h.name}(${ep.kills}/${ep.deaths}${keyItems ? `·${keyItems}` : ''})`
    })
    .filter(Boolean)
    .join('、')

  const localAdvice = computeLocalTacticalAdvice(bundle, state, heroId)
  const candSummary = localAdvice.situationalCandidates
    .map((ev) => {
      const name = bundle.augments[ev.augmentId]?.name || ev.augmentId
      return `${name}(综合${(ev.situationalScore * 100).toFixed(1)}%·${ev.primaryTag})`
    })
    .join(' vs ')

  const tonePromptMap: Record<AiSettings['toneStyle'], string> = {
    concise:
      '语气干脆利落、一针见血，在 90 字内用 3 条极简短句输出：1.综合全局选海克斯思路；2.下一件针对装备；3.一句话打法。绝不废话。',
    witty:
      '语气带一点大乱斗老哥的幽默毒舌整活感（但不冒犯玩家），在 100 字内用 3 条短句给出：1.海克斯吐槽与全局选择；2.下一件针对装；3.团战骚操作提醒。',
    beginner:
      '面向刚玩大乱斗的新手玩家，用通俗大白话解释原因（避免生僻黑话），在 110 字内分 3 条说明：1.海克斯与阵容/装备配合逻辑；2.下一件买什么及克制谁；3.站位与技能释放要点。'
  }

  const systemPrompt = `你是英雄联盟海克斯大乱斗局内原位HUD军师。请务必综合我方阵容、已出装备、已拿海克斯、敌方阵容与出装以及等级阶段给出全局最优建议。${
    tonePromptMap[settings.toneStyle || 'concise']
  }`

  const contextPrompt = [
    `玩家英雄：${guide.hero.name}`,
    `等级：${state.currentLevel}级，当前金币：${state.currentGold}`,
    `我方阵容：${allyNames || '未知'}${localAdvice.threatRadar.allyDamageWarning ? `（${localAdvice.threatRadar.allyDamageWarning}）` : ''}`,
    `我方已出装备：${myItemNames || '暂无成装'}`,
    `已拿海克斯：${pickedNames || '暂无'}`,
    candSummary ? `当前三选一候选：${candSummary}` : '',
    localAdvice.anvilFocus ? `属性铁砧建议：主拿${localAdvice.anvilFocus.primary}` : '',
    `敌方战况与装备：${enemySummary || state.enemyHeroIds.map((id) => bundle.heroes[id]?.name).join('、') || '未知'}`,
    userQuestion && userQuestion !== '__MINI_BRIEF__' ? `补充诉求：${userQuestion}` : ''
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
        Authorization: `Bearer ${settings.apiKey.trim() || 'ollama'}`
      },
      body: JSON.stringify({
        model: settings.model.trim() || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextPrompt }
        ],
        temperature: settings.toneStyle === 'witty' ? 0.65 : 0.4,
        max_tokens: 280
      }),
      signal: AbortSignal.timeout(20000)
    })

    if (!res.ok) {
      return {
        ok: false,
        content: `请求失败（HTTP ${res.status}），请在设置中点击「测试连接」排查 API Key。`
      }
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const answer = json.choices?.[0]?.message?.content?.trim()
    return { ok: Boolean(answer), content: answer || '返回为空' }
  } catch (err) {
    return { ok: false, content: `接口超时：${err instanceof Error ? err.message : String(err)}` }
  }
}
