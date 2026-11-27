import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CLIENT_BENCH_MAX_SLOTS,
  computeClientBenchSlotLayout,
  computeGameAugmentCardBoxes,
  computeOcrTitleStripCropRect,
  resolveClientEffectiveRect,
  resolveHoveredAugmentSlot
} from '../src/shared/layoutGeometry'
import { matchAugmentsFromOcrText, toPinyinIndex } from '../src/shared/pinyin'
import {
  buildAugmentReverseDetail,
  buildHeroDetailGuide,
  classifyAugmentVerdict,
  computeBenchSuggestions,
  smoothWinRate
} from '../src/main/data/synergyEngine'
import { computeLocalTacticalAdvice } from '../src/main/ai/tacticalEngine'
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

describe('HexBuddy v0.3.0 Spatial HUD & 5-Mindset Engine', () => {
  it('switches Malphite dynamically between Team Tank, YOLO AP Nuke, and Counter Boss', () => {
    const bundle = createMockBundle()
    const baseState: GameLiveState = {
      connectionMode: 'live-in-game',
      playstyleMode: 'team',
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

    // 1. In TEAM mode: Goliath ('1002') wins and Heartsteel ('3084') is top item
    const teamAdvice = computeLocalTacticalAdvice(bundle, baseState, '54')
    const teamWinner = teamAdvice.situationalCandidates.find((c) => c.isRecommendedPick)
    expect(teamWinner?.augmentId).toBe('1002')
    expect(teamAdvice.immediateNextItem?.itemId).toBe('3084')
    expect(teamAdvice.immediateNextItem?.affordableNow).toBe(false) // 2900 < 3000, needs 100g
    expect(teamAdvice.immediateNextItem?.goldRemaining).toBe(100)

    // 2. Flip to YOLO ('只顾自己爽') mode: Glass Cannon ('1006') overtakes Goliath, and build pivots to AP Nuke Malignance ('3118', 2700g -> affordableNow === true!)
    const yoloAdvice = computeLocalTacticalAdvice(
      bundle,
      { ...baseState, playstyleMode: 'yolo' },
      '54'
    )
    const yoloWinner = yoloAdvice.situationalCandidates.find((c) => c.isRecommendedPick)
    expect(yoloWinner?.augmentId).toBe('1006')
    expect(yoloAdvice.immediateNextItem?.itemId).toBe('3118')
    expect(yoloAdvice.immediateNextItem?.affordableNow).toBe(true)

    // 3. Flip to COUNTER ('针对大爹') mode: 12-kill Zed triggers Randuin's ('3143') anti-boss counter!
    const counterAdvice = computeLocalTacticalAdvice(
      bundle,
      { ...baseState, playstyleMode: 'counter' },
      '54'
    )
    expect(counterAdvice.dynamicBuildPlan[0].itemId).toBe('3143')
    expect(counterAdvice.dynamicBuildPlan[0].sourceTag).toBe('专治大爹')
  })

  it('flags hard mechanic conflicts (e.g. Back to Basics sealing R vs Ultimate Awakening)', () => {
    const bundle = createMockBundle()
    const state: GameLiveState = {
      connectionMode: 'live-in-game',
      playstyleMode: 'steady',
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
      overlayOpacity: 'unknown',
      defaultPlaystyle: 'torment'
    })
    expect(migrated.schemaVersion).toBe(CURRENT_CONFIG_SCHEMA_VERSION)
    expect(migrated.favoriteHeroIds).toEqual(['10', '54'])
    expect(migrated.preferredRoles).toEqual(['mage'])
    expect(migrated.hudScale).toBe(1.3)
    expect(migrated.hudOffsetX).toBe(-8)
    expect(migrated.hudOffsetY).toBe(8)
    expect(migrated.overlayOpacity).toBe('solid')
    expect(migrated.defaultPlaystyle).toBe('torment')
    expect(migrated.enableBenchBadges).toBe(true)

    const ai = sanitizeAiSettings({
      apiKey: '  sk-secret-12345  ',
      toneStyle: 'witty',
      shortcutCycleMindset: 'Alt+M'
    })
    const exported = buildConfigBackupJson(migrated, ai)
    expect(exported).not.toContain('sk-secret-12345')

    const restored = parseConfigBackupJson(exported, 'sk-local-preserved')
    expect(restored.settings.apiKey).toBe('sk-local-preserved')
    expect(restored.settings.toneStyle).toBe('witty')
    expect(restored.prefs.defaultPlaystyle).toBe('torment')
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
})
