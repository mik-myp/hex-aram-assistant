import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, shell } from 'electron'
import type { AppUpdateState } from '@shared/types'

const GITHUB_REPO = 'mik-myp/hex-aram-assistant'
const RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`

// Accelerated download mirrors used ONLY as fallback if direct GitHub download stalls/fails.
// Every byte is cryptographically verified against the official SHA-256 digest from api.github.com!
const DOWNLOAD_MIRROR_PREFIXES = [
  '', // 1st try: Direct official GitHub Releases CDN
  'https://ghfast.top/',
  'https://gh-proxy.com/'
]

interface GithubReleaseAsset {
  name: string
  size: number
  digest?: string | null
  browser_download_url: string
}

interface GithubLatestRelease {
  tag_name: string
  html_url: string
  body?: string | null
  published_at?: string | null
  assets?: GithubReleaseAsset[]
}

export function normalizeVersion(ver: string): string {
  return ver.trim().replace(/^[vV]/, '').split('-')[0]
}

/**
 * Returns 1 if `a > b`, -1 if `a < b`, 0 if equal.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = normalizeVersion(a)
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  const pb = normalizeVersion(b)
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length, 3)
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va > vb) return 1
    if (va < vb) return -1
  }
  return 0
}

export function selectMatchingReleaseAsset(
  assets: GithubReleaseAsset[],
  isPortable: boolean
): GithubReleaseAsset | null {
  const exeAssets = assets.filter((a) => a.name.toLowerCase().endsWith('.exe'))
  if (exeAssets.length === 0) return null

  if (isPortable) {
    return (
      exeAssets.find((a) => /portable/i.test(a.name)) ||
      exeAssets[0]
    )
  }
  return (
    exeAssets.find((a) => /setup/i.test(a.name)) ||
    exeAssets.find((a) => !/portable/i.test(a.name)) ||
    exeAssets[0]
  )
}

export class AppUpdateService {
  private state: AppUpdateState
  private selectedAsset: GithubReleaseAsset | null = null
  private listeners = new Set<(state: AppUpdateState) => void>()
  private activeAbort: AbortController | null = null

  constructor() {
    this.state = {
      phase: 'idle',
      currentVersion: typeof app?.getVersion === 'function' ? app.getVersion() : '0.0.0',
      isPortable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
      latestVersion: null,
      hasUpdate: false,
      releaseNotes: '',
      publishedAt: null,
      releasePageUrl: RELEASES_PAGE_URL,
      assetName: null,
      assetSize: 0,
      downloadPercent: 0,
      transferredBytes: 0,
      downloadedFilePath: null,
      checkedAt: null
    }
  }

  getState(): AppUpdateState {
    return { ...this.state }
  }

  onStateChanged(listener: (state: AppUpdateState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private updateState(patch: Partial<AppUpdateState>): AppUpdateState {
    this.state = { ...this.state, ...patch }
    const snapshot = this.getState()
    for (const cb of this.listeners) {
      cb(snapshot)
    }
    return snapshot
  }

  async checkForUpdates(): Promise<AppUpdateState> {
    if (this.state.phase === 'checking' || this.state.phase === 'downloading') {
      return this.getState()
    }

    this.updateState({
      phase: 'checking',
      errorMessage: undefined
    })

    try {
      let data: GithubLatestRelease | null = null
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(RELEASE_API_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `HexBuddy/${this.state.currentVersion}`
        },
        signal: controller.signal
      }).finally(() => clearTimeout(timeout))

      if (res.ok) {
        data = (await res.json()) as GithubLatestRelease
      } else {
        // Fallback when unauthenticated api.github.com hits shared-NAT 60/hr 403 rate limit:
        // Follow github.com/.../releases/latest 302 redirect -> /releases/tag/vX.Y.Z (never rate-limited!)
        const htmlRes = await fetch(RELEASES_PAGE_URL, {
          method: 'HEAD',
          redirect: 'follow',
          headers: { 'User-Agent': `HexBuddy/${this.state.currentVersion}` }
        })
        const tagMatch = htmlRes.url.match(/\/releases\/tag\/([^/?#]+)/)
        if (!tagMatch) {
          throw new Error(`GitHub Release 接口响应异常 (HTTP ${res.status})`)
        }
        const tag = decodeURIComponent(tagMatch[1])
        const ver = normalizeVersion(tag)
        const dlBase = `https://github.com/${GITHUB_REPO}/releases/download/${tag}`
        data = {
          tag_name: tag,
          html_url: `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
          body: '',
          published_at: null,
          assets: [
            {
              name: `HexBuddy-Setup-${ver}.exe`,
              size: 0,
              digest: null,
              browser_download_url: `${dlBase}/HexBuddy-Setup-${ver}.exe`
            },
            {
              name: `HexBuddy-Portable-${ver}.exe`,
              size: 0,
              digest: null,
              browser_download_url: `${dlBase}/HexBuddy-Portable-${ver}.exe`
            }
          ]
        }
      }

      const latestVer = normalizeVersion(data.tag_name || '')
      if (!latestVer) {
        throw new Error('未解析到有效版本号')
      }

      const hasUpdate = compareSemver(latestVer, this.state.currentVersion) > 0
      const matchedAsset = selectMatchingReleaseAsset(data.assets || [], this.state.isPortable)
      this.selectedAsset = matchedAsset

      // Check if we already downloaded & verified this exact file earlier in the session
      let existingVerifiedPath: string | null = null
      if (hasUpdate && matchedAsset) {
        const candidatePath = join(app.getPath('temp'), 'hexbuddy-updates', matchedAsset.name)
        if (existsSync(candidatePath)) {
          const st = await stat(candidatePath).catch(() => null)
          if (st && st.size === matchedAsset.size) {
            existingVerifiedPath = candidatePath
          }
        }
      }

      return this.updateState({
        phase: existingVerifiedPath ? 'downloaded' : hasUpdate ? 'available' : 'up-to-date',
        latestVersion: latestVer,
        hasUpdate,
        releaseNotes: (data.body || '').trim(),
        publishedAt: data.published_at || null,
        releasePageUrl: data.html_url || RELEASES_PAGE_URL,
        assetName: matchedAsset?.name || null,
        assetSize: matchedAsset?.size || 0,
        downloadPercent: existingVerifiedPath ? 100 : 0,
        transferredBytes: existingVerifiedPath ? matchedAsset?.size || 0 : 0,
        downloadedFilePath: existingVerifiedPath,
        errorMessage: undefined,
        checkedAt: Date.now()
      })
    } catch (err) {
      return this.updateState({
        phase: 'error',
        errorMessage:
          err instanceof Error && err.name === 'AbortError'
            ? '连接 GitHub 检查更新超时，请稍后重试或前往发布页查看'
            : err instanceof Error
              ? err.message
              : '检查更新失败',
        checkedAt: Date.now()
      })
    }
  }

  async downloadUpdate(): Promise<AppUpdateState> {
    if (this.state.phase === 'downloading') {
      return this.getState()
    }
    if (!this.state.hasUpdate || !this.selectedAsset) {
      await this.checkForUpdates()
    }
    const asset = this.selectedAsset
    if (!this.state.hasUpdate || !asset) {
      return this.getState()
    }

    // On non-Windows (e.g. macOS dev), open the GitHub Release page directly
    if (process.platform !== 'win32') {
      shell.openExternal(this.state.releasePageUrl)
      return this.getState()
    }

    const updateDir = join(app.getPath('temp'), 'hexbuddy-updates')
    await mkdir(updateDir, { recursive: true })
    const finalPath = join(updateDir, asset.name)
    const partPath = `${finalPath}.part`

    const expectedSha256 = asset.digest?.startsWith('sha256:')
      ? asset.digest.slice('sha256:'.length).toLowerCase()
      : null

    let lastErr: Error | null = null

    for (const prefix of DOWNLOAD_MIRROR_PREFIXES) {
      const targetUrl = prefix ? `${prefix}${asset.browser_download_url}` : asset.browser_download_url
      try {
        await rm(partPath, { force: true }).catch(() => {})
        this.activeAbort = new AbortController()
        this.updateState({
          phase: 'downloading',
          downloadPercent: 0,
          transferredBytes: 0,
          errorMessage: undefined
        })

        await this.streamAndVerifyFile(targetUrl, partPath, asset.size, expectedSha256, this.activeAbort.signal)
        await rm(finalPath, { force: true }).catch(() => {})
        await rename(partPath, finalPath)
        this.activeAbort = null

        return this.updateState({
          phase: 'downloaded',
          downloadPercent: 100,
          transferredBytes: asset.size,
          downloadedFilePath: finalPath,
          errorMessage: undefined
        })
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        await rm(partPath, { force: true }).catch(() => {})
      }
    }

    this.activeAbort = null
    return this.updateState({
      phase: 'error',
      errorMessage: `更新包下载失败（${lastErr?.message || '网络异常'}），可点击右侧按钮前往 GitHub 手动下载`
    })
  }

  private async streamAndVerifyFile(
    url: string,
    destPartPath: string,
    expectedSize: number,
    expectedSha256: string | null,
    signal: AbortSignal
  ): Promise<void> {
    const connectTimer = setTimeout(() => {
      if (this.state.transferredBytes === 0) {
        this.activeAbort?.abort()
      }
    }, 12000)

    const res = await fetch(url, {
      headers: { 'User-Agent': `HexBuddy/${this.state.currentVersion}` },
      redirect: 'follow',
      signal
    }).finally(() => clearTimeout(connectTimer))

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`)
    }

    const total = expectedSize || Number(res.headers.get('content-length') || 0)
    const hash = createHash('sha256')
    const fileStream = createWriteStream(destPartPath)
    const reader = res.body.getReader()

    let transferred = 0
    let lastEmitAt = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && value.byteLength > 0) {
          const buf = Buffer.from(value)
          hash.update(buf)
          if (!fileStream.write(buf)) {
            await new Promise<void>((resolve) => fileStream.once('drain', resolve))
          }
          transferred += buf.byteLength
          const now = Date.now()
          if (now - lastEmitAt >= 180 || transferred === total) {
            lastEmitAt = now
            const pct = total > 0 ? Math.min(99, Math.round((transferred / total) * 100)) : 0
            this.updateState({
              phase: 'downloading',
              transferredBytes: transferred,
              downloadPercent: pct
            })
          }
        }
      }
      await new Promise<void>((resolve, reject) => {
        fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()))
      })
    } catch (err) {
      fileStream.destroy()
      throw err
    }

    if (expectedSize > 0 && transferred !== expectedSize) {
      throw new Error(`文件大小校验不一致 (${transferred} / ${expectedSize})`)
    }

    if (expectedSha256) {
      const actualSha256 = hash.digest('hex').toLowerCase()
      if (actualSha256 !== expectedSha256) {
        throw new Error('SHA-256 完整性签名校验未通过，已拒绝不安全安装包')
      }
    }
  }

  /**
   * Launches the cryptographically verified update package and exits the current instance cleanly:
   * - NSIS Installed mode: spawns `HexBuddy-Setup-x.y.z.exe` detached and quits.
   * - Portable single-exe mode: runs a tiny hidden `.cmd` replacer after process exit to overwrite
   *   `PORTABLE_EXECUTABLE_FILE` and relaunch the updated Portable `.exe`!
   */
  async installDownloadedUpdate(prepareQuit: () => void): Promise<{ ok: boolean; message?: string }> {
    const filePath = this.state.downloadedFilePath
    if (!filePath || !existsSync(filePath)) {
      return { ok: false, message: '尚未下载更新安装包' }
    }

    if (process.platform !== 'win32') {
      shell.openExternal(this.state.releasePageUrl)
      return { ok: true }
    }

    const portableTarget = process.env.PORTABLE_EXECUTABLE_FILE
    prepareQuit()

    if (portableTarget) {
      const batPath = join(app.getPath('temp'), 'hexbuddy-updates', 'apply-portable-update.cmd')
      const script = [
        '@echo off',
        'chcp 65001 >nul',
        'ping 127.0.0.1 -n 3 >nul',
        `move /Y "${filePath}" "${portableTarget}" >nul`,
        `start "" "${portableTarget}"`,
        'del "%~f0"'
      ].join('\r\n')
      await writeFile(batPath, script, 'utf-8')
      const child = spawn('cmd.exe', ['/c', batPath], {
        detached: true,
        windowsHide: true,
        stdio: 'ignore'
      })
      child.unref()
    } else {
      const child = spawn(filePath, [], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    }

    setTimeout(() => {
      app.quit()
    }, 150)

    return { ok: true }
  }
}
