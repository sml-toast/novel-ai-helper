# Novel AI · 小说 AI 创作工作台

一个零运行时依赖的小说创作工作台，提供**章节写作、AI 同步辅助、知识库、人物关系图、情节一致性校验、定时发布推送**六项能力。

- 后端：Node 内置模块（`node:http` + `node:sqlite`），**无第三方运行时依赖**
- 前端：原生 ES module + CSS，无构建步骤，无打包器
- 数据：SQLite 单文件，首次启动自动建表

---

## 环境要求

| 项目 | 要求 | 说明 |
|---|---|---|
| Node.js | **>= 22.5.0** | `node:sqlite`（`DatabaseSync`）的最低版本要求。启动时可能打印 `ExperimentalWarning`，属正常现象 |
| 操作系统 | macOS / Linux / Windows | 脚本 `scripts/novel-dev.sh` 需 bash 环境 |

本机实测通过：`node v22.22.2`。

## 快速开始

```bash
# 1. 安装依赖（只有 @playwright/test 一个开发依赖）
npm install

# 2. 安装 Chromium（测试前置步骤，一次性；仅跑测试才需要）
npx playwright install chromium

# 3. 启动（同时拉起 API 与 Web 两个进程）
npm run dev
```

打开 <http://localhost:5175/novel-ai.html> 即可进入工作台。
根路径 <http://localhost:5175/> 会自动映射到 `novel-ai.html`。

## 启动命令

| 命令 | 作用 | 说明 |
|---|---|---|
| `npm run dev` | **同时启动 API + Web** | 推荐的开发方式。单个 `Ctrl-C` 即可回收两个进程，无残留端口占用 |
| `npm run api` | 仅启动 API 服务 | 端口 8787 |
| `npm run web` | 仅启动静态页面服务 | 端口 5175 |

## 端口表

| 端口 | 归属 | 用途 | 环境变量 |
|---|---|---|---|
| 5174 | blog-design | vite dev server（**本仓库不涉及**，仅避免冲突） | — |
| **5175** | novel-ai | 静态页面服务（`server/web-server.js`） | `NOVEL_WEB_PORT` |
| **8787** | novel-ai | API 服务（`server/novel-api.js`） | `NOVEL_API_PORT` |

两个端口均可通过环境变量覆盖，例如 `NOVEL_WEB_PORT=6000 npm run web`。

> **自定义 Web 端口时请用 `npm run dev`**：API 只放行白名单内的跨域来源（F074），
> 单独用 `npm run web` 改端口而未同步给 API，页面请求会被 403 拒绝。
> `scripts/novel-dev.sh` 与 `playwright.config.js` 均已自动同步该变量。

## 服务绑定与安全（F074）

| 项 | 默认行为 | 覆盖方式 |
|---|---|---|
| API 监听地址 | `127.0.0.1`（仅本机回环） | `NOVEL_API_HOST=0.0.0.0` |
| Web 监听地址 | `127.0.0.1`（仅本机回环） | `NOVEL_WEB_HOST=0.0.0.0` |
| 跨域白名单 | `http://127.0.0.1:5175`、`http://localhost:5175`（随 `NOVEL_WEB_PORT` 自动追加） | `NOVEL_ALLOWED_ORIGINS=http://a:1,http://b:2` |
| 请求体上限 | 2MB，超出返回 413 | 代码常量 `MAX_BODY_BYTES` |
| 数据库路径 | `.data/novel-ai.sqlite` | `NOVEL_DB_PATH=/path/to.sqlite` |

- 无 `Origin` 头的请求（curl、服务端直连）视为本机调用，正常放行。
- 跨域且来源不在白名单 → 读、写请求一律 403。
- **已修复的历史问题**：此前 API 未指定监听地址，实际绑定 `::`（所有网卡），
  局域网实测可直接访问，而日志却打印 `127.0.0.1`；同时 CORS 固定返回 `*`。
  该问题（X1）已于 2026-09-02 修复。

## 测试

```bash
npm test              # 跑全部用例（自动拉起 8787 + 5175 两个服务）
npm run test:ui       # Playwright UI 模式
npm run test:report   # 查看上一次的 HTML 报告
```

`npm test` 无需手工先起服务：Playwright 的 `webServer` 会自动拉起两个进程，结束后自动回收。

> 配置中固定 `workers: 1` 且 `fullyParallel: false`。因为用例会经 API 写同一个 SQLite 文件，
> 并发 worker 会导致 `SQLITE_BUSY` 与数据串扰。**请不要改为并发模式。**

## 目录结构

```
novel-ai/
├── novel-ai.html          # 工作台页面
├── novel-ai.js            # 前端主逻辑（ES module）
├── novel-ai.css           # 样式
├── server/
│   ├── novel-api.js       # REST API（8787）
│   ├── novel-db.js        # SQLite 数据访问层
│   ├── novel-ai-provider.js  # AI 能力适配层
│   ├── novel-publish.js   # 定时发布任务
│   └── web-server.js      # 静态服务（5175，零依赖）
├── scripts/
│   └── novel-dev.sh       # 双进程启动脚本
├── tests/                 # Playwright 用例
├── doc/                   # 开发文档 / 功能文档 / 任务计划 / 测试计划 / 用例截图
└── .data/                 # SQLite 数据库（运行时生成，已 gitignore）
```

## 数据存储

数据库文件位于 `.data/novel-ai.sqlite`，**首次启动自动建表并初始化**，无需手工建库或执行迁移脚本。

`.data/` 已在 `.gitignore` 中排除，不会进入版本库；克隆下来的仓库是干净的空库，不含任何历史数据。

## 已知限制

- **仅本机访问**：两个服务默认只绑定 `127.0.0.1`，同一局域网的其他设备无法访问。
  这是刻意设计（此前实际绑定所有网卡，存在数据暴露风险）。确需放开时：
  `NOVEL_API_HOST=0.0.0.0` / `NOVEL_WEB_HOST=0.0.0.0`，并自行评估风险。
- 前端通过 `window.NOVEL_API_PORT`（默认 8787）拼接 API 地址，前后端分处两个端口，
  依赖 API 的白名单 CORS 响应头。修改 API 端口需同步修改 `novel-ai.html` 中的注入值；
  修改 Web 端口请确保 API 侧感知到（用 `npm run dev` 会自动处理）。
- AI 能力依赖外部 provider 配置，未配置时相关功能**自动降级为本地 mock**
  （界面标注「本地演示模式」），其余功能不受影响。配置方式见 `.env.example`。
  **请勿把 API Key 写进任何文档或提交**。
- 数据库 schema 变更由迁移机制（`server/novel-migrate.js`）执行，迁移失败会终止启动，
  不会带着半截 schema 继续运行。

## 历史来源说明

本仓库由 [toast-blog](https://github.com/sml-toast/toast-blog)（本地 `blog-design`）经 `git-filter-repo` 按路径抽取而来，**保留了 9 个原创提交**，提交时间与作者信息均未改写。

需要说明的是：由于部分提交在源仓库中同时改动了博客与小说两侧的文件，抽取后这些提交只保留了小说相关的改动，但**提交信息仍保留原始文本**。因此少数 commit message 会出现与当前内容不完全对应的历史残留表述，例如：

- `feat: 后台语言切换无弹窗，新增小说AI辅助工具` —— 本仓库中只含「新增小说AI辅助工具」部分
- `docs: add Novel AI docs and heartbeat task verification` —— 本仓库中只含 Novel AI 文档部分

这是**刻意保留**的：不改写 message 才能在新仓库中回溯到源仓库的对应提交，可追溯性优先于文字美观。

源仓库 `blog-design` 的完整历史已通过 `git bundle` 全量备份，并打有保护标签 `pre-novel-split`，拆分过程对其零损伤。
