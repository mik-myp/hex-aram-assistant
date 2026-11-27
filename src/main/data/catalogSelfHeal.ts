import { toPinyinIndex } from '@shared/pinyin'
import type {
  AugmentMeta,
  HeroMeta,
  HeroRole,
  ItemMeta,
  SeedBundle,
  TierGrade
} from '@shared/types'
import { logDiag } from '../logger/diagLogger'

export function computeTierFromSorted(
  smoothedWr: number,
  pickRate: number,
  sortedDesc: number[]
): TierGrade {
  const idx = sortedDesc.findIndex((w) => smoothedWr >= w)
  const pct = idx === -1 ? 1 : idx / Math.max(1, sortedDesc.length)
  const adjusted = pct - (pickRate > 0.01 ? 0.03 : 0)
  if (adjusted <= 0.12) return 'T0'
  if (adjusted <= 0.3) return 'T1'
  if (adjusted <= 0.62) return 'T2'
  if (adjusted <= 0.85) return 'T3'
  return 'T4'
}

export function cleanRiotDescText(raw: string): string {
  return (raw || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/@[^@]+@/g, '')
    .replace(/%i:[^%]+%/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface RawHeroRow {
  name: string
  title: string
  games: number
  wins: number
  win_rate: number
  pick_rate: number
  rank: number
}

export interface RawAugmentRow {
  name: string
  rarity: 'silver' | 'gold' | 'prismatic'
}

export interface RawCoreBuildRow {
  items: string[]
  ordered?: boolean
  games: number
  wins: number
  win?: number
  pick?: number
}

export function mapRawDatasetTables(params: {
  refBundle: SeedBundle
  rawHeroes: Record<string, RawHeroRow>
  rawAugments: Record<string, RawAugmentRow>
  rawHeroAugments: Record<string, Record<string, { games: number; wins: number; low_sample?: boolean }>>
  rawCoreBuilds: Record<string, RawCoreBuildRow[]>
}): {
  heroes: Record<string, HeroMeta>
  augments: Record<string, AugmentMeta>
  heroAugments: SeedBundle['heroAugments']
  coreBuilds: SeedBundle['coreBuilds']
} {
  const { refBundle, rawHeroes, rawAugments, rawHeroAugments, rawCoreBuilds } = params
  const sortedWr = Object.values(rawHeroes)
    .map((h) => (h.wins + 150) / (h.games + 300))
    .sort((a, b) => b - a)

  const heroes: Record<string, HeroMeta> = {}
  for (const [id, h] of Object.entries(rawHeroes)) {
    const prev = refBundle.heroes[id]
    const swr = Number(((h.wins + 150) / (h.games + 300)).toFixed(5))
    const py = prev
      ? { full: prev.pinyinFull, initials: prev.pinyinInitials }
      : toPinyinIndex(`${h.name}${h.title}`)
    heroes[id] = {
      id,
      alias: prev?.alias || `Hero${id}`,
      name: h.name,
      title: h.title,
      roles: prev?.roles || ['fighter'],
      damageType: prev?.damageType || 'MIXED',
      avatarUrl: prev?.avatarUrl || '',
      games: h.games,
      wins: h.wins,
      winRate: h.win_rate,
      smoothedWinRate: swr,
      pickRate: h.pick_rate,
      rank: h.rank,
      tier: computeTierFromSorted(swr, h.pick_rate, sortedWr),
      skillOrder: prev?.skillOrder,
      topShoes: prev?.topShoes,
      pinyinFull: py.full,
      pinyinInitials: py.initials
    }
  }

  const augments: Record<string, AugmentMeta> = { ...refBundle.augments }
  for (const [id, aug] of Object.entries(rawAugments)) {
    const prev = refBundle.augments[id]
    const py = prev ? { full: prev.pinyinFull, initials: prev.pinyinInitials } : toPinyinIndex(aug.name)
    augments[id] = {
      id,
      name: aug.name,
      rarity: prev?.rarity || aug.rarity,
      desc: prev?.desc || aug.name,
      iconUrl: prev?.iconUrl || '',
      tags: prev?.tags || ['general'],
      pinyinFull: py.full,
      pinyinInitials: py.initials
    }
  }

  const heroAugments: SeedBundle['heroAugments'] = {}
  for (const [heroId, augMap] of Object.entries(rawHeroAugments)) {
    heroAugments[heroId] = Object.entries(augMap)
      .filter(([, st]) => st.games >= 15)
      .map(([augId, st]) => [augId, st.games, st.wins, st.low_sample ? 1 : 0])
  }

  const coreBuilds: SeedBundle['coreBuilds'] = {}
  for (const [heroId, list] of Object.entries(rawCoreBuilds)) {
    coreBuilds[heroId] = (list || []).slice(0, 3).map((b) => ({
      items: b.items,
      ordered: Boolean(b.ordered),
      games: b.games,
      winRate: Number((b.win ?? b.wins / Math.max(1, b.games)).toFixed(4)),
      pickRate: Number((b.pick ?? 0).toFixed(4))
    }))
  }

  return { heroes, augments, heroAugments, coreBuilds }
}

export async function selfHealMissingCatalogEntries(params: {
  heroes: Record<string, HeroMeta>
  augments: Record<string, AugmentMeta>
  items: Record<string, ItemMeta>
  referencedItemIds: Set<string>
}): Promise<void> {
  const { heroes, augments, items, referencedItemIds } = params

  const missingHeroes = Object.values(heroes).some(
    (h) => !h.avatarUrl || h.alias.startsWith('Hero')
  )
  const missingAugments = Object.values(augments).some((a) => !a.iconUrl || a.desc === a.name)
  const missingItems = [...referencedItemIds].some((id) => id && id !== '0' && !items[id])

  const tasks: Promise<void>[] = []

  if (missingHeroes) {
    tasks.push(
      fetch('https://game.gtimg.cn/images/lol/act/img/js/heroList/hero_list.js', {
        signal: AbortSignal.timeout(8000)
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ hero?: Array<Record<string, unknown>> }>) : null))
        .then((data) => {
          if (!data?.hero) return
          for (const gh of data.hero) {
            const hid = String(gh.heroId || '')
            const target = heroes[hid]
            if (!target || (target.avatarUrl && !target.alias.startsWith('Hero'))) continue
            const alias = String(gh.alias || target.alias)
            const roles = (Array.isArray(gh.roles) ? gh.roles : ['fighter']) as HeroRole[]
            target.alias = alias
            target.roles = roles
            target.avatarUrl = `https://game.gtimg.cn/images/lol/act/img/champion/${alias}.png`
          }
          logDiag('SYNC', 'Auto-healed new champion metadata from game.gtimg.cn')
        })
        .catch(() => {})
    )
  }

  if (missingAugments) {
    tasks.push(
      fetch('https://game.gtimg.cn/images/lol/act/img/js/kiwi_augments/kiwi_augments.json', {
        signal: AbortSignal.timeout(8000)
      })
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ augments?: Record<string, Record<string, unknown>> }>)
            : null
        )
        .then((data) => {
          const map = data?.augments
          if (!map) return
          for (const [aid, raw] of Object.entries(map)) {
            const target = augments[aid]
            if (!target) continue
            if (target.desc === target.name && typeof raw.desc === 'string') {
              target.desc = cleanRiotDescText(raw.desc) || target.name
            }
            if (!target.iconUrl && typeof raw.augmentSmallIconPath === 'string') {
              const rel = raw.augmentSmallIconPath
                .toLowerCase()
                .replace(/^\/lol-game-data\/assets\//, '')
              target.iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${rel}`
            }
          }
          logDiag('SYNC', 'Auto-healed new augment icons/descriptions from game.gtimg.cn')
        })
        .catch(() => {})
    )
  }

  if (missingItems) {
    tasks.push(
      fetch('https://game.gtimg.cn/images/lol/act/img/js/items/items.js', {
        signal: AbortSignal.timeout(8000)
      })
        .then((r) =>
          r.ok ? (r.json() as Promise<{ items?: Array<Record<string, unknown>> }>) : null
        )
        .then((data) => {
          if (!data?.items) return
          for (const it of data.items) {
            const iid = String(it.itemId || '')
            if (!iid || items[iid] || !referencedItemIds.has(iid)) continue
            const name = String(it.name || `装备${iid}`)
            const plain = cleanRiotDescText(String(it.plaintext || ''))
            const desc = cleanRiotDescText(String(it.description || ''))
            items[iid] = {
              id: iid,
              name,
              iconUrl:
                typeof it.iconPath === 'string' && it.iconPath
                  ? it.iconPath
                  : `https://game.gtimg.cn/images/lol/act/img/item/${iid}.png`,
              category: 'other',
              types: Array.isArray(it.types) ? (it.types as string[]) : [],
              totalGold: Number(it.price || 2500),
              brief: plain || desc.slice(0, 36),
              fullDesc: desc || plain
            }
          }
          logDiag('SYNC', 'Auto-healed new patch items from game.gtimg.cn')
        })
        .catch(() => {})
    )
  }

  if (tasks.length > 0) {
    await Promise.all(tasks)
  }
}
