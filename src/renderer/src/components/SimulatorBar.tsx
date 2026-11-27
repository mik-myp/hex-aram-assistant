import React, { useEffect, useState } from 'react'
import {
  ArrowUpCircle,
  BookMarked,
  Compass,
  Copy,
  Eye,
  FlaskConical,
  Minus,
  Settings,
  Square,
  X
} from 'lucide-react'
import type { AppUpdateState, GameLiveState } from '@shared/types'

interface SimulatorBarProps {
  gameState: GameLiveState
  updateState: AppUpdateState | null
  mainView: 'heroes' | 'augments'
  onChangeMainView: (v: 'heroes' | 'augments') => void
  onSelectSimScene: (scene: 'off' | 'champ-select' | 'level-7-pick' | 'fountain-buy') => void
  onToggleHud: () => void
  onOpenSettings: () => void
}

export const SimulatorBar: React.FC<SimulatorBarProps> = ({
  gameState,
  updateState,
  mainView,
  onChangeMainView,
  onSelectSimScene,
  onToggleHud,
  onOpenSettings
}) => {
  const [showDemoMenu, setShowDemoMenu] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const isMac = navigator.userAgent.includes('Mac')

  useEffect(() => {
    return window.hexbuddy.onWindowMaximizedChanged(setIsMaximized)
  }, [])

  return (
    <header
      onDoubleClick={() => {
        if (!isMac) window.hexbuddy.toggleMaximizeMain()
      }}
      className={`app-drag h-11 flex items-center justify-between border-b border-[#C8AA6E]/20 bg-[#090E18] shrink-0 ${
        isMac ? 'pl-20 pr-3' : 'pl-3.5 pr-0'
      }`}
    >
      {/* Left: Pure 2-Tab Reference Switcher (No redundant ugly title bar!) */}
      <div className="flex items-center gap-2.5">
        <div className="w-2 h-2 rounded-full bg-[#0AC8B9] shadow-[0_0_8px_#0AC8B9]" />

        <div className="app-no-drag flex items-center bg-[#111B2C] border border-[#C8AA6E]/25 rounded p-0.5 text-xs">
          <button
            onClick={() => onChangeMainView('heroes')}
            className={`px-3 py-1 rounded flex items-center gap-1.5 cursor-pointer transition ${
              mainView === 'heroes'
                ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                : 'text-[#C8C1B2] hover:text-[#F0E6D2]'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>英雄攻略图鉴</span>
          </button>
          <button
            onClick={() => onChangeMainView('augments')}
            className={`px-3 py-1 rounded flex items-center gap-1.5 cursor-pointer transition ${
              mainView === 'augments'
                ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                : 'text-[#C8C1B2] hover:text-[#F0E6D2]'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            <span>海克斯百科反查</span>
          </button>
        </div>
      </div>

      {/* Right: Action Buttons + Custom Frameless Window Controls on Windows/Linux */}
      <div className="app-no-drag flex items-center h-full">
        <div className="flex items-center gap-2 pr-3">
          {updateState?.hasUpdate && (
            <button
              onClick={onOpenSettings}
              title="发现新版本，点击查看并一键在线升级"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0AC8B9]/20 hover:bg-[#0AC8B9]/30 text-[#5CF2E5] border border-[#0AC8B9]/55 shadow-[0_0_12px_rgba(10,200,185,0.2)] cursor-pointer transition"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>
                {updateState.phase === 'downloading'
                  ? `下载更新 ${updateState.downloadPercent}%`
                  : updateState.phase === 'downloaded'
                    ? `v${updateState.latestVersion} 已就绪·点击安装`
                    : `新版本 v${updateState.latestVersion}`}
              </span>
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowDemoMenu(!showDemoMenu)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border cursor-pointer transition ${
                gameState.connectionMode === 'simulator'
                  ? 'bg-[#C8AA6E]/25 text-[#E2C992] border-[#C8AA6E]'
                  : 'bg-[#111B2C] hover:bg-[#17243A] text-[#C8C1B2] border-[#C8AA6E]/25'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5 text-[#C8AA6E]" />
              <span>原位 HUD 演练</span>
            </button>

            {showDemoMenu && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-lg bg-[#0D1524] border border-[#C8AA6E]/40 shadow-2xl py-1 z-50 text-xs">
                {(
                  [
                    { key: 'champ-select', label: '预览：选人替补席头像贴标' },
                    { key: 'level-7-pick', label: '预览：局内三选一卡片贴标' },
                    { key: 'fountain-buy', label: '预览：阵亡泉水五档动态出装' },
                    { key: 'off', label: '关闭演练（恢复真实监听）' }
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      onSelectSimScene(item.key)
                      setShowDemoMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 text-[#C8C1B2] hover:bg-[#17263E] hover:text-[#F0E6D2] cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onToggleHud}
            title="显示/隐藏全屏透明穿透原位 HUD (Alt+H)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-[#132338] hover:bg-[#1A2F4B] text-[#5CF2E5] border border-[#0AC8B9]/40 cursor-pointer transition"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>开关原位 HUD</span>
          </button>

          <button
            onClick={onOpenSettings}
            title="设置与数据口径"
            className="p-1.5 rounded bg-[#111B2C] hover:bg-[#17243A] text-[#C8C1B2] hover:text-[#F0E6D2] border border-[#C8AA6E]/25 cursor-pointer transition"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Custom Dark-Gold Frameless Window Controls (Windows / Linux) */}
        {!isMac && (
          <div className="flex items-center h-full border-l border-[#C8AA6E]/15">
            <button
              onClick={() => window.hexbuddy.minimizeMain()}
              title="最小化"
              className="h-full w-11 flex items-center justify-center text-[#94A3B8] hover:bg-white/8 hover:text-[#F0E6D2] transition cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.hexbuddy.toggleMaximizeMain()}
              title={isMaximized ? '向下还原' : '最大化'}
              className="h-full w-11 flex items-center justify-center text-[#94A3B8] hover:bg-white/8 hover:text-[#F0E6D2] transition cursor-pointer"
            >
              {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            </button>
            <button
              onClick={() => window.hexbuddy.closeMain()}
              title="关闭（默认最小化至系统托盘）"
              className="h-full w-11 flex items-center justify-center text-[#94A3B8] hover:bg-[#E11D48] hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
