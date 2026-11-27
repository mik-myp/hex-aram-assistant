import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Extracts the Markdown release notes body for a given tag/version (e.g. `v0.4.0` or `0.4.0`)
 * from `CHANGELOG.md`. Falls back to `[Unreleased]` if an exact version section is not found.
 */
export function extractChangelogSection(changelogText, rawVersion) {
  const cleanVer = (rawVersion || '').trim().replace(/^[vV]/, '')
  const lines = changelogText.split(/\r?\n/)

  const matchSection = (matcher) => {
    let capturing = false
    const collected = []

    for (const line of lines) {
      if (/^##\s+\[/.test(line)) {
        if (capturing) break
        if (matcher(line)) {
          capturing = true
          continue
        }
      } else if (capturing) {
        collected.push(line)
      }
    }

    const body = collected
      .join('\n')
      .replace(/^\s*---\s*$/gm, '')
      .trim()
    return body.length > 0 ? body : null
  }

  if (cleanVer) {
    const escaped = cleanVer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const exactRegex = new RegExp(`^##\\s+\\[v?${escaped}\\]`, 'i')
    const exactMatch = matchSection((h) => exactRegex.test(h))
    if (exactMatch) return exactMatch
  }

  const unreleasedMatch = matchSection((h) => /^##\s+\[unreleased\]/i.test(h))
  if (unreleasedMatch) return unreleasedMatch

  return `HexBuddy ${rawVersion || '新版本'} 发布（100% 纯只读安全模式）。`
}

const isCliEntry =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

const RELEASE_FOOTER = `

---

### 📥 下载说明
- **安装版（推荐）**：\`HexBuddy-Setup-{ver}.exe\`，支持自定义安装路径与桌面快捷方式。
- **免安装便携版**：\`HexBuddy-Portable-{ver}.exe\`，单文件双击即用。
- 已安装旧版本的用户可在「助手设置 → 版本更新与环境自检」中在线更新。

> 本工具仅调用官方只读接口，不读写游戏内存、不注入、不修改任何游戏文件。完整历史见 [CHANGELOG.md](https://github.com/mik-myp/hex-aram-assistant/blob/main/CHANGELOG.md)。`

/** Returns every released version tag (e.g. `v0.4.0`) that has its own section in CHANGELOG.md. */
export function listChangelogVersions(changelogText) {
  return [...changelogText.matchAll(/^##\s+\[v?(\d+\.\d+\.\d+[^\]]*)\]/gim)].map((m) => `v${m[1]}`)
}

/**
 * Builds the GitHub Release body for a tag. Strict: throws if the exact version section is missing,
 * so CI fails loudly instead of publishing a placeholder body.
 */
export function buildReleaseBody(changelogText, rawVersion) {
  const cleanVer = (rawVersion || '').trim().replace(/^[vV]/, '')
  if (!cleanVer) throw new Error('[extract-changelog] Missing version/tag argument')
  if (!listChangelogVersions(changelogText).includes(`v${cleanVer}`)) {
    throw new Error(`[extract-changelog] CHANGELOG.md has no "## [v${cleanVer}]" section`)
  }
  return extractChangelogSection(changelogText, cleanVer) + RELEASE_FOOTER.replaceAll('{ver}', cleanVer)
}

if (isCliEntry) {
  const args = process.argv.slice(2)
  const isRelease = args.includes('--release')
  const listOnly = args.includes('--list')
  const [targetTag = '', outPath = ''] = args.filter((a) => !a.startsWith('--'))
  const changelogPath = resolve(process.cwd(), 'CHANGELOG.md')
  const raw = await readFile(changelogPath, 'utf-8')

  if (listOnly) {
    process.stdout.write(`${listChangelogVersions(raw).join('\n')}\n`)
    process.exit(0)
  }

  let extracted
  try {
    extracted = isRelease ? buildReleaseBody(raw, targetTag) : extractChangelogSection(raw, targetTag)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  if (outPath) {
    const absOut = resolve(process.cwd(), outPath)
    await mkdir(dirname(absOut), { recursive: true })
    await writeFile(absOut, `${extracted}\n`, 'utf-8')
    console.log(`[extract-changelog] Wrote ${extracted.length} chars for ${targetTag || 'Unreleased'} -> ${outPath}`)
  } else {
    process.stdout.write(`${extracted}\n`)
  }
}
