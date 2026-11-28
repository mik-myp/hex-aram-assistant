import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildResolutionAwareCardSlots,
  CLIENT_BENCH_MAX_SLOTS,
  computeClientBenchSlotLayout,
  computeGameAugmentCardBoxes,
  computeGameAugmentCardBoxesForCount,
  computeOcrCardBandCropRect,
  computeOcrTitleStripCropRect,
  fitAugmentColumnsToLayout,
  GAME_CARD_STEP_BY_H,
  resolveClientEffectiveRect,
  resolveHoveredAugmentSlot
} from '../src/shared/layoutGeometry'
import {
  compileIconTemplate,
  decodeFingerprintBytesBase64,
  ICON_FP_SIZE,
  matchIconSlotFromBuffer,
  type SerializedIconFingerprintMap
} from '../src/shared/iconMatcher'
import { mergeIconAndOcrPasses } from '../src/main/ocr/iconFusionPass'
import { hasVisualFrameChanged } from '../src/main/ocr/tesseractOcrAdapter'
import { matchWordsAdaptiveColumns } from '../src/main/ocr/winrtOcrAdapter'
import { matchAugmentsFromOcrText, toPinyinIndex } from '../src/shared/pinyin'
import {
  buildAugmentReverseDetail,
  buildHeroDetailGuide,
  classifyAugmentVerdict,
  computeBenchSuggestions,
  smoothWinRate
} from '../src/main/data/synergyEngine'
import { computeLocalTacticalAdvice } from '../src/main/ai/tacticalEngine'
import { summarizeMatchHistoryRecords } from '../src/main/data/matchHistoryStore'
import { normalizeIntegerBounds } from '../src/main/window/windowManager'
import { buildDiagnosticSummary, logDiag } from '../src/main/logger/diagLogger'
import {
  compareSemver,
  selectMatchingReleaseAsset
} from '../src/main/updater/updateService'
import {
  buildConfigBackupJson,
  CURRENT_CONFIG_SCHEMA_VERSION,
  parseConfigBackupJson,
  sanitizeAiSettings,
  sanitizeUserPreferences
} from '../src/shared/configSchema'
import {
  extractChangelogSection,
  parseReleaseNotesMarkdown
} from '../src/shared/changelogParser'
import type { AugmentMeta, GameLiveState, SeedBundle } from '../src/shared/types'

function makePy(name: string): { pinyinFull: string; pinyinInitials: string } {
  const p = toPinyinIndex(name)
  return { pinyinFull: p.full, pinyinInitials: p.initials }
}

function createMockBundle(): SeedBundle {
  const augments: Record<string, AugmentMeta> = {
    '1001': {
      id: '1001',
      name: '珠光护手',
      rarity: 'prismatic',
      desc: '你的技能可以造成暴击，获得25%暴击几率。',
      iconUrl: '',
      tags: ['crit'],
      ...makePy('珠光护手')
    },
    '1002': {
      id: '1002',
      name: '歌利亚巨人',
      rarity: 'prismatic',
      desc: '体积变大，获得35%最大生命值与适应之力。',
      iconUrl: '',
      tags: ['tank'],
      ...makePy('歌利亚巨人')
    },
    '1003': {
      id: '1003',
      name: '炼狱导管',
      rarity: 'prismatic',
      desc: '技能命中敌人施加无限叠加的灼烧伤害并缩减基本技能冷却。',
      iconUrl: '',
      tags: ['burn', 'haste'],
      ...makePy('炼狱导管')
    },
    '1005': {
      id: '1005',
      name: '回归基本功',
      rarity: 'prismatic',
      desc: '你的终极技能被封印，获得普通技能伤害与急速。',
      iconUrl: '',
      tags: ['haste'],
      ...makePy('回归基本功')
    },
    '1006': {
      id: '1006',
      name: '玻璃大炮',
      rarity: 'prismatic',
      desc: '造成的伤害提升，但最大生命值降低。',
      iconUrl: '',
      tags: ['crit'],
      ...makePy('玻璃大炮')
    },
    '1007': {
      id: '1007',
      name: '终极唤醒',
      rarity: 'gold',
      desc: '施放终极技能后刷新基础技能冷却。',
      iconUrl: '',
      tags: ['haste'],
      ...makePy('终极唤醒')
    }
  }

  return {
    meta: {
      patch: '16.23',
      mode: 'normal',
      modeLabel: '常规',
      activeBand: 'all',
      bandsAvailable: false,
      seq: 22,
      matchesValid: 8401866,
      snapshotAt: '2026-11-26T09:00:00+08:00',
      sourceRepo: 'https://github.com/czgreat/aramhex-data',
      license: 'CC BY-NC 4.0',
      syncedAt: '2026-11-26T09:00:00+08:00',
      fromSource: 'bundled'
    },
    heroes: {
      '54': {
        id: '54',
        alias: 'Malphite',
        name: '墨菲特',
        title: '熔岩巨兽',
        roles: ['tank', 'mage'],
        damageType: 'TANK',
        avatarUrl: '',
        games: 40000,
        wins: 20000,
        winRate: 0.5,
        smoothedWinRate: 0.5,
        pickRate: 0.01,
        rank: 65,
        tier: 'T2',
        skillOrder: '主Q · 副E',
        pinyinFull: 'mofeite,石头人',
        pinyinInitials: 'mft'
      },
      '10': {
        id: '10',
        alias: 'Kayle',
        name: '凯尔',
        title: '正义天使',
        roles: ['marksman', 'mage'],
        damageType: 'AD',
        avatarUrl: '',
        games: 50000,
        wins: 28000,
        winRate: 0.56,
        smoothedWinRate: 0.558,
        pickRate: 0.012,
        rank: 2,
        tier: 'T0',
        skillOrder: '主E · 副Q',
        pinyinFull: 'kaier',
        pinyinInitials: 'ke'
      },
      '36': {
        id: '36',
        alias: 'DrMundo',
        name: '蒙多医生',
        title: '祖安狂人',
        roles: ['tank', 'fighter'],
        damageType: 'TANK',
        avatarUrl: '',
        games: 30000,
        wins: 16000,
        winRate: 0.533,
        smoothedWinRate: 0.532,
        pickRate: 0.008,
        rank: 15,
        tier: 'T1',
        pinyinFull: 'mengduoyisheng',
        pinyinInitials: 'mdys'
      },
      '238': {
        id: '238',
        alias: 'Zed',
        name: '劫',
        title: '影流之主',
        roles: ['assassin'],
        damageType: 'AD',
        avatarUrl: '',
        games: 25000,
        wins: 12000,
        winRate: 0.48,
        smoothedWinRate: 0.481,
        pickRate: 0.009,
        rank: 95,
        tier: 'T3',
        pinyinFull: 'jie',
        pinyinInitials: 'j'
      }
    },
    augments,
    items: {
      '3084': { id: '3084', name: '心之钢', iconUrl: '', category: 'tank', types: [], totalGold: 3000, brief: '叠加最大生命', fullDesc: '' },
      '2502': { id: '2502', name: '无终恨意', iconUrl: '', category: 'tank', types: [], totalGold: 2800, brief: '周围吸甲回血', fullDesc: '' },
      '3075': { id: '3075', name: '荆棘之甲', iconUrl: '', category: 'tank', types: [], totalGold: 2450, brief: '反弹重伤', fullDesc: '' },
      '3143': { id: '3143', name: '兰顿之兆', iconUrl: '', category: 'tank', types: [], totalGold: 2700, brief: '减暴击伤害', fullDesc: '' },
      '3118': { id: '3118', name: '残疫', iconUrl: '', category: 'mage', types: [], totalGold: 2700, brief: '大招减魔抗灼烧', fullDesc: '' },
      '4645': { id: '4645', name: '影焰', iconUrl: '', category: 'mage', types: [], totalGold: 3200, brief: '低血量技能暴击', fullDesc: '' },
      '3089': { id: '3089', name: '灭世者的死亡之帽', iconUrl: '', category: 'mage', types: [], totalGold: 3500, brief: '大幅提升法强', fullDesc: '' }
    },
    heroAugments: {
      '54': [
        ['1002', 3000, 1620, 0], // 54% tank
        ['1006', 1500, 720, 0],  // 48% fragile nuke
        ['1003', 2000, 1040, 0], // 52% burn
        ['1005', 1200, 480, 0]   // 40% trap
      ],
      '10': [
        ['1001', 2500, 1450, 0],
        ['1005', 1800, 1120, 0]
      ]
    },
    coreBuilds: {
      '54': [{ items: ['3084', '2502', '3075'], ordered: true, games: 5000, winRate: 0.53, pickRate: 0.08 }]
    },
    heroItems: {},
    heroAugmentItems: {},
    heroSpells: {
      '54': [['4+32', 8000, 4120]]
    }
  }
}

describe('HexBuddy Spatial HUD & Global Tactical Engine', () => {
  it('evaluates Malphite globally with gold affordability, team tank needs, and fed-boss counter items', () => {
    const bundle = createMockBundle()
    const baseState: GameLiveState = {
      connectionMode: 'live-in-game',
      myHeroId: '54',
      allyHeroIds: ['54', '10', '238', '10'], // 0 other tanks!
      benchHeroIds: [],
      enemyHeroIds: ['238', '36'],
      enemyPlayers: [
        { heroId: '238', kills: 12, deaths: 2, assists: 5, itemIds: [], isFedBoss: true },
        { heroId: '36', kills: 2, deaths: 5, assists: 4, itemIds: ['3084'], isFedBoss: false }
      ],
      currentLevel: 7,
      currentGold: 2900,
      isDead: true,
      isAugmentMilestone: true,
      currentItemIds: [],
      pickedAugmentIds: [],
      candidateAugmentIds: ['1002', '1006'], // 歌利亚巨人 vs 玻璃大炮
      cardSlots: [
        { slotIndex: 0, augmentId: '1002', xRatio: 0.285, yRatio: 0.24 },
        { slotIndex: 1, augmentId: '1006', xRatio: 0.5, yRatio: 0.24 }
      ],
      lastUpdatedAt: Date.now()
    }

    // 1. Default global evaluation favors Goliath ('1002') over fragile Glass Cannon against 12-kill Zed, and recommends Heartsteel ('3084')
    const advice = computeLocalTacticalAdvice(bundle, baseState, '54')
    const winner = advice.situationalCandidates.find((c) => c.isRecommendedPick)
    expect(winner?.augmentId).toBe('1002')
    expect(advice.immediateNextItem?.itemId).toBe('3084')
    expect(advice.immediateNextItem?.affordableNow).toBe(false) // 2900 < 3000, needs 100g
    expect(advice.immediateNextItem?.goldRemaining).toBe(100)

    // 2. Once Malphite owns 1 item against 12-kill AD assassin Zed, Randuin's ('3143') triggers as anti-boss counter!
    const midGameAdvice = computeLocalTacticalAdvice(
      bundle,
      { ...baseState, currentItemIds: ['3084'] },
      '54'
    )
    expect(midGameAdvice.dynamicBuildPlan.some((s) => s.itemId === '3143' && s.sourceTag === '专治大爹')).toBe(true)
  })

  it('flags hard mechanic conflicts (e.g. Back to Basics sealing R vs Ultimate Awakening)', () => {
    const bundle = createMockBundle()
    const state: GameLiveState = {
      connectionMode: 'live-in-game',
      myHeroId: '10',
      allyHeroIds: ['10'],
      benchHeroIds: [],
      enemyHeroIds: ['36'],
      enemyPlayers: [],
      currentLevel: 7,
      currentGold: 1500,
      isDead: true,
      isAugmentMilestone: true,
      currentItemIds: [],
      pickedAugmentIds: ['1005'], // Already picked Back to Basics (seals R!)
      candidateAugmentIds: ['1007', '1001'], // Ultimate Awakening ('1007') conflicts!
      cardSlots: [],
      lastUpdatedAt: Date.now()
    }
    const advice = computeLocalTacticalAdvice(bundle, state, '10')
    const conflictEval = advice.situationalCandidates.find((c) => c.augmentId === '1007')
    expect(conflictEval?.hasConflict).toBe(true)
    expect(conflictEval?.verdict).toBe('TRAP')
  })

  it('preserves exact LCU bench slot indices for spatial portrait badges and validates 16.23 seed', () => {
    const bundle = createMockBundle()
    const bench = computeBenchSuggestions(
      bundle,
      '54',
      ['54'],
      ['36', '10'],
      sanitizeUserPreferences({ favoriteHeroIds: ['10'] })
    )
    expect(bench[0].benchIndex).toBe(0)
    expect(bench[0].heroId).toBe('36')
    expect(bench[1].benchIndex).toBe(1)
    expect(bench[1].heroId).toBe('10')
    expect(bench[1].shortTag).toContain('本命')

    const seedPath = resolve(__dirname, '../resources/seed-data/seed-bundle.json')
    const realBundle = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedBundle
    expect(Object.keys(realBundle.heroes).length).toBeGreaterThanOrEqual(170)
    expect(smoothWinRate(50, 100, 0.5, 300)).toBe(0.5)
    expect(classifyAugmentVerdict(-0.05, 500, 10).verdict).toBe('TRAP')
    expect(
      matchAugmentsFromOcrText(['珠光护乎'], realBundle.augments, 1).matchedIds.length
    ).toBe(1)
    expect(buildHeroDetailGuide(realBundle, '1')).not.toBeNull()
    expect(buildAugmentReverseDetail(realBundle, '1001')?.bestHeroes.length).toBe(10)
  })

  it('aligns 10-slot ARAM bench & 3-pick cards accurately across 720p, 1080p, 16:10, and 21:9 ultrawide', () => {
    // 1. Verify all 10 ARAM Bench slots never overlap at 1280×720, 1600×900, and 1920×1080
    for (const [w, h] of [
      [1280, 720],
      [1600, 900],
      [1920, 1080]
    ] as const) {
      const slots = Array.from({ length: CLIENT_BENCH_MAX_SLOTS }, (_, i) =>
        computeClientBenchSlotLayout(w, h, i)
      )
      // Slot 0 starts at left-aligned ARAM bench (x ≈ 29.38% of clientW, NOT 50%!)
      expect(slots[0].centerX / w).toBeCloseTo(564 / 1920, 3)
      for (let i = 0; i < slots.length - 1; i++) {
        const rightEdge = slots[i].centerX + slots[i].badgeWidth / 2
        const nextLeftEdge = slots[i + 1].centerX - slots[i + 1].badgeWidth / 2
        expect(rightEdge).toBeLessThanOrEqual(nextLeftEdge)
      }
    }

    // 2. Verify RCLIENT 16:9 inscribing when fallback runs on 3440×1440 (21:9)
    const inscribed = resolveClientEffectiveRect(3440, 1440)
    expect(inscribed.width).toBe(2560)
    expect(inscribed.x).toBe(440)

    // 3. Verify In-Game 3-Pick cards scale by H around W/2 across 16:9, 16:10, and 21:9
    const boxes1080 = computeGameAugmentCardBoxes(1920, 1080)
    expect(boxes1080[0].centerXRatio).toBeCloseTo(0.3078, 3)
    expect(boxes1080[1].centerXRatio).toBeCloseTo(0.5, 3)
    expect(boxes1080[2].centerXRatio).toBeCloseTo(0.6922, 3)

    const boxes1610 = computeGameAugmentCardBoxes(2560, 1600)
    expect(boxes1610[0].centerXRatio).toBeCloseTo((1280 - 0.3417 * 1600) / 2560, 3)

    const boxes219 = computeGameAugmentCardBoxes(3440, 1440)
    expect(boxes219[0].centerX).toBeCloseTo(1720 - 0.3417 * 1440, 1) // ~1228px (35.7%, NOT 28.5% = 980px!)
    expect(boxes219[2].centerX).toBeCloseTo(1720 + 0.3417 * 1440, 1) // ~2212px (64.3%)

    // 4. Verify OCR narrow title crop NEVER overlaps top or bottom HUD badges (0% self-reading)
    const ocrCrop = computeOcrTitleStripCropRect(2560, 1440)
    expect(boxes219[0].badgeTopModeBottomY).toBeLessThan(ocrCrop.y - 120)
    expect(boxes219[0].badgeBottomModeTopY).toBeGreaterThan(ocrCrop.y + ocrCrop.height + 120)

    // 5. Verify cursor column tracking on 3440×1440 (21:9) accurately resolves x=1380 (rx=0.401) as Slot 0!
    expect(resolveHoveredAugmentSlot(1380, 700, 3440, 1440)).toBe(0)
    expect(resolveHoveredAugmentSlot(1720, 700, 3440, 1440)).toBe(1)
    expect(resolveHoveredAugmentSlot(2150, 700, 3440, 1440)).toBe(2)
  })

  it('compares semver versions and selects matching Setup vs Portable Windows assets', () => {
    expect(compareSemver('v0.3.1', '0.3.0')).toBe(1)
    expect(compareSemver('0.3.0', 'v0.3.0')).toBe(0)
    expect(compareSemver('0.2.9', '0.3.0')).toBe(-1)
    expect(compareSemver('v1.0.0', '0.9.9')).toBe(1)

    const assets = [
      {
        name: 'HexBuddy-Portable-0.3.1.exe',
        size: 91000000,
        digest: 'sha256:aaa',
        browser_download_url: 'https://example.com/portable.exe'
      },
      {
        name: 'HexBuddy-Setup-0.3.1.exe',
        size: 104000000,
        digest: 'sha256:bbb',
        browser_download_url: 'https://example.com/setup.exe'
      }
    ]
    expect(selectMatchingReleaseAsset(assets, false)?.name).toBe('HexBuddy-Setup-0.3.1.exe')
    expect(selectMatchingReleaseAsset(assets, true)?.name).toBe('HexBuddy-Portable-0.3.1.exe')
  })

  it('builds desensitized diagnostic summary with elevation & OCR status', async () => {
    logDiag('TEST', 'Simulated diagnostic check ok')
    const summary = await buildDiagnosticSummary({
      isSelfElevated: false,
      leagueElevatedMismatch: true,
      connectionMode: 'live-in-game',
      trackedWindowSummary: 'game 2560x1440 @(0,0)',
      ocrEngineSummary: 'Windows原生WinRT优先(0MB常驻)',
      datasetSummary: '16.23 (常规 · seq#22 · bundled)'
    })
    expect(summary.leagueElevatedMismatch).toBe(true)
    expect(summary.formattedReport).toContain('2560x1440')
    expect(summary.formattedReport).toContain('Simulated diagnostic check ok')
  })

  it('sanitizes legacy preferences, clamps out-of-range scales, and redacts API keys on config backup', () => {
    const migrated = sanitizeUserPreferences({
      favoriteHeroIds: ['10', '10', '  54 '],
      preferredRoles: ['mage', 'invalid_role', 'mage'],
      hudScale: 9.9,
      hudOffsetX: -25,
      hudOffsetY: 12.4,
      overlayOpacity: 'unknown'
    })
    expect(migrated.schemaVersion).toBe(CURRENT_CONFIG_SCHEMA_VERSION)
    expect(migrated.favoriteHeroIds).toEqual(['10', '54'])
    expect(migrated.preferredRoles).toEqual(['mage'])
    expect(migrated.hudScale).toBe(1.3)
    expect(migrated.hudOffsetX).toBe(-8)
    expect(migrated.hudOffsetY).toBe(8)
    expect(migrated.overlayOpacity).toBe('solid')
    expect(migrated.enableBenchBadges).toBe(true)

    const ai = sanitizeAiSettings({
      apiKey: '  sk-secret-12345  ',
      toneStyle: 'witty'
    })
    const exported = buildConfigBackupJson(migrated, ai)
    expect(exported).not.toContain('sk-secret-12345')

    const restored = parseConfigBackupJson(exported, 'sk-local-preserved')
    expect(restored.settings.apiKey).toBe('sk-local-preserved')
    expect(restored.settings.toneStyle).toBe('witty')
    expect(restored.prefs.favoriteHeroIds).toEqual(['10', '54'])
  })

  it('extracts Chinese CHANGELOG sections and parses structured release notes cards', () => {
    const changelogMd = readFileSync(resolve(__dirname, '../CHANGELOG.md'), 'utf-8')
    const v032Body = extractChangelogSection(changelogMd, 'v0.3.2')
    expect(v032Body).toContain('WeGame 管理员权限对等检测')
    expect(v032Body).not.toContain('v0.3.1')

    const v040Body = extractChangelogSection(changelogMd, 'v0.4.0')
    expect(v040Body).toContain('独立设置中心')

    const parsed = parseReleaseNotesMarkdown(v032Body)
    expect(parsed.summaryLine).toContain('版本核心')
    expect(parsed.sections.some((s) => s.tone === 'added')).toBe(true)
    expect(parsed.sections.some((s) => s.tone === 'improved')).toBe(true)
    expect(parsed.sections.some((s) => s.tone === 'fixed')).toBe(true)
  })

  it('normalizes fractional DPI bounds safely and rejects degenerate rects', () => {
    expect(
      normalizeIntegerBounds({ x: 10.6, y: 20.4, width: 1066.6667, height: 600.25 })
    ).toEqual({ x: 11, y: 20, width: 1067, height: 600 })
    expect(normalizeIntegerBounds({ x: 0, y: 0, width: 100, height: 100 })).toBeNull()
    expect(normalizeIntegerBounds({ x: Number.NaN, y: 0, width: 1280, height: 720 })).toBeNull()
  })

  it('adapts steady-mode recommendations globally to purchased AP items, enemy dive/tanks, and post-swap bench comp', () => {
    const bundle = createMockBundle()
    // AP Malphite already bought Malignance ('3118') -> steady mode recognizes AP build trajectory & recommends AP follow-up ('4645') and favors burn/haste over tank!
    const apMalphiteState: GameLiveState = {
      connectionMode: 'live-in-game',
      myHeroId: '54',
      allyHeroIds: ['54', '36', '10', '238'],
      benchHeroIds: [],
      enemyHeroIds: ['36', '36', '238'],
      enemyPlayers: [
        { heroId: '36', kills: 4, deaths: 2, assists: 5, itemIds: ['3084'], isFedBoss: false },
        { heroId: '36', kills: 3, deaths: 3, assists: 4, itemIds: ['2502'], isFedBoss: false },
        { heroId: '238', kills: 9, deaths: 2, assists: 1, itemIds: [], isFedBoss: true }
      ],
      currentLevel: 11,
      currentGold: 3300,
      isDead: true,
      isAugmentMilestone: true,
      currentItemIds: ['3118'],
      pickedAugmentIds: ['1003'],
      candidateAugmentIds: ['1003', '1006'], // 炼狱导管 vs 玻璃大炮 against tanks + fed assassin
      cardSlots: [],
      lastUpdatedAt: Date.now()
    }

    const steadyAdvice = computeLocalTacticalAdvice(bundle, apMalphiteState, '54')
    expect(steadyAdvice.dynamicBuildPlan[0].itemId).toBe('4645')
    const winner = steadyAdvice.situationalCandidates.find((c) => c.isRecommendedPick)
    expect(winner?.augmentId).toBe('1003')
    const fragile = steadyAdvice.situationalCandidates.find((c) => c.augmentId === '1006')
    expect(fragile?.situationalBonus).toBeLessThan(0)

    // Post-swap bench check: when Malphite ('54') is the team's SOLE tank, swapping to non-tank warns "换后无前排"
    const benchWhenSoleTank = computeBenchSuggestions(
      bundle,
      '54',
      ['54', '10', '238', '10', '238'],
      ['10', '36']
    )
    expect(benchWhenSoleTank[0].reason).toContain('换后无前排')
    expect(benchWhenSoleTank[1].reason).toContain('换后补前排')
  })

  it('matches all 237 real offline augment icon fingerprints under rarity tint & micro-shift and fuses with OCR', () => {
    const fpPath = resolve(__dirname, '../resources/seed-data/augment-icon-fingerprints.json')
    const fpFile = JSON.parse(readFileSync(fpPath, 'utf-8')) as SerializedIconFingerprintMap
    const seedPath = resolve(__dirname, '../resources/seed-data/seed-bundle.json')
    const realBundle = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedBundle

    const templates = Object.entries(fpFile.entries)
      .map(([id, b64]) =>
        compileIconTemplate(id, decodeFingerprintBytesBase64(b64), realBundle.augments[id]?.rarity)
      )
      .filter((t): t is NonNullable<typeof t> => t !== null)
    expect(templates.length).toBeGreaterThanOrEqual(230)

    // Render 3 real augment icons onto a simulated 1920x1080 card band with different tints (Gold/Prismatic/Silver) & slight pixel jitter
    const gameW = 1920
    const gameH = 1080
    const band = computeOcrCardBandCropRect(gameW, gameH)
    const boxes = computeGameAugmentCardBoxes(gameW, gameH)
    // Verify card band encloses all 3 icon rects & title bands without touching HUD badges
    expect(band.y).toBeLessThanOrEqual(boxes[0].iconRect.y)
    expect(band.y + band.height).toBeGreaterThanOrEqual(
      boxes[0].titleBand.y + boxes[0].titleBand.height
    )
    expect(boxes[0].badgeTopModeBottomY).toBeLessThan(band.y - 20)

    const bgra = new Uint8Array(band.width * band.height * 4)
    // Fill dark textured card background
    for (let y = 0; y < band.height; y++) {
      for (let x = 0; x < band.width; x++) {
        const i = (y * band.width + x) * 4
        bgra[i] = 28 + ((x + y) % 9)
        bgra[i + 1] = 22 + (y % 7)
        bgra[i + 2] = 18 + (x % 5)
        bgra[i + 3] = 255
      }
    }

    const targets: Array<{
      slot: 0 | 1 | 2
      id: string
      tint: [number, number, number]
      dx: number
      dy: number
    }> = [
      { slot: 0, id: '1001', tint: [0.95, 0.78, 0.42], dx: 2, dy: -2 }, // Gold tint
      { slot: 1, id: '1004', tint: [0.85, 0.65, 1.0], dx: -2, dy: 2 }, // Prismatic tint
      { slot: 2, id: '1006', tint: [0.82, 0.88, 0.96], dx: 1, dy: 1 } // Silver tint
    ]

    for (const t of targets) {
      const fpBytes = decodeFingerprintBytesBase64(fpFile.entries[t.id])
      const rect = boxes[t.slot].iconRect
      const localX = rect.x - band.x + t.dx
      const localY = rect.y - band.y + t.dy
      for (let py = 0; py < rect.height; py++) {
        const gy = Math.min(ICON_FP_SIZE - 1, Math.floor((py / rect.height) * ICON_FP_SIZE))
        for (let px = 0; px < rect.width; px++) {
          const gx = Math.min(ICON_FP_SIZE - 1, Math.floor((px / rect.width) * ICON_FP_SIZE))
          const val = fpBytes[gy * ICON_FP_SIZE + gx]
          const dstX = localX + px
          const dstY = localY + py
          if (dstX < 0 || dstY < 0 || dstX >= band.width || dstY >= band.height) continue
          const idx = (dstY * band.width + dstX) * 4
          const alpha = val / 255
          // BGRA order
          bgra[idx] = Math.min(255, Math.round(bgra[idx] * (1 - alpha) + 255 * t.tint[2] * alpha))
          bgra[idx + 1] = Math.min(
            255,
            Math.round(bgra[idx + 1] * (1 - alpha) + 255 * t.tint[1] * alpha)
          )
          bgra[idx + 2] = Math.min(
            255,
            Math.round(bgra[idx + 2] * (1 - alpha) + 255 * t.tint[0] * alpha)
          )
        }
      }
    }

    const start = Date.now()
    for (const t of targets) {
      const rect = boxes[t.slot].iconRect
      const hit = matchIconSlotFromBuffer(
        bgra,
        band.width,
        band.height,
        { x: rect.x - band.x, y: rect.y - band.y, width: rect.width, height: rect.height },
        templates,
        true
      )
      expect(hit?.augmentId).toBe(t.id)
      expect(hit?.confident).toBe(true)
    }
    expect(Date.now() - start).toBeLessThan(150)

    // Verify dual-channel fusion prioritizes OCR title over conflicting icon and drops non-confident icon noise
    const fused = mergeIconAndOcrPasses(
      {
        slotMatches: new Map([
          [0, { augmentId: '9999', score: 0.79, margin: 0.14, confident: true }], // icon guessed wrong card '9999' under hover glow
          [1, { augmentId: '1008', score: 0.65, margin: 0.04, confident: false }], // weak non-confident icon noise -> dropped!
          [2, { augmentId: '1006', score: 0.88, margin: 0.25, confident: true }]
        ]),
        totalSlots: 3,
        confidentCount: 2,
        matchedIds: ['9999', '1008', '1006'],
        avgScore: 0.77,
        elapsedMs: 3
      },
      {
        matchedIds: ['1001', '1004'],
        slotMap: new Map([
          [0, '1001'], // exact OCR title beats icon guess '9999'
          [1, '1004']
        ]),
        totalSlots: 3,
        rawLines: ['泰坦的坚决', '回归基本功'],
        avgConf: 0.92
      }
    )
    expect(fused.matchedIds).toEqual(['1001', '1004', '1006'])
    expect(fused.slotMap.get(0)).toBe('1001')
    expect(fused.slotMap.get(1)).toBe('1004')

    // Non-confident icon-only noise produces 0 cards (no mid-combat false-positive popups!)
    const noiseOnly = mergeIconAndOcrPasses(
      {
        slotMatches: new Map([
          [0, { augmentId: '1001', score: 0.66, margin: 0.05, confident: false }],
          [1, { augmentId: '1004', score: 0.64, margin: 0.03, confident: false }]
        ]),
        totalSlots: 3,
        confidentCount: 0,
        matchedIds: ['1001', '1004'],
        avgScore: 0.65,
        elapsedMs: 3
      },
      null
    )
    expect(noiseOnly.matchedIds).toEqual([])
  })

  it('detects golden augment combos, melee/scope conflicts, sample confidence, and stat anvil focus', () => {
    const seedPath = resolve(__dirname, '../resources/seed-data/seed-bundle.json')
    const realBundle = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedBundle

    // 1. Already picked 炼狱导管 (1045), offered 尤里卡 (1030) vs 大力 (1007) -> triggers golden combo 炼狱无限火链!
    const comboState: GameLiveState = {
      connectionMode: 'live-in-game',
      myHeroId: '1', // Annie (AP)
      allyHeroIds: ['1', '54', '10', '238', '36'],
      benchHeroIds: [],
      enemyHeroIds: ['36', '54', '238'],
      enemyPlayers: [
        { heroId: '36', kills: 3, deaths: 2, assists: 4, itemIds: ['3065'], isFedBoss: false },
        { heroId: '54', kills: 2, deaths: 3, assists: 6, itemIds: ['2504'], isFedBoss: false },
        { heroId: '238', kills: 4, deaths: 3, assists: 2, itemIds: [], isFedBoss: false }
      ],
      currentLevel: 7,
      currentGold: 2200,
      isDead: true,
      isAugmentMilestone: true,
      currentItemIds: ['6653'],
      pickedAugmentIds: ['1045'], // 炼狱导管
      candidateAugmentIds: ['1030', '1007'], // 尤里卡 vs 大力
      cardSlots: [],
      lastUpdatedAt: Date.now()
    }

    const advice = computeLocalTacticalAdvice(realBundle, comboState, '1')
    const eureka = advice.situationalCandidates.find((c) => c.augmentId === '1030')
    expect(eureka?.comboName).toBe('炼狱无限火链')
    expect(eureka?.isRecommendedPick).toBe(true)
    expect(eureka?.confidenceLevel).toBeDefined()
    expect(eureka?.sampleGames).toBeGreaterThan(0)
    // Enemy stacked 2 MR items ('3065', '2504') -> AP Stat Anvil prioritizes 法术穿透!
    expect(advice.anvilFocus?.primary).toContain('法术穿透')

    // 2. Hard conflict: 亮出你的剑 (1134) vs 最万用的瞄准镜 (1115)
    const conflictAdvice = computeLocalTacticalAdvice(
      realBundle,
      {
        ...comboState,
        pickedAugmentIds: ['1134'],
        candidateAugmentIds: ['1115', '1030']
      },
      '10'
    )
    const scope = conflictAdvice.situationalCandidates.find((c) => c.augmentId === '1115')
    expect(scope?.hasConflict).toBe(true)
    expect(scope?.verdict).toBe('TRAP')

    // 3. excludeHudFromCapture defaults true and honors explicit false
    expect(sanitizeUserPreferences({}).excludeHudFromCapture).toBe(true)
    expect(sanitizeUserPreferences({ excludeHudFromCapture: false }).excludeHudFromCapture).toBe(false)
  })

  it('aggregates local match history top heroes/augments with W/L stats and flags suspected exclusive fullscreen in diagnostics', async () => {
    const summary = summarizeMatchHistoryRecords([
      {
        id: '1',
        endedAt: '2026-11-28T10:00:00Z',
        durationSec: 840,
        heroId: '1',
        playstyleMode: 'steady',
        finalLevel: 15,
        pickedAugmentIds: ['1045', '1030'],
        finalItemIds: ['6653', '2503'],
        kills: 14,
        deaths: 5,
        assists: 19,
        result: 'win'
      },
      {
        id: '2',
        endedAt: '2026-11-28T10:30:00Z',
        durationSec: 720,
        heroId: '1',
        playstyleMode: 'yolo',
        finalLevel: 14,
        pickedAugmentIds: ['1045', '1048'],
        finalItemIds: ['3118'],
        kills: 8,
        deaths: 9,
        assists: 11,
        result: 'loss'
      },
      {
        id: '3',
        endedAt: '2026-11-28T11:00:00Z',
        durationSec: 650,
        heroId: '54',
        playstyleMode: 'team',
        finalLevel: 12,
        pickedAugmentIds: ['1041'],
        finalItemIds: ['3084']
      }
    ])

    expect(summary.totalMatches).toBe(3)
    expect(summary.wins).toBe(1)
    expect(summary.losses).toBe(1)
    expect(summary.decidedMatches).toBe(2)
    expect(summary.topHeroes[0]).toEqual({ heroId: '1', count: 2, wins: 1, decided: 2 })
    expect(summary.topAugments[0]).toEqual({ augmentId: '1045', count: 2, wins: 1, decided: 2 })

    const diag = await buildDiagnosticSummary({
      isSelfElevated: false,
      leagueElevatedMismatch: false,
      exclusiveFullscreenSuspected: true,
      localMatchesRecorded: 3,
      connectionMode: 'live-in-game',
      trackedWindowSummary: 'game 1920x1080 @(0,0)',
      ocrEngineSummary: 'GDI局部抓屏 + 图标指纹(237张)',
      datasetSummary: '16.23'
    })
    expect(diag.exclusiveFullscreenSuspected).toBe(true)
    expect(diag.localMatchesRecorded).toBe(3)
    expect(diag.formattedReport).toContain('疑似独占全屏')
  })

  it('supports 4-pick Hextech augment offers (geometry, adaptive 4-col OCR, hover tracking, and 4-card scoring)', () => {
    const seedPath = resolve(__dirname, '../resources/seed-data/seed-bundle.json')
    const realBundle = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedBundle

    // 1. Verify 4-card boxes never overlap horizontally on 1080p and 21:9, and are enclosed inside the widened OCR band
    for (const [w, h] of [
      [1920, 1080],
      [3440, 1440]
    ] as const) {
      const boxes4 = computeGameAugmentCardBoxesForCount(w, h, 4)
      expect(boxes4.length).toBe(4)
      const band = computeOcrCardBandCropRect(w, h)
      expect(band.x).toBeLessThanOrEqual(boxes4[0].titleBand.x)
      expect(band.x + band.width).toBeGreaterThanOrEqual(
        boxes4[3].titleBand.x + boxes4[3].titleBand.width
      )
      for (let i = 0; i < 3; i++) {
        const rightEdge = boxes4[i].centerX + boxes4[i].badgeWidth / 2
        const nextLeft = boxes4[i + 1].centerX - boxes4[i + 1].badgeWidth / 2
        expect(rightEdge).toBeLessThan(nextLeft)
      }
      expect(resolveHoveredAugmentSlot(boxes4[3].centerX, h * 0.5, w, h, 4)).toBe(3)
    }

    // 2. Real half-card shift test: even if only 3 out of 4 cards are detected at [-1.5, -0.5, +1.5]*spacing,
    // fitAugmentColumnsToLayout distinguishes 4-pick and maps them to slots [0, 1, 3]!
    const spacing1080 = GAME_CARD_STEP_BY_H * 1080
    const partial4 = fitAugmentColumnsToLayout(
      [960 - 1.5 * spacing1080, 960 - 0.5 * spacing1080, 960 + 1.5 * spacing1080],
      1920,
      1080
    )
    expect(partial4.totalSlots).toBe(4)
    expect(partial4.slotIndices).toEqual([0, 1, 3])

    // 3. Adaptive OCR column matcher with real 1080p strip coordinates detects all 4 cards accurately
    const titleStrip = computeOcrTitleStripCropRect(1920, 1080)
    const boxes4_1080 = computeGameAugmentCardBoxesForCount(1920, 1080, 4)
    const ocr4 = matchWordsAdaptiveColumns(
      [
        { t: '珠光护手', x0: boxes4_1080[0].centerX - titleStrip.x - 60, x1: boxes4_1080[0].centerX - titleStrip.x + 60 },
        { t: '炼狱导管', x0: boxes4_1080[1].centerX - titleStrip.x - 60, x1: boxes4_1080[1].centerX - titleStrip.x + 60 },
        { t: '尤里卡', x0: boxes4_1080[2].centerX - titleStrip.x - 50, x1: boxes4_1080[2].centerX - titleStrip.x + 50 },
        { t: '歌利亚巨人', x0: boxes4_1080[3].centerX - titleStrip.x - 70, x1: boxes4_1080[3].centerX - titleStrip.x + 70 }
      ],
      titleStrip.width,
      ['珠光护手 炼狱导管 尤里卡 歌利亚巨人'],
      realBundle.augments,
      { stripOriginX: titleStrip.x, stripScale: 1, gameW: 1920, gameH: 1080 }
    )
    expect(ocr4.totalSlots).toBe(4)
    expect(ocr4.matchedIds.length).toBe(4)
    expect(ocr4.slotMap.get(3)).toBe('1041')

    // 4. Single-card reroll frame change gate catches local pixel jump (>24) even when whole-strip mean barely moves
    const prevSig = new Uint8Array(144).fill(50)
    const rerollSig = new Uint8Array(prevSig)
    rerollSig[12] = 90 // single cell jumped +40, mean delta is only 40/144 = 0.28!
    expect(hasVisualFrameChanged(prevSig, rerollSig)).toBe(true)
    expect(hasVisualFrameChanged(prevSig, new Uint8Array(prevSig))).toBe(false)

    // 3. 4-card candidate slots & 5+ picked augments (e.g. Transmute Chaos / bonus round) evaluate cleanly
    const slots4 = buildResolutionAwareCardSlots(ocr4.matchedIds, 1920, 1080)
    expect(slots4.length).toBe(4)
    expect(slots4[3].slotIndex).toBe(3)
    expect(slots4[3].totalSlots).toBe(4)

    const advice4 = computeLocalTacticalAdvice(
      realBundle,
      {
        connectionMode: 'live-in-game',
        myHeroId: '1',
        allyHeroIds: ['1', '54', '10', '238', '36'],
        benchHeroIds: [],
        enemyHeroIds: ['36', '54', '238'],
        enemyPlayers: [],
        currentLevel: 15,
        currentGold: 3000,
        isDead: true,
        isAugmentMilestone: true,
        currentItemIds: ['6653'],
        pickedAugmentIds: ['1045', '1007', '1037', '1060', '1068'], // 5 already picked!
        candidateAugmentIds: ocr4.matchedIds,
        cardSlots: slots4,
        lastUpdatedAt: Date.now()
      },
      '1'
    )
    expect(advice4.situationalCandidates.length).toBe(4)
    expect(advice4.situationalCandidates.filter((c) => c.isRecommendedPick).length).toBe(1)
  })

  it('computes same-rarity Reroll EV advice, extended threat radar, and recommended spells', () => {
    const seedPath = resolve(__dirname, '../resources/seed-data/seed-bundle.json')
    const realBundle = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedBundle
    const guide = buildHeroDetailGuide(realBundle, '1')!
    const prismaticStats = guide.augments
      .filter((a) => realBundle.augments[a.augmentId]?.rarity === 'prismatic')
      .sort((a, b) => a.smoothedWinRate - b.smoothedWinRate)

    // Weak offer: pick the 3 lowest win-rate prismatic cards for Annie -> should recommend rerolling!
    const weakOfferIds = prismaticStats.slice(0, 3).map((a) => a.augmentId)
    const weakAdvice = computeLocalTacticalAdvice(
      realBundle,
      {
        connectionMode: 'live-in-game',
        myHeroId: '1',
        allyHeroIds: ['1', '54', '10', '238', '36'],
        benchHeroIds: [],
        enemyHeroIds: ['101', '115', '36', '40', '43'], // 2 poke + 2 shield + 1 heavy heal/tank
        enemyPlayers: [
          { heroId: '36', kills: 6, deaths: 1, assists: 5, itemIds: ['3065', '2504'], isFedBoss: true }
        ],
        currentLevel: 7,
        currentGold: 2400,
        isDead: true,
        isAugmentMilestone: true,
        currentItemIds: [],
        pickedAugmentIds: [],
        candidateAugmentIds: weakOfferIds,
        cardSlots: buildResolutionAwareCardSlots(weakOfferIds, 1920, 1080),
        lastUpdatedAt: Date.now()
      },
      '1'
    )
    expect(weakAdvice.rerollAdvice?.shouldReroll).toBe(true)
    expect(weakAdvice.rerollAdvice?.betterRemainingCount).toBeGreaterThanOrEqual(4)
    expect(weakAdvice.rerollAdvice?.summary).toContain('建议重随')
    expect(weakAdvice.recommendedSpells).toBeTruthy()
    expect(weakAdvice.threatRadar.enemyPokeThreat).toBeGreaterThanOrEqual(2)
    expect(weakAdvice.threatRadar.enemyShieldThreat).toBeGreaterThanOrEqual(2)
    expect(weakAdvice.threatRadar.allyTankCount).toBeGreaterThanOrEqual(1)

    // Strong offer: include top prismatic card -> should advise keeping, not rerolling!
    const topCardId = prismaticStats[prismaticStats.length - 1].augmentId
    const strongOfferIds = [topCardId, weakOfferIds[0], weakOfferIds[1]]
    const strongAdvice = computeLocalTacticalAdvice(
      realBundle,
      {
        connectionMode: 'live-in-game',
        myHeroId: '1',
        allyHeroIds: ['1'],
        benchHeroIds: [],
        enemyHeroIds: [],
        enemyPlayers: [],
        currentLevel: 7,
        currentGold: 2400,
        isDead: true,
        isAugmentMilestone: true,
        currentItemIds: [],
        pickedAugmentIds: [],
        candidateAugmentIds: strongOfferIds,
        cardSlots: buildResolutionAwareCardSlots(strongOfferIds, 1920, 1080),
        lastUpdatedAt: Date.now()
      },
      '1'
    )
    expect(strongAdvice.rerollAdvice?.shouldReroll).toBe(false)
    const bestEval = strongAdvice.situationalCandidates.find((c) => c.augmentId === topCardId)
    expect(bestEval?.rerollAction).toBe('keep')
  })

  it('supports in-game archetype quick-switch overrides and personal augment wishlist/blacklist markers', () => {
    const seedPath = resolve(__dirname, '../resources/seed-data/seed-bundle.json')
    const realBundle = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedBundle
    const guide = buildHeroDetailGuide(realBundle, '1')!
    const targetArch = guide.archetypes[0]
    expect(targetArch).toBeDefined()

    // 1. Sanitizer enforces mutual exclusion between favoriteAugmentIds and blacklistedAugmentIds
    const cleanPrefs = sanitizeUserPreferences({
      favoriteAugmentIds: ['1045', ' 1045 ', '1030'],
      blacklistedAugmentIds: ['1045', '1007'] // '1045' already in favorites -> stripped from blacklist
    })
    expect(cleanPrefs.favoriteAugmentIds).toEqual(['1045', '1030'])
    expect(cleanPrefs.blacklistedAugmentIds).toEqual(['1007'])

    // 2. Selecting different archetypes actually changes the dynamicBuildPlan items!
    const coreAugId = targetArch.coreAugmentIds[0]
    const baseArchState: GameLiveState = {
      connectionMode: 'live-in-game',
      selectedArchetypeId: targetArch.id,
      myHeroId: '1',
      allyHeroIds: ['1'],
      benchHeroIds: [],
      enemyHeroIds: [],
      enemyPlayers: [],
      currentLevel: 7,
      currentGold: 3000,
      isDead: true,
      isAugmentMilestone: true,
      currentItemIds: [],
      pickedAugmentIds: [],
      candidateAugmentIds: [coreAugId, '1030', '1007'].filter((v, i, a) => a.indexOf(v) === i),
      cardSlots: [],
      lastUpdatedAt: Date.now()
    }
    const advice = computeLocalTacticalAdvice(realBundle, baseArchState, '1', cleanPrefs)
    expect(advice.activeArchetypeId).toBe(targetArch.id)
    expect(advice.availableArchetypes?.length).toBeGreaterThanOrEqual(2)
    expect(advice.dynamicBuildPlan.some((s) => s.sourceTag === '流派定制')).toBe(true)

    const secondArch = guide.archetypes[1]
    const advice2 = computeLocalTacticalAdvice(
      realBundle,
      { ...baseArchState, selectedArchetypeId: secondArch.id },
      '1',
      cleanPrefs
    )
    expect(advice.dynamicBuildPlan.slice(0, 3).map((s) => s.itemId)).not.toEqual(
      advice2.dynamicBuildPlan.slice(0, 3).map((s) => s.itemId)
    )

    const favEval = advice.situationalCandidates.find((c) => c.augmentId === '1030')
    expect(favEval?.userPreference).toBe('favorite')
    expect(favEval?.rerollAction).toBe('keep')

    const banEval = advice.situationalCandidates.find((c) => c.augmentId === '1007')
    expect(banEval?.userPreference).toBe('blacklisted')
    expect(banEval?.rerollAction).toBe('reroll')
  })
})
