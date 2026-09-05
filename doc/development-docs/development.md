# Novel AI 开发文档

| 项目 | 内容 |
|---|---|
| 文档日期 | 2026-09-05（重写，替换早期 Toast Blog / Vite 时代的失真版本） |
| 代码基线 | main @ a1b0946 |
| 配套文档 | 架构现状 `doc/architecture/architecture.md` · 测试 `doc/testing-docs/test-automation.md` · 部署 `doc/deployment/deployment.md` |

## 一、环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | **>= 22.5.0** | `node:sqlite`（`DatabaseSync`）最低版本。启动打印 `ExperimentalWarning: SQLite` 属正常现象 |
| 操作系统 | macOS / Linux / Windows | `npm run dev` 脚本需 bash；Windows 用 Git Bash / WSL |
| 测试浏览器 | Chromium | `npx playwright install chromium`（仅跑测试需要） |

## 二、快速上手

```bash
npm install                        # 仅安装 @playwright/test 一个 devDependency
npm run dev                        # 同时拉起 API(8787) + Web(5175)
# 打开 http://localhost:5175/novel-ai.html
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 双进程启动（推荐），Ctrl-C 一次回收两个进程 |
| `npm run api` / `npm run web` | 单独启动 API / 静态服务 |
| `npm test` | Playwright 全量用例（自动拉起 5176/8788 测试服务与独立测试库） |
| `npm run test:ui` / `npm run test:report` | UI 调试模式 / 打开上次 HTML 报告 |

> **改 Web 端口必须用 `npm run dev`**：API 的 Origin 白名单需要感知 `NOVEL_WEB_PORT`
> （`scripts/novel-dev.sh` 会同步传递），单独 `npm run web` 改端口而 API 不知情时，页面请求会被 403。

## 三、目录结构

```
novel-ai/
├── novel-ai.html            # 工作台页面（注入 window.NOVEL_API_PORT）
├── novel-ai.js              # 前端全部逻辑（单文件 ES module，1805 行）
├── novel-ai.css             # 样式（CSS 变量、明暗主题）
├── server/
│   ├── novel-api.js         # REST 路由 + 中间件编排（8787）
│   ├── novel-db.js          # 数据访问层：全部 SQL、22 表建表、种子数据
│   ├── novel-migrate.js     # schema 迁移框架（PRAGMA user_version）
│   ├── novel-auth.js        # Origin 白名单 + 请求体上限
│   ├── novel-secret.js      # 密钥加密（scrypt + AES-256-GCM）
│   ├── novel-ai-provider.js # 26 种 AI 任务 + OpenAI 兼容调用 + mock 降级
│   ├── novel-publish.js     # 发布任务（当前为懒扫描 + 模拟发布）
│   └── web-server.js        # 零依赖静态服务（5175）
├── scripts/novel-dev.sh     # 双进程启动脚本
├── tests/                   # Playwright 用例（契约层 + 页面烟雾层）
├── doc/                     # 本目录
└── .data/                   # SQLite（运行时生成，已 gitignore）
```

各文件内部结构（行号导览）见 `doc/architecture/architecture.md` §二/§四。

## 四、常见改动指南

### 4.1 新增一个 AI 功能按钮

AI 类按钮走「前端 taskMap → `POST /ai` → provider taskTemplates」三段式：

1. **前端** `novel-ai.html`：工具栏加 `<button type="button" data-action="my-task">我的功能</button>`。
2. **前端** `novel-ai.js`：`taskMap` 加 `'my-task': 'my-task'`（若 action 名即 taskType 可省）；
   `taskLabels` 加 `my-task: '我的功能'`（用于历史记录与状态提示）。
3. **后端** `server/novel-ai-provider.js`：`taskTemplates` 加 `my-task: [[标题, 正文, tone], ...]`
   （mock 模式的展示内容；真实模型输出由 prompt 驱动）。

无需改 API 层——`POST /ai` 是统一入口，taskType 透传。

### 4.2 新增一个普通 API 端点

在 `server/novel-api.js` 的 `handle()` 里按现有模式加一个分支（鉴权与 CORS 已由中间件处理）：

```js
if (req.method === 'POST' && url.pathname === '/api/novel/my-resource') {
  const body = await readJson(req);                 // 2MB 上限在这里生效
  const item = addMyResource({ projectId, ... });   // SQL 写进 novel-db.js
  return send(res, 201, { item });
}
```

约定：

- 所有 SQL 只写进 `novel-db.js`，API 层不出现裸 SQL；
- 写操作调 `logAudit('domain.action', payload)` 留痕（payload 不得含密钥明文）；
- 返回体若含 projects 行，必须过 `sanitizeProject()`。

### 4.3 修改数据库 schema（加表/加列）

**不要**只改 `initDb()` 的 `CREATE TABLE IF NOT EXISTS`——对已存在的库它不会生效。正确流程：

1. 在 `server/novel-migrate.js` 的 `MIGRATIONS` 末尾**追加**新条目（version 严格递增）：

```js
{
  version: 2,
  name: '一句话说明',
  up(db) {
    safeExec(db, `CREATE TABLE IF NOT EXISTS my_table (...)`);
    safeExec(db, `ALTER TABLE chapters ADD COLUMN my_col TEXT NOT NULL DEFAULT ''`);
  }
}
```

2. 已发布的迁移**永不修改**；`safeExec` 会容错重复执行（幂等）。
3. 迁移在单事务内执行，失败即启动失败（报错 + 回滚），不会带半截 schema 运行。
4. 若新表需要被导出，同步扩展 `exportProject()`（见 roadmap F078）。

### 4.4 新增测试用例

- **API 行为** → `tests/api-contract.spec.js`：用 `request` fixture 直打 `API_BASE`，
  写操作用 `token(label)` 生成全局唯一标记做并发隔离，断言只统计自己的数据。
- **页面交互** → 新建 `tests/xxx.spec.js`，从 `./fixtures.js` 导入 `test/expect`
  （夹具会把 `window.NOVEL_API_PORT` 指到测试端口 8788，直接用 `@playwright/test` 会连去 8787 开发库）。
- 端口、库路径等常量只从 `tests/test-env.js` 取，不要手写。
- 详细规范见 `doc/testing-docs/test-automation.md`。

## 五、编码约定

### 5.1 零依赖红线

- 运行时只允许 Node 内置模块与浏览器原生 API；唯一例外是 devDependency `@playwright/test`。
- 先查 Node 内置能力（`node:sqlite` 的 FTS5、`node:crypto` 的 scrypt/GCM、`node:http` 的 SSE），
  实测结论见 `doc/design/incremental-design-2026-09-02.md`；确需第三方依赖时先在任务评审里说明。

### 5.2 安全约定（一票否决项）

1. **密钥不入库**：API Key 只允许出现在 `.env`（gitignore）与运行环境。文档、代码、测试、
   commit message 一律不得出现真实密钥（历史事故 F073/X6，清理记录见 PRD）。
2. **innerHTML 必须经 `escapeHtml()`**：所有用户可控数据（含 AI 输出）。
3. **接口不出密钥材料**：projects 行必须过 `sanitizeProject()`；展示用 `maskSecret()`。
4. **写操作留审计**：`logAudit()`，payload 只记动作与掩码。
5. **不放松默认绑定**：`127.0.0.1` 是默认值；放开 `0.0.0.0` 属于部署决策且有配套风险清单（见部署文档）。

### 5.3 注释与提交

- 注释写「为什么」而不是「做什么」；有实测依据的结论在注释里标注出处
  （如「X3 实测：无 busy_timeout 并发写失败率 88%」），让后人敢信、也敢复核。
- 提交信息用 `type(scope): 摘要`（现有历史如 `feat(security+editor): …`、`test: …`）。
- 历史提交信息与内容可能不完全对应（仓库由 toast-blog 经 git-filter-repo 抽取，刻意保留原 message
  以便回溯源仓库），见 README「历史来源说明」。

### 5.4 SQLite 约定

- `PRAGMA busy_timeout = 5000`、`journal_mode = WAL`、`foreign_keys = ON` 是多进程并发安全的根基，
  **不得移除**（依据 X3 实测）；出现 `SQLITE_BUSY` 先查这三项而不是调回单线程。
- 自动保存走 `/draft`（不进版本表）；新增高频写路径时同样考虑「不写版本/审计表」。

## 六、调试技巧

### 6.1 curl 直打 API（无 Origin 视为本机调用，放行）

```bash
curl -s http://127.0.0.1:8787/api/novel/bootstrap | head -c 400
curl -s -X POST http://127.0.0.1:8787/api/novel/chapters/3/draft \
  -H 'content-type: application/json' -d '{"content":"调试正文"}'
curl -s -X POST http://127.0.0.1:8787/api/novel/ai \
  -H 'content-type: application/json' \
  -d '{"taskType":"outline","chapterId":3}'    # 未配密钥时返回 mock 结果
```

### 6.2 常见坑速查

| 症状 | 原因 | 处置 |
|---|---|---|
| 页面请求全部 403 | 页面来源不在 API 白名单 | 用 `npm run dev` 启动（自动同步 `NOVEL_WEB_PORT`）；自定义域名/端口时设 `NOVEL_ALLOWED_ORIGINS` |
| 413 Payload Too Large | 请求体 > 2MB（`MAX_BODY_BYTES`） | 属预期防护；批量导入请拆分 |
| 改了 .js 不生效/白屏 | 静态服务缓存或 MIME 错误 | `web-server.js` 已对 `.js` 输出 `text/javascript`；强刷（Cmd+Shift+R） |
| AI 面板显示「本地演示模式」 | 未配置密钥（预期降级） | 设置面板或 `.env` 配置；降级不影响其他功能 |
| AI 返回「AI 密钥不可用」 | 主密钥丢失/被替换，库中密文解不开 | 恢复 `~/.novel-ai/master.key` 备份，或重新录入密钥 |
| 测试偶发 `database is locked` | `busy_timeout` 被移除 | 恢复 PRAGMA，不要调回 `workers: 1` |
| 测试污染了开发库 | 用例没用 `fixtures.js` 或手写了 8787/5175 | 测试端口是 5176/8788（`tests/test-env.js`），必须走夹具 |
| 端口被占用 | 上次进程残留 | `lsof -i :8787 -i :5175` 找到并结束；`npm run dev` 的 trap 正常情况会自动回收 |
| 启动即退出并报「迁移失败」 | schema 迁移半途失败已回滚 | 看报错中的迁移名；修复后重跑；必要时用备份库恢复（见部署文档） |

## 七、扩展点与现状边界

- **AI provider**：`novel-ai-provider.js` 预留了 provider 位置；接入本地 Ollama 只需把 base url
  指到 `http://127.0.0.1:11434/v1`（M5 T025 会加预设与连接检测）。
- **发布平台**：当前 `simulatePublish` 模拟结果；真实平台对接在其上扩展，重试链路（waiting/failed/retry_count）已就位。
- **前端模块化**：单文件 1805 行仍在增长，拆分方案已排期（T021）；在那之前新代码遵循现有分区
  （§四 行号导览）放置，避免加剧耦合。
- **已知待改造点**（导出不全、检索 LIKE、单项目硬编码等 8 项）集中列在
  `doc/architecture/architecture.md` §十一，动手前先看。
