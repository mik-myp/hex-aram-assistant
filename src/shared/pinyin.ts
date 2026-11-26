import { pinyin } from 'pinyin-pro'
import type { AugmentMeta } from './types'

export function toPinyinIndex(text: string): { full: string; initials: string } {
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
  if (!cleaned) return { full: '', initials: '' }
  const full = pinyin(cleaned, { toneType: 'none', type: 'array' }).join('').toLowerCase()
  const initials = pinyin(cleaned, { pattern: 'first', toneType: 'none', type: 'array' })
    .join('')
    .toLowerCase()
  return { full, initials }
}

export function normalizeChineseText(input: string): string {
  return input
    .replace(/[\s·•:：,，.。!！?？'"“”‘’()（）[\]【】<>《》\-_/\\|0-9a-zA-Z%+]/g, '')
    .trim()
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  )
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

export function charBigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const setA = new Set<string>()
  const setB = new Set<string>()
  for (let i = 0; i < a.length; i++) {
    setA.add(a[i])
    if (i < a.length - 1) setA.add(a.slice(i, i + 2))
  }
  for (let i = 0; i < b.length; i++) {
    setB.add(b[i])
    if (i < b.length - 1) setB.add(b.slice(i, i + 2))
  }
  let inter = 0
  for (const token of setA) {
    if (setB.has(token)) inter++
  }
  return (2 * inter) / (setA.size + setB.size)
}

/**
 * Match noisy OCR Chinese text lines/segments against the ~250 official Hextech augment dictionary.
 * Handles 1-2 OCR misrecognized homophone/lookalike characters (e.g. "珠光护乎" -> "珠光护手").
 */
export function matchAugmentsFromOcrText(
  ocrSegments: string[],
  augments: Record<string, AugmentMeta>,
  maxResults = 3
): { matchedIds: string[]; confidence: number } {
  const catalog = Object.values(augments).map((aug) => ({
    id: aug.id,
    name: aug.name,
    norm: normalizeChineseText(aug.name),
    py: aug.pinyinFull
  }))

  const candidateScores = new Map<string, number>()

  for (const rawSeg of ocrSegments) {
    const lines = rawSeg
      .split(/[\r\n]+/)
      .map((l) => normalizeChineseText(l))
      .filter((l) => l.length >= 2)

    for (const line of lines) {
      for (const item of catalog) {
        if (!item.norm) continue

        let score = 0
        if (line === item.norm) {
          score = 1.0
        } else if (line.includes(item.norm) && item.norm.length >= 2) {
          score = 0.94
        } else if (item.norm.includes(line) && line.length >= 3) {
          score = 0.86
        } else {
          // Sliding window over longer OCR line
          const winLen = item.norm.length
          const windows: string[] = []
          if (line.length <= winLen + 2) {
            windows.push(line)
          } else {
            for (let k = 0; k <= line.length - winLen; k++) {
              windows.push(line.slice(k, k + winLen))
            }
          }

          for (const w of windows) {
            const maxLen = Math.max(w.length, item.norm.length)
            const dist = levenshteinDistance(w, item.norm)
            const editSim = 1 - dist / maxLen
            const biSim = charBigramSimilarity(w, item.norm)
            // Also check pinyin similarity for lookalike/homophone confusion
            let pySim = 0
            if (editSim >= 0.45 || biSim >= 0.45) {
              const wPy = toPinyinIndex(w).full
              if (wPy && item.py) {
                const pyDist = levenshteinDistance(wPy, item.py)
                pySim = 1 - pyDist / Math.max(wPy.length, item.py.length)
              }
            }
            const combined = editSim * 0.55 + biSim * 0.3 + pySim * 0.15
            if (combined > score) score = combined
          }
        }

        if (score >= 0.58) {
          const prev = candidateScores.get(item.id) ?? 0
          if (score > prev) candidateScores.set(item.id, score)
        }
      }
    }
  }

  const ranked = [...candidateScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxResults)
  if (ranked.length === 0) {
    return { matchedIds: [], confidence: 0 }
  }
  const avgConf = ranked.reduce((acc, [, s]) => acc + s, 0) / ranked.length
  return {
    matchedIds: ranked.map(([id]) => id),
    confidence: Number(avgConf.toFixed(3))
  }
}

export function matchesSearchQuery(
  query: string,
  target: { name: string; pinyinFull: string; pinyinInitials: string; extraKeywords?: string }
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (target.name.toLowerCase().includes(q)) return true
  if (target.pinyinInitials.includes(q)) return true
  if (target.pinyinFull.includes(q)) return true
  if (target.extraKeywords && target.extraKeywords.toLowerCase().includes(q)) return true
  return false
}
