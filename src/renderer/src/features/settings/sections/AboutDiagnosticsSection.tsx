import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  RefreshCw,
  Rocket,
  Shield
} from 'lucide-react'
import { parseReleaseNotesMarkdown } from '@shared/changelogParser'
import type { AppUpdateState, DatasetMetadata, DiagnosticSummary } from '@shared/types'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

interface AboutDiagnosticsSectionProps {
  updateState: AppUpdateState | null
  diag: DiagnosticSummary | null
  meta: DatasetMetadata
}

export const AboutDiagnosticsSection: React.FC<AboutDiagnosticsSectionProps> = ({
  updateState,
  diag,
  meta
}) => {
  const [copiedDiag, setCopiedDiag] = useState(false)

  const parsedChangelog = useMemo(
    () => parseReleaseNotesMarkdown(updateState?.releaseNotes || ''),
    [updateState?.releaseNotes]
  )

  return (
    <>
      <div>
        <h1 className="text-base font-bold text-foreground">版本在线升级与运行环境自检</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          支持安装版与便携版 SHA-256 官方签名校验升级，并提供零隐私泄露的一键运行环境排障。
        </p>
      </div>

      {updateState && (
        <Card className={updateState.hasUpdate ? 'border-accent/50' : ''}>
          <CardHeader>
            <div className="flex items-center gap-2.5 flex-wrap">
              <ArrowUpCircle className="size-4 text-accent" />
              <CardTitle>当前版本 v{updateState.currentVersion}</CardTitle>
              <Badge variant="secondary">
                {updateState.isPortable ? '免安装便携版' : '标准安装版'}
              </Badge>
              {updateState.phase === 'up-to-date' && <Badge variant="emerald">✓ 已是最新版本</Badge>}
            </div>
            <CardAction>
              <Button
                variant="secondary"
                size="sm"
                disabled={updateState.phase === 'checking' || updateState.phase === 'downloading'}
                onClick={() => window.hexbuddy.checkForUpdates()}
              >
                {updateState.phase === 'checking' ? (
                  <Loader2 data-icon="inline-start" className="animate-spin text-accent" />
                ) : (
                  <RefreshCw data-icon="inline-start" className="text-primary" />
                )}
                {updateState.phase === 'checking' ? '正在检查...' : '检查新版本'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.hexbuddy.openExternal(updateState.releasePageUrl)}
              >
                GitHub 发布页
                <ExternalLink data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>

          {(updateState.hasUpdate || updateState.errorMessage) && (
            <CardContent className="flex flex-col gap-3">
              {updateState.hasUpdate && (
                <div className="rounded-lg bg-[#081220] border border-accent/35 p-3.5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="text-sm font-bold text-[#5cf2e5]">
                        发现新版本 v{updateState.latestVersion}
                      </span>
                      {updateState.assetSize > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                          ({(updateState.assetSize / 1024 / 1024).toFixed(1)} MB · SHA-256 签名校验)
                        </span>
                      )}
                    </div>

                    {updateState.phase === 'downloaded' ? (
                      <Button variant="cyanSolid" onClick={() => window.hexbuddy.installUpdate()}>
                        <Rocket data-icon="inline-start" />
                        立即重启并升级
                      </Button>
                    ) : (
                      <Button
                        disabled={updateState.phase === 'downloading'}
                        onClick={() => window.hexbuddy.downloadUpdate()}
                      >
                        {updateState.phase === 'downloading' ? (
                          <Loader2 data-icon="inline-start" className="animate-spin" />
                        ) : (
                          <Download data-icon="inline-start" />
                        )}
                        {updateState.phase === 'downloading'
                          ? `下载中 ${updateState.downloadPercent}%`
                          : '一键下载更新'}
                      </Button>
                    )}
                  </div>

                  {updateState.phase === 'downloading' && (
                    <div className="flex flex-col gap-1">
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          style={{ width: `${updateState.downloadPercent}%` }}
                          className="h-full bg-accent transition-all"
                        />
                      </div>
                      <div className="flex justify-between text-2xs text-muted-foreground tabular-nums">
                        <span>多节点镜像自动回退 · 下载完毕自动核验哈希</span>
                        <span>
                          {(updateState.transferredBytes / 1024 / 1024).toFixed(1)} /{' '}
                          {(updateState.assetSize / 1024 / 1024).toFixed(1)} MB
                        </span>
                      </div>
                    </div>
                  )}

                  {updateState.releaseNotes && (
                    <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
                      {parsedChangelog.summaryLine && (
                        <div className="text-xs font-semibold text-secondary-foreground">
                          {parsedChangelog.summaryLine}
                        </div>
                      )}

                      {parsedChangelog.sections.length > 0 ? (
                        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                          {parsedChangelog.sections.map((sec, idx) => (
                            <div key={idx} className="flex flex-col gap-1">
                              <Badge
                                variant={
                                  sec.tone === 'added'
                                    ? 'cyan'
                                    : sec.tone === 'improved'
                                      ? 'default'
                                      : sec.tone === 'fixed'
                                        ? 'emerald'
                                        : 'secondary'
                                }
                                className="w-fit"
                              >
                                {sec.heading}
                              </Badge>
                              <ul className="list-disc list-inside text-xs text-[#c8c1b2] flex flex-col gap-0.5 pl-1">
                                {sec.items.map((it, i) => (
                                  <li key={i} className="leading-relaxed">
                                    {it}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="max-h-32 overflow-y-auto text-xs text-[#c8c1b2] whitespace-pre-wrap leading-relaxed">
                          {updateState.releaseNotes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {updateState.errorMessage && (
                <Alert variant="destructive">
                  <AlertTriangle className="text-rose-400 mt-0.5" />
                  <AlertTitle>{updateState.errorMessage}</AlertTitle>
                </Alert>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {diag && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>运行环境健康度自检</CardTitle>
              <CardDescription>
                实时检查游戏窗口追踪、Windows UIPI 权限对等性、OCR 引擎与内存水位。
              </CardDescription>
            </div>
            <CardAction>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => {
                  window.hexbuddy.copyText(diag.formattedReport)
                  setCopiedDiag(true)
                  setTimeout(() => setCopiedDiag(false), 2000)
                }}
              >
                <ClipboardCopy data-icon="inline-start" className="text-accent" />
                {copiedDiag ? '✓ 已复制摘要' : '复制脱敏诊断摘要'}
              </Button>
              <Button variant="outline" size="xs" onClick={() => window.hexbuddy.openLogDir()}>
                <FolderOpen data-icon="inline-start" />
                打开日志目录
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg bg-[#10192b] border border-border flex items-start gap-2.5">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-foreground">
                  客户端连接：{diag.connectionMode}
                </div>
                <p className="text-2xs text-muted-foreground mt-0.5">
                  客户区追踪：{diag.trackedWindowSummary}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#10192b] border border-border flex items-start gap-2.5">
              {diag.leagueElevatedMismatch ? (
                <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-xs font-semibold text-foreground">
                  系统权限：{diag.leagueElevatedMismatch ? '检测到提权不匹配' : '对等正常'}
                </div>
                <p className="text-2xs text-muted-foreground mt-0.5">
                  {diag.isWindows
                    ? diag.isSelfElevated
                      ? '当前已运行在管理员权限'
                      : '标准用户权限运行中'
                    : 'macOS / 桌面开发预览环境'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#10192b] border border-border flex items-start gap-2.5">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-foreground">OCR 识屏引擎就绪</div>
                <p className="text-2xs text-muted-foreground mt-0.5">{diag.ocrEngineSummary}</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#10192b] border border-border flex items-start gap-2.5">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-foreground">
                  主进程 RSS：{diag.memoryRssMb} MB
                </div>
                <p className="text-2xs text-muted-foreground mt-0.5">数据：{diag.datasetSummary}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-accent shrink-0" />
            <CardTitle>合规安全声明与开源数据致谢</CardTitle>
          </div>
          <CardAction>
            <Button
              variant="outline"
              size="xs"
              onClick={() => window.hexbuddy.openExternal(meta.sourceRepo)}
            >
              访问数据源仓库
              <ExternalLink data-icon="inline-end" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground leading-relaxed">
          本软件严格遵守 Riot / 腾讯游戏安全红线（仅通过本地只读接口读取对局状态，零内存读取、零模拟按键）。胜率统计数据源自{' '}
          <strong className="text-foreground">czgreat/aramhex-data</strong>（CC BY-NC 4.0
          非商业开源授权）。
        </CardContent>
      </Card>
    </>
  )
}
