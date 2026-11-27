import React from 'react'
import { Crown, ScanEye } from 'lucide-react'
import type {
  HudDensityMode,
  OverlayOpacityMode,
  UserPreferences
} from '@shared/types'
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
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface HudAppearanceSectionProps {
  prefs: UserPreferences
  onPatchPref: (patch: Partial<UserPreferences>) => Promise<void>
  onOpenSimPreview: () => void
}

export const HudAppearanceSection: React.FC<HudAppearanceSectionProps> = ({
  prefs,
  onPatchPref,
  onOpenSimPreview
}) => {
  const previewCardSurface =
    prefs.overlayOpacity === 'clear'
      ? 'bg-black/42 backdrop-blur-[2px] border-accent/65'
      : prefs.overlayOpacity === 'glass'
        ? 'bg-[#072230]/74 backdrop-blur-md border-accent'
        : 'bg-[#072230]/96 border-accent shadow-[0_0_18px_rgba(10,200,185,0.28)]'

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-bold text-foreground">原位 HUD 外观与空间校准</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            自由定制局内透明覆盖层的缩放比例、背景通透度、信息密度与分阶段模块显隐。
          </p>
        </div>
        <Button variant="cyan" onClick={onOpenSimPreview}>
          <ScanEye data-icon="inline-start" />
          打开全屏实景校准台
        </Button>
      </div>

      <Card className="overflow-hidden border-primary/35">
        <CardHeader className="bg-[#09101d]">
          <div>
            <CardTitle>实时外观预览（所见即所得）</CardTitle>
            <CardDescription>
              当前倍率 {Math.round(prefs.hudScale * 100)}% ·{' '}
              {prefs.overlayOpacity === 'solid'
                ? '实心暗金高对比'
                : prefs.overlayOpacity === 'glass'
                  ? '毛玻璃半透'
                  : '极简纯字通透'}{' '}
              · {prefs.hudDensity === 'compact' ? '老手极简胜率档' : '新手详尽解说档'}
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant="cyan">
              偏移 X:{prefs.hudOffsetX >= 0 ? `+${prefs.hudOffsetX}` : prefs.hudOffsetX}% / Y:
              {prefs.hudOffsetY >= 0 ? `+${prefs.hudOffsetY}` : prefs.hudOffsetY}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="relative h-48 bg-gradient-to-br from-[#0e1d33] via-[#091322] to-[#1a1429] flex items-center justify-center overflow-hidden p-4">
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 50%, rgba(10, 200, 185, 0.35), transparent 65%)'
            }}
          />
          <div
            style={{
              transform: `translate(${prefs.hudOffsetX * 3}px, ${prefs.hudOffsetY * 2}px) scale(${prefs.hudScale})`
            }}
            className="transition-transform duration-150 flex flex-col items-center gap-2"
          >
            {prefs.badgePosition === 'bottom' && (
              <div className="w-56 h-10 rounded border border-dashed border-primary/40 bg-black/35 flex items-center justify-center text-2xs text-muted-foreground">
                [ 游戏内海克斯卡片区域 ]
              </div>
            )}

            <div
              className={`w-68 rounded-xl px-3.5 py-2 border flex flex-col gap-1 transition-all ${previewCardSurface}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-accent text-accent-foreground text-2xs font-extrabold flex items-center gap-0.5">
                    <Crown className="size-3" />
                    首选
                  </span>
                  <span className="text-xs font-bold text-foreground">珠光护手</span>
                </div>
                <div className="tabular-nums">
                  <span className="font-extrabold text-sm text-foreground">56.8%</span>
                  <span className="ml-1 text-2xs font-semibold text-accent">+4.6%</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-2xs">
                <span className="font-semibold text-[#5cf2e5]">🔥 技能暴击核心神卡</span>
                <span className="text-2xs px-1.5 py-0.5 rounded bg-black/45 text-secondary-foreground">
                  配装: 无尽之刃
                </span>
              </div>
              {prefs.hudDensity === 'detailed' && (
                <div className="text-2xs text-[#c8c1b2] truncate">
                  技能可直接暴击，配合法爆与无尽中期一套秒脆皮
                </div>
              )}
            </div>

            {prefs.badgePosition === 'top' && (
              <div className="w-56 h-10 rounded border border-dashed border-primary/40 bg-black/35 flex items-center justify-center text-2xs text-muted-foreground">
                [ 游戏内海克斯卡片区域 ]
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>尺寸缩放、背景通透度与信息密度</CardTitle>
            <CardDescription>
              针对 2K/4K 大屏或 14 寸笔记本精细调节字号比例与界面遮挡程度。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                HUD 整体缩放比例（{Math.round(prefs.hudScale * 100)}%）
              </span>
              {prefs.hudScale !== 1 && (
                <Button variant="ghost" size="xs" onClick={() => onPatchPref({ hudScale: 1 })}>
                  恢复 100%
                </Button>
              )}
            </div>
            <Slider
              min={0.8}
              max={1.3}
              step={0.05}
              value={prefs.hudScale}
              onValueChange={(val) =>
                onPatchPref({ hudScale: Number((val as number).toFixed(2)) })
              }
            />
            <div className="flex justify-between text-2xs text-muted-foreground tabular-nums">
              <span>80% (紧凑小屏)</span>
              <span>100% (标准自适应)</span>
              <span>130% (高分屏大字)</span>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-medium text-foreground">背景不透明度档位</div>
              <p className="text-2xs text-muted-foreground">
                觉得背景太挡视野可切为毛玻璃或极简纯字模式
              </p>
            </div>
            <ToggleGroup
              value={[prefs.overlayOpacity]}
              onValueChange={(vals) => {
                const next = vals[0] as OverlayOpacityMode | undefined
                if (next) onPatchPref({ overlayOpacity: next })
              }}
            >
              <ToggleGroupItem value="solid">实心暗金</ToggleGroupItem>
              <ToggleGroupItem value="glass">毛玻璃半透</ToggleGroupItem>
              <ToggleGroupItem value="clear">极简通透</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-medium text-foreground">卡片信息精简度</div>
              <p className="text-2xs text-muted-foreground">
                熟悉海克斯后可切至老手极简档，仅保留评级、胜率与绑定核心装
              </p>
            </div>
            <ToggleGroup
              value={[prefs.hudDensity]}
              onValueChange={(vals) => {
                const next = vals[0] as HudDensityMode | undefined
                if (next) onPatchPref({ hudDensity: next })
              }}
            >
              <ToggleGroupItem value="detailed">新手详尽解说</ToggleGroupItem>
              <ToggleGroupItem value="compact">老手极简胜率</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-medium text-foreground">局内三选一贴标位置</div>
              <p className="text-2xs text-muted-foreground">
                上下两档均严格避开卡片中央标题识屏区，杜绝自我遮挡
              </p>
            </div>
            <ToggleGroup
              value={[prefs.badgePosition]}
              onValueChange={(vals) => {
                const next = vals[0] as 'top' | 'bottom' | undefined
                if (next) onPatchPref({ badgePosition: next })
              }}
            >
              <ToggleGroupItem value="top">卡片正上方 (默认)</ToggleGroupItem>
              <ToggleGroupItem value="bottom">卡片正下方</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>分阶段模块开关与坐标偏移微调</CardTitle>
            <CardDescription>
              按需开关各阶段提示条；默认自适应 16:9 / 16:10 / 21:9 全分辨率，仅在特殊窗口边框偏差时需微调。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg bg-[#10192b] border border-border flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-foreground">选人替补席头像贴标</div>
                <p className="text-2xs text-muted-foreground">10 槽替补英雄胜率与本命高亮</p>
              </div>
              <Switch
                checked={prefs.enableBenchBadges}
                onCheckedChange={(checked) => onPatchPref({ enableBenchBadges: checked })}
              />
            </div>

            <div className="p-3 rounded-lg bg-[#10192b] border border-border flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-foreground">局内三选一海克斯贴标</div>
                <p className="text-2xs text-muted-foreground">3/7/11/15 级原位首选与避坑</p>
              </div>
              <Switch
                checked={prefs.enableThreePickBadges}
                onCheckedChange={(checked) => onPatchPref({ enableThreePickBadges: checked })}
              />
            </div>

            <div className="p-3 rounded-lg bg-[#10192b] border border-border flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-foreground">阵亡泉水动态出装路线</div>
                <p className="text-2xs text-muted-foreground">阵亡逛商店自动展开针对装与复制</p>
              </div>
              <Switch
                checked={prefs.enableFountainStrip}
                onCheckedChange={(checked) => onPatchPref({ enableFountainStrip: checked })}
              />
            </div>

            <div className="p-3 rounded-lg bg-[#10192b] border border-border flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-foreground">切出游戏 (Alt+Tab) 自动隐藏</div>
                <p className="text-2xs text-muted-foreground">看桌面/浏览器时不遮挡视线</p>
              </div>
              <Switch
                checked={prefs.autoHideWhenUnfocused}
                onCheckedChange={(checked) => onPatchPref({ autoHideWhenUnfocused: checked })}
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                原位坐标偏移微调（横向 {prefs.hudOffsetX >= 0 ? `+${prefs.hudOffsetX}` : prefs.hudOffsetX}% ·
                纵向 {prefs.hudOffsetY >= 0 ? `+${prefs.hudOffsetY}` : prefs.hudOffsetY}%）
              </span>
              {(prefs.hudOffsetX !== 0 || prefs.hudOffsetY !== 0) && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onPatchPref({ hudOffsetX: 0, hudOffsetY: 0 })}
                >
                  重置归零
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground shrink-0 w-14">横向 X</span>
                <Slider
                  min={-8}
                  max={8}
                  step={0.5}
                  value={prefs.hudOffsetX}
                  onValueChange={(v) => onPatchPref({ hudOffsetX: v as number })}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground shrink-0 w-14">纵向 Y</span>
                <Slider
                  min={-8}
                  max={8}
                  step={0.5}
                  value={prefs.hudOffsetY}
                  onValueChange={(v) => onPatchPref({ hudOffsetY: v as number })}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
