import React, { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  Check,
  ClipboardCopy,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  KeyRound,
  Keyboard,
  Loader2,
  RefreshCw,
  Rocket,
  ScanEye,
  Shield,
  ShieldAlert,
  Users,
  X
} from 'lucide-react'
import type {
  AiSettings,
  AppUpdateState,
  DatasetMetadata,
  DiagnosticSummary,
  HeroRole,
  UserPreferences
} from '@shared/types'

interface SettingsModalProps {
  settings: AiSettings
  prefs: UserPreferences
  meta: DatasetMetadata
  updateState: AppUpdateState | null
  syncing: boolean
  onSwitchDataset: (path: string, band: 'all' | 'high') => void
  onSyncNow: () => void
  onClose: () => void
  onSave: (nextSettings: AiSettings, nextPrefs: Partial<UserPreferences>) => Promise<void>
}

const ROLE_OPTIONS: Array<{ key: HeroRole; label: string }> = [
  { key: 'mage', label: '法师' },
  { key: 'marksman', label: '射手' },
  { key: 'fighter', label: '战士' },
  { key: 'tank', label: '坦克' },
  { key: 'assassin', label: '刺客' },
  { key: 'support', label: '辅助' }
]

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
  prefs,
  meta,
  updateState,
  syncing,
  onSwitchDataset,
  onSyncNow,
  onClose,
  onSave
}) => {
  const [form, setForm] = useState<AiSettings>({ ...settings })
  const [autoOcr, setAutoOcr] = useState<boolean>(prefs.autoOcrOnMilestone)
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(prefs.minimizeToTray)
  const [releaseMainOnMatch, setReleaseMainOnMatch] = useState<boolean>(
    prefs.releaseMainOnMatch ?? true
  )
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean>(prefs.launchAtLogin ?? false)
  const [autoHideUnfocused, setAutoHideUnfocused] = useState<boolean>(
    prefs.autoHideWhenUnfocused ?? true
  )
  const [badgePosition, setBadgePosition] = useState<'top' | 'bottom'>(prefs.badgePosition || 'top')
  const [hudOffsetX, setHudOffsetX] = useState<number>(prefs.hudOffsetX ?? 0)
  const [hudOffsetY, setHudOffsetY] = useState<number>(prefs.hudOffsetY ?? 0)
  const [preferredRoles, setPreferredRoles] = useState<HeroRole[]>(prefs.preferredRoles || [])
  const [diag, setDiag] = useState<DiagnosticSummary | null>(null)
  const [copiedDiag, setCopiedDiag] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.hexbuddy.getDiagnostics().then(setDiag).catch(() => {})
  }, [])

  const currentDatasetPath =
    meta.availableDatasets?.find((d) => d.patch === meta.patch && d.mode === meta.mode)?.path ||
    `patches/${meta.patch}/${meta.mode}`

  const toggleRole = (r: HeroRole): void => {
    setPreferredRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    await onSave(form, {
      autoOcrOnMilestone: autoOcr,
      minimizeToTray,
      releaseMainOnMatch,
      launchAtLogin,
      autoHideWhenUnfocused: autoHideUnfocused,
      badgePosition,
      hudOffsetX,
      hudOffsetY,
      preferredRoles
    })
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 450)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="hex-panel w-full max-w-xl rounded-lg overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-[#C8AA6E]/25 flex items-center justify-between bg-[#090F1A]">
          <h2 className="text-base font-semibold text-[#F0E6D2]">原位 HUD、数据口径与助手设置</h2>
          <button onClick={onClose} className="p-1 text-[#94A3B8] hover:text-[#F0E6D2] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 text-sm max-h-[82vh] overflow-y-auto">
          {/* 0. App Version & Online Self-Update */}
          {updateState && (
            <section className="p-3.5 rounded-lg bg-[#0D1728] border border-[#C8AA6E]/30 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="w-4 h-4 text-[#0AC8B9]" />
                  <span className="font-semibold text-[#F0E6D2]">
                    软件版本：v{updateState.currentVersion}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/8 text-[#94A3B8] text-[10px]">
                    {updateState.isPortable ? '免安装便携版' : '标准安装版'}
                  </span>
                  {updateState.phase === 'up-to-date' && (
                    <span className="text-[11px] text-emerald-400">✓ 已是最新版本</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={updateState.phase === 'checking' || updateState.phase === 'downloading'}
                    onClick={() => window.hexbuddy.checkForUpdates()}
                    className="px-2.5 py-1 rounded bg-[#141F30] hover:bg-[#1C2B42] border border-[#C8AA6E]/30 text-[#C8C1B2] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {updateState.phase === 'checking' ? (
                      <Loader2 className="w-3 h-3 animate-spin text-[#0AC8B9]" />
                    ) : (
                      <RefreshCw className="w-3 h-3 text-[#C8AA6E]" />
                    )}
                    <span>{updateState.phase === 'checking' ? '检查中...' : '检查软件更新'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.hexbuddy.openExternal(updateState.releasePageUrl)}
                    className="px-2 py-1 rounded bg-[#141F30] hover:bg-[#1C2B42] border border-white/10 text-[#94A3B8] hover:text-[#F0E6D2] flex items-center gap-1 cursor-pointer"
                  >
                    <span>发布页</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {updateState.hasUpdate && (
                <div className="p-2.5 rounded bg-[#081220] border border-[#0AC8B9]/35 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-bold text-[#5CF2E5]">
                        发现新版本 v{updateState.latestVersion}
                      </span>
                      {updateState.assetSize > 0 && (
                        <span className="ml-2 text-[#94A3B8] tabular-nums">
                          ({(updateState.assetSize / 1024 / 1024).toFixed(1)} MB · SHA-256 官方签名校验)
                        </span>
                      )}
                    </div>

                    {updateState.phase === 'downloaded' ? (
                      <button
                        type="button"
                        onClick={() => window.hexbuddy.installUpdate()}
                        className="px-3 py-1 rounded bg-[#0AC8B9] hover:bg-[#3CE6D8] text-[#06131C] font-bold flex items-center gap-1 cursor-pointer shadow"
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        <span>立即重启并升级</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={updateState.phase === 'downloading'}
                        onClick={() => window.hexbuddy.downloadUpdate()}
                        className="px-3 py-1 rounded bg-[#C8AA6E] hover:bg-[#E2C992] text-[#070B12] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        {updateState.phase === 'downloading' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {updateState.phase === 'downloading'
                            ? `正在下载 ${updateState.downloadPercent}%`
                            : '一键下载并更新'}
                        </span>
                      </button>
                    )}
                  </div>

                  {updateState.phase === 'downloading' && (
                    <div className="space-y-1">
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          style={{ width: `${updateState.downloadPercent}%` }}
                          className="h-full bg-[#0AC8B9] transition-all"
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-[#94A3B8] tabular-nums">
                        <span>支持多节点自动回退加速 · 下载完成后自动校验 SHA-256</span>
                        <span>
                          {(updateState.transferredBytes / 1024 / 1024).toFixed(1)} /{' '}
                          {(updateState.assetSize / 1024 / 1024).toFixed(1)} MB
                        </span>
                      </div>
                    </div>
                  )}

                  {updateState.releaseNotes && (
                    <div className="max-h-24 overflow-y-auto text-[11px] text-[#C8C1B2] whitespace-pre-wrap border-t border-white/10 pt-1.5 leading-relaxed">
                      {updateState.releaseNotes}
                    </div>
                  )}
                </div>
              )}

              {updateState.errorMessage && (
                <div className="text-[11px] text-rose-400">{updateState.errorMessage}</div>
              )}
            </section>
          )}

          {/* 0b. Windows WeGame UAC Privilege Parity Alert / Relaunch */}
          {diag?.isWindows && !diag.isSelfElevated && (
            <section
              className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                diag.leagueElevatedMismatch
                  ? 'bg-amber-500/15 border-amber-400/55 text-amber-100'
                  : 'bg-[#0E1728] border-[#C8AA6E]/25 text-[#C8C1B2]'
              }`}
            >
              <div className="flex items-start gap-2">
                {diag.leagueElevatedMismatch ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-[#C8AA6E] shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-[#F0E6D2]">
                    {diag.leagueElevatedMismatch
                      ? '检测到游戏正以管理员权限运行（WeGame 默认），当前普通权限下游戏内快捷键可能被系统拦截'
                      : '当前以普通权限运行（若通过 WeGame 启动游戏导致 Alt+H/S 失灵，可切换管理员权限）'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.hexbuddy.relaunchAsAdmin()}
                className="px-2.5 py-1.5 rounded bg-[#C8AA6E] hover:bg-[#E2C992] text-[#070B12] font-semibold shrink-0 cursor-pointer"
              >
                以管理员身份重启
              </button>
            </section>
          )}

          {/* 1. HUD & Tray Behavior */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-[#E2C992] font-medium">
              <ScanEye className="w-4 h-4" />
              <span>原位 HUD 与系统托盘行为</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
              <label className="flex items-start gap-2 p-2.5 rounded bg-[#111B2C] border border-[#C8AA6E]/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={minimizeToTray}
                  onChange={(e) => setMinimizeToTray(e.target.checked)}
                  className="mt-0.5 accent-[#0AC8B9]"
                />
                <div>
                  <div className="font-semibold text-[#F0E6D2]">关闭主窗口时休眠驻留托盘</div>
                  <p className="text-[#94A3B8] mt-0.5">销毁主窗口释放约 150MB 内存，仅留轻量后台待命</p>
                </div>
              </label>

              <label className="flex items-start gap-2 p-2.5 rounded bg-[#111B2C] border border-[#C8AA6E]/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoOcr}
                  onChange={(e) => setAutoOcr(e.target.checked)}
                  className="mt-0.5 accent-[#0AC8B9]"
                />
                <div>
                  <div className="font-semibold text-[#F0E6D2]">选卡期自动识屏 + 刷新跟随</div>
                  <p className="text-[#94A3B8] mt-0.5">Windows 原生 OCR 优先 + 选完卡 15 秒自动休眠</p>
                </div>
              </label>

              <label className="flex items-start gap-2 p-2.5 rounded bg-[#111B2C] border border-[#C8AA6E]/20 cursor-pointer md:col-span-2">
                <input
                  type="checkbox"
                  checked={releaseMainOnMatch}
                  onChange={(e) => setReleaseMainOnMatch(e.target.checked)}
                  className="mt-0.5 accent-[#0AC8B9]"
                />
                <div>
                  <div className="font-semibold text-[#F0E6D2]">
                    进入游戏对局时自动休眠主窗口（推荐开启，局内直省 ~150MB 内存；双屏常驻查阅可关）
                  </div>
                  <p className="text-[#94A3B8] mt-0.5">
                    对局中由原位 HUD 全程接管推荐；随时可点 HUD 书本图标或双击托盘秒开图鉴
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2 p-2.5 rounded bg-[#111B2C] border border-[#C8AA6E]/20 cursor-pointer md:col-span-2">
                <input
                  type="checkbox"
                  checked={launchAtLogin}
                  onChange={(e) => setLaunchAtLogin(e.target.checked)}
                  className="mt-0.5 accent-[#0AC8B9]"
                />
                <div>
                  <div className="font-semibold text-[#F0E6D2]">
                    开机静默随系统启动并驻留托盘（不弹主窗口打扰，待机仅约 60MB）
                  </div>
                  <p className="text-[#94A3B8] mt-0.5">
                    打开英雄联盟进入大乱斗选人时自动唤醒原位 HUD，打完退出自动休眠
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2 p-2.5 rounded bg-[#111B2C] border border-[#C8AA6E]/20 cursor-pointer md:col-span-2">
                <input
                  type="checkbox"
                  checked={autoHideUnfocused}
                  onChange={(e) => setAutoHideUnfocused(e.target.checked)}
                  className="mt-0.5 accent-[#0AC8B9]"
                />
                <div>
                  <div className="font-semibold text-[#F0E6D2]">
                    切出游戏 (Alt+Tab) 时自动隐藏 HUD，切回自动恢复
                  </div>
                  <p className="text-[#94A3B8] mt-0.5">
                    自动追踪英雄联盟客户区真实像素（支持无边框/窗口化、100%~200% DPI 缩放、16:9 / 16:10 / 21:9 带鱼屏；若设为传统独占全屏请改为无边框）
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded bg-[#111B2C] border border-[#C8AA6E]/20 text-xs">
              <span className="text-[#C8C1B2]">局内三选一原位贴标位置：</span>
              <div className="flex gap-1.5">
                {(
                  [
                    { key: 'top', label: '海克斯卡片正上方（默认）' },
                    { key: 'bottom', label: '海克斯卡片正下方' }
                  ] as const
                ).map((pos) => (
                  <button
                    type="button"
                    key={pos.key}
                    onClick={() => setBadgePosition(pos.key)}
                    className={`px-2.5 py-1 rounded cursor-pointer ${
                      badgePosition === pos.key
                        ? 'bg-[#C8AA6E] text-[#070B12] font-semibold'
                        : 'bg-[#0B1220] text-[#94A3B8]'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded bg-[#111B2C] border border-[#C8AA6E]/20 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#C8C1B2]">
                  原位坐标偏移微调（横向 {hudOffsetX >= 0 ? `+${hudOffsetX}` : hudOffsetX}% · 纵向{' '}
                  {hudOffsetY >= 0 ? `+${hudOffsetY}` : hudOffsetY}%）
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setHudOffsetX(0)
                    setHudOffsetY(0)
                  }}
                  className="px-2 py-0.5 rounded bg-[#0B1220] text-[#E2C992] hover:bg-white/10 cursor-pointer"
                >
                  重置归零
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-[#94A3B8] shrink-0">横向 X</span>
                  <input
                    type="range"
                    min={-8}
                    max={8}
                    step={0.5}
                    value={hudOffsetX}
                    onChange={(e) => setHudOffsetX(Number(e.target.value))}
                    className="w-full accent-[#0AC8B9]"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-[#94A3B8] shrink-0">纵向 Y</span>
                  <input
                    type="range"
                    min={-8}
                    max={8}
                    step={0.5}
                    value={hudOffsetY}
                    onChange={(e) => setHudOffsetY(Number(e.target.value))}
                    className="w-full accent-[#0AC8B9]"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* 2. Preferred Roles for Champ Select Bench HUD */}
          <section className="space-y-2 pt-2 border-t border-[#C8AA6E]/15">
            <div className="flex items-center gap-2 text-[#E2C992] font-medium">
              <Users className="w-4 h-4" />
              <span>选人替补席 · 我的常玩定位加权</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_OPTIONS.map((ro) => {
                const active = preferredRoles.includes(ro.key)
                return (
                  <button
                    type="button"
                    key={ro.key}
                    onClick={() => toggleRole(ro.key)}
                    className={`px-3 py-1 rounded text-xs border cursor-pointer transition ${
                      active
                        ? 'bg-[#C8AA6E] text-[#070B12] border-[#C8AA6E] font-semibold'
                        : 'bg-[#141F30] text-[#94A3B8] border-[#C8AA6E]/25 hover:text-[#F0E6D2]'
                    }`}
                  >
                    {ro.label}
                  </button>
                )
              })}
            </div>
          </section>

          {/* 3. Dataset Mode & Hot Sync */}
          <section className="space-y-2 pt-2 border-t border-[#C8AA6E]/15">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#E2C992] font-medium">
                <Database className="w-4 h-4" />
                <span>数据模式与分段口径</span>
              </div>
              <button
                type="button"
                onClick={onSyncNow}
                disabled={syncing}
                className="px-2.5 py-1 rounded text-xs bg-[#141F30] hover:bg-[#1B2B44] border border-[#C8AA6E]/30 text-[#C8C1B2] flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 text-[#C8AA6E] ${syncing ? 'animate-spin' : ''}`} />
                <span>检查统计数据热更</span>
              </button>
            </div>

            {meta.availableDatasets && meta.availableDatasets.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <select
                  value={currentDatasetPath}
                  onChange={(e) => onSwitchDataset(e.target.value, 'all')}
                  className="flex-1 px-3 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2]"
                >
                  {meta.availableDatasets.map((ds) => (
                    <option key={ds.path} value={ds.path}>
                      {ds.patch} 版本 · {ds.modeLabel}
                    </option>
                  ))}
                </select>

                {meta.bandsAvailable && (
                  <div className="flex gap-1">
                    {(['all', 'high'] as const).map((b) => (
                      <button
                        type="button"
                        key={b}
                        onClick={() => onSwitchDataset(currentDatasetPath, b)}
                        className={`px-2.5 py-1.5 rounded border cursor-pointer ${
                          meta.activeBand === b
                            ? 'bg-[#0AC8B9]/25 text-[#5CF2E5] border-[#0AC8B9]'
                            : 'bg-[#141F30] text-[#94A3B8] border-white/10'
                        }`}
                      >
                        {b === 'all' ? '全体样本' : '前5%高玩'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 4. Shortcuts & LLM */}
          <section className="space-y-3 pt-2 border-t border-[#C8AA6E]/15">
            <div className="flex items-center gap-2 text-[#E2C992] font-medium">
              <Keyboard className="w-4 h-4" />
              <span>全局快捷键与可选 AI 锦囊接口</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-[#94A3B8]">显示/隐藏原位 HUD</span>
                <input
                  value={form.shortcutOverlay}
                  onChange={(e) => setForm({ ...form, shortcutOverlay: e.target.value })}
                  className="w-full px-3 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[#94A3B8]">手动重识三选一卡片</span>
                <input
                  value={form.shortcutOcr}
                  onChange={(e) => setForm({ ...form, shortcutOcr: e.target.value })}
                  className="w-full px-3 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2]"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <KeyRound className="w-3.5 h-3.5 text-[#C8AA6E] mt-1 mr-1" />
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
                  className="px-2 py-1 rounded text-xs bg-[#141F30] hover:bg-[#1B2A42] border border-[#C8AA6E]/25 text-[#C8C1B2] cursor-pointer"
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="Base URL"
                className="px-2.5 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2]"
              />
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="Model"
                className="px-2.5 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2]"
              />
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="API Key (选填)"
                className="px-2.5 py-1.5 rounded bg-[#141F30] border border-[#C8AA6E]/30 text-[#F0E6D2]"
              />
            </div>
          </section>

          {/* Attribution & 1-Click Diagnostics */}
          <section className="p-3 rounded bg-[#090E17] border border-[#C8AA6E]/20 text-xs text-[#94A3B8] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#0AC8B9]" />
                当前 {meta.patch} · {meta.modeLabel}（{meta.matchesValid.toLocaleString()} 场对局 · CC BY-NC 4.0）
              </span>
              <button
                type="button"
                onClick={() => window.hexbuddy.openExternal(meta.sourceRepo)}
                className="inline-flex items-center gap-1 text-[#C8AA6E] hover:underline cursor-pointer shrink-0"
              >
                aramhex-data
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {diag && (
              <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#64748B]">
                  遇到坐标或识屏问题？可导出脱敏运行摘要排障
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      window.hexbuddy.copyText(diag.formattedReport)
                      setCopiedDiag(true)
                      setTimeout(() => setCopiedDiag(false), 2000)
                    }}
                    className="px-2 py-1 rounded bg-[#141F30] hover:bg-[#1B2B44] text-[#C8C1B2] flex items-center gap-1 cursor-pointer"
                  >
                    <ClipboardCopy className="w-3 h-3 text-[#0AC8B9]" />
                    <span>{copiedDiag ? '✓ 已复制诊断摘要' : '复制诊断摘要'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.hexbuddy.openLogDir()}
                    className="px-2 py-1 rounded bg-[#141F30] hover:bg-[#1B2B44] text-[#94A3B8] hover:text-[#F0E6D2] flex items-center gap-1 cursor-pointer"
                  >
                    <FolderOpen className="w-3 h-3" />
                    <span>日志目录</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded text-xs bg-[#141F30] text-[#C8C1B2] cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded text-xs font-semibold bg-[#C8AA6E] hover:bg-[#E2C992] text-[#070B12] flex items-center gap-1.5 cursor-pointer"
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
