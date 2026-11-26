import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { app } from 'electron'
import { toPinyinIndex } from '@shared/pinyin'
import type {
  AugmentMeta,
  DatasetMetadata,
  DatasetOption,
  HeroMeta,
  SeedBundle,
  TierGrade
} from '@shared/types'

const MIRROR_BASES: Array<{ source: 'mirror' | 'github'; baseUrl: string }> = [
  { source: 'mirror', baseUrl: 'https://cdn.jsdelivr.net/gh/czgreat/aramhex-data@main' },
  { source: 'mirror', baseUrl: 'https://fastly.jsdelivr.net/gh/czgreat/aramhex-data@main' },
  { source: 'github', baseUrl: 'https://raw.githubusercontent.com/czgreat/aramhex-data/main' }
]

function sha256Hex(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function resolveBundledSeedPath(): string {
  const prodPath = resolve(process.resourcesPath || '', 'seed-data/seed-bundle.json')
  if (existsSync(prodPath)) return prodPath
  const devPath = resolve(app.getAppPath(), 'resources/seed-data/seed-bundle.json')
  if (existsSync(devPath)) return devPath
  return resolve(process.cwd(), 'resources/seed-data/seed-bundle.json')
}

function resolveCachedBundlePath(): string {
  return resolve(app.getPath('userData'), 'cached-seed-bundle-v2.json')
}

function computeTierFromSorted(smoothedWr: number, pickRate: number, sortedDesc: number[]): TierGrade {
  const idx = sortedDesc.findIndex((w) => smoothedWr >= w)
  const pct = idx === -1 ? 1 : idx / Math.max(1, sortedDesc.length)
  const adjusted = pct - (pickRate > 0.01 ? 0.03 : 0)
  if (adjusted <= 0.12) return 'T0'
  if (adjusted <= 0.30) return 'T1'
  if (adjusted <= 0.62) return 'T2'
  if (adjusted <= 0.85) return 'T3'
  return 'T4'
}

interface RemoteLatestManifest {
  patch: string
  mode: string
  mode_label?: string
  bands?: boolean
  seq: number
  matches: number
  snapshot_at: string
  path: string
  files?: Record<string, { sha256: string; size: number }>
}

interface RemoteIndexManifest {
  datasets?: Array<{
    patch: string
    mode: string
    mode_label?: string
    path: string
    bands?: boolean
    matches?: number
    matches_detail?: { valid?: number }
    snapshot_at?: string
    files?: Record<string, { sha256: string; size: number }>
  }>
}

export class DataSyncService {
  private bundle: SeedBundle | null = null
  private baseBundled: SeedBundle | null = null

  async init(): Promise<SeedBundle> {
    const bundledPath = resolveBundledSeedPath()
    const cachedPath = resolveCachedBundlePath()

    let bundled: SeedBundle | null = null
    let cached: SeedBundle | null = null

    if (existsSync(bundledPath)) {
      try {
        bundled = JSON.parse(await readFile(bundledPath, 'utf-8')) as SeedBundle
        this.baseBundled = bundled
      } catch (err) {
        console.warn('[DataSync] Failed to parse bundled seed:', err)
      }
    }

    if (existsSync(cachedPath)) {
      try {
        cached = JSON.parse(await readFile(cachedPath, 'utf-8')) as SeedBundle
      } catch (err) {
        console.warn('[DataSync] Failed to parse cached seed:', err)
      }
    }

    if (cached && (!bundled || cached.meta.seq >= bundled.meta.seq)) {
      this.bundle = {
        ...cached,
        meta: { ...cached.meta, fromSource: 'cache' }
      }
    } else if (bundled) {
      this.bundle = bundled
    } else {
      throw new Error('未找到内置种子数据包，请先执行 pnpm fetch-seed')
    }

    return this.bundle
  }

  getBundle(): SeedBundle {
    if (!this.bundle) {
      throw new Error('DataSyncService 尚未初始化')
    }
    return this.bundle
  }

  getMeta(): DatasetMetadata {
    return this.getBundle().meta
  }

  private async pickMirror(): Promise<{ source: 'mirror' | 'github'; baseUrl: string } | null> {
    for (const candidate of MIRROR_BASES) {
      try {
        const res = await fetch(`${candidate.baseUrl}/latest.json`, {
          signal: AbortSignal.timeout(8000),
          headers: { 'Cache-Control': 'no-cache' }
        })
        if (res.ok) return candidate
      } catch {
        // try next
      }
    }
    return null
  }

  async switchDataset(
    datasetPath: string,
    band: 'all' | 'high' = 'all'
  ): Promise<{ ok: boolean; meta: DatasetMetadata; message: string }> {
    const current = this.getBundle()

    // Fast path: if switching back to bundled default normal mode 'all'
    if (
      this.baseBundled &&
      datasetPath === `patches/${this.baseBundled.meta.patch}/${this.baseBundled.meta.mode}` &&
      band === 'all'
    ) {
      this.bundle = this.baseBundled
      return {
        ok: true,
        meta: this.bundle.meta,
        message: `已切换至 ${this.bundle.meta.patch} · ${this.bundle.meta.modeLabel}（全体样本）`
      }
    }

    const mirror = await this.pickMirror()
    if (!mirror) {
      return {
        ok: false,
        meta: current.meta,
        message: '当前离线无法拉取其他规则/分段数据集，保持当前离线数据包'
      }
    }

    const targetOption = (current.meta.availableDatasets || []).find((d) => d.path === datasetPath)
    const effectiveBand = band === 'high' && targetOption?.bandsAvailable ? 'high' : 'all'
    const subPrefix = effectiveBand === 'high' ? `${datasetPath}/bands/high` : datasetPath

    const fetchJson = async <T>(relPath: string): Promise<T> => {
      const res = await fetch(`${mirror.baseUrl}/${relPath}`, {
        signal: AbortSignal.timeout(25000)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${relPath}`)
      return (await res.json()) as T
    }

    const [rawHeroes, rawAugments, rawHeroAugments, rawCoreBuilds] = await Promise.all([
      fetchJson<
        Record<
          string,
          {
            name: string
            title: string
            games: number
            wins: number
            win_rate: number
            pick_rate: number
            rank: number
          }
        >
      >(`${subPrefix}/heroes.json`),
      fetchJson<Record<string, { name: string; rarity: 'silver' | 'gold' | 'prismatic' }>>(
        `${datasetPath}/augments.json`
      ),
      fetchJson<Record<string, Record<string, { games: number; wins: number; low_sample?: boolean }>>>(
        `${subPrefix}/hero_augments.json`
      ),
      fetchJson<
        Record<
          string,
          Array<{
            items: string[]
            ordered?: boolean
            games: number
            wins: number
            win?: number
            pick?: number
          }>
        >
      >(`${subPrefix}/core_builds.json`).catch(() =>
        fetchJson<
          Record<
            string,
            Array<{
              items: string[]
              ordered?: boolean
              games: number
              wins: number
              win?: number
              pick?: number
            }>
          >
        >(`${datasetPath}/core_builds.json`)
      )
    ])

    const refBundle = this.baseBundled || current
    const sortedWr = Object.values(rawHeroes)
      .map((h) => (h.wins + 150) / (h.games + 300))
      .sort((a, b) => b - a)

    const nextHeroes: Record<string, HeroMeta> = {}
    for (const [id, h] of Object.entries(rawHeroes)) {
      const prev = refBundle.heroes[id]
      const swr = Number(((h.wins + 150) / (h.games + 300)).toFixed(5))
      const py = prev
        ? { full: prev.pinyinFull, initials: prev.pinyinInitials }
        : toPinyinIndex(`${h.name}${h.title}`)
      nextHeroes[id] = {
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

    const nextAugments: Record<string, AugmentMeta> = { ...refBundle.augments }
    for (const [id, aug] of Object.entries(rawAugments)) {
      const prev = refBundle.augments[id]
      const py = prev ? { full: prev.pinyinFull, initials: prev.pinyinInitials } : toPinyinIndex(aug.name)
      nextAugments[id] = {
        id,
        name: aug.name,
        rarity: prev?.rarity || aug.rarity,
        desc: prev?.desc || `${aug.name}`,
        iconUrl: prev?.iconUrl || '',
        tags: prev?.tags || ['general'],
        pinyinFull: py.full,
        pinyinInitials: py.initials
      }
    }

    const nextHeroAugments: SeedBundle['heroAugments'] = {}
    for (const [heroId, augMap] of Object.entries(rawHeroAugments)) {
      nextHeroAugments[heroId] = Object.entries(augMap)
        .filter(([, st]) => st.games >= 15)
        .map(([augId, st]) => [augId, st.games, st.wins, st.low_sample ? 1 : 0])
    }

    const nextCoreBuilds: SeedBundle['coreBuilds'] = {}
    for (const [heroId, list] of Object.entries(rawCoreBuilds)) {
      nextCoreBuilds[heroId] = (list || []).slice(0, 3).map((b) => ({
        items: b.items,
        ordered: Boolean(b.ordered),
        games: b.games,
        winRate: Number((b.win ?? b.wins / Math.max(1, b.games)).toFixed(4)),
        pickRate: Number((b.pick ?? 0).toFixed(4))
      }))
    }

    this.bundle = {
      ...refBundle,
      meta: {
        ...refBundle.meta,
        patch: targetOption?.patch || refBundle.meta.patch,
        mode: targetOption?.mode || 'normal',
        modeLabel: targetOption?.modeLabel || '常规',
        activeBand: effectiveBand,
        bandsAvailable: Boolean(targetOption?.bandsAvailable),
        matchesValid: targetOption?.matchesValid || refBundle.meta.matchesValid,
        fromSource: mirror.source
      },
      heroes: nextHeroes,
      augments: nextAugments,
      heroAugments: nextHeroAugments,
      coreBuilds: nextCoreBuilds
    }

    return {
      ok: true,
      meta: this.bundle.meta,
      message: `已切换至 ${this.bundle.meta.patch} · ${this.bundle.meta.modeLabel}（${
        effectiveBand === 'high' ? '前 5% 高玩分段' : '全体样本'
      }）`
    }
  }

  async checkAndSync(force = false): Promise<{
    updated: boolean
    meta: DatasetMetadata
    message: string
  }> {
    const current = this.getBundle()
    const chosenMirror = await this.pickMirror()

    if (!chosenMirror) {
      return {
        updated: false,
        meta: current.meta,
        message: '当前离线或镜像暂不可达，已继续使用内置离线包'
      }
    }

    const [latestJson, indexJson] = await Promise.all([
      fetch(`${chosenMirror.baseUrl}/latest.json`, { signal: AbortSignal.timeout(10000) }).then(
        (r) => r.json() as Promise<RemoteLatestManifest>
      ),
      fetch(`${chosenMirror.baseUrl}/index.json`, { signal: AbortSignal.timeout(10000) })
        .then((r) => r.json() as Promise<RemoteIndexManifest>)
        .catch(() => ({ datasets: [] } as RemoteIndexManifest))
    ])

    const availableDatasets: DatasetOption[] = (indexJson.datasets || []).slice(0, 4).map((ds) => ({
      id: `${ds.patch}-${ds.mode}`,
      patch: ds.patch,
      mode: ds.mode,
      modeLabel: ds.mode_label || (ds.mode === 'normal' ? '常规' : ds.mode),
      path: ds.path,
      bandsAvailable: Boolean(ds.bands),
      activeBand: 'all',
      matchesValid: ds.matches_detail?.valid || ds.matches || 0
    }))

    if (!force && latestJson.seq <= current.meta.seq) {
      if (availableDatasets.length > 0) {
        this.bundle = {
          ...current,
          meta: { ...current.meta, availableDatasets }
        }
      }
      return {
        updated: false,
        meta: this.bundle!.meta,
        message: `已是最新统计版本（${latestJson.patch} · 序号 #${latestJson.seq}）`
      }
    }

    const fetchVerifiedJson = async <T>(fileName: string): Promise<T> => {
      const url = `${chosenMirror.baseUrl}/${latestJson.path}/${fileName}`
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) })
      if (!res.ok) throw new Error(`拉取 ${fileName} 失败: HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const expectedSha = latestJson.files?.[fileName]?.sha256
      if (expectedSha) {
        const actualSha = sha256Hex(buf)
        if (actualSha !== expectedSha) {
          throw new Error(`${fileName} SHA-256 校验不一致`)
        }
      }
      return JSON.parse(buf.toString('utf-8')) as T
    }

    const [
      rawHeroes,
      rawAugments,
      rawHeroAugments,
      rawCoreBuilds,
      rawHeroItems,
      rawHeroAugmentItems,
      rawHeroSpells
    ] = await Promise.all([
      fetchVerifiedJson<
        Record<
          string,
          {
            name: string
            title: string
            games: number
            wins: number
            win_rate: number
            pick_rate: number
            rank: number
          }
        >
      >('heroes.json'),
      fetchVerifiedJson<Record<string, { name: string; rarity: 'silver' | 'gold' | 'prismatic' }>>(
        'augments.json'
      ),
      fetchVerifiedJson<
        Record<string, Record<string, { games: number; wins: number; low_sample?: boolean }>>
      >('hero_augments.json'),
      fetchVerifiedJson<
        Record<
          string,
          Array<{
            items: string[]
            ordered?: boolean
            games: number
            wins: number
            win?: number
            pick?: number
          }>
        >
      >('core_builds.json'),
      fetchVerifiedJson<Record<string, Record<string, { games: number; wins: number }>>>(
        'hero_items.json'
      ),
      fetchVerifiedJson<
        Record<
          string,
          Record<
            string,
            { items?: Array<{ item: string; name?: string; games: number; wins: number }> }
          >
        >
      >('hero_augment_items.json'),
      fetchVerifiedJson<Record<string, Record<string, { games: number; wins: number }>>>(
        'hero_spells.json'
      )
    ])

    const sortedWr = Object.values(rawHeroes)
      .map((h) => (h.wins + 150) / (h.games + 300))
      .sort((a, b) => b - a)

    const nextHeroes: Record<string, HeroMeta> = {}
    for (const [id, h] of Object.entries(rawHeroes)) {
      const prev = current.heroes[id]
      const swr = Number(((h.wins + 150) / (h.games + 300)).toFixed(5))
      const py = prev
        ? { full: prev.pinyinFull, initials: prev.pinyinInitials }
        : toPinyinIndex(`${h.name}${h.title}`)
      nextHeroes[id] = {
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

    const nextAugments: Record<string, AugmentMeta> = { ...current.augments }
    for (const [id, aug] of Object.entries(rawAugments)) {
      const prev = current.augments[id]
      const py = prev ? { full: prev.pinyinFull, initials: prev.pinyinInitials } : toPinyinIndex(aug.name)
      nextAugments[id] = {
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

    const nextHeroAugments: SeedBundle['heroAugments'] = {}
    for (const [heroId, augMap] of Object.entries(rawHeroAugments)) {
      nextHeroAugments[heroId] = Object.entries(augMap)
        .filter(([, st]) => st.games >= 15)
        .map(([augId, st]) => [augId, st.games, st.wins, st.low_sample ? 1 : 0])
    }

    const nextCoreBuilds: SeedBundle['coreBuilds'] = {}
    for (const [heroId, list] of Object.entries(rawCoreBuilds)) {
      nextCoreBuilds[heroId] = (list || []).slice(0, 3).map((b) => ({
        items: b.items,
        ordered: Boolean(b.ordered),
        games: b.games,
        winRate: Number((b.win ?? b.wins / Math.max(1, b.games)).toFixed(4)),
        pickRate: Number((b.pick ?? 0).toFixed(4))
      }))
    }

    const nextHeroItems: SeedBundle['heroItems'] = {}
    for (const [heroId, itemMap] of Object.entries(rawHeroItems)) {
      nextHeroItems[heroId] = Object.entries(itemMap)
        .filter(
          ([itemId, st]) =>
            st.games >= 80 &&
            current.items[itemId] &&
            !(current.items[itemId].types || []).includes('Boots')
        )
        .sort((a, b) => b[1].games - a[1].games)
        .slice(0, 18)
        .map(([itemId, st]) => [itemId, st.games, st.wins])
    }

    const nextHeroAugmentItems: SeedBundle['heroAugmentItems'] = {}
    for (const [heroId, augMap] of Object.entries(rawHeroAugmentItems)) {
      const sub: Record<string, Array<[string, string, number, number]>> = {}
      for (const [augId, obj] of Object.entries(augMap)) {
        if (!obj.items?.length) continue
        sub[augId] = obj.items
          .slice(0, 3)
          .map((it) => [
            String(it.item),
            it.name || current.items[it.item]?.name || '',
            it.games,
            it.wins
          ])
      }
      if (Object.keys(sub).length > 0) nextHeroAugmentItems[heroId] = sub
    }

    const nextHeroSpells: SeedBundle['heroSpells'] = {}
    for (const [heroId, spMap] of Object.entries(rawHeroSpells)) {
      nextHeroSpells[heroId] = Object.entries(spMap)
        .filter(([, st]) => st.games >= 30)
        .sort((a, b) => b[1].games - a[1].games)
        .slice(0, 3)
        .map(([combo, st]) => [combo, st.games, st.wins])
    }

    const updatedBundle: SeedBundle = {
      meta: {
        patch: latestJson.patch,
        mode: latestJson.mode,
        modeLabel: latestJson.mode_label || '常规',
        activeBand: 'all',
        bandsAvailable: Boolean(latestJson.bands),
        seq: latestJson.seq,
        matchesValid: latestJson.matches,
        snapshotAt: latestJson.snapshot_at,
        sourceRepo: 'https://github.com/czgreat/aramhex-data',
        license: 'CC BY-NC 4.0',
        syncedAt: new Date().toISOString(),
        fromSource: chosenMirror.source,
        availableDatasets: availableDatasets.length > 0 ? availableDatasets : current.meta.availableDatasets
      },
      heroes: nextHeroes,
      augments: nextAugments,
      items: current.items,
      heroAugments: nextHeroAugments,
      coreBuilds: nextCoreBuilds,
      heroItems: nextHeroItems,
      heroAugmentItems: nextHeroAugmentItems,
      heroSpells: nextHeroSpells
    }

    const cachePath = resolveCachedBundlePath()
    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, JSON.stringify(updatedBundle), 'utf-8')
    this.bundle = updatedBundle

    return {
      updated: true,
      meta: updatedBundle.meta,
      message: `已同步最新 ${updatedBundle.meta.patch} 版本国服统计（${(
        updatedBundle.meta.matchesValid / 10000
      ).toFixed(0)}万场有效对局）`
    }
  }
}
