import { buildHeroDetailGuide } from '../data/synergyEngine'
import type { AiSettings, GameLiveState, PlaystyleMode, SeedBundle } from '@shared/types'

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

  const modeNameMap: Record<PlaystyleMode, string> = {
    steady: '稳健上分',
    counter: '针对敌方大爹',
    team: '团队补位牺牲',
    yolo: '只顾自己爽（极限输出整活）',
    torment: '不死折磨恶心对面'
  }

  const pickedNames = state.pickedAugmentIds
    .map((id) => bundle.augments[id]?.name)
    .filter(Boolean)
    .join('、')
  const enemySummary = state.enemyPlayers
    .map((ep) => {
      const h = bundle.heroes[ep.heroId]
      return h ? `${h.name}(${ep.kills}/${ep.deaths})` : ''
    })
    .filter(Boolean)
    .join('、')

  const tonePromptMap: Record<AiSettings['toneStyle'], string> = {
    concise:
      '语气干脆利落、一针见血，在 80 字内用 3 条极简短句输出：1.海克斯思路；2.下一件必出装备；3.一句话打法。绝不废话。',
    witty:
      '语气带一点大乱斗老哥的幽默毒舌整活感（但不冒犯玩家），在 95 字内用 3 条短句给出：1.海克斯吐槽与思路；2.下一件针对装；3.团战骚操作提醒。',
    beginner:
      '面向刚玩大乱斗的新手玩家，用通俗大白话解释原因（避免生僻黑话），在 105 字内分 3 条说明：1.海克斯配合逻辑；2.下一件买什么及克制谁；3.站位与技能释放要点。'
  }

  const systemPrompt = `你是英雄联盟海克斯大乱斗局内原位HUD军师。严格按玩家当前选择的【心态模式】给出建议。${
    tonePromptMap[settings.toneStyle || 'concise']
  }`

  const contextPrompt = [
    `玩家英雄：${guide.hero.name}（心态模式：【${modeNameMap[state.playstyleMode]}】）`,
    `等级：${state.currentLevel}级，当前金币：${state.currentGold}`,
    `敌方战况：${enemySummary || state.enemyHeroIds.map((id) => bundle.heroes[id]?.name).join('、') || '未知'}`,
    `已拿海克斯：${pickedNames || '暂无'}`,
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
