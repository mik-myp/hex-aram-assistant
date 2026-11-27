import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const ROOT_DIR = process.cwd()
const SRC_DIR = resolve(ROOT_DIR, 'src')

const ENTRY_FILES = new Set(['src/main/index.ts', 'src/renderer/src/App.tsx'])
const ENTRY_MAX_LINES = 220
const UI_PRIMITIVE_MAX_LINES = 180
const MODULE_WARN_LINES = 350
const MODULE_MAX_LINES = 450

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(full)))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

function stripCommentsAndStrings(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

const files = await collectSourceFiles(SRC_DIR)
const errors = []
const warnings = []

for (const absPath of files) {
  const relPath = relative(ROOT_DIR, absPath).replace(/\\/g, '/')
  const raw = await readFile(absPath, 'utf-8')
  const lineCount = raw.split(/\r?\n/).length

  // 1. File Line Budget Enforcement
  if (ENTRY_FILES.has(relPath)) {
    if (lineCount > ENTRY_MAX_LINES) {
      errors.push(`[行数超限] 入口文件 ${relPath} 当前 ${lineCount} 行（上限 ${ENTRY_MAX_LINES} 行）`)
    }
  } else if (relPath.startsWith('src/renderer/src/components/ui/')) {
    if (lineCount > UI_PRIMITIVE_MAX_LINES) {
      errors.push(`[行数超限] 原子 UI 组件 ${relPath} 当前 ${lineCount} 行（上限 ${UI_PRIMITIVE_MAX_LINES} 行）`)
    }
  } else {
    if (lineCount > MODULE_MAX_LINES) {
      errors.push(`[行数超限] 模块 ${relPath} 当前 ${lineCount} 行（硬上限 ${MODULE_MAX_LINES} 行，请按领域职责拆分）`)
    } else if (lineCount > MODULE_WARN_LINES) {
      warnings.push(`[行数预警] 模块 ${relPath} 当前 ${lineCount} 行（建议控制在 ${MODULE_WARN_LINES} 行以内）`)
    }
  }

  const codeOnly = stripCommentsAndStrings(raw)

  // 2. Zero Explicit `any` Enforcement
  if (/:\s*any\b|\bas\s+any\b|<any>/.test(codeOnly)) {
    errors.push(`[类型违规] ${relPath} 检测到显式 any，请改用具体类型或 unknown + 类型守卫`)
  }

  // 3. Architectural Layer Seam Enforcement
  if (relPath.startsWith('src/shared/')) {
    if (/from\s+['"](electron|node:|react|@\/|@renderer)/.test(raw)) {
      errors.push(`[分层违规] 纯共享层 ${relPath} 禁止导入 electron / node:* / react 或渲染层模块`)
    }
  }

  if (relPath.startsWith('src/renderer/src/components/ui/')) {
    if (/window\.hexbuddy|from\s+['"]@\/features\//.test(raw)) {
      errors.push(`[分层违规] 原子 UI 组件 ${relPath} 禁止访问 window.hexbuddy 或业务 features 模块`)
    }
  }

  if (
    relPath.startsWith('src/renderer/src/features/hud/') ||
    relPath === 'src/renderer/src/components/MiniOverlay.tsx'
  ) {
    if (/from\s+['"]@\/components\/ui\/(dialog|select|alert-dialog|tooltip)['"]/.test(raw)) {
      errors.push(`[穿透窗口违规] 原位 HUD 模块 ${relPath} 禁止挂载 Portal 浮层原语以免破坏鼠标穿透`)
    }
  }
}

for (const w of warnings) {
  console.warn(`⚠️  ${w}`)
}

if (errors.length > 0) {
  console.error(`\n❌ 架构与代码规范门禁未通过（共 ${errors.length} 项违规）：`)
  for (const err of errors) {
    console.error(`  - ${err}`)
  }
  process.exit(1)
}

console.log(
  `✓ 架构与代码规范门禁通过（已扫描 ${files.length} 个源码文件 · 单文件全部 ≤ ${MODULE_MAX_LINES} 行 · 0 分层违规 · 0 any）`
)
