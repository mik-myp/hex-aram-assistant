import https from 'node:https'
import { hasActiveGameWindow } from './windowTracker'
import type { EnemyPlayerLiveInfo, HeroMeta } from '@shared/types'

export interface LiveMatchSnapshot {
  inGame: boolean
  myHeroId: string | null
  allyHeroIds: string[]
  enemyHeroIds: string[]
  enemyPlayers: EnemyPlayerLiveInfo[]
  currentLevel: number
  currentGold: number
  isDead: boolean
  isAugmentMilestone: boolean
  currentItemIds: string[]
}

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
})

interface RawLiveAllGameData {
  activePlayer?: {
    summonerName?: string
    riotId?: string
    riotIdGameName?: string
    level?: number
    currentGold?: number
  }
  allPlayers?: Array<{
    summonerName?: string
    riotId?: string
    riotIdGameName?: string
    championName?: string
    rawChampionName?: string
    team?: 'ORDER' | 'CHAOS'
    isDead?: boolean
    scores?: {
      kills?: number
      deaths?: number
      assists?: number
    }
    items?: Array<{ itemID: number }>
  }>
}

function readOnlyGetLive2999(): Promise<RawLiveAllGameData | null> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: 2999,
        path: '/liveclientdata/allgamedata',
        method: 'GET',
        agent: httpsAgent,
        timeout: 1500
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          resolve(null)
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(Buffer.from(c)))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as RawLiveAllGameData)
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.end()
  })
}

function resolveHeroIdFromPlayer(
  p: { championName?: string; rawChampionName?: string },
  heroes: Record<string, HeroMeta>
): string | null {
  const rawAlias = p.rawChampionName?.replace(/^game_character_displayname_/i, '').toLowerCase()
  const cname = p.championName?.trim()

  for (const h of Object.values(heroes)) {
    if (rawAlias && h.alias.toLowerCase() === rawAlias) return h.id
    if (cname && (h.name === cname || h.title === cname || h.alias === cname)) return h.id
  }
  return null
}

const AUGMENT_LEVELS = new Set([3, 7, 11, 15])

export class ReadOnlyLiveWatcher {
  private timer: NodeJS.Timeout | null = null
  private hadActiveGame = false
  private getHeroes: () => Record<string, HeroMeta>
  private onUpdate: (snapshot: LiveMatchSnapshot | null) => void

  constructor(
    getHeroes: () => Record<string, HeroMeta>,
    onUpdate: (snapshot: LiveMatchSnapshot | null) => void
  ) {
    this.getHeroes = getHeroes
    this.onUpdate = onUpdate
  }

  start(): void {
    if (this.timer) return
    this.pollOnce()
    this.timer = setInterval(() => this.pollOnce(), 2500)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async pollOnce(): Promise<void> {
    // Zero-network idle short-circuit: do NOT open TCP/TLS sockets to 127.0.0.1:2999 when RiotWindowClass isn't open!
    if (!hasActiveGameWindow()) {
      if (this.hadActiveGame) {
        this.hadActiveGame = false
        this.onUpdate(null)
      }
      return
    }

    const data = await readOnlyGetLive2999()
    if (!data || !Array.isArray(data.allPlayers) || data.allPlayers.length === 0) {
      if (this.hadActiveGame) {
        this.hadActiveGame = false
        this.onUpdate(null)
      }
      return
    }
    this.hadActiveGame = true

    const heroes = this.getHeroes()
    const active = data.activePlayer
    const mePlayer =
      data.allPlayers.find(
        (p) =>
          (active?.riotId && p.riotId === active.riotId) ||
          (active?.summonerName && p.summonerName === active.summonerName) ||
          (active?.riotIdGameName && p.riotIdGameName === active.riotIdGameName)
      ) || data.allPlayers[0]

    const myTeam = mePlayer?.team || 'ORDER'
    const myHeroId = mePlayer ? resolveHeroIdFromPlayer(mePlayer, heroes) : null
    const allyHeroIds: string[] = []
    const enemyHeroIds: string[] = []
    const rawEnemies: Array<{
      heroId: string
      kills: number
      deaths: number
      assists: number
      itemIds: string[]
    }> = []

    for (const p of data.allPlayers) {
      const hid = resolveHeroIdFromPlayer(p, heroes)
      if (!hid) continue
      if (p.team === myTeam) {
        allyHeroIds.push(hid)
      } else {
        enemyHeroIds.push(hid)
        rawEnemies.push({
          heroId: hid,
          kills: p.scores?.kills ?? 0,
          deaths: p.scores?.deaths ?? 0,
          assists: p.scores?.assists ?? 0,
          itemIds: (p.items || []).map((it) => String(it.itemID)).filter((id) => id !== '0')
        })
      }
    }

    const maxKills = Math.max(0, ...rawEnemies.map((e) => e.kills))
    const enemyPlayers: EnemyPlayerLiveInfo[] = rawEnemies.map((e) => ({
      ...e,
      isFedBoss: e.kills >= 5 && e.kills === maxKills && e.kills > e.deaths
    }))

    const level = active?.level ?? 3
    const currentGold = Math.round(active?.currentGold ?? 1400)
    const isDead = Boolean(mePlayer?.isDead)
    const currentItemIds = (mePlayer?.items || [])
      .map((it) => String(it.itemID))
      .filter((id) => id !== '0')

    this.onUpdate({
      inGame: true,
      myHeroId,
      allyHeroIds,
      enemyHeroIds,
      enemyPlayers,
      currentLevel: level,
      currentGold,
      isDead,
      isAugmentMilestone: AUGMENT_LEVELS.has(level) || (isDead && level >= 7),
      currentItemIds
    })
  }
}
