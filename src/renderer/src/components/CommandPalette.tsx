import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookMarked,
  Compass,
  Copy,
  CornerDownLeft,
  Search,
  Settings,
  ShoppingBag
} from 'lucide-react'
import { matchesSearchQuery } from '@shared/pinyin'
import type {
  AugmentMeta,
  HeroMeta,
  ItemMeta,
  SettingsSectionId
} from '@shared/types'
import { RARITY_BADGE, RARITY_LABEL } from './HeroGuide'
import { TIER_STYLE } from './TierRadar'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  heroes: Record<string, HeroMeta>
  augments: Record<string, AugmentMeta>
  items: Record<string, ItemMeta>
  onSelectHero: (heroId: string) => void
  onSelectAugment: (augmentId: string) => void
  onSelectSetting: (section: SettingsSectionId) => void
  onCopyItem: (itemName: string) => void
}

type CommandEntry =
  | {
      kind: 'hero'
      id: string
      hero: HeroMeta
    }
  | {
      kind: 'augment'
      id: string
      augment: AugmentMeta
    }
  | {
      kind: 'item'
      id: string
      item: ItemMeta
    }
  | {
      kind: 'setting'
      id: string
      section: SettingsSectionId
      title: string
      subtitle: string
    }

const QUICK_SETTINGS_ENTRIES: Array<{
  section: SettingsSectionId
  title: string
  subtitle: string
  keywords: string
}> = [
  {
    section: 'hud',
    title: 'HUD 缩放、透明度与微调校准',
    subtitle: '调整 80%~130% 字号倍率、毛玻璃/通透模式与上下贴标位置',
    keywords: 'hud suofang toumingdu pianyi 缩放 透明 偏移 校准 贴标'
  },
  {
    section: 'hotkeys',
    title: '全局快捷键录制与 OCR 识屏引擎',
    subtitle: '可视化绑定 Alt+H / Alt+S / Alt+M 并检测热键冲突',
    keywords: 'hotkey kuaijiejian ocr shiping 快捷键 热键 识屏 冲突'
  },
  {
    section: 'general',
    title: '开机静默自启、托盘休眠与 WeGame 管理员权限',
    subtitle: '管理低内存休眠、配置备份导入导出与恢复出厂设置',
    keywords: 'wegame admin tuopan kaiji beifen 自启 托盘 内存 权限 备份 重置'
  },
  {
    section: 'data',
    title: '开局默认心态、前 5% 高玩分段与缓存清理',
    subtitle: '设置每局默认稳健/独爽/折磨心态及大乱斗数据集口径',
    keywords: 'data xintai gaowan huancun 心态 高玩 分段 缓存 剪贴板'
  },
  {
    section: 'ai',
    title: 'AI 战局一句话锦囊与连通测速',
    subtitle: '配置 DeepSeek / 硅基流动 / 通义千问 / Ollama 与毒舌/保姆风格',
    keywords: 'ai llm deepseek ollama key 锦囊 模型 测速'
  },
  {
    section: 'about',
    title: '在线版本升级与环境健康度诊断',
    subtitle: '检查新版本、查看中文更新日志与导出脱敏排障摘要',
    keywords: 'update version log zhenduan 更新 升级 版本 日志 诊断'
  }
]

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  heroes,
  augments,
  items,
  onSelectHero,
  onSelectAugment,
  onSelectSetting,
  onCopyItem
}) => {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  const results = useMemo<CommandEntry[]>(() => {
    const q = query.trim()

    if (!q) {
      const topHeroes = Object.values(heroes)
        .sort((a, b) => b.smoothedWinRate - a.smoothedWinRate)
        .slice(0, 5)
        .map((hero): CommandEntry => ({ kind: 'hero', id: `hero-${hero.id}`, hero }))

      const quickSettings = QUICK_SETTINGS_ENTRIES.slice(0, 4).map(
        (s): CommandEntry => ({
          kind: 'setting',
          id: `set-${s.section}`,
          section: s.section,
          title: s.title,
          subtitle: s.subtitle
        })
      )
      return [...quickSettings, ...topHeroes]
    }

    const matchedSettings: CommandEntry[] = QUICK_SETTINGS_ENTRIES.filter((s) =>
      matchesSearchQuery(q, {
        name: `${s.title} ${s.subtitle}`,
        pinyinFull: s.keywords,
        pinyinInitials: s.keywords
      })
    ).map((s) => ({
      kind: 'setting',
      id: `set-${s.section}`,
      section: s.section,
      title: s.title,
      subtitle: s.subtitle
    }))

    const matchedHeroes: CommandEntry[] = Object.values(heroes)
      .filter((h) =>
        matchesSearchQuery(q, {
          name: `${h.name} ${h.title} ${h.alias}`,
          pinyinFull: h.pinyinFull,
          pinyinInitials: h.pinyinInitials
        })
      )
      .sort((a, b) => b.smoothedWinRate - a.smoothedWinRate)
      .slice(0, 8)
      .map((hero) => ({ kind: 'hero', id: `hero-${hero.id}`, hero }))

    const matchedAugments: CommandEntry[] = Object.values(augments)
      .filter((a) =>
        matchesSearchQuery(q, {
          name: a.name,
          pinyinFull: a.pinyinFull,
          pinyinInitials: a.pinyinInitials,
          extraKeywords: a.desc
        })
      )
      .slice(0, 8)
      .map((augment) => ({ kind: 'augment', id: `aug-${augment.id}`, augment }))

    const ql = q.toLowerCase()
    const matchedItems: CommandEntry[] = Object.values(items)
      .filter(
        (im) =>
          im.totalGold >= 1000 &&
          (im.name.toLowerCase().includes(ql) || im.brief.toLowerCase().includes(ql))
      )
      .slice(0, 6)
      .map((item) => ({ kind: 'item', id: `item-${item.id}`, item }))

    return [...matchedHeroes, ...matchedAugments, ...matchedItems, ...matchedSettings].slice(0, 18)
  }, [query, heroes, augments, items])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const executeEntry = (entry: CommandEntry | undefined): void => {
    if (!entry) return
    onOpenChange(false)
    if (entry.kind === 'hero') {
      onSelectHero(entry.hero.id)
    } else if (entry.kind === 'augment') {
      onSelectAugment(entry.augment.id)
    } else if (entry.kind === 'setting') {
      onSelectSetting(entry.section)
    } else if (entry.kind === 'item') {
      onCopyItem(entry.item.name)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) =>
        results.length === 0 ? 0 : (prev - 1 + results.length) % results.length
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executeEntry(results[activeIndex])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-xl p-0">
        <DialogTitle className="sr-only">全局速查命令面板</DialogTitle>
        <DialogDescription className="sr-only">
          输入中文或拼音首字母快速检索英雄攻略、海克斯符文、装备名称或设置项
        </DialogDescription>

        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border bg-[#09101d]">
          <Search className="size-4 text-primary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="秒搜英雄 / 海克斯 / 装备 / 设置项（支持拼音首字母，如 gl、zghs、热键）..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none select-text"
          />
          <Badge variant="outline">Esc 关闭</Badge>
        </div>

        <div className="max-h-96 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {results.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              未找到与「{query}」匹配的英雄、海克斯、装备或设置项
            </div>
          ) : (
            results.map((entry, idx) => {
              const selected = idx === activeIndex
              return (
                <button
                  key={entry.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => executeEntry(entry)}
                  className={`w-full rounded-md px-3 py-2 flex items-center justify-between gap-3 text-left cursor-pointer transition ${
                    selected ? 'bg-[#17263e] text-foreground' : 'text-[#c8c1b2] hover:bg-[#111b2c]'
                  }`}
                >
                  {entry.kind === 'hero' && (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={entry.hero.avatarUrl}
                          alt=""
                          className="size-7 rounded border border-primary/40 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <span className="truncate">{entry.hero.name}</span>
                            <span
                              className={`text-2xs px-1 rounded border ${
                                TIER_STYLE[entry.hero.tier]
                              }`}
                            >
                              {entry.hero.tier}
                            </span>
                          </div>
                          <div className="text-2xs text-muted-foreground truncate">
                            {entry.hero.title} · 胜率 {(entry.hero.smoothedWinRate * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary">
                        <Compass />
                        英雄图鉴
                      </Badge>
                    </>
                  )}

                  {entry.kind === 'augment' && (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        {entry.augment.iconUrl ? (
                          <img
                            src={entry.augment.iconUrl}
                            alt=""
                            className="size-7 rounded bg-black/50 p-0.5 border border-white/15 shrink-0"
                          />
                        ) : (
                          <div className="size-7 rounded bg-black/40 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <span className="truncate">{entry.augment.name}</span>
                            <span
                              className={`text-2xs px-1 rounded border ${
                                RARITY_BADGE[entry.augment.rarity]
                              }`}
                            >
                              {RARITY_LABEL[entry.augment.rarity]}
                            </span>
                          </div>
                          <div className="text-2xs text-muted-foreground truncate">
                            {entry.augment.desc}
                          </div>
                        </div>
                      </div>
                      <Badge variant="cyan">
                        <BookMarked />
                        海克斯反查
                      </Badge>
                    </>
                  )}

                  {entry.kind === 'item' && (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={entry.item.iconUrl}
                          alt=""
                          className="size-7 rounded border border-primary/35 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <span className="truncate">{entry.item.name}</span>
                            <span className="text-2xs text-secondary-foreground tabular-nums">
                              {entry.item.totalGold}金
                            </span>
                          </div>
                          <div className="text-2xs text-muted-foreground truncate">
                            {entry.item.brief || '回车一键复制名称用于商店搜索'}
                          </div>
                        </div>
                      </div>
                      <Badge variant="default">
                        <Copy />
                        复制装备名
                      </Badge>
                    </>
                  )}

                  {entry.kind === 'setting' && (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-7 rounded bg-[#101c30] border border-border flex items-center justify-center shrink-0 text-primary">
                          <Settings className="size-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">
                            {entry.title}
                          </div>
                          <div className="text-2xs text-muted-foreground truncate">
                            {entry.subtitle}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline">跳转设置</Badge>
                    </>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="px-3.5 py-2 border-t border-border bg-[#090f1a] flex items-center justify-between text-2xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>↑↓ 选择条目</span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="size-3" /> 回车直达 / 复制
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <ShoppingBag className="size-3 text-primary" /> 支持全拼与首字母检索
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
