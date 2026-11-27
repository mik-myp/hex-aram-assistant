import React, { useRef } from 'react'
import { ImagePlus, Monitor, RotateCcw, Ruler, Trash2, Users } from 'lucide-react'
import { clamp, SIMULATOR_RESOLUTION_PRESETS } from '@shared/layoutGeometry'
import type { GameLiveState, HeroMeta } from '@shared/types'
import { TEN_BENCH_TEST_IDS } from '../hudConstants'
import type { CustomScreenshotState } from '../useHudSession'

export const HudSimulatorDock: React.FC<{
  gameState: GameLiveState
  heroes: Record<string, HeroMeta>
  isChampSelect: boolean
  hostSize: { w: number; h: number }
  simPresetId: string
  setSimPresetId: (id: string) => void
  showWireframe: boolean
  setShowWireframe: React.Dispatch<React.SetStateAction<boolean>>
  customScreenshot: CustomScreenshotState | null
  setCustomScreenshot: React.Dispatch<React.SetStateAction<CustomScreenshotState | null>>
  setOcrBusy: (v: boolean) => void
  offsetX: number
  offsetY: number
  enterInteractive: () => void
  leaveInteractive: () => void
}> = ({
  gameState,
  heroes,
  isChampSelect,
  hostSize,
  simPresetId,
  setSimPresetId,
  showWireframe,
  setShowWireframe,
  customScreenshot,
  setCustomScreenshot,
  setOcrBusy,
  offsetX,
  offsetY,
  enterInteractive,
  leaveInteractive
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleToggleFullBenchTest = (): void => {
    const isFull = gameState.benchHeroIds.length >= 8
    const targetIds = isFull
      ? TEN_BENCH_TEST_IDS.slice(0, 4).filter((id) => heroes[id])
      : TEN_BENCH_TEST_IDS.filter((id) => heroes[id])
    window.hexbuddy.updateAugments({ benchHeroIds: targetIds })
  }

  const handleNudgeOffset = (dx: number, dy: number, reset = false): void => {
    if (reset) {
      window.hexbuddy.savePrefs({ hudOffsetX: 0, hudOffsetY: 0 })
      return
    }
    const nx = Number(clamp(offsetX + dx, -8, 8).toFixed(1))
    const ny = Number(clamp(offsetY + dy, -8, 8).toFixed(1))
    window.hexbuddy.savePrefs({ hudOffsetX: nx, hudOffsetY: ny })
  }

  const handleUploadScreenshot = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const img = new Image()
      img.onload = async () => {
        const w = img.naturalWidth || 1920
        const h = img.naturalHeight || 1080
        setCustomScreenshot({
          url: dataUrl,
          width: w,
          height: h,
          name: file.name,
          ocrSummary: '正在执行窄带标题 OCR 识别...'
        })
        setOcrBusy(true)
        const ocrRes = await window.hexbuddy.recognizeImageOcr(dataUrl)
        setOcrBusy(false)
        setCustomScreenshot((prev) =>
          prev
            ? {
                ...prev,
                ocrSummary:
                  ocrRes.matchedAugmentIds.length > 0
                    ? `OCR 识别命中 ${ocrRes.matchedAugmentIds.length} 张海克斯 (${ocrRes.elapsedMs}ms)`
                    : '未检出三选一文字（可切至对应场景比对坐标框）'
              }
            : null
        )
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div
      onMouseEnter={enterInteractive}
      onMouseLeave={leaveInteractive}
      className="pointer-events-auto fixed bottom-2.5 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-2xl bg-[#09111F]/96 border border-[#C8AA6E]/50 shadow-2xl flex flex-col gap-1.5 max-w-[96vw]"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[#E2C992] font-bold">原位校准台：</span>
          {(
            [
              { key: 'champ-select', label: '① 选人替补席 (10槽)' },
              { key: 'level-7-pick', label: '② 局内三选一 + 刷新' },
              { key: 'fountain-buy', label: '③ 阵亡逛商店出装' }
            ] as const
          ).map((sc) => (
            <button
              key={sc.key}
              onClick={() => window.hexbuddy.setSimulator(sc.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] cursor-pointer transition ${
                gameState.simulatorScene === sc.key
                  ? 'bg-[#C8AA6E] text-[#070B12] font-bold'
                  : 'bg-white/8 text-[#C8C1B2] hover:text-white'
              }`}
            >
              {sc.label}
            </button>
          ))}

          {isChampSelect && (
            <button
              onClick={handleToggleFullBenchTest}
              className="px-2.5 py-1 rounded-full text-[11px] bg-[#0AC8B9]/20 hover:bg-[#0AC8B9]/30 text-[#5CF2E5] border border-[#0AC8B9]/45 flex items-center gap-1 cursor-pointer"
            >
              <Users className="w-3 h-3" />
              <span>{gameState.benchHeroIds.length >= 8 ? '切回 4 人常规替补' : '塞满 10 格替补测试'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowWireframe((v) => !v)}
            className={`px-2.5 py-1 rounded-full text-[11px] border flex items-center gap-1 cursor-pointer ${
              showWireframe
                ? 'bg-[#0AC8B9]/20 border-[#0AC8B9]/50 text-[#5CF2E5]'
                : 'bg-white/5 border-white/15 text-[#94A3B8]'
            }`}
          >
            <Ruler className="w-3 h-3" />
            <span>标准游戏坐标线: {showWireframe ? '开' : '关'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadScreenshot}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-full text-[11px] bg-[#16253B] hover:bg-[#1E324F] text-[#F0E6D2] border border-[#C8AA6E]/40 flex items-center gap-1 cursor-pointer"
          >
            <ImagePlus className="w-3 h-3 text-[#E2C992]" />
            <span>导入真实游戏截图叠底校验</span>
          </button>

          {customScreenshot && (
            <button
              onClick={() => setCustomScreenshot(null)}
              title={customScreenshot.ocrSummary || customScreenshot.name}
              className="px-2 py-1 rounded-full text-[11px] bg-amber-500/20 text-amber-200 border border-amber-400/40 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>清除截图 ({customScreenshot.width}×{customScreenshot.height})</span>
            </button>
          )}

          <button
            onClick={() => {
              leaveInteractive()
              window.hexbuddy.setSimulator('off')
              window.hexbuddy.toggleMiniOverlay(false)
            }}
            className="px-2.5 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-400/40 text-[11px] cursor-pointer"
          >
            退出演练
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-white/10">
        <div className="flex items-center gap-1 flex-wrap">
          <Monitor className="w-3.5 h-3.5 text-[#C8AA6E] mr-0.5" />
          <span className="text-[10px] text-[#94A3B8] mr-1">分辨率/比例测试:</span>
          <button
            onClick={() => {
              setCustomScreenshot(null)
              setSimPresetId('native')
            }}
            className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
              !customScreenshot && simPresetId === 'native'
                ? 'bg-[#0AC8B9] text-[#070B12] font-bold'
                : 'bg-white/8 text-[#94A3B8] hover:text-white'
            }`}
          >
            铺满当前屏 ({hostSize.w}×{hostSize.h})
          </button>
          {SIMULATOR_RESOLUTION_PRESETS.map((pr) => {
            const active = !customScreenshot && simPresetId === pr.id
            return (
              <button
                key={pr.id}
                onClick={() => {
                  setCustomScreenshot(null)
                  setSimPresetId(pr.id)
                }}
                title={pr.label}
                className={`px-2 py-0.5 rounded text-[10px] cursor-pointer transition ${
                  active
                    ? 'bg-[#0AC8B9] text-[#070B12] font-bold'
                    : 'bg-white/8 text-[#C8C1B2] hover:text-white'
                }`}
              >
                {pr.shortLabel}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1 text-[10px] text-[#94A3B8]">
          <span>
            微调({offsetX >= 0 ? `+${offsetX}` : offsetX}%, {offsetY >= 0 ? `+${offsetY}` : offsetY}%):
          </span>
          <button
            onClick={() => handleNudgeOffset(-0.5, 0)}
            className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[#F0E6D2] cursor-pointer"
          >
            ←
          </button>
          <button
            onClick={() => handleNudgeOffset(0.5, 0)}
            className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[#F0E6D2] cursor-pointer"
          >
            →
          </button>
          <button
            onClick={() => handleNudgeOffset(0, -0.5)}
            className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[#F0E6D2] cursor-pointer"
          >
            ↑
          </button>
          <button
            onClick={() => handleNudgeOffset(0, 0.5)}
            className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[#F0E6D2] cursor-pointer"
          >
            ↓
          </button>
          {(offsetX !== 0 || offsetY !== 0) && (
            <button
              onClick={() => handleNudgeOffset(0, 0, true)}
              title="重置偏移"
              className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 flex items-center gap-0.5 cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>归零</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
