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

if (isCliEntry) {
  const targetTag = process.argv[2] || ''
  const outPath = process.argv[3] || ''
  const changelogPath = resolve(process.cwd(), 'CHANGELOG.md')

  const raw = await readFile(changelogPath, 'utf-8')
  const extracted = extractChangelogSection(raw, targetTag)

  if (outPath) {
    const absOut = resolve(process.cwd(), outPath)
    await mkdir(dirname(absOut), { recursive: true })
    await writeFile(absOut, `${extracted}\n`, 'utf-8')
    console.log(`[extract-changelog] Wrote ${extracted.length} chars for ${targetTag || 'Unreleased'} -> ${outPath}`)
  } else {
    process.stdout.write(`${extracted}\n`)
  }
}
