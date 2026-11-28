import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, screen } from 'electron'
import type { DiagnosticSummary, GameLiveState } from '@shared/types'

const MAX_LOG_BYTES = 1024 * 1024 // 1 MB hard cap with automatic rotation
const recentMemLines: string[] = []
const MAX_MEM_LINES = 40

let logWriteChain: Promise<void> = Promise.resolve()

export function getLogDirPath(): string {
  if (typeof app?.getPath !== 'function') return process.cwd()
  return join(app.getPath('userData'), 'logs')
}

export function getLogFilePath(): string {
  return join(getLogDirPath(), 'hexbuddy.log')
}

export function logDiag(tag: string, message: string): void {
  const ts = new Date().toISOString()
  const line = `${ts} [${tag}] ${message}`
  recentMemLines.push(line)
  if (recentMemLines.length > MAX_MEM_LINES) {
    recentMemLines.shift()
  }

  if (typeof app?.getPath !== 'function') return

  logWriteChain = logWriteChain
    .then(async () => {
      const logPath = getLogFilePath()
      await mkdir(dirname(logPath), { recursive: true })
      if (existsSync(logPath)) {
        const st = await stat(logPath).catch(() => null)
        if (st && st.size >= MAX_LOG_BYTES) {
          const prevPath = join(getLogDirPath(), 'hexbuddy.prev.log')
          await rename(logPath, prevPath).catch(() => {})
        }
      }
      await appendFile(logPath, `${line}\n`, 'utf-8')
    })
    .catch(() => {})
}

export async function buildDiagnosticSummary(extra: {
  isSelfElevated: boolean
  leagueElevatedMismatch: boolean
  exclusiveFullscreenSuspected?: boolean
  localMatchesRecorded?: number
  connectionMode: GameLiveState['connectionMode']
  trackedWindowSummary: string
  ocrEngineSummary: string
  datasetSummary: string
}): Promise<DiagnosticSummary> {
  const displays =
    typeof screen?.getAllDisplays === 'function'
      ? screen.getAllDisplays().map(
          (d, idx) =>
            `#${idx + 1}(${d.bounds.width}x${d.bounds.height}@${Math.round(d.scaleFactor * 100)}%)`
        )
      : []

  let tailLines = [...recentMemLines]
  if (tailLines.length < 8) {
    const p = getLogFilePath()
    if (existsSync(p)) {
      const content = await readFile(p, 'utf-8').catch(() => '')
      const fileLines = content.trim().split(/\r?\n/).filter(Boolean)
      if (fileLines.length > tailLines.length) {
        tailLines = fileLines.slice(-20)
      }
    }
  }

  const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024)
  const reportLines = [
    `=== HexBuddy 运行环境诊断摘要 ===`,
    `版本: v${typeof app?.getVersion === 'function' ? app.getVersion() : '0.3.2'} (${
      process.env.PORTABLE_EXECUTABLE_FILE ? 'Portable便携版' : 'Setup安装版/开发版'
    })`,
    `系统: ${process.platform} ${process.arch} | 主进程 RSS: ${memMb} MB`,
    `权限状态: 当前管理员=${extra.isSelfElevated ? '是' : '否'} | 游戏提权不匹配(UIPI)=${
      extra.leagueElevatedMismatch ? '⚠️是(建议管理员重启)' : '正常'
    }`,
    `显示器: ${displays.join(', ') || '未知'}`,
    `连接状态: ${extra.connectionMode} | 追踪客户区: ${extra.trackedWindowSummary}`,
    `显示模式提示: ${
      extra.exclusiveFullscreenSuspected
        ? '⚠️疑似独占全屏(局部抓屏黑屏，建议游戏改为无边框模式)'
        : '正常(无边框/窗口化)'
    } | 本地战绩记录: ${extra.localMatchesRecorded ?? 0} 局`,
    `OCR状态: ${extra.ocrEngineSummary}`,
    `数据集: ${extra.datasetSummary}`,
    `--- 最近运行日志 (最新 ${Math.min(12, tailLines.length)} 条) ---`,
    ...tailLines.slice(-12)
  ]

  return {
    isWindows: process.platform === 'win32',
    isSelfElevated: extra.isSelfElevated,
    leagueElevatedMismatch: extra.leagueElevatedMismatch,
    exclusiveFullscreenSuspected: Boolean(extra.exclusiveFullscreenSuspected),
    localMatchesRecorded: extra.localMatchesRecorded ?? 0,
    connectionMode: extra.connectionMode,
    trackedWindowSummary: extra.trackedWindowSummary,
    ocrEngineSummary: extra.ocrEngineSummary,
    datasetSummary: extra.datasetSummary,
    memoryRssMb: memMb,
    logDirPath: getLogDirPath(),
    formattedReport: reportLines.join('\n')
  }
}
