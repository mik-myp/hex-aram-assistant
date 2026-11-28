import React, { useEffect, useState } from 'react'
import { Clock, History, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import type {
  AugmentMeta,
  HeroMeta,
  ItemMeta,
  LocalMatchHistorySummary,
  PlaystyleMode
} from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface MatchHistoryViewProps {
  heroes: Record<string, HeroMeta>
  augments: Record<string, AugmentMeta>
  items: Record<string, ItemMeta>
  onJumpToHero: (heroId: string) => void
  onJumpToAugment: (augmentId: string) => void
  onNotify: (msg: string) => void
}

const MODE_LABELS: Record<PlaystyleMode, string> = {
  steady: '⚖️ 稳健',
  counter: '🎯 针对',
  team: '🤝 团队',
  yolo: '🔥 独爽',
  torment: '😈 折磨'
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}分${s.toString().padStart(2, '0')}秒` : `${s}秒`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

export const MatchHistoryView: React.FC<MatchHistoryViewProps> = ({
  heroes,
  augments,
  items,
  onJumpToHero,
  onJumpToAugment,
  onNotify
}) => {
  const [summary, setSummary] = useState<LocalMatchHistorySummary | null>(null)
  const [loading, setLoading] = useState(true)

  const loadHistory = async (): Promise<void> => {
    setLoading(true)
    const data = await window.hexbuddy.getMatchHistorySummary()
    setSummary(data)
    setLoading(false)
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const handleClear = async (): Promise<void> => {
    const empty = await window.hexbuddy.clearMatchHistory()
    setSummary(empty)
    onNotify('已清空纯本地对局战绩本')
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-5xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-base font-bold text-foreground flex items-center gap-2">
              <History className="size-4 text-accent" />
              个人海克斯战绩本（100% 纯本地存储）
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              每局海克斯大乱斗结束自动归档本局英雄、海克斯组合与最终成装，零云端上传，保留最近 100 局。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={loadHistory} disabled={loading}>
              <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} />
              刷新
            </Button>
            {summary && summary.totalMatches > 0 && (
              <Button variant="outline" size="sm" onClick={handleClear}>
                <Trash2 data-icon="inline-start" className="text-rose-400" />
                清空记录
              </Button>
            )}
          </div>
        </div>

        {summary && summary.totalMatches > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span>近期常玩英雄（累计 {summary.totalMatches} 局）</span>
                    {summary.decidedMatches > 0 && (
                      <Badge variant="outline" className="tabular-nums text-accent border-accent/40">
                        {summary.wins}胜 {summary.losses}负 ·{' '}
                        {Math.round((summary.wins / summary.decidedMatches) * 100)}%
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>点击英雄头像直接查看对应海斗攻略</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {summary.topHeroes.map((row) => {
                    const h = heroes[row.heroId]
                    if (!h) return null
                    const wr =
                      row.decided > 0 ? Math.round((row.wins / row.decided) * 100) : null
                    return (
                      <button
                        key={row.heroId}
                        type="button"
                        onClick={() => onJumpToHero(row.heroId)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#10192b] hover:bg-[#17263e] border border-border cursor-pointer transition"
                      >
                        <img src={h.avatarUrl} alt="" className="size-6 rounded-full" />
                        <span className="text-xs font-semibold text-foreground">{h.name}</span>
                        <Badge variant="secondary">
                          {row.count}局{wr !== null ? ` · ${wr}%` : ''}
                        </Badge>
                      </button>
                    )
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>最常拿海克斯 Top</CardTitle>
                  <CardDescription>点击卡片跳转海克斯百科反查最强适配英雄</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {summary.topAugments.length > 0 ? (
                    summary.topAugments.map((row) => {
                      const am = augments[row.augmentId]
                      if (!am) return null
                      const wr =
                        row.decided > 0 ? Math.round((row.wins / row.decided) * 100) : null
                      return (
                        <button
                          key={row.augmentId}
                          type="button"
                          onClick={() => onJumpToAugment(row.augmentId)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#10192b] hover:bg-[#17263e] border border-primary/30 cursor-pointer transition text-xs"
                        >
                          {am.iconUrl && <img src={am.iconUrl} alt="" className="size-4 rounded" />}
                          <span className="text-foreground font-medium">{am.name}</span>
                          <span className="text-[10px] text-accent font-bold tabular-nums">
                            ×{row.count}
                            {wr !== null ? ` (${wr}%)` : ''}
                          </span>
                        </button>
                      )
                    })
                  ) : (
                    <span className="text-xs text-muted-foreground">暂无已记录海克斯</span>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-2.5">
              {summary.records.map((rec) => {
                const h = heroes[rec.heroId]
                return (
                  <Card key={rec.id} className="hover:border-primary/40 transition">
                    <CardContent className="py-3 px-4 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-44">
                        {h ? (
                          <button
                            type="button"
                            onClick={() => onJumpToHero(rec.heroId)}
                            className="flex items-center gap-2.5 text-left cursor-pointer"
                          >
                            <img
                              src={h.avatarUrl}
                              alt=""
                              className="size-10 rounded-lg border border-primary/45"
                            />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-foreground">{h.name}</span>
                                {rec.result === 'win' && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-bold">
                                    胜
                                  </span>
                                )}
                                {rec.result === 'loss' && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-400/40 text-[10px] font-bold">
                                    负
                                  </span>
                                )}
                              </div>
                              <div className="text-2xs text-muted-foreground flex items-center gap-1.5 tabular-nums">
                                <span>Lv.{rec.finalLevel}</span>
                                {rec.kills !== undefined &&
                                  rec.deaths !== undefined &&
                                  rec.assists !== undefined && (
                                    <>
                                      <span>·</span>
                                      <span className="text-foreground/90 font-medium">
                                        {rec.kills}/{rec.deaths}/{rec.assists}
                                      </span>
                                    </>
                                  )}
                                <span>·</span>
                                <span>{MODE_LABELS[rec.playstyleMode] || rec.playstyleMode}</span>
                              </div>
                            </div>
                          </button>
                        ) : (
                          <span className="text-xs text-foreground">英雄 #{rec.heroId}</span>
                        )}
                      </div>

                      <div className="flex-1 flex flex-wrap items-center gap-1.5">
                        {rec.pickedAugmentIds.length > 0 ? (
                          rec.pickedAugmentIds.map((aid) => {
                            const am = augments[aid]
                            if (!am) return null
                            return (
                              <button
                                key={aid}
                                type="button"
                                onClick={() => onJumpToAugment(aid)}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-[#0c1626] hover:bg-[#17263e] border border-accent/35 text-xs cursor-pointer transition"
                              >
                                {am.iconUrl && (
                                  <img src={am.iconUrl} alt="" className="size-4 rounded" />
                                )}
                                <span className="text-[#f0e6d2]">{am.name}</span>
                              </button>
                            )
                          })
                        ) : (
                          <span className="text-2xs text-muted-foreground">未记录海克斯</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {rec.finalItemIds.slice(0, 6).map((iid, idx) => {
                          const im = items[iid]
                          if (!im) return null
                          return (
                            <img
                              key={`${iid}-${idx}`}
                              src={im.iconUrl}
                              alt={im.name}
                              title={im.name}
                              className="size-7 rounded border border-white/15"
                            />
                          )
                        })}
                      </div>

                      <div className="text-right text-2xs text-muted-foreground tabular-nums shrink-0">
                        <div className="flex items-center justify-end gap-1 text-[#c8c1b2]">
                          <Clock className="size-3" />
                          <span>{formatDuration(rec.durationSec)}</span>
                        </div>
                        <div>{formatDate(rec.endedAt)}</div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 flex flex-col items-center justify-center text-center gap-2.5">
              <Sparkles className="size-8 text-primary/70" />
              <div className="text-sm font-semibold text-foreground">还没有本地对局记录</div>
              <p className="text-xs text-muted-foreground max-w-md">
                正常开启英雄联盟打完一局海克斯大乱斗后，HexBuddy 会自动把你的英雄、海克斯组合与成装归档到本机{' '}
                <code className="text-foreground">match-history.json</code>，方便随时复盘常用套路。
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
