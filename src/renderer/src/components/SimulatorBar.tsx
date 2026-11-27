import React, { useState } from 'react'
import { BookMarked, Compass, Eye, FlaskConical, Settings } from 'lucide-react'
import type { GameLiveState } from '@shared/types'

interface SimulatorBarProps {
  gameState: GameLiveState
  mainView: 'heroes' | 'augments'
  onChangeMainView: (v: 'heroes' | 'augments') => void
  onSelectSimScene: (scene: 'off' | 'champ-select' | 'level-7-pick' | 'fountain-buy') => void
  onToggleHud: () => void
  onOpenSettings: () => void
}

export const SimulatorBar: React.FC<SimulatorBarProps> = ({
  gameState,
  mainView,
  onChangeMainView,
  onSelectSimScene,
  onToggleHud,
  onOpenSettings
}) => {
  const [showDemoMenu, setShowDemoMenu] = useState(false)
  const isMac = navigator.userAgent.includes('Mac')

  return (
    <header
      className={`app-drag h-12 px-4 flex items-center justify-between border-b border-[#C8AA6E]/20 bg-[#090E18] shrink-0 ${
        isMac ? 'pl-20' : ''
      }`}
    >
      {/* Left: Brand + Pure 2-Tab Reference Switcher */}
      <div className="flex items-center gap-3">
        <span className="font-runeterra text-base font-bold tracking-wide text-[#F0E6D2]">
          HexBuddy
        </span>

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

      {/* Right: Clean 3 Buttons Only */}
      <div className="app-no-drag flex items-center gap-2 relative">
        <div className="relative">
          <button
            onClick={() => setShowDemoMenu(!showDemoMenu)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border cursor-pointer transition ${
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-[#132338] hover:bg-[#1A2F4B] text-[#5CF2E5] border border-[#0AC8B9]/40 cursor-pointer transition"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>开关原位 HUD</span>
        </button>

        <button
          onClick={onOpenSettings}
          title="设置与数据口径"
          className="p-1.5 rounded bg-[#111B2C] hover:bg-[#17243A] text-[#C8C1B2] hover:text-[#F0E6D2] border border-[#C8AA6E]/25 cursor-pointer transition"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
