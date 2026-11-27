import React, { useEffect, useState } from 'react'
import {
  Database,
  Keyboard,
  ScanEye,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react'
import type {
  AiSettings,
  AppUpdateState,
  CacheStatsInfo,
  DatasetMetadata,
  DiagnosticSummary,
  SettingsSectionId,
  ShortcutStatusMap,
  UserPreferences
} from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { AboutDiagnosticsSection } from './sections/AboutDiagnosticsSection'
import { AiAdvisorSection } from './sections/AiAdvisorSection'
import { GeneralSection } from './sections/GeneralSection'
import { HotkeysOcrSection } from './sections/HotkeysOcrSection'
import { HudAppearanceSection } from './sections/HudAppearanceSection'
import { StrategyDataSection } from './sections/StrategyDataSection'

export interface SettingsCenterProps {
  settings: AiSettings
  prefs: UserPreferences
  meta: DatasetMetadata
  shortcutStatus: ShortcutStatusMap | null
  updateState: AppUpdateState | null
  syncing: boolean
  initialSection?: SettingsSectionId
  onSwitchDataset: (path: string, band: 'all' | 'high') => void
  onSyncNow: () => void
  onUpdatePrefs: (patch: Partial<UserPreferences>) => Promise<void>
  onUpdateSettings: (next: AiSettings) => Promise<void>
  onResetAll: () => Promise<void>
  onImportedConfig: (payload: {
    settings?: AiSettings
    prefs?: UserPreferences
    shortcutStatus?: ShortcutStatusMap
  }) => void
  onCacheCleared: (nextMeta: DatasetMetadata) => void
  onOpenSimPreview: () => void
  onNotify: (msg: string) => void
}

const SECTION_NAV: Array<{
  id: SettingsSectionId
  label: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: 'general', label: '常规与系统', desc: '自启、内存休眠与备份', icon: SlidersHorizontal },
  { id: 'hud', label: '原位 HUD 外观与校准', desc: '缩放、透明度与实时预览', icon: ScanEye },
  { id: 'hotkeys', label: '识屏与全局热键', desc: '按键录制与 OCR 策略', icon: Keyboard },
  { id: 'data', label: '攻略偏好与数据口径', desc: '默认心态、高玩分段与缓存', icon: Database },
  { id: 'ai', label: 'AI 战局锦囊', desc: '模型预设、风格与测速', icon: Sparkles },
  { id: 'about', label: '版本更新与环境自检', desc: '在线升级、诊断与开源协议', icon: ShieldCheck }
]

export const SettingsCenter: React.FC<SettingsCenterProps> = ({
  settings,
  prefs,
  meta,
  shortcutStatus,
  updateState,
  syncing,
  initialSection = 'general',
  onSwitchDataset,
  onSyncNow,
  onUpdatePrefs,
  onUpdateSettings,
  onResetAll,
  onImportedConfig,
  onCacheCleared,
  onOpenSimPreview,
  onNotify
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection)
  const [diag, setDiag] = useState<DiagnosticSummary | null>(null)
  const [cacheStats, setCacheStats] = useState<CacheStatsInfo | null>(null)
  const [autoSaveFlash, setAutoSaveFlash] = useState(false)

  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection])

  useEffect(() => {
    window.hexbuddy.getDiagnostics().then(setDiag).catch(() => {})
    window.hexbuddy.getCacheStats().then(setCacheStats).catch(() => {})
  }, [activeSection, meta.seq])

  const triggerSavedIndicator = (): void => {
    setAutoSaveFlash(true)
    setTimeout(() => setAutoSaveFlash(false), 1400)
  }

  const patchPref = async (patch: Partial<UserPreferences>): Promise<void> => {
    await onUpdatePrefs(patch)
    triggerSavedIndicator()
  }

  const patchSettings = async (patch: Partial<AiSettings>): Promise<void> => {
    await onUpdateSettings({ ...settings, ...patch })
    triggerSavedIndicator()
  }

  return (
    <div className="flex-1 flex min-h-0 bg-background">
      <aside className="w-64 shrink-0 border-r border-border bg-[#090f1a] flex flex-col justify-between p-3">
        <div className="flex flex-col gap-1">
          <div className="px-2.5 py-2 mb-1 flex items-center justify-between">
            <span className="text-xs font-bold text-primary tracking-wide">助手设置中心</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                autoSaveFlash
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-white/5 text-muted-foreground border-white/10'
              }`}
            >
              {autoSaveFlash ? '✓ 已自动保存' : '即改即存'}
            </span>
          </div>

          {SECTION_NAV.map((item) => {
            const Icon = item.icon
            const active = activeSection === item.id
            const showUpdateDot = item.id === 'about' && Boolean(updateState?.hasUpdate)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition flex items-start gap-2.5 cursor-pointer ${
                  active
                    ? 'bg-[#16243b] border border-primary/45 text-foreground shadow-sm'
                    : 'border border-transparent text-[#c8c1b2] hover:bg-[#111b2c] hover:text-foreground'
                }`}
              >
                <Icon
                  className={`size-4 mt-0.5 shrink-0 ${
                    active ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold flex items-center justify-between gap-1">
                    <span className="truncate">{item.label}</span>
                    {showUpdateDot && (
                      <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_#0ac8b9] shrink-0" />
                    )}
                  </div>
                  <div className="text-2xs text-muted-foreground truncate mt-0.5">
                    {item.desc}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="p-2.5 rounded-lg bg-[#0d1524] border border-border text-[11px] text-muted-foreground flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-foreground font-medium">
            <span>HexBuddy v{updateState?.currentVersion || '0.3.2'}</span>
            <Badge variant="cyan">100% 纯只读</Badge>
          </div>
          <span>对局进行中自动静默免打扰，绝不后台抢占网速或弹窗。</span>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-5">
          {activeSection === 'general' && (
            <GeneralSection
              prefs={prefs}
              diag={diag}
              onPatchPref={patchPref}
              onResetAll={onResetAll}
              onImportedConfig={onImportedConfig}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'hud' && (
            <HudAppearanceSection
              prefs={prefs}
              onPatchPref={patchPref}
              onOpenSimPreview={onOpenSimPreview}
            />
          )}

          {activeSection === 'hotkeys' && (
            <HotkeysOcrSection
              settings={settings}
              prefs={prefs}
              shortcutStatus={shortcutStatus}
              onPatchSettings={patchSettings}
              onPatchPref={patchPref}
            />
          )}

          {activeSection === 'data' && (
            <StrategyDataSection
              prefs={prefs}
              meta={meta}
              cacheStats={cacheStats}
              syncing={syncing}
              onPatchPref={patchPref}
              onSwitchDataset={onSwitchDataset}
              onSyncNow={onSyncNow}
              onRefreshCacheStats={(stats, nextMeta) => {
                setCacheStats(stats)
                onCacheCleared(nextMeta)
              }}
              onNotify={onNotify}
            />
          )}

          {activeSection === 'ai' && (
            <AiAdvisorSection settings={settings} onPatchSettings={patchSettings} />
          )}

          {activeSection === 'about' && (
            <AboutDiagnosticsSection updateState={updateState} diag={diag} meta={meta} />
          )}
        </div>
      </main>
    </div>
  )
}
