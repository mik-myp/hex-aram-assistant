import { execFile } from 'node:child_process'
import https from 'node:https'
import { promisify } from 'node:util'
import WebSocket from 'ws'

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

/**
 * 100% STRICT READ-ONLY LCU process credential reader.
 * Never modifies game memory, files, or client state.
 */
export async function detectLcuCredentials(): Promise<LcuCredentials | null> {
  try {
    let stdout = ''
    if (process.platform === 'win32') {
      const res = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          "Get-CimInstance Win32_Process -Filter \"name = 'LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine"
        ],
        { timeout: 3500 }
      )
      stdout = res.stdout
    } else {
      const res = await execFileAsync('ps', ['-Ao', 'args'], { timeout: 2500 })
      stdout = res.stdout
        .split('\n')
        .filter((line) => line.includes('LeagueClientUx'))
        .join('\n')
    }

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
      this.onUpdate(null)
      return
    }

    if (this.currentPort !== creds.port || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connectWs(creds)
    }

    const session = await lcuReadOnlyGet<RawChampSelectSession>(
      creds,
      '/lol-champ-select/v1/session'
    )
    this.onUpdate(parseSession(session))
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
      this.closeWs()
    })

    this.ws = ws
  }
}
