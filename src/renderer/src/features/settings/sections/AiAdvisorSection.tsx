import React, { useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2, Sparkles } from 'lucide-react'
import type { AiSettings, AiToneStyle } from '@shared/types'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const PROVIDER_PRESETS = [
  {
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  },
  {
    name: '硅基流动 (含免费模型)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct'
  },
  {
    name: '阿里通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus'
  },
  {
    name: '本地 Ollama (免Key)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b'
  }
]

interface AiAdvisorSectionProps {
  settings: AiSettings
  onPatchSettings: (patch: Partial<AiSettings>) => Promise<void>
}

export const AiAdvisorSection: React.FC<AiAdvisorSectionProps> = ({
  settings,
  onPatchSettings
}) => {
  const [draft, setDraft] = useState<AiSettings>({ ...settings })
  const [showApiKey, setShowApiKey] = useState(false)
  const [testingAi, setTestingAi] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    setDraft({ ...settings })
  }, [settings])

  return (
    <>
      <div>
        <h1 className="text-base font-bold text-foreground">可选 AI 战局一句话锦囊</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          本地离线胜率引擎无需任何 Key 即可完整工作；接入兼容 OpenAI 协议的模型后可在泉水一键生成实时针对建议。
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>AI 锦囊开关与解说语言风格</CardTitle>
            <CardDescription>
              不想使用外部大模型时可直接关闭总开关，无需删除已保存的 API Key。
            </CardDescription>
          </div>
          <CardAction>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(checked) => onPatchSettings({ enabled: checked })}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs font-medium text-foreground">局内锦囊解说语气</span>
            <ToggleGroup
              value={[draft.toneStyle || 'concise']}
              onValueChange={(vals) => {
                const next = vals[0] as AiToneStyle | undefined
                if (next) onPatchSettings({ toneStyle: next })
              }}
            >
              <ToggleGroupItem value="concise">⚡ 实用干货一针见血</ToggleGroupItem>
              <ToggleGroupItem value="witty">🌶️ 毒舌整活老哥风</ToggleGroupItem>
              <ToggleGroupItem value="beginner">🛡️ 新手保姆大白话</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardContent>
      </Card>

      <Card className={!draft.enabled ? 'opacity-60' : ''}>
        <CardHeader>
          <div>
            <CardTitle>模型服务商预设与接口连通测试</CardTitle>
            <CardDescription>
              支持 DeepSeek、硅基流动（含免费 Qwen 模型）、通义千问及本地免 Key 的 Ollama。
            </CardDescription>
          </div>
          <CardAction>
            <Button
              variant="cyan"
              size="sm"
              disabled={testingAi}
              onClick={async () => {
                setTestingAi(true)
                setTestResult(null)
                await onPatchSettings(draft)
                const res = await window.hexbuddy.testAiConnection(draft)
                setTestResult({ ok: res.ok, message: res.message })
                setTestingAi(false)
              }}
            >
              {testingAi ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              {testingAi ? '测速中...' : '测试连接'}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">一键套用预设：</span>
            {PROVIDER_PRESETS.map((p) => (
              <Button
                key={p.name}
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => {
                  setTestResult(null)
                  onPatchSettings({
                    providerName: p.name,
                    baseUrl: p.baseUrl,
                    model: p.model,
                    apiKey: p.name.includes('Ollama') && !draft.apiKey ? 'ollama' : draft.apiKey
                  })
                }}
              >
                {p.name}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">接口地址 (Base URL)</label>
              <Input
                value={draft.baseUrl}
                placeholder="https://api.deepseek.com/v1"
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                onBlur={() => onPatchSettings({ baseUrl: draft.baseUrl })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">模型名称 (Model)</label>
              <Input
                value={draft.model}
                placeholder="deepseek-chat"
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                onBlur={() => onPatchSettings({ model: draft.model })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                API Key（本地保存在本机，失焦自动落盘）
              </label>
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="text-2xs text-primary hover:underline cursor-pointer"
              >
                {showApiKey ? '隐藏密钥' : '显示密钥'}
              </button>
            </div>
            <Input
              type={showApiKey ? 'text' : 'password'}
              value={draft.apiKey}
              placeholder="sk-...（本地 Ollama 填 ollama 即可）"
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              onBlur={() => onPatchSettings({ apiKey: draft.apiKey })}
            />
          </div>

          {testResult && (
            <Alert variant={testResult.ok ? 'cyan' : 'destructive'}>
              {testResult.ok ? (
                <Check className="text-accent mt-0.5" />
              ) : (
                <AlertTriangle className="text-rose-400 mt-0.5" />
              )}
              <AlertTitle>{testResult.message}</AlertTitle>
            </Alert>
          )}
        </CardContent>
      </Card>
    </>
  )
}
