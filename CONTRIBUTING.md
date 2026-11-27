# HexBuddy（海斗军师）企业级工程开发与发布规范

本文档定义 HexBuddy 的**模块分层架构、单文件与组件封装粒度、状态与副作用隔离、TypeScript 防御性类型规范、资源生命周期治理、自动化质量门禁及版本发布标准**。

> **核心原则**：规范不靠口头自觉，本仓库核心指标由 [`scripts/check-architecture.mjs`](./scripts/check-architecture.mjs)（`pnpm check:arch`）在本地与 CI 阶段强制拦截。

---

## 1. 领域分层架构与单向依赖规则（Layered Architecture）

全仓遵循严格的单向依赖流，严禁跨层逆向引用或循环依赖：

```text
Renderer Features (features/*)
   └── UI Primitives (components/ui/*) + Custom Hooks (hooks/*)
          └── Preload Bridge (src/preload) ── IPC ──▶ Main IPC Router (src/main/ipc)
                                                         └── Main Domain Modules (ai / data / game / ocr / shortcuts / state / updater / window)
                                                                └── Shared Pure Core (src/shared/*)
```

| 层级目录 | 职责定义 | 严格禁止事项（由 `pnpm check:arch` 自动校验） |
| :--- | :--- | :--- |
| **`src/shared/`** | 纯领域类型契约、空间几何计算、拼音索引、配置 Schema 容错清洗、Markdown 解析 | **禁止**引入 `electron`、`node:*`、`react` 或渲染层路径（`@/`、`@renderer`），确保可在任意测试与脚本环境纯函数运行。 |
| **`src/main/`** | Electron 主进程，按单一领域切分：`state/`、`window/`、`shortcuts/`、`ipc/`、`game/`、`data/`、`ocr/`、`ai/`、`updater/`、`logger/` | **禁止**将 `src/main/index.ts` 写成“上帝文件”（入口文件仅做启动编排与退出回收，不含具体业务实现）。 |
| **`src/preload/`** | 最小权限上下文隔离桥接（`contextBridge`） | **禁止**将裸 `ipcRenderer` 或 Node `fs/child_process` 直接暴露给 `window`。 |
| **`src/renderer/src/components/ui/`** | 无业务语义的原子 UI 组件库（`@base-ui/react` + `shadcn/ui`） | **禁止**访问 `window.hexbuddy`、**禁止**导入业务领域模块（`features/*`），确保 100% 纯受控可复用。 |
| **`src/renderer/src/features/`** | 按业务领域内聚的模块（`settings/`、`hud/`、`command/`、`onboarding/`），内部按 `sections/`、`components/`、`hooks/` 拆分 | `#mini` 原位穿透 HUD（`features/hud/**`）**禁止**导入带 Portal / Focus Trap 的浮层原语（`dialog`、`select`、`alert-dialog`、`tooltip`），防止破坏鼠标穿透或抢夺游戏焦点。 |

---

## 2. 文件粒度与组件封装规范（Modularity & Granularity）

### 2.1 硬性代码行数预算（CI 强门禁阻断）
任何功能迭代不得堆砌巨型单文件（God Component / God Service）：
- **应用顶层入口文件**（`src/main/index.ts`、`src/renderer/src/App.tsx`）：**硬上限 `≤ 220` 行**
- **原子基础 UI 组件**（`src/renderer/src/components/ui/*.tsx`）：**硬上限 `≤ 180` 行**
- **所有业务组件、Hook 与主进程模块**（`src/**/*.{ts,tsx}`）：**预警线 `350` 行，硬上限 `≤ 450` 行**（超出硬上限时 `pnpm check:arch` 直接返回非零退出码阻断提交与发版）

### 2.2 React 组件封装四准则
1. **单一职责（One File, One Primary Export）**：
   - 一个 `.tsx` 文件只承载一个核心职责组件；若某个视图包含多个独立分页或区块（如设置中心的 6 个分类面板、HUD 的顶部控制栏/三选一徽章/演练校准台），必须拆分为独立的 `sections/*` 或 `components/*` 子文件。
2. **视图与副作用解耦（Presentational vs Custom Hooks）**：
   - 凡组件内包含 `>= 2` 个跨进程 IPC 订阅（`onGameStateUpdated`、`onPrefsUpdated` 等）或复杂异步编排，必须抽离至专属 Custom Hook（如 `useWorkspaceBootstrap`、`useHudSession`），保持 JSX 视图层只负责“输入状态 → 渲染 UI → 派发回调”。
3. **Props 接口收敛（防布尔爆炸与深层透传）**：
   - 避免互斥布尔 Props（如 `isChecking` + `isDownloading` + `isDownloaded`），统一使用判别联合状态机（`phase: 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error'`）。
   - Base UI 触发器组合统一采用 `render={<Button />}` 渲染委托模式（若渲染非 `<button>` 标签须显式声明 `nativeButton={false}`），禁止无意义的额外 `<div>` 包裹。
4. **纯逻辑下沉（Pure Logic Sink）**：
   - 组件内严禁编写超过 25 行的纯数据转换、坐标几何计算或正则解析逻辑；此类逻辑必须下沉至 `src/shared/` 或模块级纯函数并配套单元测试。

---

## 3. TypeScript 防御性类型与错误处理规范

1. **零裸 `any` 纪律**：
   - 全仓启用 `strict: true`，`src/` 下**严禁出现显式 `: any` 或 `as any`**（`pnpm check:arch` 静态扫描拦截）。确实需要类型收敛时使用 `unknown` + 类型守卫（Type Guard）。
2. **跨信任边界“零信任清洗”（Zero-Trust Boundary Validation）**：
   - 所有来自磁盘配置文件、远端 CDN/GitHub JSON、OCR 原始文本与 IPC 调用的数据，必须视作不可信 `unknown`，经由 `src/shared/configSchema.ts` 等 Sanitizer 完成**默认值合并、枚举合法性校验与数值上下界钳制**后方可进入内存状态。
3. **外部 I/O 超时与异常闭环**：
   - 所有网络请求（`fetch`）必须绑定 `AbortSignal.timeout(...)` 显式超时，严禁无限挂起。
   - 用户主动触发的异步操作（热更同步、AI 测速、下载安装包、清理缓存）必须具备 UI 防重入锁（加载态 + 错误反馈提示）；后台守护循环的非致命降级统一记录至脱敏轮转日志 `logDiag()`，严禁裸 `catch {}` 吞灭关键故障上下文。

---

## 4. 桌面端性能、内存与资源生命周期治理

1. **成对挂载与销毁（Paired Teardown）**：
   - 每一个 `ipcRenderer.on`、`window.addEventListener`、`setInterval`、`globalShortcut.register`、WebSocket 连接及原生定时器，必须在 `useEffect` 清理函数或 `app.on('will-quit')` 中严格对称注销，杜绝句柄与闭包内存泄漏。
2. **双窗口内存隔离红线**：
   - 主窗口在关闭驻留托盘或进入实时对局（默认开启）时执行真销毁（`BrowserWindow.destroy()`），释放约 150MB 渲染进程常驻内存。
   - `#mini` HUD 窗口仅通过 `data:get-hud-bootstrap` 加载剥离了拼音全拼索引与冗长 HTML 描述后的精简字典；选卡界面关闭时主动调用 `webFrame.clearCache()` 回收解码位图。
   - 离线 OCR Worker 执行“15 秒空闲自动销毁”，确保游戏团战期间 WASM 内存严格归零。

---

## 5. 合规安全死线（零妥协原则）

1. **100% 纯只读通信**：仅允许对 LCU 本地接口发起 `GET` 查询/事件订阅及读取官方 Live Client Data API（`GET https://127.0.0.1:2999/liveclientdata/allgamedata`），**严禁**任何 `POST`/`PUT`/`PATCH` 写操作。
2. **零内存读取与零模拟输入**：**严禁**读取游戏进程内存、注入 DLL 或调用 `SendInput` 模拟键鼠操作（装备快捷搜索仅允许写入系统剪贴板）。
3. **对局内静默免打扰**：当检测到玩家处于选人或实时对局状态时，自动挂起后台版本检查与数据包热更，确保零网速争抢与零弹窗打扰。

---

## 6. 提交、测试与发版自动化门禁

### 6.1 Conventional Commits 规范
```text
<type>(<scope>): <简明描述>
```
- `type`：`feat` | `fix` | `perf` | `refactor` | `ui` | `data` | `docs` | `build` | `ci` | `test`
- `scope`：`hud` | `ocr` | `engine` | `guide` | `settings` | `updater` | `win32` | `sync` | `arch`

### 6.2 本地与 CI 四重强制门禁
每次合并代码或打版本标签前，必须完整通过 `pnpm check && pnpm build`：
1. **`pnpm check:arch`**：校验全仓文件行数上限、分层依赖合规性、HUD Portal 禁令与零 `any` 规范。
2. **`pnpm typecheck`**：Node 主进程与 Web 渲染进程双 `tsconfig` 严格类型检查。
3. **`pnpm test`**：核心几何计算、评分引擎、配置迁移与日志提取 `vitest` 单元测试。
4. **`pnpm build`**：`electron-vite` 主进程、Preload 与渲染层生产打包验证。

### 6.3 面向玩家的 `CHANGELOG.md` 与发版闭环
- 在 [`CHANGELOG.md`](./CHANGELOG.md) 中使用玩家可读的中文分组（`### ✨ 新增功能` / `### ⚡ 体验与性能优化` / `### 🐛 问题修复`）记录变更。
- **仅在确认需要构建并发布正式 Windows 安装包（`Setup.exe`）与便携包（`Portable.exe`）时推送 `v*` 标签**；CI 会自动调用 `scripts/extract-changelog.mjs` 将对应版本中文说明同步至 GitHub Release 与客户端在线更新面板。
