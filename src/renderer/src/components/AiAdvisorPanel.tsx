import React, { useEffect, useState } from 'react'
import { Bot, Crosshair, Loader2, Send, ShieldAlert, Sparkles, Swords } from 'lucide-react'
import type {
  AiSettings,
  GameLiveState,
  HeroMeta,
  ItemMeta,
  TacticalAdvice
} from '@shared/types'

interface AiAdvisorPanelProps {
  selectedHeroId: string
  heroes: Record<string, HeroMeta>
  items: Record<string, ItemMeta>
  gameState: GameLiveState
  settings: AiSettings
  onOpenSettings: () => void
  onActivate5v5Sim: () => void
}

const QUICK_QUESTIONS = [
  '对面太肉而且回血很猛，我下一件装备和海克斯怎么选？',
  '结合我当前已拿的海克斯，团战该打先手消耗还是保后排反打？',
  '这把我是全队唯一输出点，怎么出装容错率最高？'
]

export const AiAdvisorPanel: React.FC<AiAdvisorPanelProps> = ({
  selectedHeroId,
  heroes,
  items,
  gameState,
  settings,
  onOpenSettings,
  onActivate5v5Sim
}) => {
  const [advice, setAdvice] = useState<TacticalAdvice | null>(null)
  const [question, setQuestion] = useState('')
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmReply, setLlmReply] = useState<string | null>(null)
  const [llmError, setLlmError] = useState(false)

  useEffect(() => {
    window.hexbuddy.getTacticalAdvice(selectedHeroId).then(setAdvice)
  }, [
    selectedHeroId,
    gameState.enemyHeroIds,
    gameState.allyHeroIds,
    gameState.pickedAugmentIds,
    gameState.currentItemIds
  ])

  const handleAskLlm = async (q?: string): Promise<void> => {
    const finalQ = q ?? question
    setLlmLoading(true)
    setLlmError(false)
    const res = await window.hexbuddy.askLlmAdvisor(selectedHeroId, finalQ)
    setLlmReply(res.content)
    setLlmError(!res.ok)
    setLlmLoading(false)
  }

  return (
    <div className="space-y-5 pb-8">
      {/* 5v5 Lineup Bar */}
      <section className="hex-panel rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F0E6D2]">
            <Swords className="w-4 h-4 text-[#C8AA6E]" />
            <span>实时 5v5 对阵感知（Live 2999 只读接口自动同步）</span>
          </div>

          {gameState.enemyHeroIds.length === 0 && (
            <button
              onClick={onActivate5v5Sim}
              className="px-3 py-1 rounded text-xs bg-[#C8AA6E]/20 hover:bg-[#C8AA6E]/30 text-[#E2C992] border border-[#C8AA6E]/40 cursor-pointer transition"
            >
              一键加载「多前排强回血」5v5 团战模拟场景体验
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 rounded bg-[#0B121F] border border-[#0AC8B9]/25 space-y-2">
            <div className="text-xs font-medium text-[#5CF2E5]">我方阵容</div>
            <div className="flex items-center gap-2 flex-wrap">
              {(gameState.allyHeroIds.length > 0 ? gameState.allyHeroIds : [selectedHeroId]).map(
                (hid, idx) => {
                  const h = heroes[hid]
                  if (!h) return null
                  return (
                    <div
                      key={`${hid}-${idx}`}
                      className="flex items-center gap-1.5 bg-[#131F33] px-2 py-1 rounded border border-white/10 text-xs"
                    >
                      <img src={h.avatarUrl} alt={h.name} className="w-6 h-6 rounded" />
                      <span>{h.name}</span>
                      <span className="text-[10px] text-[#94A3B8]">{h.damageType}</span>
                    </div>
                  )
                }
              )}
            </div>
          </div>

          <div className="p-3 rounded bg-[#0B121F] border border-rose-500/25 space-y-2">
            <div className="text-xs font-medium text-rose-300">敌方阵容</div>
            {gameState.enemyHeroIds.length === 0 ? (
              <div className="text-xs text-[#64748B] py-1">
                进入游戏加载界面后自动读取敌方 5 人英雄与出装威胁
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {gameState.enemyHeroIds.map((hid, idx) => {
                  const h = heroes[hid]
                  if (!h) return null
                  return (
                    <div
                      key={`${hid}-${idx}`}
                      className="flex items-center gap-1.5 bg-[#1B1424] px-2 py-1 rounded border border-rose-500/25 text-xs"
                    >
                      <img src={h.avatarUrl} alt={h.name} className="w-6 h-6 rounded" />
                      <span>{h.name}</span>
                      <span className="text-[10px] text-rose-300/80">{h.damageType}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Layer 1: Instant Zero-Config Local Tactical Engine */}
      {advice && (
        <section className="hex-panel rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs text-[#0AC8B9] font-semibold">
                <ShieldAlert className="w-4 h-4" />
                <span>本地战术规则引擎诊断（零延迟 · 免 API Key）</span>
              </div>
              <h3 className="text-base font-bold text-[#F0E6D2]">{advice.headline}</h3>
            </div>
          </div>

          {/* Threat Damage Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="md:col-span-2 p-3 rounded bg-[#111B2C] border border-[#C8AA6E]/15 space-y-1.5">
              <div className="flex justify-between text-[#C8C1B2] tabular-nums">
                <span>敌方物理威胁 {Math.round(advice.threatRadar.enemyAdRatio * 100)}%</span>
                <span>法术威胁 {Math.round(advice.threatRadar.enemyApRatio * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-indigo-500/40 overflow-hidden flex">
                <div
                  style={{ width: `${Math.round(advice.threatRadar.enemyAdRatio * 100)}%` }}
                  className="bg-amber-500 h-full"
                />
                <div
                  style={{ width: `${Math.round(advice.threatRadar.enemyApRatio * 100)}%` }}
                  className="bg-sky-400 h-full"
                />
              </div>
            </div>

            <div className="p-3 rounded bg-[#111B2C] border border-[#C8AA6E]/15 flex items-center justify-between tabular-nums">
              <span className="text-[#94A3B8]">敌方重装前排</span>
              <span className="text-sm font-bold text-[#F0E6D2]">
                {advice.threatRadar.enemyTankCount} 人
              </span>
            </div>

            <div className="p-3 rounded bg-[#111B2C] border border-[#C8AA6E]/15 flex items-center justify-between tabular-nums">
              <span className="text-[#94A3B8]">敌方强回血点</span>
              <span
                className={`text-sm font-bold ${
                  advice.threatRadar.enemyHealThreat >= 2 ? 'text-rose-400' : 'text-[#F0E6D2]'
                }`}
              >
                {advice.threatRadar.enemyHealThreat} 人
              </span>
            </div>
          </div>

          {/* Counter Items */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#E2C992] flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" />
              <span>针对性动态出装调整推荐</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {advice.counterItemIds.map(({ itemId, reason }) => {
                const im = items[itemId]
                if (!im) return null
                return (
                  <div
                    key={itemId}
                    className="p-3 rounded-lg bg-[#121D30] border border-[#C8AA6E]/30 flex items-start gap-3"
                  >
                    <img
                      src={im.iconUrl}
                      alt={im.name}
                      className="w-10 h-10 rounded border border-[#C8AA6E]/40 shrink-0"
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="text-xs font-semibold text-[#F0E6D2]">{im.name}</div>
                      <p className="text-[11px] text-[#C8C1B2] leading-snug">{reason}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Next augment & playstyle bullets */}
          <div className="p-3.5 rounded bg-[#0A101C] border border-[#C8AA6E]/20 space-y-2 text-xs">
            <div className="text-[#5CF2E5] font-medium">{advice.nextAugmentFocus}</div>
            <ul className="space-y-1 text-[#C8C1B2] list-disc list-inside">
              {advice.playstyleTips.map((tip, idx) => (
                <li key={idx}>{tip}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Layer 2: Custom LLM Deep Advisor */}
      <section className="hex-panel rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#C8AA6E]" />
            <h3 className="text-sm font-semibold text-[#F0E6D2]">
              大模型深度局内军师（结合国服 840 万场胜率上下文实时推理）
            </h3>
          </div>
          <button
            onClick={onOpenSettings}
            className="text-xs text-[#C8AA6E] hover:underline cursor-pointer"
          >
            {settings.apiKey ? `当前模型：${settings.model}` : '配置 API Key / 本地 Ollama'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => {
                setQuestion(q)
                handleAskLlm(q)
              }}
              disabled={llmLoading}
              className="px-3 py-1.5 rounded-full text-xs bg-[#131F32] hover:bg-[#1B2B44] text-[#C8C1B2] hover:text-[#F0E6D2] border border-[#C8AA6E]/25 flex items-center gap-1.5 cursor-pointer transition"
            >
              <Sparkles className="w-3 h-3 text-[#C8AA6E]" />
              <span>{q}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !llmLoading) handleAskLlm()
            }}
            placeholder="输入你的局内困惑，如：刷到了珠光护手和炼狱导管选哪个？对面有薇恩和蒙多..."
            className="flex-1 px-3.5 py-2 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-xs text-[#F0E6D2] placeholder-[#64748B] focus:outline-none focus:border-[#C8AA6E]"
          />
          <button
            onClick={() => handleAskLlm()}
            disabled={llmLoading}
            className="px-4 py-2 rounded bg-[#C8AA6E] hover:bg-[#E2C992] text-[#070B12] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
          >
            {llmLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>向军师提问</span>
          </button>
        </div>

        {llmReply && (
          <div
            className={`p-4 rounded-lg border text-xs leading-relaxed whitespace-pre-wrap ${
              llmError
                ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                : 'bg-[#090F1A] border-[#0AC8B9]/35 text-[#F0E6D2]'
            }`}
          >
            {llmReply}
          </div>
        )}
      </section>
    </div>
  )
}
