import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import https from 'node:https'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import WebSocket from 'ws'
import { findLeagueClientUxProcessInfo } from './windowTracker'

const execFileAsync = promisify(execFile)

export interface LcuCredentials {
  port: string
  token: string
}

export interface LcuChampSelectSnapshot {
  inChampSelect: boolean
  myHeroId: string | null
  allyHeroIds: string[]
  benchHeroIds: string[]
}

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
})

// Cache credentials per LeagueClientUx PID so we NEVER repeatedly spawn child processes!
let cachedPid = 0
let cachedCreds: LcuCredentials | null = null
let lastCliProbeAt = 0

/**
 * 100% STRICT READ-ONLY LCU credential discovery (Zero-PowerShell fast path!):
 *  1. On Windows, checks `FindWindowW("RCLIENT")` via `koffi` (<0.01ms). If League Client isn't open, returns `null` immediately!
 *  2. Reads Riot's standard `lockfile` (`LeagueClient:pid:port:token:https`) directly from the client folder (`0` child processes!).
 *  3. Only if `lockfile` is absent (some CN launcher configs), runs ONE cached command-line lookup for that PID.
 */
export async function detectLcuCredentials(): Promise<LcuCredentials | null> {
  try {
    if (process.platform === 'win32') {
      const info = findLeagueClientUxProcessInfo()
      if (!info) {
        cachedPid = 0
        cachedCreds = null
        return null
      }

      if (info.pid === cachedPid && cachedCreds) {
        return cachedCreds
      }

      // Fast Path 1: Read Riot's plain-text `lockfile` directly (0 processes spawned!)
      if (info.exePath) {
        const clientDir = dirname(info.exePath)
        for (const candidate of [join(clientDir, 'lockfile'), join(clientDir, '..', 'lockfile')]) {
          if (existsSync(candidate)) {
            const content = (await readFile(candidate, 'utf-8').catch(() => '')).trim()
            const parts = content.split(':')
            if (parts.length >= 4 && /^\d+$/.test(parts[2]) && parts[3]) {
              cachedPid = info.pid
              cachedCreds = { port: parts[2], token: parts[3] }
              return cachedCreds
            }
          }
        }
      }

      // Fallback Path 2: One-time WMI query per PID (throttled to at most once per 10s)
      if (Date.now() - lastCliProbeAt < 10000) return null
      lastCliProbeAt = Date.now()

      const res = await execFileAsync(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId = ${info.pid}").CommandLine`
        ],
        { timeout: 3500, windowsHide: true }
      )
      const portMatch = res.stdout.match(/--app-port=(\d+)/)
      const tokenMatch = res.stdout.match(/--remoting-auth-token=([\w-]+)/)
      if (portMatch && tokenMatch) {
        cachedPid = info.pid
        cachedCreds = { port: portMatch[1], token: tokenMatch[1] }
        return cachedCreds
      }
      return null
    }

    // macOS / Linux dev fallback
    const res = await execFileAsync('ps', ['-Ao', 'args'], { timeout: 2500 })
    const stdout = res.stdout
      .split('\n')
      .filter((line) => line.includes('LeagueClientUx'))
      .join('\n')
    const portMatch = stdout.match(/--app-port=(\d+)/)
    const tokenMatch = stdout.match(/--remoting-auth-token=([\w-]+)/)
    if (portMatch && tokenMatch) {
      return { port: portMatch[1], token: tokenMatch[1] }
    }
    return null
  } catch {
    return null
  }
}

/**
 * STRICT READ-ONLY HTTP GET to 127.0.0.1 LCU API.
 * Only GET is implemented by design.
 */
function lcuReadOnlyGet<T>(creds: LcuCredentials, path: string): Promise<T | null> {
  return new Promise((resolve) => {
    const auth = Buffer.from(`riot:${creds.token}`).toString('base64')
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: Number(creds.port),
        path,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${auth}`
        },
        agent: httpsAgent,
        timeout: 2000
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
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T)
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

interface RawChampSelectSession {
  localPlayerCellId?: number
  myTeam?: Array<{ cellId: number; championId: number }>
  benchEnabled?: boolean
  benchChampions?: Array<{ championId: number }>
}

function parseSession(session: RawChampSelectSession | null): LcuChampSelectSnapshot {
  if (!session || !Array.isArray(session.myTeam)) {
    return { inChampSelect: false, myHeroId: null, allyHeroIds: [], benchHeroIds: [] }
  }
  let myHeroId: string | null = null
  const allyHeroIds: string[] = []

  for (const member of session.myTeam) {
    if (!member.championId || member.championId <= 0) continue
    const idStr = String(member.championId)
    if (member.cellId === session.localPlayerCellId) {
      myHeroId = idStr
    }
    allyHeroIds.push(idStr)
  }

  const benchHeroIds = (session.benchChampions || [])
    .filter((b) => b.championId > 0)
    .map((b) => String(b.championId))

  return {
    inChampSelect: true,
    myHeroId,
    allyHeroIds,
    benchHeroIds
  }
}

export class ReadOnlyLcuWatcher {
  private timer: NodeJS.Timeout | null = null
  private ws: WebSocket | null = null
  private currentPort: string | null = null
  private hadActiveSession = false
  private onUpdate: (snapshot: LcuChampSelectSnapshot | null) => void

  constructor(onUpdate: (snapshot: LcuChampSelectSnapshot | null) => void) {
    this.onUpdate = onUpdate
  }

  start(): void {
    if (this.timer) return
    this.pollOnce()
    this.timer = setInterval(() => this.pollOnce(), 4000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.closeWs()
  }

  private closeWs(): void {
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // ignore
      }
      this.ws = null
    }
    this.currentPort = null
  }

  private async pollOnce(): Promise<void> {
    const creds = await detectLcuCredentials()
    if (!creds) {
      this.closeWs()
      if (this.hadActiveSession) {
        this.hadActiveSession = false
        this.onUpdate(null)
      }
      return
    }

    if (this.currentPort !== creds.port || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connectWs(creds)
    }

    const session = await lcuReadOnlyGet<RawChampSelectSession>(
      creds,
      '/lol-champ-select/v1/session'
    )
    const snap = parseSession(session)
    if (snap.inChampSelect || this.hadActiveSession) {
      this.hadActiveSession = snap.inChampSelect
      this.onUpdate(snap)
    }
  }

  private connectWs(creds: LcuCredentials): void {
    this.closeWs()
    this.currentPort = creds.port
    const auth = Buffer.from(`riot:${creds.token}`).toString('base64')
    const ws = new WebSocket(`wss://127.0.0.1:${creds.port}/`, {
      headers: { Authorization: `Basic ${auth}` },
      rejectUnauthorized: false
    })

    ws.on('open', () => {
      // WAMP code 5 = SUBSCRIBE (strictly read-only event subscription)
      ws.send(JSON.stringify([5, 'OnJsonApiEvent_lol-champ-select_v1_session']))
    })

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString())
        if (Array.isArray(parsed) && parsed[2]?.data) {
          const evType = parsed[2].eventType
          if (evType === 'Delete') {
            this.onUpdate({ inChampSelect: false, myHeroId: null, allyHeroIds: [], benchHeroIds: [] })
          } else {
            this.onUpdate(parseSession(parsed[2].data as RawChampSelectSession))
          }
        }
      } catch {
        // ignore non-JSON frames
      }
    })

    ws.on('error', () => {
      cachedCreds = null
      this.closeWs()
    })

    this.ws = ws
  }
}
