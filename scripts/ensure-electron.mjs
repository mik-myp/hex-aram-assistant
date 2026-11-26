import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

// Ensures Electron.app is extracted reliably on Node v26+ (where extract-zip can exit early)
async function main() {
  let electronDir
  try {
    electronDir = realpathSync(join(process.cwd(), 'node_modules/electron'))
  } catch {
    return
  }

  const pathTxt = join(electronDir, 'path.txt')
  if (existsSync(pathTxt)) {
    const binRel = readFileSync(pathTxt, 'utf-8').trim()
    if (existsSync(join(electronDir, 'dist', binRel))) return
  }

  if (process.platform !== 'darwin') return

  const keepAlive = setInterval(() => {}, 1000)
  try {
    const req = createRequire(join(electronDir, 'install.js'))
    const pkg = JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf-8'))
    const { downloadArtifact } = req('@electron/get')
    const zipPath = await downloadArtifact({
      version: pkg.version,
      artifactName: 'electron',
      mirrorOptions: {
        mirror: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/'
      }
    })
    const distDir = join(electronDir, 'dist')
    rmSync(distDir, { recursive: true, force: true })
    mkdirSync(distDir, { recursive: true })
    execFileSync('ditto', ['-xk', zipPath, distDir])
    writeFileSync(pathTxt, 'Electron.app/Contents/MacOS/Electron', 'utf-8')
  } catch (err) {
    console.warn('[ensure-electron] Warning:', err?.message || err)
  } finally {
    clearInterval(keepAlive)
  }
}

main()
