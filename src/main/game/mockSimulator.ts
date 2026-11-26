import type { GameLiveState, SeedBundle } from '@shared/types'

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

export function createSimulatorScene(
  scene: 'champ-select' | 'level-7-pick' | 'teamfight-5v5',
  bundle: SeedBundle
): GameLiveState {
  // Hero IDs in LoL: 1=Annie, 10=Kayle, 222=Jinx, 223=TahmKench, 101=Xerath, 99=Lux, 81=Ezreal,
  // 36=DrMundo, 14=Sion, 16=Soraka, 8=Vladimir, 67=Vayne, 103=Ahri
  if (scene === 'champ-select') {
    return {
      connectionMode: 'simulator',
      simulatorScene: 'champ-select',
      myHeroId: bundle.heroes['1'] ? '1' : Object.keys(bundle.heroes)[0],
      allyHeroIds: ['1', '101', '99', '103', '81'].filter((id) => bundle.heroes[id]),
      benchHeroIds: ['10', '222', '223', '54'].filter((id) => bundle.heroes[id]),
      enemyHeroIds: [],
      currentLevel: 3,
      isAugmentMilestone: false,
      currentItemIds: [],
      pickedAugmentIds: [],
      candidateAugmentIds: [],
      lastUpdatedAt: Date.now()
    }
  }

  if (scene === 'level-7-pick') {
    const cands = findAugmentIdsByNames(
      bundle,
      ['珠光护手', '炼狱导管', '歌利亚巨人', '利刃华尔兹', '回归基本功'],
      3
    )
    const firstPicked = findAugmentIdsByNames(bundle, ['巫术思考', '法力流', '大力'], 1)
    return {
      connectionMode: 'simulator',
      simulatorScene: 'level-7-pick',
      myHeroId: bundle.heroes['103'] ? '103' : '1',
      allyHeroIds: ['103', '222', '223', '81', '99'].filter((id) => bundle.heroes[id]),
      benchHeroIds: [],
      enemyHeroIds: ['36', '14', '16', '8', '67'].filter((id) => bundle.heroes[id]),
      currentLevel: 7,
      isAugmentMilestone: true,
      currentItemIds: ['3118'].filter((id) => bundle.items[id]),
      pickedAugmentIds: firstPicked,
      candidateAugmentIds: cands,
      lastUpdatedAt: Date.now()
    }
  }

  // teamfight-5v5: Heavy healing + multi-tank enemy comp
  const pickedTwo = findAugmentIdsByNames(bundle, ['珠光护手', '尖端发明家', '泰坦的坚决'], 2)
  return {
    connectionMode: 'simulator',
    simulatorScene: 'teamfight-5v5',
    myHeroId: bundle.heroes['222'] ? '222' : '1',
    allyHeroIds: ['222', '103', '223', '99', '81'].filter((id) => bundle.heroes[id]),
    benchHeroIds: [],
    enemyHeroIds: ['36', '14', '16', '8', '67'].filter((id) => bundle.heroes[id]),
    currentLevel: 11,
    isAugmentMilestone: true,
    currentItemIds: ['3031', '3085'].filter((id) => bundle.items[id]),
    pickedAugmentIds: pickedTwo,
    candidateAugmentIds: [],
    lastUpdatedAt: Date.now()
  }
}
