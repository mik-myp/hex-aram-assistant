import { extractChangelogSection } from '@shared/changelogParser'

export interface GithubReleaseAsset {
  name: string
  size: number
  digest?: string | null
  browser_download_url: string
}

export function normalizeVersion(ver: string): string {
  return ver.trim().replace(/^[vV]/, '').split('-')[0]
}

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
    return exeAssets.find((a) => /portable/i.test(a.name)) || exeAssets[0]
  }
  return (
    exeAssets.find((a) => /setup/i.test(a.name)) ||
    exeAssets.find((a) => !/portable/i.test(a.name)) ||
    exeAssets[0]
  )
}

export async function fetchFallbackChangelogSection(
  githubRepo: string,
  tag: string,
  ver: string
): Promise<string> {
  const candidates = [
    `https://cdn.jsdelivr.net/gh/${githubRepo}@${tag}/CHANGELOG.md`,
    `https://raw.githubusercontent.com/${githubRepo}/${tag}/CHANGELOG.md`
  ]
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) continue
      const md = await res.text()
      const section = extractChangelogSection(md, ver)
      if (section) return section
    } catch {
      // try next mirror
    }
  }
  return ''
}
