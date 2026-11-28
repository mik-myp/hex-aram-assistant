import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { app, nativeImage } from 'electron'
import {
  compileIconTemplate,
  decodeFingerprintBytesBase64,
  encodeFingerprintBytesBase64,
  extractTemplateBytesFromPixels,
  ICON_FP_SIZE,
  type CompiledIconTemplate,
  type SerializedIconFingerprintMap
} from '@shared/iconMatcher'
import type { AugmentMeta } from '@shared/types'
import { logDiag } from '../logger/diagLogger'

let rawEntries: Record<string, string> = {}
let compiledCache: CompiledIconTemplate[] = []
let compiledSignature = ''
let initialized = false
let healingInFlight = false

function resolveBundledFpPath(): string {
  const prod = resolve(process.resourcesPath || '', 'seed-data/augment-icon-fingerprints.json')
  if (existsSync(prod)) return prod
  const dev =
    typeof app?.getAppPath === 'function'
      ? resolve(app.getAppPath(), 'resources/seed-data/augment-icon-fingerprints.json')
      : ''
  if (dev && existsSync(dev)) return dev
  return resolve(process.cwd(), 'resources/seed-data/augment-icon-fingerprints.json')
}

function resolveUserCacheFpPath(): string | null {
  if (typeof app?.getPath !== 'function') return null
  return resolve(app.getPath('userData'), 'augment-icon-fingerprints-cache.json')
}

export async function initIconFingerprintStore(): Promise<number> {
  if (initialized) return Object.keys(rawEntries).length
  initialized = true

  const merged: Record<string, string> = {}
  const bundledPath = resolveBundledFpPath()
  if (existsSync(bundledPath)) {
    try {
      const parsed = JSON.parse(await readFile(bundledPath, 'utf-8')) as SerializedIconFingerprintMap
      if (parsed?.entries && typeof parsed.entries === 'object') {
        Object.assign(merged, parsed.entries)
      }
    } catch (err) {
      logDiag('ICON-FP', `Failed to load bundled fingerprints: ${String(err).slice(0, 120)}`)
    }
  }

  const userPath = resolveUserCacheFpPath()
  if (userPath && existsSync(userPath)) {
    try {
      const parsed = JSON.parse(await readFile(userPath, 'utf-8')) as SerializedIconFingerprintMap
      if (parsed?.entries && typeof parsed.entries === 'object') {
        Object.assign(merged, parsed.entries)
      }
    } catch {
      // ignore corrupted user cache
    }
  }

  rawEntries = merged
  compiledSignature = ''
  const count = Object.keys(rawEntries).length
  logDiag('ICON-FP', `Loaded ${count} offline augment icon fingerprints`)
  return count
}

export function getCompiledIconTemplates(
  augments: Record<string, AugmentMeta>
): CompiledIconTemplate[] {
  const keys = Object.keys(augments)
  const sig = `${keys.length}:${Object.keys(rawEntries).length}`
  if (sig === compiledSignature && compiledCache.length > 0) {
    return compiledCache
  }

  const next: CompiledIconTemplate[] = []
  for (const id of keys) {
    const b64 = rawEntries[id]
    if (!b64) continue
    const bytes = decodeFingerprintBytesBase64(b64)
    const tpl = compileIconTemplate(id, bytes, augments[id]?.rarity)
    if (tpl) next.push(tpl)
  }

  compiledCache = next
  compiledSignature = sig
  return compiledCache
}

export function getIconFingerprintCount(): number {
  return Object.keys(rawEntries).length
}

/**
 * Lazily fetches & caches fingerprints for newly added patch augments not yet in the bundled file.
 */
export async function healMissingIconFingerprints(
  augments: Record<string, AugmentMeta>
): Promise<void> {
  if (healingInFlight) return
  const missing = Object.values(augments).filter((a) => a.iconUrl && !rawEntries[a.id])
  if (missing.length === 0) return

  healingInFlight = true
  try {
    let added = 0
    for (const aug of missing.slice(0, 24)) {
      try {
        const res = await fetch(aug.iconUrl, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        const img = nativeImage.createFromBuffer(buf)
        if (img.isEmpty()) continue
        const sz = img.getSize()
        const bmp = img.toBitmap()
        const fp = extractTemplateBytesFromPixels(
          new Uint8Array(bmp.buffer, bmp.byteOffset, bmp.byteLength),
          sz.width,
          sz.height,
          true
        )
        rawEntries[aug.id] = encodeFingerprintBytesBase64(fp)
        added++
      } catch {
        // non-fatal
      }
    }

    if (added > 0) {
      compiledSignature = ''
      const userPath = resolveUserCacheFpPath()
      if (userPath) {
        const payload: SerializedIconFingerprintMap = {
          version: 1,
          size: ICON_FP_SIZE,
          entries: rawEntries
        }
        await mkdir(dirname(userPath), { recursive: true })
        await writeFile(userPath, JSON.stringify(payload), 'utf-8')
      }
      logDiag('ICON-FP', `Auto-healed ${added} new patch augment icon fingerprints`)
    }
  } finally {
    healingInFlight = false
  }
}
