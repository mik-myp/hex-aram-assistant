import React, { useState } from 'react'
import { Check, ExternalLink, KeyRound, Keyboard, Shield, X } from 'lucide-react'
import type { AiSettings, DatasetMetadata } from '@shared/types'

interface SettingsModalProps {
  settings: AiSettings
  meta: DatasetMetadata
  onClose: () => void
  onSave: (next: AiSettings) => Promise<void>
}

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

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  meta,
  onClose,
  onSave
}) => {
  const [form, setForm] = useState<AiSettings>({ ...settings })
  const [saved, setSaved] = useState(false)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    await onSave(form)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 500)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="hex-panel w-full max-w-xl rounded-lg overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-[#C8AA6E]/25 flex items-center justify-between bg-[#090F1A]">
          <h2 className="text-base font-semibold text-[#F0E6D2]">助手设置与大模型军师配置</h2>
          <button
            onClick={onClose}
            className="p-1 text-[#94A3B8] hover:text-[#F0E6D2] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 text-sm max-h-[80vh] overflow-y-auto">
          {/* Shortcuts */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-[#E2C992] font-medium">
              <Keyboard className="w-4 h-4" />
              <span>局内全局快捷键</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs text-[#94A3B8]">呼出/隐藏置顶迷你悬浮窗</span>
                <input
                  value={form.shortcutOverlay}
                  onChange={(e) => setForm({ ...form, shortcutOverlay: e.target.value })}
                  placeholder="例如 Alt+H"
                  className="w-full px-3 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2] text-xs focus:outline-none focus:border-[#C8AA6E]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[#94A3B8]">一键截屏 OCR 识别三选一</span>
                <input
                  value={form.shortcutOcr}
                  onChange={(e) => setForm({ ...form, shortcutOcr: e.target.value })}
                  placeholder="例如 Alt+S"
                  className="w-full px-3 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2] text-xs focus:outline-none focus:border-[#C8AA6E]"
                />
              </label>
            </div>
          </section>

          {/* LLM Config */}
          <section className="space-y-3 pt-2 border-t border-[#C8AA6E]/15">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#E2C992] font-medium">
                <KeyRound className="w-4 h-4" />
                <span>进阶大模型 API（OpenAI 兼容格式）</span>
              </div>
              <span className="text-[11px] text-[#0AC8B9]">不填也可正常使用本地阵容克制引擎</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PROVIDER_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.name}
                  onClick={() =>
                    setForm({
                      ...form,
                      providerName: p.name,
                      baseUrl: p.baseUrl,
                      model: p.model,
                      apiKey: p.name.includes('Ollama') && !form.apiKey ? 'ollama' : form.apiKey
                    })
                  }
                  className="px-2.5 py-1 rounded text-xs bg-[#141F30] hover:bg-[#1B2A42] border border-[#C8AA6E]/25 text-[#C8C1B2] hover:text-[#F0E6D2] cursor-pointer transition"
                >
                  填入 {p.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 col-span-2">
                <span className="text-xs text-[#94A3B8]">接口地址 (Base URL)</span>
                <input
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full px-3 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2] text-xs focus:outline-none focus:border-[#C8AA6E]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[#94A3B8]">模型名称 (Model)</span>
                <input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2] text-xs focus:outline-none focus:border-[#C8AA6E]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[#94A3B8]">API Key（仅保存在本机磁盘）</span>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2] text-xs focus:outline-none focus:border-[#C8AA6E]"
                />
              </label>
            </div>
          </section>

          {/* Data attribution */}
          <section className="p-3 rounded bg-[#090E17] border border-[#C8AA6E]/20 text-xs text-[#94A3B8] space-y-1.5">
            <div className="flex items-center gap-1.5 text-[#C8C1B2] font-medium">
              <Shield className="w-3.5 h-3.5 text-[#0AC8B9]" />
              <span>数据口径与开源合规声明</span>
            </div>
            <p>
              当前统计包：版本 <strong className="text-[#F0E6D2]">{meta.patch}</strong>（序号 #{meta.seq}，有效样本{' '}
              <strong className="text-[#F0E6D2] tabular-nums">
                {meta.matchesValid.toLocaleString()}
              </strong>{' '}
              场对局）。
            </p>
            <p className="flex items-center gap-2 flex-wrap">
              <span>
                统计数据源遵循 <strong>CC BY-NC 4.0（署名-非商业性使用）</strong> 协议：
              </span>
              <button
                type="button"
                onClick={() => window.hexbuddy.openExternal(meta.sourceRepo)}
                className="inline-flex items-center gap-1 text-[#C8AA6E] hover:underline cursor-pointer"
              >
                github.com/czgreat/aramhex-data
                <ExternalLink className="w-3 h-3" />
              </button>
            </p>
          </section>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded text-xs bg-[#141F30] text-[#C8C1B2] hover:text-[#F0E6D2] cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded text-xs font-semibold bg-[#C8AA6E] hover:bg-[#E2C992] text-[#070B12] flex items-center gap-1.5 cursor-pointer transition"
            >
              {saved ? <Check className="w-3.5 h-3.5" /> : null}
              <span>{saved ? '已保存' : '保存设置'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
