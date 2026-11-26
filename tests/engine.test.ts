import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchAugmentsFromOcrText, toPinyinIndex } from '../src/shared/pinyin'
import {
  buildHeroDetailGuide,
  classifyAugmentVerdict,
  computeBenchSuggestions,
  smoothWinRate
} from '../src/main/data/synergyEngine'
import { computeLocalTacticalAdvice } from '../src/main/ai/advisorService'
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
    '1004': {
      id: '1004',
      name: '易损',
      rarity: 'silver',
      desc: '装备和持续伤害效果可以暴击。',
      iconUrl: '',
      tags: ['crit', 'burn'],
      ...makePy('易损')
    },
    '1005': {
      id: '1005',
      name: '回归基本功',
      rarity: 'prismatic',
      desc: '你的终极技能被封印，获得普通技能伤害与急速。',
      iconUrl: '',
      tags: ['haste'],
      ...makePy('回归基本功')
    }
  }

  return {
    meta: {
      patch: '16.23',
      mode: 'normal',
      modeLabel: '常规',
      seq: 22,
      matchesValid: 8401866,
      snapshotAt: '2026-11-26T09:00:00+08:00',
      sourceRepo: 'https://github.com/czgreat/aramhex-data',
      license: 'CC BY-NC 4.0',
      syncedAt: '2026-11-26T09:00:00+08:00',
      fromSource: 'bundled'
    },
    heroes: {
      '1': {
        id: '1',
        alias: 'Annie',
        name: '安妮',
        title: '黑暗之女',
        roles: ['mage'],
        damageType: 'AP',
        avatarUrl: '',
        games: 20000,
        wins: 10000,
        winRate: 0.5,
        smoothedWinRate: 0.5,
        pickRate: 0.005,
        rank: 70,
        tier: 'T2',
        pinyinFull: 'anni,火女',
        pinyinInitials: 'an'
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
      '16': {
        id: '16',
        alias: 'Soraka',
        name: '索拉卡',
        title: '众星之子',
        roles: ['support'],
        damageType: 'AP',
        avatarUrl: '',
        games: 25000,
        wins: 13000,
        winRate: 0.52,
        smoothedWinRate: 0.519,
        pickRate: 0.007,
        rank: 28,
        tier: 'T1',
        pinyinFull: 'suolaka',
        pinyinInitials: 'slk'
      }
    },
    augments,
    items: {
      '3165': { id: '3165', name: '莫雷洛秘典', iconUrl: '', category: 'mage', types: [], totalGold: 2200 },
      '6653': { id: '6653', name: '兰德里的折磨', iconUrl: '', category: 'mage', types: [], totalGold: 3000 },
      '4645': { id: '4645', name: '影焰', iconUrl: '', category: 'mage', types: [], totalGold: 3200 }
    },
    heroAugments: {
      '1': [
        ['1001', 3000, 1740, 0], // 58% -> S+
        ['1004', 2200, 1210, 0], // 55% -> S/S+
        ['1003', 2800, 1540, 0], // 55% -> S
        ['1005', 1500, 600, 0] // 40% -> TRAP (sealing Annie R Tibbers!)
      ]
    },
    coreBuilds: {
      '1': [{ items: ['6653', '4645', '3165'], ordered: true, games: 5000, winRate: 0.53, pickRate: 0.08 }]
    },
    heroItems: {},
    heroAugmentItems: {
      '1': {
        '1001': [['4645', '影焰', 1200, 720]]
      }
    },
    heroSpells: {
      '1': [['4+32', 8000, 4120]]
    }
  }
}

describe('HexBuddy core intelligence suite', () => {
  it('computes Bayesian smoothed win rates safely for low and high sample counts', () => {
    // Small sample 3/3 (100% raw) should shrink smoothly toward 50% baseline
    const tiny = smoothWinRate(3, 3, 0.5, 300)
    expect(tiny).toBeGreaterThan(0.5)
    expect(tiny).toBeLessThan(0.52)

    // Large sample 5800/10000 stays close to 58%
    const large = smoothWinRate(5800, 10000, 0.5, 300)
    expect(large).toBeGreaterThan(0.575)
  })

  it('recovers accurate official Hextech augments from noisy OCR characters', () => {
    const bundle = createMockBundle()
    // Simulate typical Tesseract lookalike confusion: 护手->护乎, 巨人->巨入, 导管->导官
    const { matchedIds, confidence } = matchAugmentsFromOcrText(
      ['珠光护乎   歌利亚巨入   炼狱导官'],
      bundle.augments,
      3
    )
    expect(matchedIds).toContain('1001')
    expect(matchedIds).toContain('1002')
    expect(matchedIds).toContain('1003')
    expect(confidence).toBeGreaterThan(0.65)
  })

  it('derives beginner archetypes and flags negative-winrate trap augments', () => {
    const bundle = createMockBundle()
    const guide = buildHeroDetailGuide(bundle, '1')
    expect(guide).not.toBeNull()
    // Annie sealing R with Back to Basics ('1005') drops winrate by ~-8%, must be flagged TRAP
    expect(guide!.trapAugments.some((t) => t.augmentId === '1005')).toBe(true)
    const critArc = guide!.archetypes.find((a) => a.id.includes('crit'))
    expect(critArc).toBeDefined()
    expect(critArc!.itemPivotTip).toContain('影焰')
    expect(classifyAugmentVerdict(-0.06, 800, 10).verdict).toBe('TRAP')
  })

  it('recommends T0 bench upgrades and anti-heal/anti-tank counter items', () => {
    const bundle = createMockBundle()
    const bench = computeBenchSuggestions(bundle, '1', ['1', '16'], ['10'])
    expect(bench[0].heroId).toBe('10')
    expect(bench[0].deltaVsCurrent).toBeGreaterThan(0.05)

    const liveState: GameLiveState = {
      connectionMode: 'live-in-game',
      myHeroId: '1',
      allyHeroIds: ['1', '10'],
      benchHeroIds: [],
      enemyHeroIds: ['36', '16', '36'], // Heavy heal + tank
      currentLevel: 11,
      isAugmentMilestone: true,
      currentItemIds: [],
      pickedAugmentIds: ['1001'],
      candidateAugmentIds: [],
      lastUpdatedAt: Date.now()
    }
    const advice = computeLocalTacticalAdvice(bundle, liveState, '1')
    const itemIds = advice.counterItemIds.map((c) => c.itemId)
    expect(itemIds).toContain('3165') // 莫雷洛秘典 anti-heal
    expect(itemIds).toContain('6653') // 兰德里 anti-tank
  })

  it('validates the real bundled 16.23 CN dataset across all 170+ champions', () => {
    const seedPath = resolve(__dirname, '../resources/seed-data/seed-bundle.json')
    const realBundle = JSON.parse(readFileSync(seedPath, 'utf-8')) as SeedBundle
    const heroIds = Object.keys(realBundle.heroes)
    expect(heroIds.length).toBeGreaterThanOrEqual(170)
    expect(Object.keys(realBundle.augments).length).toBeGreaterThanOrEqual(200)

    for (const hid of heroIds) {
      const g = buildHeroDetailGuide(realBundle, hid)
      expect(g).not.toBeNull()
      expect(g!.archetypes.length).toBeGreaterThanOrEqual(1)
      expect(g!.augments.length).toBeGreaterThan(20)
    }

    // Verify OCR fuzzy dictionary recovery against the full 237-augment catalog
    const ocrCheck = matchAugmentsFromOcrText(
      ['珠光护乎', '歌利亚巨入', '泰坦的坚诀'],
      realBundle.augments,
      3
    )
    const matchedNames = ocrCheck.matchedIds.map((id) => realBundle.augments[id]?.name)
    expect(matchedNames).toContain('珠光护手')
    expect(matchedNames).toContain('泰坦的坚决')
  })
})
