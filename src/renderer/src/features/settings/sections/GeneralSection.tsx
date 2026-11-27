import React, { useState } from 'react'
import { AlertTriangle, FileDown, FileUp, RotateCcw, ShieldAlert } from 'lucide-react'
import type {
  AiSettings,
  DiagnosticSummary,
  ShortcutStatusMap,
  UiFontScale,
  UserPreferences
} from '@shared/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface GeneralSectionProps {
  prefs: UserPreferences
  diag: DiagnosticSummary | null
  onPatchPref: (patch: Partial<UserPreferences>) => Promise<void>
  onResetAll: () => Promise<void>
  onImportedConfig: (payload: {
    settings?: AiSettings
    prefs?: UserPreferences
    shortcutStatus?: ShortcutStatusMap
  }) => void
  onNotify: (msg: string) => void
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({
  prefs,
  diag,
  onPatchPref,
  onResetAll,
  onImportedConfig,
  onNotify
}) => {
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  return (
    <>
      <div>
        <h1 className="text-base font-bold text-foreground">常规与系统行为</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          管理 Windows 开机静默待命、窗口内存深度休眠、权限对等性以及个人配置迁移。
        </p>
      </div>

      {diag?.isWindows && !diag.isSelfElevated && (
        <Alert variant={diag.leagueElevatedMismatch ? 'warning' : 'default'}>
          {diag.leagueElevatedMismatch ? (
            <AlertTriangle className="text-amber-400 mt-0.5" />
          ) : (
            <ShieldAlert className="text-primary mt-0.5" />
          )}
          <div className="flex-1 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <AlertTitle>
                {diag.leagueElevatedMismatch
                  ? '检测到英雄联盟正以管理员权限运行（WeGame 默认模式）'
                  : '当前以标准普通权限运行'}
              </AlertTitle>
              <AlertDescription>
                {diag.leagueElevatedMismatch
                  ? '由于 Windows UIPI 隔离机制，普通权限下局内 Alt+H / Alt+S 全局热键会被游戏拦截，建议一键切换管理员权限。'
                  : '若你通过 WeGame 启动游戏且遇到局内热键无响应，可随时以管理员身份重启。'}
              </AlertDescription>
            </div>
            <Button size="sm" onClick={() => window.hexbuddy.relaunchAsAdmin()}>
              以管理员身份重启
            </Button>
          </div>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>主界面文字大小与护眼清晰度</CardTitle>
            <CardDescription>
              一键调节攻略图鉴、海克斯百科与设置中心的整体文字比例（不会改变局内原位 HUD 的空间锚点坐标）。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-semibold text-foreground">界面阅读字号档位</div>
            <p className="text-2xs text-muted-foreground mt-0.5">
              高分屏或长时间查阅推荐选择「舒适护眼」或「大字清晰」
            </p>
          </div>
          <ToggleGroup
            value={[prefs.uiFontScale || 'comfortable']}
            onValueChange={(vals) => {
              const next = vals[0] as UiFontScale | undefined
              if (next) onPatchPref({ uiFontScale: next })
            }}
          >
            <ToggleGroupItem value="normal">标准紧凑</ToggleGroupItem>
            <ToggleGroupItem value="comfortable">舒适护眼 (推荐)</ToggleGroupItem>
            <ToggleGroupItem value="large">大字清晰</ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>后台驻留与低内存休眠策略</CardTitle>
            <CardDescription>
              采用真销毁休眠架构：空闲托盘待命仅占约 60MB 内存，进入对局自动释放主窗口渲染进程。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-white/6 py-1">
          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-foreground">关闭主窗口时休眠驻留系统托盘</div>
              <p className="text-2xs text-muted-foreground mt-0.5">
                点击右上角关闭时销毁主窗口释放 ~150MB 内存，双击任务栏托盘图标秒开恢复
              </p>
            </div>
            <Switch
              checked={prefs.minimizeToTray}
              onCheckedChange={(checked) => onPatchPref({ minimizeToTray: checked })}
            />
          </div>

          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-foreground">
                进入游戏对局时自动休眠主窗口（推荐单屏玩家开启）
              </div>
              <p className="text-2xs text-muted-foreground mt-0.5">
                对局内由全屏穿透原位 HUD 全程接管推荐；若你有副屏想常驻查阅英雄图鉴可关闭此项
              </p>
            </div>
            <Switch
              checked={prefs.releaseMainOnMatch ?? true}
              onCheckedChange={(checked) => onPatchPref({ releaseMainOnMatch: checked })}
            />
          </div>

          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-foreground">
                开机随 Windows 静默启动并驻留托盘
              </div>
              <p className="text-2xs text-muted-foreground mt-0.5">
                开机不弹主窗口不打扰日常办公，打开英雄联盟进入海克斯大乱斗时自动唤醒 HUD
              </p>
            </div>
            <Switch
              checked={prefs.launchAtLogin ?? false}
              onCheckedChange={(checked) => onPatchPref({ launchAtLogin: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>配置备份迁移与恢复出厂默认</CardTitle>
            <CardDescription>
              支持跨电脑迁移个人偏好配置，或在调乱参数时一键还原初始推荐状态。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-white/6 py-1">
          <div className="py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">个人配置导入与导出备份</div>
              <p className="text-2xs text-muted-foreground mt-0.5">
                导出 JSON 会自动剔除 API Key 等敏感凭据，方便在网吧、笔记本或新版本便携包之间迁移收藏英雄与 HUD 习惯
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const res = await window.hexbuddy.exportConfigFile()
                  if (res.ok) onNotify(res.message)
                }}
              >
                <FileDown data-icon="inline-start" />
                导出备份 (.json)
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const res = await window.hexbuddy.importConfigFile()
                  if (res.ok) onImportedConfig(res)
                  if (res.message !== '已取消导入') onNotify(res.message)
                }}
              >
                <FileUp data-icon="inline-start" />
                导入备份
              </Button>
            </div>
          </div>

          <div className="py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">恢复出厂默认设置</div>
              <p className="text-2xs text-muted-foreground mt-0.5">
                将 HUD 缩放、透明度、坐标微调偏移、默认心态及全局快捷键重置为初始推荐值（已填 API Key 会保留）
              </p>
            </div>

            <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
              <AlertDialogTrigger render={<Button variant="destructive" size="sm" className="shrink-0" />}>
                <RotateCcw data-icon="inline-start" />
                恢复默认设置
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>确认恢复出厂默认设置？</AlertDialogTitle>
                <AlertDialogDescription>
                  此操作会将 HUD 缩放、透明度、坐标微调偏移、默认心态及全局快捷键重置为初始推荐状态（已填写的 AI API Key 会安全保留）。
                </AlertDialogDescription>
                <div className="flex justify-end gap-2 pt-2">
                  <AlertDialogClose render={<Button variant="secondary" />}>取消</AlertDialogClose>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      await onResetAll()
                      setResetDialogOpen(false)
                      onNotify('已恢复全部默认设置')
                    }}
                  >
                    确认重置
                  </Button>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
