import React from 'react'
import {
  BookMarked,
  Compass,
  FlaskConical,
  Layers,
  RefreshCw,
  Settings,
  ShieldCheck
} from 'lucide-react'
import type { DatasetMetadata, GameLiveState } from '@shared/types'

interface SimulatorBarProps {
  meta: DatasetMetadata
  gameState: GameLiveState
  mainView: 'heroes' | 'augments'
  syncing: boolean
  onChangeMainView: (v: 'heroes' | 'augments') => void
  onSwitchDataset: (path: string, band: 'all' | 'high') => void
  onSyncNow: () => void
  onSelectSimScene: (scene: 'off' | 'champ-select' | 'level-7-pick' | 'teamfight-5v5') => void
  onOpenMini: () => void
  onOpenSettings: () => void
}

export const SimulatorBar: React.FC<SimulatorBarProps> = ({
  meta,
  gameState,
  mainView,
  syncing,
  onChangeMainView,
  onSwitchDataset,
  onSyncNow,
  onSelectSimScene,
  onOpenMini,
  onOpenSettings
}) => {
  const isMac = navigator.userAgent.includes('Mac')
  const statusLabel =
    gameState.connectionMode === 'live-in-game'
      ? `局内实时 · ${gameState.currentLevel}级${gameState.isDead ? ' (泉水选卡窗)' : ''}`
      : gameState.connectionMode === 'lcu-champ-select'
        ? '选人房间已连接 · 实时监测阵容'
        : gameState.connectionMode === 'simulator'
          ? '模拟演练已激活'
          : '等待游戏客户端'

  const statusDot =
    gameState.connectionMode === 'live-in-game' || gameState.connectionMode === 'lcu-champ-select'
      ? 'bg-[#0AC8B9] shadow-[0_0_8px_#0AC8B9]'
      : gameState.connectionMode === 'simulator'
        ? 'bg-[#C8AA6E] shadow-[0_0_8px_#C8AA6E]'
        : 'bg-slate-500'

  const currentDatasetPath =
    meta.availableDatasets?.find((d) => d.patch === meta.patch && d.mode === meta.mode)?.path ||
    `patches/${meta.patch}/${meta.mode}`

  return (
    <header
      className={`app-drag h-12 px-4 flex items-center justify-between border-b border-[#C8AA6E]/25 bg-[#090E18] shrink-0 gap-2 ${
        isMac ? 'pl-20' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-runeterra text-base font-bold tracking-wide text-[#F0E6D2]">
            HexBuddy
          </span>
        </div>

        {/* Top-level View Switcher: Hero Guides vs Augment Encyclopedia */}
        <div className="app-no-drag flex items-center bg-[#111B2C] border border-[#C8AA6E]/30 rounded p-0.5 text-xs shrink-0">
          <button
            onClick={() => onChangeMainView('heroes')}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer transition ${
              mainView === 'heroes'
                ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                : 'text-[#C8C1B2] hover:text-[#F0E6D2]'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>英雄攻略库</span>
          </button>
          <button
            onClick={() => onChangeMainView('augments')}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer transition ${
              mainView === 'augments'
                ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                : 'text-[#C8C1B2] hover:text-[#F0E6D2]'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            <span>海克斯百科反查</span>
          </button>
        </div>

        <div className="hidden 2xl:flex items-center gap-2 text-xs text-[#C8C1B2] truncate">
          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
          <span className="truncate">{statusLabel}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-[#0AC8B9] bg-[#0AC8B9]/10 px-1.5 py-0.5 rounded border border-[#0AC8B9]/25">
            <ShieldCheck className="w-3 h-3" />
            纯只读
          </span>
        </div>
      </div>

      {/* Right interactive controls */}
      <div className="app-no-drag flex items-center gap-2 shrink-0">
        {/* Dataset Mode & Skill Band Switcher */}
        {meta.availableDatasets && meta.availableDatasets.length > 0 && (
          <div className="flex items-center gap-1 bg-[#111B2C] border border-[#C8AA6E]/25 rounded px-1.5 py-0.5 text-xs">
            <select
              value={currentDatasetPath}
              onChange={(e) => onSwitchDataset(e.target.value, 'all')}
              disabled={syncing}
              title="切换统计版本或活动规则（如首次必棱彩）"
              className="bg-transparent text-[#E2C992] py-0.5 pr-1 focus:outline-none cursor-pointer"
            >
              {meta.availableDatasets.map((ds) => (
                <option key={ds.path} value={ds.path} className="bg-[#0C1320] text-[#F0E6D2]">
                  {ds.patch} · {ds.modeLabel}
                </option>
              ))}
            </select>

            {meta.bandsAvailable ? (
              <div className="flex items-center border-l border-[#C8AA6E]/20 pl-1 gap-0.5">
                {(['all', 'high'] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => onSwitchDataset(currentDatasetPath, b)}
                    className={`px-1.5 py-0.5 rounded text-[11px] cursor-pointer ${
                      meta.activeBand === b
                        ? 'bg-[#0AC8B9]/25 text-[#5CF2E5] font-semibold'
                        : 'text-[#94A3B8] hover:text-[#F0E6D2]'
                    }`}
                  >
                    {b === 'all' ? '全体' : '前5%'}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-[#64748B] border-l border-[#C8AA6E]/15 pl-1.5">
                全体样本
              </span>
            )}
          </div>
        )}

        {/* Simulator Bar */}
        <div className="flex items-center bg-[#111B2C] border border-[#C8AA6E]/25 rounded p-0.5 text-xs">
          <span className="px-1.5 py-1 text-[#94A3B8] flex items-center gap-1">
            <FlaskConical className="w-3.5 h-3.5 text-[#C8AA6E]" />
            <span className="hidden xl:inline">模拟:</span>
          </span>
          {(
            [
              { key: 'off', label: '真实' },
              { key: 'champ-select', label: '选人室' },
              { key: 'level-7-pick', label: '三选一' },
              { key: 'teamfight-5v5', label: '5v5克制' }
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
          title="呼出局内两态伸缩悬浮窗 (Alt+H)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-[#142238] hover:bg-[#1B2D48] text-[#F0E6D2] border border-[#0AC8B9]/35 cursor-pointer transition"
        >
          <Layers className="w-3.5 h-3.5 text-[#0AC8B9]" />
          <span>迷你悬浮窗</span>
        </button>

        <button
          onClick={onSyncNow}
          disabled={syncing}
          title="检查热更新"
          className="p-1.5 rounded bg-[#111B2C] hover:bg-[#17243A] text-[#C8C1B2] border border-[#C8AA6E]/25 cursor-pointer transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-[#C8AA6E] ${syncing ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={onOpenSettings}
          title="设置"
          className="p-1.5 rounded bg-[#111B2C] hover:bg-[#17243A] text-[#C8C1B2] hover:text-[#F0E6D2] border border-[#C8AA6E]/25 cursor-pointer transition"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
