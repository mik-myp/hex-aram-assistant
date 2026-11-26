import React from 'react'
import { Eye, FlaskConical, Layers, Radio, RefreshCw, Settings, ShieldCheck } from 'lucide-react'
import type { DatasetMetadata, GameLiveState } from '@shared/types'

interface SimulatorBarProps {
  meta: DatasetMetadata
  gameState: GameLiveState
  syncing: boolean
  onSyncNow: () => void
  onSelectSimScene: (scene: 'off' | 'champ-select' | 'level-7-pick' | 'teamfight-5v5') => void
  onOpenMini: () => void
  onOpenSettings: () => void
}

export const SimulatorBar: React.FC<SimulatorBarProps> = ({
  meta,
  gameState,
  syncing,
  onSyncNow,
  onSelectSimScene,
  onOpenMini,
  onOpenSettings
}) => {
  const isMac = navigator.userAgent.includes('Mac')
  const statusLabel =
    gameState.connectionMode === 'live-in-game'
      ? `局内实时连接 · ${gameState.currentLevel} 级`
      : gameState.connectionMode === 'lcu-champ-select'
        ? '选人房间已连接 · 实时监测替补席'
        : gameState.connectionMode === 'simulator'
          ? '模拟演练信号已激活'
          : '等待英雄联盟客户端（只读安全守护）'

  const statusDot =
    gameState.connectionMode === 'live-in-game' || gameState.connectionMode === 'lcu-champ-select'
      ? 'bg-[#0AC8B9] shadow-[0_0_8px_#0AC8B9]'
      : gameState.connectionMode === 'simulator'
        ? 'bg-[#C8AA6E] shadow-[0_0_8px_#C8AA6E]'
        : 'bg-slate-500'

  return (
    <header
      className={`app-drag h-12 px-4 flex items-center justify-between border-b border-[#C8AA6E]/25 bg-[#090E18] shrink-0 ${
        isMac ? 'pl-20' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-runeterra text-base font-bold tracking-wide text-[#F0E6D2]">
            HexBuddy
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[#C8AA6E]/15 text-[#E2C992] border border-[#C8AA6E]/30">
            海斗军师
          </span>
        </div>

        <div className="h-4 w-px bg-[#C8AA6E]/20" />

        <div className="flex items-center gap-2 text-xs text-[#C8C1B2]">
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="truncate">{statusLabel}</span>
          <span className="hidden xl:inline-flex items-center gap-1 text-[11px] text-[#0AC8B9] bg-[#0AC8B9]/10 px-1.5 py-0.5 rounded border border-[#0AC8B9]/25">
            <ShieldCheck className="w-3 h-3" />
            100% 纯只读零风险
          </span>
        </div>
      </div>

      {/* Interactive controls */}
      <div className="app-no-drag flex items-center gap-2">
        <div className="flex items-center bg-[#111B2C] border border-[#C8AA6E]/25 rounded p-0.5 text-xs">
          <span className="px-2 py-1 text-[#94A3B8] flex items-center gap-1">
            <FlaskConical className="w-3.5 h-3.5 text-[#C8AA6E]" />
            <span className="hidden lg:inline">对局模拟:</span>
          </span>
          {(
            [
              { key: 'off', label: '真实监听' },
              { key: 'champ-select', label: '选人替补席' },
              { key: 'level-7-pick', label: '7级三选一' },
              { key: 'teamfight-5v5', label: '5v5团战克制' }
            ] as const
          ).map((item) => {
            const active =
              item.key === 'off'
                ? gameState.connectionMode !== 'simulator'
                : gameState.connectionMode === 'simulator' && gameState.simulatorScene === item.key
            return (
              <button
                key={item.key}
                onClick={() => onSelectSimScene(item.key)}
                className={`px-2 py-1 rounded transition cursor-pointer ${
                  active
                    ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                    : 'text-[#C8C1B2] hover:text-[#F0E6D2] hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        <button
          onClick={onOpenMini}
          title="呼出局内置顶迷你悬浮窗 (Alt+H)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-[#142238] hover:bg-[#1B2D48] text-[#F0E6D2] border border-[#0AC8B9]/35 cursor-pointer transition"
        >
          <Layers className="w-3.5 h-3.5 text-[#0AC8B9]" />
          <span>迷你悬浮窗</span>
        </button>

        <button
          onClick={onSyncNow}
          disabled={syncing}
          title={`当前版本 ${meta.patch}（${(meta.matchesValid / 10000).toFixed(0)}万场国服对局）· 点击检查热更新`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-[#111B2C] hover:bg-[#17243A] text-[#C8C1B2] border border-[#C8AA6E]/25 cursor-pointer transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#C8AA6E] ${syncing ? 'animate-spin' : ''}`} />
          <span className="tabular-nums">{meta.patch} 数据</span>
        </button>

        <button
          onClick={onOpenSettings}
          title="AI 军师接口与快捷键设置"
          className="p-1.5 rounded bg-[#111B2C] hover:bg-[#17243A] text-[#C8C1B2] hover:text-[#F0E6D2] border border-[#C8AA6E]/25 cursor-pointer transition"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
