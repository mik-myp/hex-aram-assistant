import React, { useMemo, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import type {
  CacheStatsInfo,
  DatasetMetadata,
  HeroRole,
  PlaystyleMode,
  UserPreferences
} from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const ROLE_OPTIONS: Array<{ key: HeroRole; label: string }> = [
  { key: 'mage', label: '法师' },
  { key: 'marksman', label: '射手' },
  { key: 'fighter', label: '战士' },
  { key: 'tank', label: '坦克' },
  { key: 'assassin', label: '刺客' },
  { key: 'support', label: '辅助' }
]

const MINDSET_OPTIONS: Array<{ key: PlaystyleMode; label: string }> = [
  { key: 'steady', label: '⚖️ 稳健上分' },
  { key: 'counter', label: '🎯 针对大爹' },
  { key: 'team', label: '🤝 团队补位' },
  { key: 'yolo', label: '🔥 只顾独爽' },
  { key: 'torment', label: '😈 不死折磨' }
]

function formatBytesToMb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

interface StrategyDataSectionProps {
  prefs: UserPreferences
  meta: DatasetMetadata
  cacheStats: CacheStatsInfo | null
  syncing: boolean
  onPatchPref: (patch: Partial<UserPreferences>) => Promise<void>
  onSwitchDataset: (path: string, band: 'all' | 'high') => void
  onSyncNow: () => void
  onRefreshCacheStats: (stats: CacheStatsInfo, meta: DatasetMetadata) => void
  onNotify: (msg: string) => void
}

export const StrategyDataSection: React.FC<StrategyDataSectionProps> = ({
  prefs,
  meta,
  cacheStats,
  syncing,
  onPatchPref,
  onSwitchDataset,
  onSyncNow,
  onRefreshCacheStats,
  onNotify
}) => {
  const [clearingCache, setClearingCache] = useState(false)

  const datasetItems = useMemo(() => {
    const avail = meta.availableDatasets || []
    if (avail.length === 0) {
      const fallbackPath = `patches/${meta.patch}/${meta.mode}`
      return [{ value: fallbackPath, label: `${meta.patch} 版本 · ${meta.modeLabel}` }]
    }
    return avail.map((ds) => ({
      value: ds.path,
      label: `${ds.patch} 版本 · ${ds.modeLabel}（${ds.matchesValid.toLocaleString()} 场）`
    }))
  }, [meta])

  const currentDatasetPath =
    meta.availableDatasets?.find((d) => d.patch === meta.patch && d.mode === meta.mode)?.path ||
    datasetItems[0]?.value ||
    `patches/${meta.patch}/${meta.mode}`

  return (
    <>
      <div>
        <h1 className="text-base font-bold text-foreground">攻略偏好、分段口径与本地缓存</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          定制你的开局默认出装心态、选人替补席常玩定位加权，以及统计数据分段与缓存空间。
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>个人打法心态与常玩英雄定位</CardTitle>
            <CardDescription>
              每局进入选人界面时自动重置为你的默认初始心态，局内仍可随时临时切换。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground">每局默认开局心态</span>
            <ToggleGroup
              className="flex-wrap"
              value={[prefs.defaultPlaystyle]}
              onValueChange={(vals) => {
                const next = vals[0] as PlaystyleMode | undefined
                if (next) onPatchPref({ defaultPlaystyle: next })
              }}
            >
              {MINDSET_OPTIONS.map((m) => (
                <ToggleGroupItem key={m.key} value={m.key}>
                  {m.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground">
              选人替补席 · 我的常玩定位加权（多选，替补席出现时优先提分）
            </span>
            <ToggleGroup
              multiple
              className="flex-wrap"
              value={prefs.preferredRoles}
              onValueChange={(vals) => onPatchPref({ preferredRoles: vals as HeroRole[] })}
            >
              {ROLE_OPTIONS.map((ro) => (
                <ToggleGroupItem key={ro.key} value={ro.key}>
                  {ro.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-foreground">
                泉水点击复制装备名后，10 秒自动还原原剪贴板内容
              </div>
              <p className="text-2xs text-muted-foreground mt-0.5">
                方便商店 Ctrl+V 搜完装备后不覆盖你原先复制的聊天文字或链接
              </p>
            </div>
            <Switch
              checked={prefs.restoreClipboardAfterCopy}
              onCheckedChange={(checked) => onPatchPref({ restoreClipboardAfterCopy: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>大乱斗统计数据源与分段口径</CardTitle>
            <CardDescription>
              当前生效：{meta.patch} · {meta.modeLabel}（{meta.matchesValid.toLocaleString()}{' '}
              场有效对局 · 序列 #{meta.seq}）
            </CardDescription>
          </div>
          <CardAction>
            <Button variant="secondary" size="sm" disabled={syncing} onClick={onSyncNow}>
              <RefreshCw
                data-icon="inline-start"
                className={syncing ? 'animate-spin text-accent' : 'text-primary'}
              />
              {syncing ? '正在同步...' : '检查数据热更'}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-56">
              <Select
                items={datasetItems}
                value={currentDatasetPath}
                onValueChange={(val) => {
                  if (val) onSwitchDataset(val as string, meta.activeBand)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {datasetItems.map((ds) => (
                      <SelectItem key={ds.value} value={ds.value}>
                        {ds.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {meta.bandsAvailable && (
              <ToggleGroup
                value={[meta.activeBand]}
                onValueChange={(vals) => {
                  const nextBand = vals[0] as 'all' | 'high' | undefined
                  if (nextBand && nextBand !== meta.activeBand) {
                    onSwitchDataset(currentDatasetPath, nextBand)
                  }
                }}
              >
                <ToggleGroupItem value="all">全体玩家样本</ToggleGroupItem>
                <ToggleGroupItem value="high">前 5% 高玩样本</ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-foreground">
                软件启动且空闲时自动静默检查最新胜率热更包
              </div>
              <p className="text-2xs text-muted-foreground mt-0.5">
                自动补齐新补丁英雄/海克斯图标与描述；若已在游戏对局中则自动跳过不抢网速
              </p>
            </div>
            <Switch
              checked={prefs.autoSyncDataOnBoot}
              onCheckedChange={(checked) => onPatchPref({ autoSyncDataOnBoot: checked })}
            />
          </div>
        </CardContent>
        <CardFooter>
          <span className="text-2xs text-muted-foreground tabular-nums">
            本地缓存占用：共 {cacheStats ? formatBytesToMb(cacheStats.totalBytes) : '...'}{' '}
            {cacheStats
              ? `（图标缓存 ${formatBytesToMb(cacheStats.chromiumCacheBytes)} · 热更快照 ${formatBytesToMb(cacheStats.bundleBytes)}）`
              : ''}
          </span>
          <Button
            variant="outline"
            size="xs"
            disabled={clearingCache}
            onClick={async () => {
              setClearingCache(true)
              const res = await window.hexbuddy.clearLocalCache()
              onRefreshCacheStats(res.stats, res.meta)
              onNotify(res.message)
              setClearingCache(false)
            }}
          >
            <Trash2 data-icon="inline-start" />
            一键清理本地缓存
          </Button>
        </CardFooter>
      </Card>
    </>
  )
}
