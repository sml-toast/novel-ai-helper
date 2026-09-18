# Novel AI 开发文档

| 项目 | 内容 |
|---|---|
| 文档日期 | 2026-09-17（M6 重写，替换 M4/2026-09-05 失真版本） |
| 里程碑 | **M6**（大纲三视图 / 伏笔抽屉 / 调度器状态 / 专注模式 / 力导向图谱 / 多格式导出） |
| Schema | **v7**（`server/novel-migrate.js` 末条迁移 version = 7，F083/F092） |
| 测试基线 | Playwright **75 passed**（契约 33 + 页面 42），见 `doc/testing-docs/testing.md` |
| 零依赖红线 | 运行时只用 Node 内置模块 + 浏览器原生 API；唯一 devDependency 是 `@playwright/test` |
| 配套文档 | 架构 `doc/architecture/architecture.md` · 测试 `doc/testing-docs/testing.md` · 部署 `doc/deployment/deployment.md` |

> 本文件描述**目标工程状态**：零依赖栈保持不变，新增的工程化能力（TypeScript checkJs / ESLint+Prettier / CI / 多环境 .env）为已拍板方向，落地步骤见第七章。其余章节均基于当前代码事实。

## 一、环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | **>= 22.5.0** | `node:sqlite`（`DatabaseSync`）最低版本。启动打印 `ExperimentalWarning: SQLite` 属正常现象 |
| 包管理器 | npm（随 Node 自带） | 仅装 `@playwright/test` 一个 devDependency，无需 pnpm/yarn |
| Shell | bash | `npm run dev` 走 `scripts/novel-dev.sh` |
| 操作系统 | macOS / Linux / Windows | Windows 用 Git Bash / WSL 跑 `npm run dev` |
| 测试浏览器 | Chromium | `npx playwright install chromium`（仅跑测试需要） |
| 大模型密钥 | 可选 | 不配密钥时 AI 自动降级为本地 mock（界面标「本地演示模式」），其余功能不受影响 |

## 二、快速上手

```bash
npm install                        # 仅安装 @playwright/test 一个 devDependency
npm run dev                        # 同时拉起 API(8787) + Web(5175)
# 浏览器打开 http://localhost:5175/novel-ai.html
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 双进程启动（推荐），Ctrl-C 一次回收两个进程 |
| `npm run api` / `npm run web` | 单独启动 API / 静态服务 |
| `npm run test` | Playwright 全量用例（自动拉起 5176/8788 测试服务与独立测试库） |
| `npm run test:ui` / `npm run test:report` | UI 调试模式 / 打开上次 HTML 报告（test-results/playwright-report） |
| `npm run typecheck`（工程化新增·待落地） | `tsc --noEmit` 对 JS 做 JSDoc 类型检查，不产出文件 |

> **改 Web 端口必须用 `npm run dev`**：API 的 Origin 白名单需要感知 `NOVEL_WEB_PORT`（`scripts/novel-dev.sh` 会同步传给 API 进程）。单独 `npm run web` 改端口而 API 不知情时，页面请求会被 403。

## 三、目录结构与各文件职责

```
novel-ai/
├── novel-ai.html            # 工作台页面（注入 window.NOVEL_API_PORT = window.NOVEL_API_PORT || 8787）
├── novel-ai.js              # 前端薄入口（F089 重构结果）：import './js/events.js' + loadBootstrap()
├── novel-ai.css             # 样式：CSS 变量、明暗主题、toolbar 折叠/forms-collapsed/status-strip/原生下拉
├── server/                  # 25 个文件：零依赖 Node 后端（node:http + node:sqlite）
│   ├── novel-api.js         # REST 路由 + 中间件编排（CORS/鉴权已在这里统一处理，分发到 db 函数）
│   ├── novel-db.js          # 数据访问层：全部 SQL、initDb、resolveDbPath、PRAGMA(busy_timeout/WAL/foreign_keys)
│   ├── novel-migrate.js     # schema 迁移框架（PRAGMA user_version，当前 v7），新增迁移只能往后追加
│   ├── novel-auth.js        # Origin 白名单 + 请求体上限（MAX_BODY_BYTES = 2MB）
│   ├── novel-secret.js      # 密钥加密（scrypt + AES-256-GCM），主密钥默认 ~/.novel-ai/master.key
│   ├── novel-ai-provider.js # AI 任务编排 + OpenAI 兼容调用 + mock 降级
│   ├── novel-ai-prompt.js   # 各 taskType 的 prompt 模板（分层注入）
│   ├── novel-ai-mock.js     # 无密钥时的确定性 mock 输出
│   ├── novel-ai-stream.js   # SSE 流式输出（text/event-stream：meta→delta→done）
│   ├── novel-ai-probe.js    # 连接探测 / 预检
│   ├── novel-local-model.js # 本地模型（Ollama，base url 指 http://127.0.0.1:11434/v1）
│   ├── novel-publish.js     # 发布任务（simulate 模拟适配器，真实平台对接在其上扩展）
│   ├── novel-scheduler.js   # 定时发布调度器（测试库自动禁用）
│   ├── novel-outline.js     # 大纲数据包（chapters/scenes/foreshadows/plotLines/beats，按 sort_order）
│   ├── novel-foreshadow.js  # 伏笔与线索生命周期状态机
│   ├── novel-project.js     # 项目 CRUD / 切换 / 隔离
│   ├── novel-export.js      # 导出总控（project / markdown / docx / epub 路由白名单）
│   ├── novel-docx.js        # DOCX（OOXML/ZIP）生成
│   ├── novel-epub.js        # EPUB（OCF：首条目 STORED 的 mimetype）生成
│   ├── novel-zip.js         # 手写 ZIP 工具（供 docx/epub）
│   ├── novel-recall.js      # 按需召回 / 引用清单 / 正文截断
│   ├── novel-mentions.js    # 实体提及扫描（纯函数，无 SQL 依赖，迁移内复用）
│   ├── novel-date.js        # 本地日期工具（打卡日期本地化）
│   ├── load-env.js          # .env 加载（NOVEL_NO_DOTENV=1 可禁用；不覆盖已存在 env）
│   └── web-server.js        # 零依赖静态服务（NOVEL_WEB_PORT / NOVEL_WEB_HOST，.js → text/javascript）
├── js/                      # 36 个 ES module（F089 前端模块化，无构建、无打包器）
├── tests/                   # Playwright 用例 + 夹具 + 常量（见测试文档）
├── scripts/novel-dev.sh     # 双进程启动脚本（同步传递 NOVEL_API_PORT / NOVEL_WEB_PORT）
├── doc/                     # 本目录
├── .data/                   # SQLite（运行时生成，已 gitignore）
├── .env / .env.example      # 多环境配置（.env 不入库）
└── playwright.config.js     # Playwright 配置（webServer 数组 + 测试隔离）
```

### 3.1 前端模块（js/，36 个 ES module，按职责分组）

| 分组 | 文件 | 职责 |
|---|---|---|
| 装配 | `app.js` | `loadBootstrap()`（首屏 /api/novel/bootstrap）+ `renderAll()` 渲染编排 |
| 装配 | `events.js` | 全局事件委托：`[data-action]` 通用派发、`taskMap`（action→taskType）、各面板开关 |
| 装配 | `render-core.js` | 顶栏/项目卡/项目切换器/章节列表/关系渲染 |
| 装配 | `ui.js` / `dom.js` / `modal.js` / `nav.js` | 辅助区、DOM 工具、弹窗、导航 |
| 编辑器 | `editor.js` / `autosave.js` / `draft.js` / `versions.js` / `chapters.js` | 编辑器、防抖自动保存、草稿通道、版本、章节 |
| 编辑器 | `focus-mode.js` | 专注模式（body.focus-mode 驱动显隐 + Esc 退出 + 字号/行宽档位） |
| AI | `ai.js` | `runAi(taskType)` / `buildAiPayload` / 流式消费，import `taskLabels` |
| AI | `ai-settings.js` / `local-model.js` | 密钥设置状态、本地模型 |
| AI | `constants.js` | `taskLabels`（任务中文名）、常量枚举 |
| 知识/图谱 | `knowledge.js` / `graph.js` / `graph-view.js` / `graph-layout.js` / `mentions.js` | 知识库、图谱渲染、力导向布局/拖拽 pin、`window.__graphPerf` |
| 大纲/情节 | `outline.js` / `plot-grid.js` / `foreshadow.js` | 三视图、情节网格、伏笔抽屉 |
| 发布 | `publish.js` / `export-menu.js` | 发布看板、多格式导出弹窗 |
| 写作辅助 | `dashboard.js` / `story-bible.js` / `editorial.js` / `projects.js` | 仪表盘、故事圣经、社编、项目 |
| 状态/存储 | `store.js` / `session.js` / `log.js` | 全局状态、写作会话计时、系统日志 |
| 其它 | `fallback-data.js` / `utils.js` | API 离线兜底、通用工具 |

> 前端无构建：浏览器以 `<script type="module" src="./novel-ai.js">` 加载，`novel-ai.js` 仅做导入与首屏触发。新代码按上表分组落入对应模块，避免加剧耦合。

### 3.2 后端分层

```
请求 → web-server.js(静态) / novel-api.js(REST 路由)
        ├─ novel-auth.js      （Origin 白名单 + 2MB 上限，统一中间件）
        ├─ novel-api.js       （按 pathname 分发，读/写都过 novel-db.js）
        ├─ novel-db.js        （SQL 唯一出口；initDb + migrate；PRAGMA 安全基）
        ├─ novel-migrate.js   （schema 升版，失败即启动失败）
        ├─ novel-secret.js    （密钥加解密，sanitizeProject 剔密文）
        ├─ novel-ai-provider.js + prompt/mock/stream/probe/local-model（AI 通道）
        └─ novel-publish/scheduler/outline/foreshadow/project/export/docx/epub/zip/recall/mentions/date（业务域）
```

约定：**所有 SQL 只写在 `novel-db.js`**；API 层不出现裸 SQL；写操作经 `logAudit()` 留痕（payload 不含密钥明文）；返回 projects 行必须过 `sanitizeProject()`。

## 四、常见改动指南

### 4.1 新增一个 AI 工具按钮

AI 类按钮走「HTML `data-action` → `taskMap` → `runAi(taskType)` → `/ai` → provider」链路（统一入口，taskType 透传，无需改 API 路由）：

1. **`novel-ai.html`**：在工具栏（主行或 `<details class="toolbar-more">`「更多写作工具」）加按钮：
   ```html
   <button type="button" data-action="my-task-ai">我的功能</button>
   ```
2. **`js/events.js`**：在 `taskMap` 加一条 `action → taskType` 映射，让通用 `[data-action]` 处理器路由到 `runAi`：
   ```js
   const taskMap = {
     'run-sync-ai': 'sync',
     'my-task-ai': 'my-task',   // ← 新增
     // ...
   };
   ```
3. **`js/constants.js`**：`taskLabels` 加中文名（用于历史记录与生成中提示）：
   ```js
   export const taskLabels = { /* ... */ my-task: '我的功能' };
   ```
4. **`server/novel-ai-provider.js`**（及其 prompt 子模块）：加 `my-task` 的 prompt 模板与 mock 降级内容。真实模型输出由 prompt 驱动；无密钥时返回 mock。

### 4.2 新增一个普通 API 端点

在 `server/novel-api.js` 的 `handle()` 里按现有模式加分支（鉴权与 CORS 已由中间件处理）：

```js
// 路由匹配在文件顶部 url.pathname 的 if 链中
if (req.method === 'POST' && url.pathname === '/api/novel/my-resource') {
  const body = await readJson(req);                 // 2MB 上限在这里生效
  const item = addMyResource({ projectId, ... });   // SQL 写进 novel-db.js
  return send(res, 201, { item });
}
```

约定：
- 所有 SQL 只写进 `novel-db.js`，API 层不出现裸 SQL；
- 写操作调 `logAudit('domain.action', payload)` 留痕（payload 不得含密钥明文）；
- 返回体若含 projects 行，必须过 `sanitizeProject()`；
- 多项目上下文尊重 `?projectId=` 查询参数与 `X-Project-Id` 请求头（见 api-contract #19/#20）。

### 4.3 修改数据库 schema（加表 / 加列）

**绝不**只改 `initDb()` 的 `CREATE TABLE IF NOT EXISTS`——对已存在的库它不会生效。`initDb` 只能建新表、无法改已有表。正确流程走迁移框架：

1. 在 `server/novel-migrate.js` 的 `MIGRATIONS` 末尾**追加**新条目（version 严格递增，当前末条是 v7）：

   ```js
   {
     version: 8,            // 当前已发布到 v7；新迁移从 v8 递增
     name: '一句话说明（需求编号）',
     up(db) {
       // 加列用 safeExec 容错重复执行（幂等）
       safeExec(db, `ALTER TABLE chapters ADD COLUMN my_col TEXT NOT NULL DEFAULT ''`);
       // 加表用 IF NOT EXISTS
       db.exec(`CREATE TABLE IF NOT EXISTS my_table (...)`);
       // 需回填存量时，在单事务内写数据（迁移 up 整体在一个事务里）
     }
   }
   ```
2. 已发布的迁移**永不修改**；`safeExec` 会跳过「列已存在 / 表已存在」，保证幂等。
3. 迁移在单事务内执行，失败即 `ROLLBACK` + 启动失败（报错并回滚，不会带半截 schema 继续跑），由启动方决定是否中止进程。
4. 若新表要被导出/导入，同步扩展 `exportProject()`（见 F078 往返）。
5. 测试对 schema 版本的断言从 `MIGRATIONS` 推导（api-contract #13），**新增迁移无需改测试数字**。

### 4.4 新增一个测试用例

- **API 行为**（`@playwright/test` 直打）：`tests/api-contract.spec.js` 或 `tests/api-m6.spec.js`。用 `token(label)` 生成全局唯一标记做并发隔离，断言只统计自己的数据；经 API 间接校验库状态，不直接连 SQLite（唯一例外是 `user_version`，走只读探针 `tests/helpers/db-probe.mjs`）。
- **页面交互**：新建 `tests/xxx.spec.js`，从 `./fixtures.js` 导入 `test/expect`（夹具注入测试端口；直接用 `@playwright/test` 会连去 8787 开发库）。
- 端口、库路径、Origin 等常量**只从 `tests/test-env.js` 取**，不要手写。
- 详细规范见 `doc/testing-docs/testing.md`「八、如何新增用例」。

### 4.5 新增一个管理面板 / 表单区

管理区（关系、目标、待办、术语表、敏感规则等带 `form-grid` 的区块）遵循近期 UI 简化约定：**默认收起**（`body.forms-collapsed` 隐藏 `.ops-layout .form-grid` 等），由用户展开。新增管理面板时：

1. 在 `novel-ai.html` 的对应 `<details>` 或 `.ops-layout` 区块内加 `class="form-grid"` 表单；
2. 在 `novel-ai.js` / `js/events.js` 绑定展开与提交；
3. 提交走对应 API 端点（写操作过 `logAudit`）；
4. **测试不 fill 这些输入框**（见测试文档「加载可见性矩阵」），可安全默认折叠，不影响 75 条用例。

## 五、编码约定

### 5.1 零依赖红线（不可协商）

- 运行时只允许 Node 内置模块（`node:http` / `node:sqlite` / `node:crypto` / `node:fs` / `node:path` / `node:url` …）与浏览器原生 API（ES module / fetch / EventSource / DOM）。
- 唯一例外是 devDependency `@playwright/test`（仅测试用）。
- 先查 Node 内置能力（`node:sqlite` 的 FTS5、`node:crypto` 的 scrypt/GCM、`node:http` 的 SSE）。确需第三方依赖时，先在任务评审里说明并获拍板，不得擅自 `npm install`。
- 前端无构建、无打包器：新增依赖会直接破坏「原生 ES module 直达浏览器」的约束。

### 5.2 安全约定（一票否决项）

1. **密钥不入库明文**：API Key 只允许在 `.env`（gitignore）与运行环境。文档、代码、测试、commit message 一律不得出现真实密钥（F073/X6 历史事故）。项目库中的密钥经 `aes-256-gcm` 加密，主密钥 `~/.novel-ai/master.key`。
2. **innerHTML 必须经 `escapeHtml()`**：所有用户可控数据（含 AI 输出）。
3. **接口不出密钥材料**：projects 行必须过 `sanitizeProject()`；展示用 `maskSecret()`；导出 JSON 不得含 `api_key_cipher` / `api_key_salt`。
4. **写操作留审计**：`logAudit()`，payload 只记动作与掩码。
5. **不放松默认绑定**：`127.0.0.1` 是默认值；放开 `0.0.0.0` 属部署决策且有配套风险清单（见部署文档）。
6. **CORS 白名单**：F074 后非白名单 Origin 一律 403，且响应不带任何 `access-control-allow-origin` 头。

### 5.3 JSDoc 类型与模块边界

- 用 JSDoc `@param` / `@returns` / `@type` 标注公共函数与模块导出，为第七章 `tsc --noEmit` checkJs 打底；新增导出优先带类型注解。
- 模块边界：前端按 §3.1 分组落地，事件委托集中在 `js/events.js`；后端 SQL 收敛在 `novel-db.js`，业务域逻辑按文件切分，迁移逻辑只在 `novel-migrate.js`。
- 注释写「为什么」而非「做什么」；有实测结论的标注出处（如「X3 实测：无 busy_timeout 并发写失败率 88%」）。
- 提交信息 `type(scope): 摘要`（如 `feat(security+editor): …`、`test: …`）。

### 5.4 SQLite 约定

- `PRAGMA busy_timeout = 5000`、`journal_mode = WAL`、`foreign_keys = ON` 是多进程并发安全的根基，**不得移除**（依据 X3 实测）。
- 出现 `SQLITE_BUSY` 先查这三项与 `busy_timeout`，**不要**因此调回 `workers: 1`（见测试文档「环境隔离」）。
- 自动保存走 `/draft`（不进版本表）；高频写路径同样考虑「不写版本/审计表」。

## 六、调试速查

### 6.1 curl 直打 API（无 Origin 视为本机调用，放行）

```bash
curl -s http://127.0.0.1:8787/api/novel/bootstrap | head -c 400
curl -s -X POST http://127.0.0.1:8787/api/novel/chapters/3/draft \
  -H 'content-type: application/json' -d '{"content":"调试正文"}'
curl -s -X POST http://127.0.0.1:8787/api/novel/ai \
  -H 'content-type: application/json' \
  -d '{"taskType":"outline","chapterId":3}'    # 未配密钥时返回 mock 结果
```

### 6.2 密钥与日志位置

| 项 | 位置 |
|---|---|
| 项目库加密密钥（密文+盐） | `projects.api_key_cipher` / `projects.api_key_salt`（绝不明文） |
| 主密钥 | `~/.novel-ai/master.key`（`NOVEL_MASTER_KEY_PATH` 可改；**勿指向项目内目录**，否则随仓库清理后密钥永久无法解密） |
| 运行环境密钥 | `.env` 的 `NOVEL_AI_API_KEY`（gitignore，优先级低于项目库已存密钥） |
| 系统日志 | 前端 `#logDrawer`（顶栏 `[data-action="open-log"]` 打开）；后端 stdout 打印启动/迁移/审计 |
| 测试库 | `.data/novel-test.sqlite`（每次 `npm test` 重置；开发库 `.data/novel-ai.sqlite` 不受影响） |

> 日志级别：当前为「启动/迁移/错误」级 stdout 打印，无独立 log level 开关。DEBUG 排查可临时在相关模块加 `console.log` 后删除；不要在提交里留调试日志。

### 6.3 常见坑速查

| 症状 | 原因 | 处置 |
|---|---|---|
| 页面请求全部 403 | 页面来源不在 API 白名单 | 用 `npm run dev` 启动（自动同步 `NOVEL_WEB_PORT`）；自定义域名/端口时设 `NOVEL_ALLOWED_ORIGINS` |
| 413 Payload Too Large | 请求体 > 2MB（`MAX_BODY_BYTES`） | 属预期防护；批量导入请拆分 |
| 改了 .js 不生效/白屏 | 静态服务缓存或 MIME 错误 | `web-server.js` 已对 `.js` 输出 `text/javascript`；强刷（Cmd+Shift+R） |
| AI 面板显示「本地演示模式」 | 未配置密钥（预期降级） | 设置面板或 `.env` 配置；降级不影响其他功能 |
| AI 返回「AI 密钥不可用」 | 主密钥丢失/被替换，库中密文解不开 | 恢复 `~/.novel-ai/master.key` 备份，或重新录入密钥 |
| 测试偶发 `database is locked` | `busy_timeout` 被移除 | 恢复 PRAGMA，不要调回 `workers: 1` |
| 测试污染了开发库 | 用例没用 `fixtures.js` 或手写 8787/5175 | 测试端口是 5176/8788（`tests/test-env.js`），必须走夹具 |
| 端口被占用 | 上次进程残留 | `lsof -i :8787 -i :5175` 找到并结束；`npm run dev` 的 trap 正常情况自动回收 |
| 启动即退出报「迁移失败」 | schema 迁移半途失败已回滚 | 看报错中的迁移名；修复后重跑；必要时用备份库恢复（见部署文档） |

## 七、工程化落地（已拍板方向 · 目标状态与步骤）

保持零依赖运行时栈不变，工程化能力只作为 **devDependency / 配置 / CI** 叠加，不引入运行时依赖。

### 7.1 TypeScript 类型检查（checkJs）

目标：用 `tsc --noEmit` 对现有 JS 做 JSDoc 类型检查，零运行时成本、无需改写文件为 .ts。

1. `package.json` 增加 devDependency：`"typescript": "^5.x"`，脚本：
   ```json
   "scripts": {
     "typecheck": "tsc --noEmit",
     "test": "playwright test"
   }
   ```
2. 新增 `tsconfig.json`：
   ```json
   {
     "compilerOptions": {
       "allowJs": true,
       "checkJs": true,
       "noEmit": true,
       "strict": true,
       "module": "nodenext",
       "moduleResolution": "nodenext",
       "target": "ES2023",
       "lib": ["ES2023", "DOM", "DOM.Iterable"],
       "skipLibCheck": true,
       "types": ["node"]
     },
     "include": ["server/**/*.js", "js/**/*.js", "tests/**/*.js", "scripts/**/*.js"]
   }
   ```
3. 渐进式：`checkJs` 初期用 `// @ts-nocheck` 在噪声文件上临时豁免，逐步补 JSDoc 后移除；优先给 `novel-db.js` / `novel-api.js` / 公共函数加 `@param`/`@returns`。
4. 编辑器：`jsconfig.json`（同 `include`）让 IDE 实时提示类型错误。

### 7.2 ESLint + Prettier

目标：统一风格与捕获低级错误，规则从松到严。

1. devDependencies：`"eslint": "^9.x"`、`"prettier": "^3.x"`、`"eslint-config-prettier"`、`"globals"`。
2. `package.json` 脚本：
   ```json
   "scripts": {
     "lint": "eslint .",
     "format": "prettier --write \"**/*.{js,json,md,css,html}\""
   }
   ```
3. `eslint.config.js`（flat config）：环境 `node` + `browser` + `es2023`，开启 `no-undef`、`no-unused-vars`；**禁止 `no-restricted-imports` 规则把第三方运行时包列入白名单之外**（守住零依赖红线）——任何 `import` 非 `node:` 前缀的非内置包即报错。
4. `.prettierrc`：2 空格、单引号、尾逗号、`LF` 换行；`prettier --check` 进 CI。

### 7.3 CI 工作流（GitHub Actions）

目标：每次 push / PR 自动类型检查 + Lint + 测试。

`.github/workflows/ci.yml`：

```yaml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22.5.0', cache: 'npm' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
        env:
          CI: 'true'          # playwright.config.js 据此 workers=2、retries=1
```

要点：
- `npm ci` 只装 devDeps（含 `@playwright/test`），无运行时依赖。
- `CI=true` 下 Playwright `workers: 2`、`retries: 1`（本地 `workers: 4`、`retries: 0`，见测试文档）。
- 测试库由 `webServer` 命令自动重置，CI 不写开发库。

### 7.4 多环境 .env 矩阵

`.env` 不入库；`.env.example` 为样例（已存在，见根目录）。`load-env.js` 规则：**不覆盖**已在 `process.env` 中的变量（shell / Playwright 注入优先）；`NOVEL_NO_DOTENV=1` 彻底禁用（测试进程用它避免加载真实密钥）。

| 变量 | 默认 | 说明 | 谁读 |
|---|---|---|---|
| `NOVEL_WEB_PORT` | 5175 | 静态页端口；**改端口必须用 `npm run dev`**，否则 API 白名单不感知 | web-server.js / novel-dev.sh / playwright |
| `NOVEL_WEB_HOST` | 127.0.0.1 | 静态页监听地址；改 `0.0.0.0` 暴露局域网，自担风险 | web-server.js |
| `NOVEL_API_PORT` | 8787 | API 端口 | novel-api.js / novel-dev.sh / playwright |
| `NOVEL_API_HOST` | 127.0.0.1 | API 监听地址；改 `0.0.0.0` 暴露局域网 | novel-api.js |
| `NOVEL_DB_PATH` | .data/novel-ai.sqlite | SQLite 路径（相对项目根解析）；测试指向 `.data/novel-test.sqlite` | novel-db.js / playwright |
| `NOVEL_ALLOWED_ORIGINS` | http://127.0.0.1:5175,http://localhost:5175 | 跨域白名单，逗号分隔；缺 `NOVEL_WEB_PORT` 时自动追加 | novel-auth.js |
| `NOVEL_AI_BASE_URL` | （空） | OpenAI 兼容地址；环境变量 > 项目库 `ai_base_url` | novel-ai-provider.js |
| `NOVEL_AI_MODEL` | （空） | 模型名；环境变量 > 项目库 `ai_model` | novel-ai-provider.js |
| `NOVEL_AI_API_KEY` | （空） | Bearer Token；项目库密钥 > 本变量 > 无（mock） | novel-secret.js |
| `NOVEL_MASTER_KEY_PATH` | ~/.novel-ai/master.key | 主密钥路径；**勿指向项目内目录** | novel-secret.js |
| `NOVEL_NO_DOTENV` | （空） | =1 禁用 .env 加载（测试隔离用） | load-env.js |
| `NOVEL_SCHEDULER_DISABLED` | （空） | =1 禁用定时调度器 | novel-scheduler.js |
| `NOVEL_SCHEDULER_INTERVAL_MS` | 30000 | 调度器扫描周期 | novel-scheduler.js |
| `NOVEL_API_RELATIVE` / `NOVEL_PUBLIC_API_RELATIVE` | （空） | 反向代理/相对路径部署开关 | novel-api.js / web-server.js |
| `NOVEL_DEPLOY_CONFIG` | （空） | 部署配置路径 | 部署模块 |

环境矩阵示例：

| 环境 | WEB | API | DB | 备注 |
|---|---|---|---|---|
| 本地开发 | 5175 | 8787 | .data/novel-ai.sqlite | `npm run dev` |
| 测试（CI/本地） | 5176 | 8788 | .data/novel-test.sqlite | `npm test` 自动拉起 + 重置 |
| 演示/内网 | 自定义 | 自定义 | 自定义 | 设 `NOVEL_ALLOWED_ORIGINS`；谨慎 `0.0.0.0` |

## 八、扩展点与现状边界

- **AI provider**：`novel-ai-provider.js` 预留 provider 位置；本地 Ollama 只需把 `NOVEL_AI_BASE_URL` 指到 `http://127.0.0.1:11434/v1`。
- **发布平台**：当前 `simulatePublish` 模拟结果；真实平台对接在其上扩展，重试链路（waiting/failed/retry_count/simulated 标注）已就位。
- **前端模块化**：F089 已完成单文件（约 2400 行）→ `js/` 36 模块拆分；新代码遵循 §3.1 分组，避免加剧耦合。
- **已知待改造点**（导出不全、检索 LIKE、单项目硬编码等）集中列在 `doc/architecture/architecture.md` §十一，动手前先看。
