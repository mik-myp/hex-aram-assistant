import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { app } from 'electron'
import type {
  DatasetMetadata,
  DatasetOption,
  ItemMeta,
  SeedBundle
} from '@shared/types'
import {
  mapRawDatasetTables,
  selfHealMissingCatalogEntries,
  type RawAugmentRow,
  type RawCoreBuildRow,
  type RawHeroRow
} from './catalogSelfHeal'

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

  private async readBundledFromDisk(): Promise<SeedBundle | null> {
    const bundledPath = resolveBundledSeedPath()
    if (!existsSync(bundledPath)) return null
    try {
      return JSON.parse(await readFile(bundledPath, 'utf-8')) as SeedBundle
    } catch (err) {
      console.warn('[DataSync] Failed to parse bundled seed:', err)
      return null
    }
  }

  async init(): Promise<SeedBundle> {
    const cachedPath = resolveCachedBundlePath()
    const bundled = await this.readBundledFromDisk()

    let cached: SeedBundle | null = null
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

  async getCachedBundleBytes(): Promise<number> {
    const cachedPath = resolveCachedBundlePath()
    if (!existsSync(cachedPath)) return 0
    const st = await stat(cachedPath).catch(() => null)
    return st?.size ?? 0
  }

  async clearCachedBundle(): Promise<DatasetMetadata> {
    const cachedPath = resolveCachedBundlePath()
    if (existsSync(cachedPath)) {
      await rm(cachedPath, { force: true }).catch(() => {})
    }
    const bundled = await this.readBundledFromDisk()
    if (bundled) {
      this.bundle = bundled
    }
    return this.getMeta()
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
    const diskBundled = await this.readBundledFromDisk()

    if (
      diskBundled &&
      datasetPath === `patches/${diskBundled.meta.patch}/${diskBundled.meta.mode}` &&
      band === 'all'
    ) {
      this.bundle = diskBundled
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
      fetchJson<Record<string, RawHeroRow>>(`${subPrefix}/heroes.json`),
      fetchJson<Record<string, RawAugmentRow>>(`${datasetPath}/augments.json`),
      fetchJson<Record<string, Record<string, { games: number; wins: number; low_sample?: boolean }>>>(
        `${subPrefix}/hero_augments.json`
      ),
      fetchJson<Record<string, RawCoreBuildRow[]>>(`${subPrefix}/core_builds.json`).catch(() =>
        fetchJson<Record<string, RawCoreBuildRow[]>>(`${datasetPath}/core_builds.json`)
      )
    ])

    const refBundle = diskBundled || current
    const mapped = mapRawDatasetTables({
      refBundle,
      rawHeroes,
      rawAugments,
      rawHeroAugments,
      rawCoreBuilds
    })

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
      heroes: mapped.heroes,
      augments: mapped.augments,
      heroAugments: mapped.heroAugments,
      coreBuilds: mapped.coreBuilds
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

    const availableDatasets: DatasetOption[] = (indexJson.datasets || [])
      .slice(0, 4)
      .map((ds) => ({
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
      fetchVerifiedJson<Record<string, RawHeroRow>>('heroes.json'),
      fetchVerifiedJson<Record<string, RawAugmentRow>>('augments.json'),
      fetchVerifiedJson<
        Record<string, Record<string, { games: number; wins: number; low_sample?: boolean }>>
      >('hero_augments.json'),
      fetchVerifiedJson<Record<string, RawCoreBuildRow[]>>('core_builds.json'),
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

    const mapped = mapRawDatasetTables({
      refBundle: current,
      rawHeroes,
      rawAugments,
      rawHeroAugments,
      rawCoreBuilds
    })

    const nextItems: Record<string, ItemMeta> = { ...current.items }
    const referencedItemIds = new Set<string>()
    for (const list of Object.values(rawCoreBuilds)) {
      for (const b of list || []) {
        for (const iid of b.items || []) referencedItemIds.add(String(iid))
      }
    }
    for (const itemMap of Object.values(rawHeroItems)) {
      for (const [iid, st] of Object.entries(itemMap)) {
        if (st.games >= 80) referencedItemIds.add(iid)
      }
    }

    await selfHealMissingCatalogEntries({
      heroes: mapped.heroes,
      augments: mapped.augments,
      items: nextItems,
      referencedItemIds
    })

    const nextHeroItems: SeedBundle['heroItems'] = {}
    for (const [heroId, itemMap] of Object.entries(rawHeroItems)) {
      nextHeroItems[heroId] = Object.entries(itemMap)
        .filter(
          ([itemId, st]) =>
            st.games >= 80 &&
            nextItems[itemId] &&
            !(nextItems[itemId].types || []).includes('Boots')
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
        availableDatasets:
          availableDatasets.length > 0 ? availableDatasets : current.meta.availableDatasets
      },
      heroes: mapped.heroes,
      augments: mapped.augments,
      items: nextItems,
      heroAugments: mapped.heroAugments,
      coreBuilds: mapped.coreBuilds,
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
