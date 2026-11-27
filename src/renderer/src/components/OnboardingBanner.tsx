import React, { useEffect, useState } from 'react'
import { CheckCircle2, FlaskConical, Monitor, ShieldAlert, Sparkles, X } from 'lucide-react'
import type { DiagnosticSummary } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface OnboardingBannerProps {
  onStartSimDemo: () => void
  onDismiss: () => void
}

export const OnboardingBanner: React.FC<OnboardingBannerProps> = ({
  onStartSimDemo,
  onDismiss
}) => {
  const [diag, setDiag] = useState<DiagnosticSummary | null>(null)

  useEffect(() => {
    window.hexbuddy.getDiagnostics().then(setDiag).catch(() => {})
  }, [])

  return (
    <div className="px-4 py-2.5 bg-gradient-to-r from-[#0c1a2e] via-[#0d1728] to-[#131d30] border-b border-primary/30 flex items-center justify-between gap-4 flex-wrap shrink-0">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <Badge variant="cyan">
          <Sparkles />
          30 秒上手自检
        </Badge>

        <span className="inline-flex items-center gap-1.5 text-[#f0e6d2]">
          <Monitor className="size-3.5 text-primary" />
          <span>
            ① 游戏内视频请设为<strong>「无边框模式」</strong>（传统全屏会遮挡透明 HUD）
          </span>
        </span>

        <span className="text-white/20">|</span>

        {diag?.leagueElevatedMismatch ? (
          <span className="inline-flex items-center gap-1.5 text-amber-200">
            <ShieldAlert className="size-3.5 text-amber-400" />
            <span>② 检测到 WeGame 管理员运行，建议提权以防热键失灵</span>
            <Button
              size="xs"
              onClick={() => window.hexbuddy.relaunchAsAdmin()}
            >
              一键管理员重启
            </Button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[#c8c1b2]">
            <CheckCircle2 className="size-3.5 text-emerald-400" />
            <span>② 进入海克斯大乱斗自动唤醒 HUD，打完自动休眠</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button variant="cyan" size="xs" onClick={onStartSimDemo}>
          <FlaskConical data-icon="inline-start" />
          免开游戏 · 试玩三选一演练
        </Button>
        <Button
          variant="ghost"
          size="xs"
          title="不再显示此引导条"
          onClick={onDismiss}
        >
          <span>知道了</span>
          <X data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}
