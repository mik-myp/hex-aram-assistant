export interface ParsedReleaseSection {
  heading: string
  tone: 'added' | 'improved' | 'fixed' | 'notes'
  items: string[]
}

export interface ParsedReleaseNotes {
  summaryLine: string | null
  sections: ParsedReleaseSection[]
  rawFallback: string
}

function classifyHeadingTone(heading: string): ParsedReleaseSection['tone'] {
  if (/新增|added|feat|功能/i.test(heading)) return 'added'
  if (/优化|性能|体验|improv|perf|changed/i.test(heading)) return 'improved'
  if (/修复|fix|bug/i.test(heading)) return 'fixed'
  return 'notes'
}

/**
 * Parses Keep-a-Changelog style Chinese/English Markdown release notes into structured UI cards.
 * Gracefully falls back if a release body consists of plain lines or auto-generated git bullets.
 */
export function parseReleaseNotesMarkdown(markdown: string): ParsedReleaseNotes {
  const clean = (markdown || '').trim()
  if (!clean) {
    return { summaryLine: null, sections: [], rawFallback: '' }
  }

  const lines = clean.split(/\r?\n/)
  let summaryLine: string | null = null
  const sections: ParsedReleaseSection[] = []
  let current: ParsedReleaseSection | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Skip top-level version header `## [v0.4.0] - 2026-...`
    if (/^##\s+/.test(line) && !/^###\s+/.test(line)) {
      continue
    }

    if (/^>\s+/.test(line) && !summaryLine) {
      summaryLine = line.replace(/^>\s*/, '').replace(/\*\*/g, '').trim()
      continue
    }

    if (/^###\s+/.test(line)) {
      const heading = line.replace(/^###\s+/, '').trim()
      current = {
        heading,
        tone: classifyHeadingTone(heading),
        items: []
      }
      sections.push(current)
      continue
    }

    if (/^[-*•]\s+/.test(line)) {
      const itemText = line.replace(/^[-*•]\s+/, '').replace(/\*\*(.*?)\*\*/g, '$1').trim()
      if (!current) {
        current = {
          heading: '版本更新内容',
          tone: 'notes',
          items: []
        }
        sections.push(current)
      }
      if (itemText) {
        current.items.push(itemText)
      }
    }
  }

  return {
    summaryLine,
    sections: sections.filter((s) => s.items.length > 0),
    rawFallback: clean
  }
}

/**
 * Extracts a target version's release notes body from `CHANGELOG.md` (with `[Unreleased]` fallback).
 */
export function extractChangelogSection(changelogText: string, rawVersion: string): string {
  const cleanVer = (rawVersion || '').trim().replace(/^[vV]/, '')
  const lines = changelogText.split(/\r?\n/)

  const matchSection = (matcher: (headerLine: string) => boolean): string | null => {
    let capturing = false
    const collected: string[] = []
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
    const body = collected.join('\n').replace(/^\s*---\s*$/gm, '').trim()
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
