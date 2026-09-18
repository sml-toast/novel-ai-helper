# Novel AI 增量架构设计 + 技术实测（全新，M6 / schema v7）

| 项目 | 内容 |
|---|---|
| 文档日期 | 2026-09-17（重写） |
| 文档性质 | **增量架构设计 + 历史技术实测**。本文件替代 `doc/archive/2026-09-05-superseded/incremental-design-2026-09-02.md`（停留在 M4 / 2026-09-05），按 **M6 收口 / schema v7** 状态重写，结论均经源码核实 |
| 代码基线 | `e0290ca`（2026-09-09，M6 收口），schema `user_version = 7` |
| 读者 | 接手本项目的开发者、做架构评审的工程师 |
| 零依赖红线 | 运行时只依赖 Node 内置模块（`node:http` / `node:sqlite` / `node:crypto` / `node:fs` / `node:os` / `node:path` / `node:url`）；唯一第三方包是 devDependency `@playwright/test`。任何新功能先问「Node 内置能不能做」 |

> 本文件保留 T（任务）/ X（架构复核发现）/ R（风险）编号体系，状态对齐 M6 当前真实实现。所有数字来自历史实测脚本（`/tmp/novel-arch-probe/*`，见旧 design 文档附录 A）与当前源码核查，**无虚构端点与表**。

---

## 零、当前项目真相快照（M6 / schema v7）

- **双进程**：Web `server/web-server.js`（默认 `127.0.0.1:5175`，逐请求读盘）+ API `server/novel-api.js`（默认 `127.0.0.1:8787`）。无共享内存，靠 SQLite 文件 + CORS 白名单通信。
- **后端零运行时依赖**：`node:http` + `node:sqlite`（Node ≥ 22.5.0，内置 SQLite 3.51.2）；前端原生 ES module + CSS，无构建/打包。
- **Schema v7**：22 张基础业务表（initDb 建）+ 迁移框架新增 7 张（含 1 张 FTS5 虚拟表 `search_fts`），合计约 29 张物理表。`volumes`（卷）未做。
- **安全模型（F074）**：只信任本机；API 默认绑 `127.0.0.1`；Origin 白名单；请求体上限 2MB；主密钥 `~/.novel-ai/master.key`（0600）用 scrypt + AES-256-GCM 加密存储的密钥。**密钥严禁写入文档**。
- **AI Provider**：拆为 prompt / mock / stream / local-model / probe 五个子模块；Ollama / LM Studio / llama.cpp 走 OpenAI 兼容路径无需 Key；连不上本地服务给可行动报错（`connection-error`）而非降级 mock。
- **测试**：`workers`（本地 4 / CI 2），独立于开发库（端口 5176 / 8788 + `.data/novel-test.sqlite`）；`busy_timeout=5000` 从根因消除 SQLite BUSY（无它失败率 88%，有它 0）。现状 75 passed。
- **近期 UI 简化（2026-09 三轮）**：吸顶分区导航、工具栏主行 + 可折叠「更多写作工具」、管理表单默认收起（`forms-collapsed` 只藏输入框不藏按钮）、`status-strip` 替代大卡、原生 `<details>` 下拉、`zone-label` 分区标题。
- **部署**：编辑机 = 本工作区（源码）；运行机 = `10.144.144.4`（smlhome / root，密钥直连），`/opt/novel-ai/`，systemd 两服务；nginx 仅 `:8888`。公网 `39.102.76.107` 代理 `:80`/`:443` 到死端口，novel-ai 只 `:8888` → 站点 404（**待修复**）。

---

## 一、设计原则

### 1.1 零依赖优先（Zero-Dependency First）

系统的可移植性来自「**只靠 Node 内置能力**」。引入任何第三方运行时包（即便是一个 HTTP 库或 ORM）都会：① 破坏单机拷贝即用的特性；② 引入供应链与审计面；③ 增加 `npm install` 失败风险（尤其离线环境）。

**判定规则**：新功能出现时，先问「Node 内置能不能做」。历史实测已证明 23 项能力全部可用 Node 内置落地（FTS5 中文检索、scrypt/AES 加密、SSE 流式、力导向布局、DOCX/EPUB 手写 OOXML、RAG 四维召回……），**无一项需要外部依赖**。唯一的例外是 `@playwright/test`——它是测试工具，不进运行时，符合红线。

### 1.2 渐进式披露（Progressive Disclosure）

信息密度按「作者当下需要」分层，默认只露主干，高级/低频操作折叠。依据 2026-09 三轮 UI 简化落地：

- **吸顶分区导航**：滚动时分区锚点常驻，不占正文高度。
- **工具栏主行 + 可折叠「更多写作工具」**：高频动作（保存/AI/导出）在一行，低频动作收进折叠区。
- **管理表单默认收起**：`forms-collapsed` 只藏输入框，**不藏按钮**——保证「展开入口」永远可见，作者不会因为表单收起而找不到功能。
- **`status-strip` 替代大卡**：用一条轻量状态条替代原先占版面的状态大卡。
- **原生 `<details>` 下拉**：用浏览器原生折叠元素，零 JS 状态、零依赖、可访问性好。
- **`zone-label` 分区标题**：用小标签把页面切成语义区，降低认知负荷。

设计意图：写作工具的主界面必须「**接近空白纸**」，AI 辅助与管理系统是「需要时招之即来、不需要时退居幕后」。

### 1.3 本机优先安全（Local-First Security）

整个系统定位**单机单用户本地写作工具**，安全模型围绕「只信任本机」展开：

- 任何「对外开放 / 多人协作 / 公网访问」需求都推翻该模型，属显式非目标（F095 不排期）。
- 防护是**纵深**的：网络层（绑回环）+ 来源层（Origin 白名单）+ 输入层（2MB 上限 + 参数化 SQL）+ 静态层（目录穿越防护）+ 输出层（转义 + 密钥脱敏）+ 凭据层（主密钥加密）+ 审计层（写操作留痕）。
- 「可修复的配置故障必须被看见」：主密钥解密失败、本地模型连不上，**不降级 mock**，而是返回可读错误卡片——避免作者把示例数据当 AI 建议继续改稿。

---

## 二、关键技术决策与依据

### D1 草稿态 vs 版本态分离（X4 实测驱动）

自动保存（3s 防抖）只 `UPDATE chapters.content`，**不写版本表**；只有手动存稿 `/save`、回滚 `/rollback`、里程碑快照 `/milestone` 才进 `chapter_versions`（kind = `manual` / `auto` / 命名快照）。

**依据**：X4 实测，自动保存进版本表 → 100 章 318MB、版本列表单次返回 108 万字；分离后压缩约 45x。这是「高频路径不污染审计/版本」的核心约束。**接口契约**：`/save` 的 `kind='manual'` 被 46 条测试明文验证，不能被调用方覆盖；因此里程碑单独开 `/milestone` 端点而非给 `/save` 加参数。

### D2 `busy_timeout` 是并发写的根因（X3 实测驱动）

跨进程并发写 SQLite BUSY 的根因不是「SQLite 锁的固有限制」，而是**缺 `PRAGMA busy_timeout`**。

**依据**：X3 跨进程实测——无 `busy_timeout`：4 进程 × 400 写，失败 1411/1600（88%）；设置 `busy_timeout = 5000` 后：同样压力失败率 0。因此 `server/novel-db.js` 建库即设该参数，Playwright `workers` 才可提升（本地 4 / CI 2），而非锁死 `workers:1`。

### D3 API 默认绑 `127.0.0.1`（X1 修复）

`server/novel-api.js` 的 `listen(port, host)` 中 `host = process.env.NOVEL_API_HOST || '127.0.0.1'`。**不传 host 时 Node 默认绑 `::`（所有网卡）**，局域网可直接访问，日志却打印 `127.0.0.1`，极具误导性。确需局域网/多设备时设 `NOVEL_API_HOST=0.0.0.0`（自担风险）。

### D4 前端 `apiBase` 固定 `127.0.0.1`（非 `location.hostname`）

前端 API 基址写死 `127.0.0.1`，不用 `location.hostname`。**依据**：`localhost` 在部分环境会被解析为 IPv6 `::1`，而 API 只绑 IPv4 回环（`127.0.0.1`），会直接连不上（见 `tests/test-env.js` 注释）。同一理由：测试基址也用 `127.0.0.1`。

### D5 主密钥外置 `~/.novel-ai/master.key`（0600）

AI 密钥用 AES-256-GCM 加密落库（密文 + 盐），加解密密钥来自主密钥。主密钥**必须在用户目录，不能放项目内**——`.data/` 与 `.env` 都在 `.gitignore`，随仓库清理 = 已存密钥永久不可恢复。文件权限显式 `chmod 0600` + 目录 `0700`（实测 umask 022 下不显式 chmod 会退化成 0644，同机其他账号可读）。主密钥丢失/被替换 = 旧密文 GCM 认证失败永久不可解密（D 项跨进程实测），故 UI 强制引导备份导出。

### D6 `exportProject` 用显式列名（防导出密钥）

`GET /api/novel/export/project` 的 SQL **逐个表显式列出列名**，绝不用 `SELECT *`。**依据**：`projects` 含 `api_key_cipher` / `api_key_salt` 密钥材料，若用 `SELECT *` 会随 `json_object` 一并导出，泄露加密密钥密文与盐。`sanitizeProject` 在 API/DB 层白名单输出，密文/盐/明文永不出响应体。

### D7 本地模型拆为五个子模块

`server/novel-ai-provider.js`（编排）之下拆为：`novel-ai-mock.js`（示例数据）、`novel-ai-prompt.js`（分层 prompt + token 估算 + 解析）、`novel-ai-stream.js`（SSE 流式孪生通道）、`novel-local-model.js`（端点判定 + 可行动报错 + 鉴权头）、`novel-ai-probe.js`（连接检测 + 模型枚举）。

**依据**：provider 长期超 300 行；F093 本地模型（Ollama / LM Studio / llama.cpp / vLLM）与云模型**共用 OpenAI 兼容路径**，唯一差别是「本地通常无 Key」与「报错需可行动」。拆模块让「端点判定/报错文案」与「探测/枚举」各自独立演进，且远端预设与报错提示共用 `LOCAL_PRESETS` 单一真源（避免两处漂移）。

### D8 schema 变更只走 `novel-migrate.js`

禁止直接改 `initDb()` 加列/加表。所有演进走 `server/novel-migrate.js` 的 `MIGRATIONS` 数组：`PRAGMA user_version` + 单事务 + `safeExec` 幂等 + 失败即启动失败。当前已应用 v1–v7（`chapter_versions.kind/name` → 性能索引 → `search_fts` bigram → 实体提及/别名 → 写作会话 → 伏笔 → 章节排序/场景归属/情节线）。**已发布迁移永不修改**，新需求一律追加新条目。

### D9 连不上本地服务 = 可行动报错，不降级 mock

云模型断网保留 mock 降级（作者至少看到结构示例）；**本地模型端点连不上则显式 `connection-error` 卡片**（提示「请先启动 Ollama / 端口 X 无监听」），绝不降级 mock——否则作者会以为本地模型在跑，看到的却是内置示例。判定核心：`canCallReal = Boolean(apiKey) || local === true`，短路从「`!baseUrl || !apiKey`」改为允许本地无 Key。

---

## 三、历史技术实测（A–F 六项验证）

> 以下数字来自旧 design 文档附录 A 的实测脚本（同源可复跑），结论在当前 M6 代码中被沿用与实现。

### A. FTS5 中文检索（F088 / T012）

| 方案 | 中文 2 字词召回 | 备注 |
|---|---|---|
| 默认 `unicode61` | 3/10 | 整段中文当一个 token |
| **bigram 手工切分** | **10/10** | 采用方案 |
| trigram | 6/10 | 更差，勿用 |

- 磁盘膨胀：150 万字 4.40MB → 11.42MB（2.6x，可接受）。
- **字面后过滤**：bigram 有子串误召（`MATCH '黑潮'` 返回「黑潮生」行），FTS5 粗筛后必须 `LIKE '%query%'` 精确过滤。
- 性能：150 万字下稀有词召回快 166x、常见词 4.8x。统一 `search_fts` 覆盖七类实体（章节/知识/角色/时间线/场景/世界观/术语）。

### B. 迁移框架（T004 / D8）

- v0→v3 迁移全通过；中途抛错 → `ROLLBACK` 未污染库（R2 已验证）。
- 幂等：重复启动 `user_version` 稳定不变（契约测试覆盖）；`safeExec` 容错 `duplicate column`/`already exists`。
- `NOVEL_DB_PATH` 指向隔离库可行（测试库机制基础）。

### C. SSE 流式（F082 / T015）

- 首字节 11.2ms；`AbortController` 中断正常（客户端断开服务端不报错、不落库）。
- 6 事件正确解析；`?mock=1` 确定性假流（固定 40 字符分片 × 15ms）消除 Playwright 时序 flaky（R12）。
- CORS 头必须随 `writeHead` 一起发，事后 `setHeader` 会抛 `ERR_HTTP_HEADERS_SENT`（实测进程崩溃）。

### D. 密钥加密（F075 / T006 / D5）

- scrypt `N=16384/r=8/p=1` 单次约 **30ms**（实测 100 次加密 3053ms）。
- 派生 key 带 `Map<salt,key>` 缓存：缓存后 1000 次取 key 仅 **0.31ms**（≈0.0003ms/次，R13 已缓解）。
- AES-256-GCM 自带完整性：篡改密文/盐不匹配抛 `Unsupported state or unable to authenticate data`，不会解出乱码。
- **主密钥丢失跨进程实测**：新主密钥下旧密文解密失败（预期行为，R3 固有限制）。
- umask 022 下 `writeFileSync` 的 `mode:0600` 会退化为 0644，故必须 `chmodSync` 补一刀。

### E. 中文实体识别（F080 / T013）

- 朴素实现 500 条词典 × 10 万字 = **324ms**；首字符索引版 = **2.5ms**（快 130x，R9 已缓解）。
- 召回 11/11（种子数据）；负例遮蔽后对抗 8/10（剩余误报由提及 UI 人工标负例兜底，E.3 结论）。
- CJK 邻居边界校验被实测否定（不引入）。

### F. 并发写 / 绑定 / 请求体（X3 / X1 / X5）

- **并发写**：无 `busy_timeout` 失败率 **88%**（1411/1600）；有则 **0**（D2，R11）。
- **绑定地址（X1）**：`listen(port)` 未传 host 实测 `192.168.102.128`（局域网 IP）可访问；对照绑 `127.0.0.1` 则 `ECONNREFUSED`。
- **请求体上限（X5）**：无上限时 50MB 请求被完整读入，堆占用 **109MB**；现 `readJson` 累计超 `MAX_BODY_BYTES=2MB` 即中断并 413。

---

## 四、架构复核发现（X1–X6，均为已修复项）

| ID | 发现 | 严重度 | 状态 | 修复方式 | 证据 |
|---|---|---|---|---|---|
| **X1** | API `listen(port)` 未传 host，实际绑 `::`（所有网卡），局域网可直访，日志却打印 `127.0.0.1` | 🔴 高 | ✅ 已修复 | `host = NOVEL_API_HOST \|\| '127.0.0.1'`；启动自检地址非回环告警 | `server/novel-api.js:807` |
| **X2** | PRD 称「多项目需改 30+ 端点与前端 state」 | 🟢 误判 | ✅ 已消解 | 源码核验：47 个路由分支中仅 2 行真依赖 `bootstrap.project`，中间件 1 行解决（T011，人天 3→1.5） | `server/novel-project.js` |
| **X3** | 测试 `workers:1` 归因于「SQLite 锁固有限制」 | 🟠 根因错 | ✅ 已修复 | 根因是缺 `busy_timeout`；设 5000 后失败率 88%→0，workers 提升（本地 4 / CI 2） | `playwright.config.js` 头注释 |
| **X4** | 自动保存进版本表 → 版本爆炸 | 🔴 高 | ✅ 已修复 | 草稿态不进版本表（D1），压缩 45x；版本列表只返回 `kind != 'auto'`（D1，R1） | `server/novel-db.js` `saveDraft`/`saveChapter` |
| **X5** | 请求体无上限，50MB 打满内存 | 🔴 高 | ✅ 已修复 | `readJson` 累计字节 > 2MB → `PAYLOAD_TOO_LARGE` → 413 + `req.destroy()` | `server/novel-api.js:67` |
| **X6** | PRD 自身第 97 行含明文 API Key | 🔴 高 | ✅ 已修复 | 三处明文改占位符 + 新增 `.env.example`；provider 读取仅剩 `process.env`；`git` 历史清理 | `doc/prd/*`、`.env.example` |

> 补充（运行期）：CORS 原 `send()` 固定回显 `access-control-allow-origin: *`（X1 上下文）——已改为仅白名单 Origin 回显 + `Vary: Origin`，非白名单读写一律 403（F074）。

---

## 五、任务分解（T001–T026，状态对齐 M6）

> 全部 26 项任务在 M6 / schema v7 下均已交付（Done）。下表每项标注「Done + 代码证据」。状态图例：✅ Done / ⬜ Backlog。

### M4：可信可用（全部 Done）

| 任务 | 名称 | 状态 | 代码证据 |
|---|---|---|---|
| **T001** | 密钥外泄紧急处置（F073） | ✅ Done | 全仓无明文；`.env.example` 存在；provider 仅读 `process.env` |
| **T002** | git 历史密钥清理（F073b） | ✅ Done | `git log -S` 命中 0（用户已拍板执行） |
| **T003** | DB 路径可配置 + busy_timeout（F077 前置） | ✅ Done | `server/novel-db.js` `NOVEL_DB_PATH` + `PRAGMA busy_timeout=5000` |
| **T004** | 迁移框架 + v1 迁移（F075/F086 前置） | ✅ Done | `server/novel-migrate.js` `MIGRATIONS` v1–v7 |
| **T005** | API 鉴权与本机绑定（F074） | ✅ Done | `server/novel-auth.js` + `server/novel-api.js` `listen(host='127.0.0.1')` + 2MB 上限 |
| **T006** | AI 配置闭环与密钥加密（F075） | ✅ Done | `server/novel-secret.js` scrypt+AES-256-GCM + 0600 主密钥 + 掩码 + 备份引导端点 |
| **T007** | 防丢稿 + 草稿态/版本态规则（F076×F086） | ✅ Done | `js/autosave.js`、`/chapters/:id/draft`、`saveChapter kind='manual'` |
| **T008** | 导出完整性 + 导入回灌 + 备份（F078） | ✅ Done | `server/novel-export.js` `exportProject`（显式列名，密钥剔除）+ `importProject`（单事务/外键顺序/`VACUUM INTO` 备份） |
| **T009** | 测试体系补齐（F077） | ✅ Done | `tests/*` 6 spec，75 passed，独立库 + 隔离端口 + workers 提升 |
| **T010** | 四份失真文档纠偏 | ✅ Done | 文档与源码对齐（本次重写延续） |

### M5：长篇结构化（全部 Done）

| 任务 | 名称 | 状态 | 代码证据 |
|---|---|---|---|
| **T011** | 多项目支持与切换器（F079） | ✅ Done | `server/novel-project.js` `resolveProjectId`；`?projectId=` → `X-Project-Id` → 默认；`projectExists` 404 |
| **T012** | FTS5 检索升级（F088） | ✅ Done | v3 迁移 `search_fts` bigram + 字面后过滤；`searchAll` 七类实体 |
| **T013** | 自动提及与反链（F080） | ✅ Done | v4 迁移 `entity_mentions`/`entity_aliases`（polarity±1）；`server/novel-mentions.js`；`/mentions` 端点 |
| **T014** | 按需召回 + 上下文管理（F081） | ✅ Done | `server/novel-recall.js` 四维加权；`novel-ai-prompt.js` 五层 prompt + 三段截断 + refs/tokenEstimate；prompt 缩短 63% |
| **T015** | AI 流式输出 + 可信标识（F082） | ✅ Done | `server/novel-ai-stream.js` SSE 端点；`provider` 三态/四态徽章；`?mock=1` 确定性假流 |
| **T016** | 会话计时 / 里程碑 / 打卡（F086-part2） | ✅ Done | v5 迁移 `writing_sessions`；`/sessions/start|end`、`/sessions/stats`；`/milestone` 端点 |
| **T017** | 表单去硬编码（F087） | ✅ Done | `js/*` 表单字段开放录入 + 校验；`selectedText` 走真实 `getSelection()` |
| **T018** | 定时发布真实调度器（F085） | ✅ Done | `server/novel-scheduler.js` 随 API 启动；`scanDuePublishTasks` 重启补跑 |

### M6：创作增强（全部 Done）

| 任务 | 名称 | 状态 | 代码证据 |
|---|---|---|---|
| **T019** | 伏笔与线索生命周期（F084） | ✅ Done | v6 迁移 `foreshadows`（planted→resolved/abandoned）；`server/novel-foreshadow.js`；conflict 任务注入未回收清单 |
| **T020** | 大纲树 / 场景网格 / Plot Grid（F083） | ✅ Done（卷未做） | v7 迁移 `sort_order`/场景归属章节/`plot_lines`/`plot_beats`；`server/novel-outline.js`；`js/outline.js`/`plot-grid.js`。**已知限制：`volumes`（卷）未实现，当前为「章→场景」两级** |
| **T021** | 前端模块化拆分（F089） | ✅ Done | `novel-ai.js`（2090 行）→ `js/` 约 36 个 ES module；保持无构建 |
| **T022** | 专注 / 打字机 / 沉浸模式（F090） | ✅ Done | `js/focus-mode.js`；Cmd+S/Cmd+Enter/Esc 快捷键 |
| **T023** | 图谱力导向布局（F091） | ✅ Done | `js/graph-view.js`/`graph-layout.js`；200+ 节点流畅 + 缩放/拖拽/固定 |
| **T024** | Markdown 导出（F092a） | ✅ Done | `server/novel-export.js` `exportMarkdown`；`/export/markdown` |
| **T025** | 本地模型接入（F093） | ✅ Done | `server/novel-local-model.js` + `novel-ai-probe.js`；`/settings/ai/presets` + `/test`；本地无 Key 放行；`connection-error` 不降级 |
| **T026** | DOCX / EPUB 导出（F092b） | ✅ Done | `server/novel-docx.js`/`novel-epub.js`/`novel-zip.js`；`/export/docx`/`/export/epub`（手写 OOXML/OPF） |

```mermaid
graph LR
    subgraph M4["M4 可信可用 ✅"]
        T001["T001 密钥处置"] --> T005["T005 鉴权+本机绑定"]
        T003["T003 DB+busy_timeout"] --> T004["T004 迁移框架"]
        T004 --> T006["T006 密钥加密"]
        T004 --> T007["T007 防丢稿"]
        T005 --> T007
        T005 --> T008["T008 导出导入"]
        T007 --> T008
        T003 --> T009["T009 测试"]
        T005 --> T009
    end
    subgraph M5["M5 长篇结构化 ✅"]
        T012["T012 FTS5"] --> T013["T013 提及"]
        T013 --> T014["T014 召回"] --> T015["T015 流式"]
        T011["T011 多项目"] T016["T016 里程碑"] T017["T017 表单"] T018["T018 调度器"]
    end
    subgraph M6["M6 创作增强 ✅"]
        T019["T019 伏笔"] T020["T020 大纲/PlotGrid"]
        T021["T021 前端模块化"] T022["T022 专注"]
        T023["T023 力导向"] T024["T024 MD导出"]
        T025["T025 本地模型"] T026["T026 DOCX/EPUB"]
    end
    T009 -.-> T011
    T009 -.-> T021
    T004 -.-> T019
    T004 -.-> T020
    T006 -.-> T025
    T008 -.-> T024 -.-> T026

    classDef done fill:#d6f5d6,stroke:#2e7d32;
    class T001,T003,T004,T005,T006,T007,T008,T009,T011,T012,T013,T014,T015,T016,T017,T018,T019,T020,T021,T022,T023,T024,T025,T026 done;
```

> **F094（PWA）**：3.0 人天，与 F074「仅本机 + Origin 白名单」存在根本张力，建议 M6 后单独立项评估（非 T 任务，Backlog）。
> **F095（只读分享协作）**：架构建议不排期（与本地单机定位冲突，推翻 F074 鉴权模型）。

---

## 六、风险登记册（技术维度，R1–R16）

状态图例：✅ 已缓解 / 🟡 部分缓解 / ⬜ 未缓解（固有限制，接受）/ ➕ 已接受（低，可接受）。

| ID | 类别 | 风险 | 等级 | 实测/源码依据 | 缓解措施 | 当前状态 |
|---|---|---|---|---|---|---|
| **R1** | 性能 | 版本表膨胀 | 🔴 高 | X4：100 章 318MB | ① 草稿态不进版本表（压缩 45x）；② 版本列表只返回 `kind != 'auto'` | ✅ 已缓解 |
| **R2** | 数据 | 迁移失败致 schema 半截 | 🔴 高 | B 项：事务回滚有效 | ① 单事务；② 失败即启动失败；③ 启动前备份 DB | ✅ 已缓解 |
| **R3** | 安全 | 主密钥丢失→已存密钥永久不可解密 | 🔴 高 | D 项跨进程实测 | ① 主密钥放 `~/.novel-ai/`（非项目内）；② UI 强制备份引导；③ 检测不到时提示重录 | 🟡 部分缓解（备份引导已交付；**丢失本质不可恢复，属残余风险**） |
| **R4** | 安全 | API 绑定所有网卡（X1） | 🔴 高 | 实测局域网可达 | `listen('127.0.0.1')` + 启动自检非回环告警 | ✅ 已缓解 |
| **R5** | 数据 | 导入外键顺序错误→脏数据 | 🟠 中 | foreign_keys ON | ① 固定顺序 users→projects→chapters→其余；② 单事务回滚；③ 导入前 `VACUUM INTO` 备份 | ✅ 已缓解 |
| **R6** | 兼容 | `node:sqlite` 仍 experimental | 🟠 中 | 运行打印 `ExperimentalWarning` | `engines >=22.5.0`；数据访问集中 `novel-db.js` | ⬜ 未缓解（固有限制，接受） |
| **R7** | 兼容 | Node 版本漂移 | 🟠 中 | 要求 `>=22.5.0` | ① `engines` 锁；②（建议）`.nvmrc` + 启动校验版本；③ CI 固定版本 | 🟡 部分缓解 |
| **R8** | 性能 | FTS5 磁盘膨胀 2.6x | 🟡 低 | A 项：4.40→11.42MB | 可接受；长篇可选只索引标题 | ➕ 已接受 |
| **R9** | 性能 | 实体扫描 O(n×m) 退化 | 🟡 低 | E 项：朴素 324ms→索引 2.5ms | 首字符 Map 索引（快 130x） | ✅ 已缓解 |
| **R10** | 性能 | 力导向 200+ 节点卡顿 | 🟡 低 | 旧硬编码 8 坐标 | 自实现力导向 + `requestAnimationFrame` 分帧 + 缩放/拖拽 | ✅ 已缓解（T023） |
| **R11** | 测试 | SQLite 并发致测试不稳定 | 🟢 已缓解 | X3：busy_timeout 后 0 | ① `busy_timeout=5000`；② 测试库隔离；③ workers 提升 | ✅ 已缓解 |
| **R12** | 测试 | SSE 流式断言 flaky | 🟡 低 | C 项时序依赖强 | `?mock=1` 确定性假流；断言最终拼接串 | ✅ 已缓解 |
| **R13** | 性能 | scrypt 30ms 落 AI 热路径 | 🟡 低 | D 项：缓存后 ≈0.0003ms | 派生 key `Map<salt,key>` 缓存 | ✅ 已缓解 |
| **R14** | 数据 | bigram 子串误召（「黑潮生」） | 🟡 低 | A 项：`MATCH '黑潮'` 返回「黑潮生」 | FTS5 粗筛后字面 `LIKE` 精确过滤 | ✅ 已缓解 |
| **R15** | 架构 | 前端单文件持续膨胀 | 🟠 中 | 旧 1190→1570 行预估 | T021 拆分 `js/` 约 36 模块，单文件 ≤ 300 行 | ✅ 已缓解 |
| **R16** | 数据 | `.data/` 在 `.gitignore`，无自动备份 | 🟠 中 | 全仓无自动备份逻辑 | ① `exportProject` 完整导出（密钥剔除）；② 部署文档备份指引；③ `VACUUM INTO`/`.backup` | 🟡 部分缓解（无定时自动备份脚本，需人工执行） |

### 部署相关新增风险（M6 收口时暴露，建议补录）

| ID | 类别 | 风险 | 等级 | 现状 | 状态 |
|---|---|---|---|---|---|
| **R17** | 部署 | 公网 `39.102.76.107` 代理 `:80`/`:443` 到死端口，novel-ai 只 `:8888` → 站点 404 | 🔴 高 | nginx 仅 `:8888`；API 绑 `127.0.0.1` 不对外；反代未把 `/api/` 透到 8787 | ⬜ 未缓解（待修复，见 architecture §十二） |
| **R18** | 部署 | 运行机 `10.144.144.4` systemd 两服务存活依赖人工巡检 | 🟠 中 | 无健康检查/自动拉起之外的告警 | 🟡 部分缓解（systemd `Restart=on-failure` 假设成立时有效） |

---

## 七、零依赖红线复核结论

对 23 项需求逐条独立判断：**零依赖下全部可落地，无一项需要外部依赖或用户决策**。Q3（向量 RAG 方案）已关闭——四维加权召回在零依赖下完全可行，无需向量、无需外部 API。

**任何新功能先做「Node 内置能不能做」的判定**，违例需显式说明理由并经评审。密钥、AI 调用、流式、检索、加密、图谱、导出均已用 Node 内置实现并实测，构成可复用的先例。

---

*本文件为 M6 / schema v7 全新重写，未改动仓库任何业务代码；结论经 `server/*.js`、`tests/test-env.js`、`playwright.config.js`、`package.json` 与 git 基线 `e0290ca` 核实。*
