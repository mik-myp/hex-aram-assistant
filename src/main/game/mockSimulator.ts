import { buildResolutionAwareCardSlots } from '@shared/layoutGeometry'
import type { CardSlotAnchor, GameLiveState, PlaystyleMode, SeedBundle } from '@shared/types'

function findAugmentIdsByNames(bundle: SeedBundle, preferredNames: string[], count = 3): string[] {
  const all = Object.values(bundle.augments)
  const found: string[] = []
  for (const name of preferredNames) {
    const hit = all.find((a) => a.name.includes(name))
    if (hit && !found.includes(hit.id)) found.push(hit.id)
    if (found.length >= count) return found
  }
  for (const a of all.filter((x) => x.rarity === 'prismatic')) {
    if (!found.includes(a.id)) found.push(a.id)
    if (found.length >= count) break
  }
  return found
}

export function makeDefaultCardSlots(ids: string[], gameW = 1920, gameH = 1080): CardSlotAnchor[] {
  return buildResolutionAwareCardSlots(ids, gameW, gameH)
}

export function createSimulatorScene(
  scene: 'champ-select' | 'level-7-pick' | 'fountain-buy',
  bundle: SeedBundle,
  playstyleMode: PlaystyleMode = 'steady'
): GameLiveState {
  if (scene === 'champ-select') {
    const bench = ['10', '223', '54', '222'].filter((id) => bundle.heroes[id])
    return {
      connectionMode: 'simulator',
      simulatorScene: 'champ-select',
      playstyleMode,
      myHeroId: bundle.heroes['54'] ? '54' : '1', // 墨菲特 Malphite (great to demo Team Tank vs YOLO AP Nuke!)
      allyHeroIds: ['54', '101', '99', '103', '81'].filter((id) => bundle.heroes[id]),
      benchHeroIds: bench,
      enemyHeroIds: [],
      enemyPlayers: [],
      currentLevel: 3,
      currentGold: 1400,
      isDead: false,
      isAugmentMilestone: false,
      currentItemIds: [],
      pickedAugmentIds: [],
      candidateAugmentIds: [],
      cardSlots: [],
      lastUpdatedAt: Date.now()
    }
  }

  const enemyPlayers = [
    { heroId: '36', kills: 11, deaths: 2, assists: 9, itemIds: ['3084', '3065'], isFedBoss: true }, // 11杀蒙多 心之钢+振奋大爹
    { heroId: '14', kills: 3, deaths: 5, assists: 12, itemIds: ['3084', '3075'], isDead: false, isFedBoss: false },
    { heroId: '16', kills: 1, deaths: 4, assists: 18, itemIds: ['6617'], isFedBoss: false },
    { heroId: '238', kills: 8, deaths: 5, assists: 6, itemIds: ['6692', '3142'], isFedBoss: false }, // 劫
    { heroId: '67', kills: 4, deaths: 6, assists: 5, itemIds: ['3153'], isFedBoss: false }
  ].filter((p) => bundle.heroes[p.heroId])

  if (scene === 'level-7-pick') {
    const cands = findAugmentIdsByNames(
      bundle,
      ['珠光护手', '炼狱导管', '玻璃大炮', '歌利亚巨人'],
      3
    )
    const firstPicked = findAugmentIdsByNames(bundle, ['易损', '法力流', '大力'], 1)
    return {
      connectionMode: 'simulator',
      simulatorScene: 'level-7-pick',
      playstyleMode,
      myHeroId: bundle.heroes['1'] ? '1' : Object.keys(bundle.heroes)[0],
      allyHeroIds: ['1', '103', '99', '81', '101'].filter((id) => bundle.heroes[id]),
      benchHeroIds: [],
      enemyHeroIds: enemyPlayers.map((e) => e.heroId),
      enemyPlayers,
      currentLevel: 7,
      currentGold: 2450,
      isDead: true,
      isAugmentMilestone: true,
      currentItemIds: ['3118'].filter((id) => bundle.items[id]),
      pickedAugmentIds: firstPicked,
      candidateAugmentIds: cands,
      cardSlots: makeDefaultCardSlots(cands),
      lastUpdatedAt: Date.now()
    }
  }

  // fountain-buy: Dead in base with 3350 gold, ready to buy items under different mindsets!
  const pickedTwo = findAugmentIdsByNames(bundle, ['珠光护手', '炼狱导管'], 2)
  return {
    connectionMode: 'simulator',
    simulatorScene: 'fountain-buy',
    playstyleMode,
    myHeroId: bundle.heroes['54'] ? '54' : '1', // 墨菲特: switch between 团队(心之钢肉) / 针对(反甲重伤) / 独爽(影焰帽子核弹) / 折磨(无终恨意冰杖)!
    allyHeroIds: ['54', '103', '99', '81', '101'].filter((id) => bundle.heroes[id]),
    benchHeroIds: [],
    enemyHeroIds: enemyPlayers.map((e) => e.heroId),
    enemyPlayers,
    currentLevel: 11,
    currentGold: 3350,
    isDead: true,
    isAugmentMilestone: false,
    currentItemIds: ['3118'].filter((id) => bundle.items[id]),
    pickedAugmentIds: pickedTwo,
    candidateAugmentIds: [],
    cardSlots: [],
    lastUpdatedAt: Date.now()
  }
}
