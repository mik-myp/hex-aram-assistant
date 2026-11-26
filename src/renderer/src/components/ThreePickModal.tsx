import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  Crown,
  FlaskConical,
  ImagePlus,
  Loader2,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { matchesSearchQuery } from '@shared/pinyin'
import { RARITY_BADGE, RARITY_LABEL, VERDICT_STYLE } from './HeroGuide'
import { renderSimulatedThreeCardsDataUrl } from '../utils/mockOcrCanvas'
import type {
  AugmentMeta,
  AugmentRarity,
  HeroDetailGuide,
  OcrRecognizeResult
} from '@shared/types'

interface ThreePickModalProps {
  guide: HeroDetailGuide
  augments: Record<string, AugmentMeta>
  pickedAugmentIds: string[]
  candidateAugmentIds: string[]
  lastOcrResult: OcrRecognizeResult | null
  onSetCandidates: (ids: string[]) => void
  onSelectWinnerToPicked: (augId: string) => void
  onOcrResultReceived: (res: OcrRecognizeResult) => void
}

export const ThreePickModal: React.FC<ThreePickModalProps> = ({
  guide,
  augments,
  pickedAugmentIds,
  candidateAugmentIds,
  lastOcrResult,
  onSetCandidates,
  onSelectWinnerToPicked,
  onOcrResultReceived
}) => {
  const [query, setQuery] = useState('')
  const [rarityFilter, setRarityFilter] = useState<'all' | AugmentRarity>('all')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [simPreviewUrl, setSimPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const statByAugId = useMemo(() => {
    const map = new Map(guide.augments.map((s) => [s.augmentId, s]))
    return map
  }, [guide.augments])

  // Support Ctrl/Cmd+V image paste directly on this screen!
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent): Promise<void> => {
      const item = Array.from(e.clipboardData?.items || []).find((it) =>
        it.type.startsWith('image/')
      )
      if (!item) return
      const file = item.getAsFile()
      if (!file) return
      const reader = new FileReader()
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          setSimPreviewUrl(reader.result)
          setOcrBusy(true)
          const res = await window.hexbuddy.recognizeImageOcr(reader.result)
          onOcrResultReceived(res)
          setOcrBusy(false)
        }
      }
      reader.readAsDataURL(file)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [onOcrResultReceived])

  const quickSearchMatches = useMemo(() => {
    const all = Object.values(augments).filter((m) => {
      if (rarityFilter !== 'all' && m.rarity !== rarityFilter) return false
      return matchesSearchQuery(query, {
        name: m.name,
        pinyinFull: m.pinyinFull,
        pinyinInitials: m.pinyinInitials
      })
    })
    // Sort by hero winrate if available
    return all
      .sort((a, b) => {
        const sa = statByAugId.get(a.id)?.smoothedWinRate ?? 0.45
        const sb = statByAugId.get(b.id)?.smoothedWinRate ?? 0.45
        return sb - sa
      })
      .slice(0, 14)
  }, [augments, rarityFilter, query, statByAugId])

  const handleScreenOcr = async (): Promise<void> => {
    setOcrBusy(true)
    const res = await window.hexbuddy.captureScreenOcr()
    onOcrResultReceived(res)
    setOcrBusy(false)
  }

  const handleSimulatedCardOcr = async (): Promise<void> => {
    // Pick 3 realistic augments of the same rarity tier for this hero to simulate an authentic in-game roll
    const pool = guide.augments
      .map((s) => augments[s.augmentId])
      .filter((m): m is AugmentMeta => Boolean(m && m.rarity === 'prismatic'))
    const sample: AugmentMeta[] = []
    const step = Math.max(1, Math.floor(pool.length / 4))
    for (let i = 0; i < pool.length && sample.length < 3; i += step) {
      const idx = (i + Math.floor(Math.random() * step)) % pool.length
      if (!sample.some((x) => x.id === pool[idx].id)) {
        sample.push(pool[idx])
      }
    }
    const dataUrl = renderSimulatedThreeCardsDataUrl(sample)
    setSimPreviewUrl(dataUrl)
    setOcrBusy(true)
    const res = await window.hexbuddy.recognizeImageOcr(dataUrl)
    onOcrResultReceived(res)
    setOcrBusy(false)
  }

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        setSimPreviewUrl(reader.result)
        setOcrBusy(true)
        const res = await window.hexbuddy.recognizeImageOcr(reader.result)
        onOcrResultReceived(res)
        setOcrBusy(false)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const pickedTags = useMemo(() => {
    return new Set(
      pickedAugmentIds.flatMap((id) => augments[id]?.tags || []).filter((t) => t !== 'general')
    )
  }, [pickedAugmentIds, augments])

  // Score the 3 candidates
  const evaluatedCandidates = useMemo(() => {
    const list = candidateAugmentIds
      .map((id) => {
        const meta = augments[id]
        if (!meta) return null
        const stat = statByAugId.get(id)
        const sharedTags = meta.tags.filter((t) => pickedTags.has(t))
        const synergyBonus = sharedTags.length > 0 ? 0.012 : 0
        const score = (stat?.smoothedWinRate ?? guide.hero.smoothedWinRate - 0.01) + synergyBonus
        return {
          meta,
          stat,
          sharedTags,
          score
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    const bestId =
      list.length > 0 ? [...list].sort((a, b) => b.score - a.score)[0].meta.id : null
    return { list, bestId }
  }, [candidateAugmentIds, augments, statByAugId, pickedTags, guide.hero.smoothedWinRate])

  const addCandidate = (id: string): void => {
    if (candidateAugmentIds.includes(id)) return
    const next =
      candidateAugmentIds.length >= 3
        ? [...candidateAugmentIds.slice(1), id]
        : [...candidateAugmentIds, id]
    onSetCandidates(next)
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Top Action Bar: OCR + Upload + Clear */}
      <div className="hex-panel rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#F0E6D2]">
              局内「三选一」极速对比台（支持本地中文 OCR 识屏 + 拼音首字母双通道）
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              局内弹出海克斯时按快捷键直接截屏识别，或直接输入首字母（如{' '}
              <code className="text-[#E2C992]">zghs</code> 珠光护手）2 秒加满 3 个槽位对比。也支持直接{' '}
              <code className="text-[#E2C992]">Cmd/Ctrl + V</code> 粘贴截图！
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleScreenOcr}
              disabled={ocrBusy}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-[#0AC8B9] hover:bg-[#22E1D2] text-[#070B12] flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              {ocrBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              <span>截屏 OCR 自动识别 (Alt+S)</span>
            </button>

            <button
              onClick={handleSimulatedCardOcr}
              disabled={ocrBusy}
              className="px-3 py-1.5 rounded text-xs bg-[#162338] hover:bg-[#1E2F4A] text-[#E2C992] border border-[#C8AA6E]/35 flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>生成模拟卡面跑真实 OCR 测试</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={ocrBusy}
              className="px-3 py-1.5 rounded text-xs bg-[#111B2C] hover:bg-[#18263D] text-[#C8C1B2] border border-[#C8AA6E]/25 flex items-center gap-1.5 cursor-pointer transition"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>上传截图识别</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadImage}
              className="hidden"
            />

            {candidateAugmentIds.length > 0 && (
              <button
                onClick={() => {
                  onSetCandidates([])
                  setSimPreviewUrl(null)
                }}
                className="px-2.5 py-1.5 rounded text-xs bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空槽位</span>
              </button>
            )}
          </div>
        </div>

        {/* OCR Status Feedback & Simulated Screen Thumbnail */}
        {(lastOcrResult || simPreviewUrl) && (
          <div className="p-2.5 rounded bg-[#080D16] border border-[#C8AA6E]/20 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              {lastOcrResult && (
                <div
                  className={
                    lastOcrResult.success ? 'text-[#0AC8B9] font-medium' : 'text-amber-300'
                  }
                >
                  {lastOcrResult.success
                    ? `OCR 识别成功（耗时 ${lastOcrResult.elapsedMs}ms · 词库匹配度 ${(lastOcrResult.confidence * 100).toFixed(0)}%）：已自动填入 ${lastOcrResult.matchedAugmentIds.map((id) => augments[id]?.name).join(' / ')}`
                    : `OCR 提示：${lastOcrResult.error}`}
                </div>
              )}
              {lastOcrResult?.rawTexts && lastOcrResult.rawTexts.length > 0 && (
                <div className="text-[11px] text-[#64748B]">
                  原始文本帧：{lastOcrResult.rawTexts.join(' | ')}
                </div>
              )}
            </div>
            {simPreviewUrl && (
              <img
                src={simPreviewUrl}
                alt="OCR 画面预览"
                className="h-14 rounded border border-[#C8AA6E]/30 object-contain"
              />
            )}
          </div>
        )}

        {/* Quick Pinyin & Rarity Picker */}
        <div className="pt-2 border-t border-[#C8AA6E]/15 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-60">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="手动秒选兜底：输入拼音首字母（如 zghs / glyjr / lrwz）或关键字点选加入..."
                className="w-full pl-8 pr-3 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-xs text-[#F0E6D2] placeholder-[#64748B] focus:outline-none focus:border-[#C8AA6E]"
              />
            </div>

            <div className="flex items-center gap-1">
              {(
                [
                  { key: 'all', label: '全部' },
                  { key: 'prismatic', label: '棱彩' },
                  { key: 'gold', label: '黄金' },
                  { key: 'silver', label: '白银' }
                ] as const
              ).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRarityFilter(r.key)}
                  className={`px-2.5 py-1.5 rounded text-xs cursor-pointer ${
                    rarityFilter === r.key
                      ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                      : 'bg-[#141F30] text-[#C8C1B2]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {quickSearchMatches.map((m) => {
              const selected = candidateAugmentIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => addCandidate(m.id)}
                  className={`px-2 py-1 rounded text-xs border flex items-center gap-1.5 cursor-pointer transition ${
                    selected
                      ? 'bg-[#C8AA6E]/30 border-[#C8AA6E] text-[#F0E6D2]'
                      : `${RARITY_BADGE[m.rarity]} hover:brightness-110`
                  }`}
                >
                  {m.iconUrl && <img src={m.iconUrl} alt="" className="w-3.5 h-3.5 rounded-sm" />}
                  <span>{m.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 3-Card Showdown Stage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((slotIdx) => {
          const item = evaluatedCandidates.list[slotIdx]
          if (!item) {
            return (
              <div
                key={`empty-${slotIdx}`}
                className="h-72 rounded-lg border border-dashed border-[#C8AA6E]/25 bg-[#0B111D]/60 flex flex-col items-center justify-center text-center p-6 space-y-2"
              >
                <div className="w-10 h-10 rounded-full bg-[#141F30] border border-[#C8AA6E]/25 flex items-center justify-center text-sm font-semibold text-[#C8AA6E]">
                  {slotIdx + 1}
                </div>
                <div className="text-xs font-medium text-[#C8C1B2]">待选海克斯槽位 #{slotIdx + 1}</div>
                <p className="text-[11px] text-[#64748B]">
                  按 Alt+S 截屏自动识别，或在上方点击海克斯标签填入
                </p>
              </div>
            )
          }

          const { meta, stat, sharedTags } = item
          const isBest = evaluatedCandidates.bestId === meta.id && evaluatedCandidates.list.length >= 2
          const frameClass =
            meta.rarity === 'prismatic'
              ? 'rarity-frame-prismatic'
              : meta.rarity === 'gold'
                ? 'rarity-frame-gold'
                : 'rarity-frame-silver'

          return (
            <div
              key={meta.id}
              className={`${frameClass} relative rounded-xl p-5 flex flex-col justify-between space-y-4 transition ${
                isBest ? 'ring-2 ring-[#0AC8B9] shadow-[0_0_28px_rgba(10,200,185,0.2)]' : ''
              }`}
            >
              <button
                onClick={() =>
                  onSetCandidates(candidateAugmentIds.filter((cid) => cid !== meta.id))
                }
                title="移除此卡"
                className="absolute top-3 right-3 p-1 rounded bg-black/40 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="space-y-3">
                {isBest && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0AC8B9] text-[#070B12] text-xs font-bold">
                    <Crown className="w-3.5 h-3.5" />
                    <span>首选推荐 · 最优胜率解</span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {meta.iconUrl && (
                    <img
                      src={meta.iconUrl}
                      alt={meta.name}
                      className="w-14 h-14 rounded-lg bg-black/50 p-1 border border-white/20 shrink-0"
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-[#F0E6D2]">{meta.name}</h4>
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded border ${RARITY_BADGE[meta.rarity]}`}
                      >
                        {RARITY_LABEL[meta.rarity]}
                      </span>
                    </div>
                    {stat ? (
                      <span
                        className={`inline-block mt-1 text-xs px-2 py-0.5 rounded border font-semibold ${
                          VERDICT_STYLE[stat.verdict]
                        }`}
                      >
                        {stat.verdictLabel}
                      </span>
                    ) : (
                      <span className="inline-block mt-1 text-xs text-[#94A3B8]">
                        该英雄触发此卡样本较少
                      </span>
                    )}
                  </div>
                </div>

                {/* Big Scannable Numbers */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-black/35 border border-white/10 tabular-nums">
                  <div>
                    <div className="text-[11px] text-[#94A3B8]">英雄专属胜率</div>
                    <div className="text-lg font-bold text-[#F0E6D2]">
                      {stat ? `${(stat.smoothedWinRate * 100).toFixed(1)}%` : '参考通用'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#94A3B8]">相比英雄均值</div>
                    <div
                      className={`text-lg font-bold ${
                        (stat?.deltaWinRate ?? 0) >= 0.015
                          ? 'text-[#0AC8B9]'
                          : (stat?.deltaWinRate ?? 0) <= -0.02
                            ? 'text-rose-400'
                            : 'text-[#E2C992]'
                      }`}
                    >
                      {stat
                        ? `${stat.deltaWinRate >= 0 ? '+' : ''}${(stat.deltaWinRate * 100).toFixed(1)}%`
                        : '--'}
                    </div>
                  </div>
                </div>

                {sharedTags.length > 0 && (
                  <div className="px-2.5 py-1.5 rounded bg-[#0AC8B9]/15 border border-[#0AC8B9]/35 text-xs text-[#5CF2E5]">
                    协同加成：与你本局已选海克斯构成同体系词条联动！
                  </div>
                )}

                <p className="text-xs text-[#C8C1B2] leading-relaxed">{meta.desc}</p>
              </div>

              <button
                onClick={() => onSelectWinnerToPicked(meta.id)}
                className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                  isBest
                    ? 'bg-[#C8AA6E] hover:bg-[#E2C992] text-[#070B12]'
                    : 'bg-white/10 hover:bg-white/20 text-[#F0E6D2]'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>选定此海克斯（记入本局已拿槽）</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
