# Novel AI · Wiki 知识库（接手者必读）

> 面向**接手本项目**的开发者/维护者。这里放「代码注释里写不下、但踩过坑才知道」的隐性知识。代码与本文冲突时以代码为准。
> 基线：M6 收口（2026-09-09），F093 本地模型已合入，schema v7，零运行时依赖。

---

## 1. 术语表

| 术语 | 含义 |
|---|---|
| **草稿态 (draft)** | 章节当前正在写的正文，存于 `chapters.content`。自动保存**只 UPDATE 主表**，不入库版本（X4 教训：2h 写作能产生 360 个版本，版本表会炸）。 |
| **版本态 (version)** | 章节的历史快照，存于 `chapter_versions`。分两种 `kind`：`auto`（自动草稿版本）/ `milestone`（里程碑快照，★ 打快照生成）。 |
| **伏笔生命周期** | `foreshadows` 状态机：`planted`（已埋）→ `resolved`（已回收）/ `abandoned`（弃用），单向流出。逾期 = `expected_chapter` ≤ 当前章节数且仍为 `planted`，**判定在服务端做**，前端只展示红框预警。 |
| **写作会话 (writing session)** | `writing_sessions` 一行 = 一次写作。浏览器崩溃/直接关页会留下 `ended_at` 为空的「进行中」行，由下次 `startWritingSession` 兜底关闭。 |
| **节点图 (node map)** | 知识库力导向图谱（F091）：`node-map` 为画布，节点按类型着色（核心/知识/角色/时间线/场景/世界观），边为紫半透明；可拖拽、可双击钉住（📌）。 |
| **实体提及 (entity mention)** | `entity_mentions`：章节正文一次实体命中（含 `position` 供高亮）。`entity_aliases` 存正例别名与**负例**（`polarity=-1`，如「黑潮生」遮蔽「黑潮」误召）。 |
| **分区导航** | 顶部 `.workspace-nav` 锚点切换 8 个 section（`#sec-write`…`#sec-story`），`js/nav.js` 做平滑滚动 + scrollspy。 |
| **录入表单折叠** | `body.forms-collapsed` 默认收起管理区输入框（渐进式披露），点「展开录入」显式。 |
| **本地模型** | F093：Ollama / LM Studio / llama.cpp 走 OpenAI 兼容接口，**通常无需 API Key**，留空即可调用。 |
| **主密钥** | `~/.novel-ai/master.key`（0600），用 AES-256-GCM 加密项目内保存的 API Key。丢失则密钥不可恢复。不在项目内、严禁提交。 |
| **schema 迁移** | `server/novel-migrate.js`：基于 `PRAGMA user_version` 的迁移数组，事务回滚 + 幂等（`safeExec` 跳过「列/表已存在」）。当前 v7。 |

---

## 2. 新人上手 10 分钟清单

1. **读根 `README.md`**：环境（Node ≥ 22.5.0，需 `node:sqlite`）、`npm install`、启动 `npm run dev`。
2. **起服务**：`npm run dev` 同时拉起 Web(5175) 与 API(8787)。打开 `http://localhost:5175/novel-ai.html`。
3. **看演示数据**：默认示例小说「雾港星火」已填充章节/角色/伏笔，先逛一遍 8 个分区。
4. **读架构**：`doc/architecture/architecture.md` 的「代码地图」与「数据模型 v7」。
5. **读原型**：`doc/00-prototype.md` 理解信息架构与设计 token。
6. **读测试约定**：`doc/testing-docs/testing.md`——`fullyParallel:true`、本地 `workers:4` / CI `2`、测试用 5176/8788 + 独立库，原因见下「避坑」。
7. **跑一遍测试**：`npm test`（自动拉起服务，75 passed）。
8. **看迁移机制**：`server/novel-migrate.js` 的 `MIGRATIONS` 数组（v1–v7），理解怎么加字段/建表。
9. **摸一遍前端模块**：`js/` 下按功能切分（chapters/draft/autosave/versions/graph-view…），`novel-ai.js` 是入口。
10. **改一处验证**：例如改一个 CSS 变量看配色变化，或跟「如何加一个 AI 按钮」走一遍，确认你的改动链路通。

---

## 3. 常见问题 FAQ

**Q：改了 CSS 没生效？**
A：先看是不是被 `body.forms-collapsed` 收掉了——该规则只隐藏 `.ops-layout` 内的 `.form-grid`/`.config-textarea`/`.goal-box`。如果你把录入元素放在 ops-layout 之外，它不受折叠控制。其次确认改的是 `novel-ai.css`（不是其他文件），且浏览器没缓存（开发期硬刷 Cmd/Ctrl+Shift+R）。CSS 是静态文件，无构建，改完直接刷新生效。

**Q：测试卡死 / 跑不动？**
A：先确认 `npx playwright install chromium` 已装。卡死常见原因：
- **Google Fonts 被墙**（见避坑）——测试依赖加载 Inter/Noto Serif SC，连不上会挂死。本机需能访问 `fonts.googleapis.com`，或临时改 `novel-ai.html` 去掉 preconnect（仅调试）。
- 端口被占：先 `lsof -i:5176` / `lsof -i:8788` 看是否残留测试进程，杀掉再跑。
- 并发 `database is locked`：多半是 `PRAGMA busy_timeout` 被移除（见避坑）——**恢复 busy_timeout，不要把 `workers` 调回 1**。

**Q：密钥在哪？**
A：项目内**不存明文** API Key。云模型密钥填在 AI 配置区，由主密钥 `~/.novel-ai/master.key`（AES-256-GCM）加密后落 `projects.api_key_cipher` + `api_key_salt`。主密钥文件不在仓库内（`.gitignore` 之外靠路径隔离，0600 权限）。**任何文档/代码/提交都不得写密钥**（F073）。本地模型（F093）通常无需 Key。

**Q：如何加一个 AI 按钮？**
A：典型链路（以「续写建议」`continue-writing` 为例）：
1. **HTML**：在对应 `.toolbar-actions` 加 `<button data-action="continue-writing">续写建议</button>`（主行或「更多写作工具」`<details>` 次行）。
2. **前端入口**：在 `novel-ai.js`/`events.js` 的事件委托里加 `case 'continue-writing':`，调 `ai.js` 的流式请求。
3. **Provider**：`server/novel-ai-provider.js` + `novel-ai-stream.js` 处理 OpenAI 兼容流式；未配置走 `novel-ai-mock.js` 降级（界面标注「本地演示模式」）。
4. **编号**：在 `doc/function-docs/functions.md` 补 F 编号，在 `button-reference.md` 补 B 编号；PRD/design 同步。
5. **测试**：在 `tests/` 加 Playwright 用例（走 5176/8788 独立库），跑 `npm test` 确认 75+ 仍过。

---

## 4. 避坑清单

| 坑 | 现象 | 正确做法 |
|---|---|---|
| **同文件并行 Edit 竞态** | 两人/两 Agent 同时改同一文件，后写覆盖前写，或 Edit 因 `old_string` 已被改而失败。 | 改前先 `Read` 取最新；大改优先整文件 `Write`；避免对同一个文件交叉小修。 |
| **Google Fonts 被墙 → Playwright 挂死** | `npm test` 卡在加载页，超时失败；`novel-ai.html` 用 `fonts.googleapis.com` 拉 Inter/Noto Serif SC。 | 本机需能访问该域名；CI/离线环境需注入字体或临时去除 preconnect（仅调试，不提交）。切勿以为「测试代码 bug」。 |
| **CORS 白名单** | 页面请求被 403，控制台报跨域。 | API 只放行白名单来源（`NOVEL_ALLOWED_ORIGINS`；默认随 `NOVEL_WEB_PORT` 自动追加 5175）。**改 Web 端口务必用 `npm run dev`**，让 API 同步感知；单独 `npm run web` 改端口会 403（X1）。 |
| **SQLite BUSY / database is locked** | 并发写报 `SQLITE_BUSY`。 | **根因是缺 `PRAGMA busy_timeout`，非 SQLite 固有限制**（实测无 busy_timeout 失败率 88%，设 5000 后 0%）。`server/novel-db.js` 已设该参数，故允许并发：`fullyParallel:true`，本地 `workers:4`、CI `2`。**偶发 locked 先查 busy_timeout，别把 `workers` 调回 1**。 |
| **表单墙折叠边界** | 新录入框在管理区一直显示，不被「展开录入」控制。 | `forms-collapsed` 只隐藏 `.ops-layout` 内的 `.form-grid`/`.config-textarea`/`.goal-box`。新录入元素必须放进 `.ops-layout` 才会被折叠；写作区/图谱/大纲不受影响。 |
| **直接改 initDb** | schema 变更不生效 / 老库缺字段。 | 一律走 `server/novel-migrate.js`：往 `MIGRATIONS` 追加新 version，`safeExec` 幂等，事务回滚。**禁止直接改 `initDb`**。 |
| **自动保存生成版本** | 版本表爆炸（X4：2h → 360 版本）。 | 自动保存只 UPDATE `chapters` 主表；只有「★ 打快照」/ 手动存稿才写 `chapter_versions`。 |
| **密钥明文** | 安全事故。 | 永远加密落库（AES-256-GCM + 主密钥），绝不写文档/代码/提交。 |

---

## 5. 设计决策速查

| 决策 | 选择 | 原因（详见 design 文档） |
|---|---|---|
| 运行时依赖 | **零依赖**（仅 Node 内置 + 1 个 devDep） | 单机工具，易分发、零供应链风险；红线不可协商。 |
| 前端形态 | 原生 ES module + CSS，**无构建** | 直接开文件即用；无打包器、无 HMR 复杂链。 |
| 双进程 | Web(5175) + API(8787) 分离 | 静态服务与 API 关注点分离；API 绑定 127.0.0.1，CORS 白名单控跨域。 |
| schema 演进 | 迁移数组 + `user_version` + 事务回滚 + 幂等 | initDb 只能建新表，改已有表/加列必须迁移；失败即启动失败，绝不带半截 schema 跑。 |
| 检索 | FTS5 `search_fts` bigram 切分 | 中文 unicode61 把整段当一个 token，2 字召回差；bigram 覆盖全实体 + 字面后过滤防误召（design A 节实测）。 |
| 自动保存 | 防抖 + 只 UPDATE 主表 | 避免版本爆炸（X4）。 |
| 界面密度 | 分区导航 + 渐进式披露（折叠） | M5/M6 能力膨胀后平铺认知过载；三轮简化收口（2026-09-16~17）。 |
| AI 降级 | 未配置 provider → 本地 mock | 无 Key 也能演示全部功能；界面标注「本地演示模式」。 |
| 本地模型 | F093 OpenAI 兼容，免 Key | Ollama/LM Studio/llama.cpp 统一接入，零密钥门槛。 |
| 测试隔离 | 独立端口/库 + busy_timeout 放开并发 | SQLite 并发写靠 busy_timeout 保障；独立端口/库防用例串扰。 |
| 工程化方向（已拍板） | 加 TS 类型检查（`tsc --noEmit` / `checkJs` 经 JSDoc）、ESLint+Prettier(devDeps)、CI(GitHub Actions)、多环境(`.env`+`.env.example`)、可选构建 | **不破零依赖红线**：工具只作 devDependency，运行时依旧零依赖。 |

---

## 6. 相关文档跳转

- 总索引：`doc/README.md`
- 原型/线框/设计 token：`doc/00-prototype.md`
- 架构（as-built）：`doc/architecture/architecture.md`
- 开发上手与改动指南：`doc/development-docs/development.md`
- 测试体系：`doc/testing-docs/testing.md`
- 功能/按钮编号：`doc/function-docs/functions.md`、`button-reference.md`
- 部署与备份：`doc/deployment/deployment.md`
