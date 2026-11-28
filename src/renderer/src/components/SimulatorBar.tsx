import React, { useEffect, useState } from 'react'
import {
  ArrowUpCircle,
  BookMarked,
  Compass,
  Copy,
  Eye,
  FlaskConical,
  History,
  Minus,
  Search,
  Settings,
  Square,
  X
} from 'lucide-react'
import type { AppUpdateState, GameLiveState, MainViewTab } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface SimulatorBarProps {
  gameState: GameLiveState
  updateState: AppUpdateState | null
  mainView: MainViewTab
  onChangeMainView: (v: MainViewTab) => void
  onOpenCommandPalette: () => void
  onSelectSimScene: (scene: 'off' | 'champ-select' | 'level-7-pick' | 'fountain-buy') => void
  onToggleHud: () => void
  onJumpToUpdateSection: () => void
}

export const SimulatorBar: React.FC<SimulatorBarProps> = ({
  gameState,
  updateState,
  mainView,
  onChangeMainView,
  onOpenCommandPalette,
  onSelectSimScene,
  onToggleHud,
  onJumpToUpdateSection
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
      className={`app-drag h-12 flex items-center justify-between border-b border-border bg-[#090e18] shrink-0 ${
        isMac ? 'pl-20 pr-3' : 'pl-3.5 pr-0'
      }`}
    >
      {/* Left: Base UI 3-Tab Workspace Switcher + Global Ctrl+K Trigger */}
      <div className="flex items-center gap-2.5">
        <div
          title={
            gameState.connectionMode === 'disconnected'
              ? '待命监听中（零后台轮询损耗）'
              : `已连接：${gameState.connectionMode}`
          }
          className={`size-2 rounded-full ${
            gameState.connectionMode === 'disconnected'
              ? 'bg-primary/70'
              : 'bg-accent shadow-[0_0_8px_#0ac8b9]'
          }`}
        />

        <div className="app-no-drag">
          <Tabs
            value={mainView}
            onValueChange={(val) => onChangeMainView(val as MainViewTab)}
          >
            <TabsList>
              <TabsTrigger value="heroes">
                <Compass />
                <span>英雄攻略图鉴</span>
              </TabsTrigger>
              <TabsTrigger value="augments">
                <BookMarked />
                <span>海克斯百科反查</span>
              </TabsTrigger>
              <TabsTrigger value="history">
                <History />
                <span>个人战绩本</span>
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings />
                <span>助手设置</span>
                {updateState?.hasUpdate && (
                  <span className="size-1.5 rounded-full bg-accent shadow-[0_0_6px_#0ac8b9]" />
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          title="全局速查英雄 / 海克斯 / 装备 / 设置项 (Ctrl+K)"
          className="app-no-drag hidden lg:flex items-center justify-between gap-3 h-7 px-2.5 rounded-md bg-[#111b2c] hover:bg-[#162338] border border-border text-xs text-muted-foreground hover:text-foreground transition cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5">
            <Search className="size-3 text-primary" />
            <span>全局速查...</span>
          </span>
          <kbd className="px-1.5 py-0.2 rounded bg-black/35 border border-white/10 text-[10px] font-mono text-[#c8c1b2]">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>
      </div>

      {/* Right: Action Buttons + Custom Frameless Window Controls on Windows/Linux */}
      <div className="app-no-drag flex items-center h-full">
        <div className="flex items-center gap-2 pr-3">
          {updateState?.hasUpdate && (
            <Button
              variant="cyan"
              size="sm"
              className="rounded-full"
              onClick={onJumpToUpdateSection}
            >
              <ArrowUpCircle data-icon="inline-start" />
              <span>
                {updateState.phase === 'downloading'
                  ? `下载更新 ${updateState.downloadPercent}%`
                  : updateState.phase === 'downloaded'
                    ? `v${updateState.latestVersion} 已就绪·点击安装`
                    : `新版本 v${updateState.latestVersion}`}
              </span>
            </Button>
          )}

          <div className="relative">
            <Button
              variant={gameState.connectionMode === 'simulator' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setShowDemoMenu((v) => !v)}
            >
              <FlaskConical data-icon="inline-start" />
              <span>原位 HUD 演练</span>
            </Button>

            {showDemoMenu && (
              <div
                onMouseLeave={() => setShowDemoMenu(false)}
                className="absolute right-0 mt-1.5 w-56 rounded-lg bg-popover border border-primary/40 shadow-2xl py-1 z-50 text-xs"
              >
                {(
                  [
                    { key: 'champ-select', label: '① 预览：选人替补席头像贴标' },
                    { key: 'level-7-pick', label: '② 预览：局内三选一卡片贴标' },
                    { key: 'fountain-buy', label: '③ 预览：阵亡泉水五档动态出装' },
                    { key: 'off', label: '关闭演练（恢复真实监听）' }
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      onSelectSimScene(item.key)
                      setShowDemoMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 text-[#c8c1b2] hover:bg-[#17263e] hover:text-foreground cursor-pointer transition"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            variant="cyan"
            size="sm"
            onClick={onToggleHud}
            title="显示/隐藏全屏透明穿透原位 HUD (Alt+H)"
          >
            <Eye data-icon="inline-start" />
            <span>开关原位 HUD</span>
          </Button>
        </div>

        {/* Custom Dark-Gold Frameless Window Controls (Windows / Linux) */}
        {!isMac && (
          <div className="flex items-center h-full border-l border-primary/15">
            <button
              type="button"
              onClick={() => window.hexbuddy.minimizeMain()}
              title="最小化"
              className="h-full w-11 flex items-center justify-center text-muted-foreground hover:bg-white/8 hover:text-foreground transition cursor-pointer"
            >
              <Minus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => window.hexbuddy.toggleMaximizeMain()}
              title={isMaximized ? '向下还原' : '最大化'}
              className="h-full w-11 flex items-center justify-center text-muted-foreground hover:bg-white/8 hover:text-foreground transition cursor-pointer"
            >
              {isMaximized ? <Copy className="size-3" /> : <Square className="size-3" />}
            </button>
            <button
              type="button"
              onClick={() => window.hexbuddy.closeMain()}
              title="关闭（默认休眠至系统托盘）"
              className="h-full w-11 flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-white transition cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
