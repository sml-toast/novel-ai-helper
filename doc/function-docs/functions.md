# Novel AI 助手 · 功能文档（编号版 · M6 / schema v7）

> 文档日期：2026-09-17（重写，对齐 M6 收口与 schema v7）
> 基线：M4「可信可用」、M5「长篇结构化」、M6「创作增强」、F093「本地模型接入」均已交付（2026-09-09 收口）；F094 PWA / F095 只读分享未排期（Backlog）。
> 编号体系：功能 `F001–F095`，按钮 `B001–B093`（见 `button-reference.md`）。本表据 `server/novel-api.js`、`js/*.js`、`novel-ai.html` 当前代码核实，端点前缀统一为 `/api/novel`。

## 状态说明

| 状态 | 含义 |
|---|---|
| Done | 已交付并随 M4/M5/M6/F093 合并验证（全量回归 75 passed） |
| Backlog | 已立项/已识别，但排期待用户决策（非当前开发范围） |

---

## 一、功能点编号总表（F001–F095）

| 编号 | 名称 | 所属模块 | 状态 | 简短描述 | 主要 API 端点 / UI 入口 |
|---|---|---|---|---|---|
| F001 | 新建项目 | 项目/章节 | Done | 侧栏「新建」：弹窗收集标题/题材/世界观/目标平台/写作风格 → 创建并自动切换到新项目 | `POST /api/novel/projects`；`data-action="new-project"` |
| F002 | 存稿 | 项目/章节 | Done | 手动存稿：写主表并生成 `kind='manual'` 版本；防抖自动保存走 `/draft` 不生成版本 | `POST /api/novel/chapters/:id/save`；自动 `POST /api/novel/chapters/:id/draft`；`data-action="save-draft"` |
| F003 | 新建章节 | 项目/章节 | Done | 为当前项目新增章节 | `POST /api/novel/chapters`；`data-action="create-chapter"` |
| F004 | 创建项目 | 项目/章节 | Done | 设置表单创建项目（与 F001 共用后端逻辑，自动切换） | `POST /api/novel/projects`；`data-action="create-project"` |
| F005 | 同步辅助 | AI 辅助 | Done | 触发 AI 对当前章节进行同步辅助（续写/润色等 26 种任务之一） | `POST /api/novel/ai`（task=`sync`）；`data-action="run-sync-ai"` |
| F006 | AI 历史 | AI 辅助 | Done | 打开 AI 交互历史记录面板 | `GET /api/novel/ai/history`；`data-action="load-history"` |
| F007 | 审计日志 | AI 辅助 | Done | 打开审计日志面板，查看操作记录 | `GET /api/novel/audit`；`data-action="load-audit"` |
| F008 | 系统日志 | AI 辅助 | Done | 打开日志面板（F063–F067） | 本地面板，无 API；`data-action="open-log"` |
| F009 | 知识库搜索 | 知识库 | Done | 在知识库面板内搜索知识条目（FTS5） | `GET /api/novel/search`；`data-action="search-knowledge"` |
| F010 | 刷新图谱 | 图谱 | Done | 重新加载知识图谱数据 | `GET /api/novel/graph`；`data-action="refresh-graph"` |
| F011 | 框架提炼 | AI 辅助 | Done | 从正文提取故事框架结构 | `POST /api/novel/ai`（task=`framework`） |
| F012 | 情节提炼 | AI 辅助 | Done | 提取章节核心情节线 | `POST /api/novel/ai`（task=`plot-extract`） |
| F013 | 章节构思 | AI 辅助 | Done | 生成章节大纲 | `POST /api/novel/ai`（task=`outline`） |
| F014 | 拟人化润色 | AI 辅助 | Done | 对文本进行拟人化润色 | `POST /api/novel/ai`（task=`polish`） |
| F015 | 分镜剧本 | AI 辅助 | Done | 将文本转为分镜剧本格式 | `POST /api/novel/ai`（task=`screenplay`） |
| F016 | 续写建议 | AI 辅助 | Done | 提供续写建议 | `POST /api/novel/ai`（task=`continue`） |
| F017 | 爆点强化 | AI 辅助 | Done | 强化章节冲突爆点 | `POST /api/novel/ai`（task=`hook-boost`） |
| F018 | 伏笔回收 | AI 辅助 | Done | 管理伏笔与回收计划 | `POST /api/novel/ai`（task=`foreshadow`） |
| F019 | 平台改写 | AI 辅助 | Done | 适配不同发布平台 | `POST /api/novel/ai`（task=`platform-rewrite`） |
| F020 | 标题生成 | AI 辅助 | Done | 自动生成章节标题 | `POST /api/novel/ai`（task=`title`） |
| F021 | 简介生成 | AI 辅助 | Done | 自动生成章节简介 | `POST /api/novel/ai`（task=`synopsis`） |
| F022 | 标签生成 | AI 辅助 | Done | 自动生成标签 | `POST /api/novel/ai`（task=`tags`） |
| F023 | 对白检查 | AI 辅助 | Done | 检查对白质量 | `POST /api/novel/ai`（task=`dialogue`） |
| F024 | 批注建议 | AI 辅助 | Done | 提供批注建议 | `POST /api/novel/ai`（task=`annotation`） |
| F025 | 章节摘要 | AI 辅助 | Done | 生成章节摘要 | `POST /api/novel/ai`（task=`summary`） |
| F026 | 设定抽取 | AI 辅助 | Done | 抽取关键设定术语 | `POST /api/novel/ai`（task=`term-extract`） |
| F027 | 敏感改写 | AI 辅助 | Done | 处理敏感内容 | `POST /api/novel/ai`（task=`sensitive-rewrite`） |
| F028 | 角色小传 | AI 辅助 | Done | 生成角色小传 | `POST /api/novel/ai`（task=`character-bio`） |
| F029 | 时间线整理 | AI 辅助 | Done | 整理故事时间线 | `POST /api/novel/ai`（task=`timeline`） |
| F030 | 场景描写 | AI 辅助 | Done | 增强场景描写 | `POST /api/novel/ai`（task=`scene`） |
| F031 | 世界观扩展 | AI 辅助 | Done | 扩展世界观元素 | `POST /api/novel/ai`（task=`world`） |
| F032 | 冲突校验 | AI 辅助 | Done | 校验情节冲突（与伏笔状态机联动） | `POST /api/novel/ai`（task=`conflict`） |
| F033 | 版权警示 | AI 辅助 | Done | 检查版权风险 | `POST /api/novel/ai`（task=`copyright`） |
| F034 | 导入项目知识 | 知识库 | Done | 导入外部知识文件到项目知识库 | `POST /api/novel/knowledge`；`data-action="import-knowledge"` |
| F035 | 关系设计 | 知识库 | Done | AI 辅助设计角色关系 | `POST /api/novel/ai`（task=`relationship`）；`data-action="relationship-ai"` |
| F036 | 生成思维图 | 知识库 | Done | 生成思维导图 | `POST /api/novel/ai`（task=`mindmap`）；`data-action="mindmap"` |
| F037 | 保存平台配置 | 发布 | Done | 保存发布平台设置（账号名/平台规则开放录入） | `POST /api/novel/platforms`；`data-action="save-platform"` |
| F038 | 创建定时发布 | 发布 | Done | 设置定时发布任务（时间自选，留空 = +1h） | `POST /api/novel/publish`；`data-action="schedule-publish"` |
| F039 | 归档当前章节 | 发布 | Done | 归档已发布章节 | `POST /api/novel/chapters/:id/archive`；`data-action="archive-chapter"` |
| F040 | 查看版本 | 版本 | Done | 查看章节历史版本（卡片标注 kind：自动版本/手动存稿/★里程碑快照） | `GET /api/novel/chapters/:id/versions`；`data-action="load-versions"` |
| F041 | 刷新仪表盘 | 统计 | Done | 刷新仪表盘数据（含连续打卡与 12 周热力图） | `GET /api/novel/dashboard`；`data-action="refresh-dashboard"` |
| F042 | 保存目标 | 统计 | Done | 保存写作目标（deadline/note 开放录入） | `POST /api/novel/goals`；`data-action="save-goal"` |
| F043 | 记录进度 | 统计 | Done | 记录写作进度 | `POST /api/novel/progress`；`data-action="add-progress"` |
| F044 | 新增角色 | 内容管理 | Done | 添加新角色（motivation/arc 开放录入） | `POST /api/novel/characters`；`data-action="add-character"` |
| F045 | 查看角色 | 内容管理 | Done | 加载角色列表 | `GET /api/novel/characters`；`data-action="load-characters"` |
| F046 | 新增场景 | 内容管理 | Done | 添加新场景（description 开放录入） | `POST /api/novel/scenes`；`data-action="add-scene"` |
| F047 | 查看场景 | 内容管理 | Done | 加载场景列表 | `GET /api/novel/scenes`；`data-action="load-scenes"` |
| F048 | 新增时间线 | 内容管理 | Done | 添加新时间线条目（description 开放录入） | `POST /api/novel/timeline`；`data-action="add-timeline"` |
| F049 | 查看时间线 | 内容管理 | Done | 加载时间线列表 | `GET /api/novel/timeline`；`data-action="load-timeline"` |
| F050 | 新增世界观 | 内容管理 | Done | 添加新世界观元素（content 开放录入） | `POST /api/novel/world`；`data-action="add-world"` |
| F051 | 查看世界观 | 内容管理 | Done | 加载世界观列表 | `GET /api/novel/world`；`data-action="load-world"` |
| F052 | 新增批注 | 批注待办 | Done | 添加新批注（severity 表单选择 info/warning/danger，服务端白名单） | `POST /api/novel/chapters/:id/annotations`；`data-action="add-annotation"` |
| F053 | 查看批注 | 批注待办 | Done | 加载批注列表 | `GET /api/novel/chapters/:id/annotations`；`data-action="load-annotations"` |
| F054 | 新增待办 | 批注待办 | Done | 添加新待办（dueAt 开放录入，可留空） | `POST /api/novel/todos`；`data-action="add-todo"` |
| F055 | 查看待办 | 批注待办 | Done | 加载待办列表 | `GET /api/novel/todos`；`data-action="load-todos"` |
| F056 | 新增术语 | 术语提示词 | Done | 添加新术语（definition 开放录入） | `POST /api/novel/glossary`；`data-action="add-glossary"` |
| F057 | 查看术语表 | 术语提示词 | Done | 加载术语列表 | `GET /api/novel/glossary`；`data-action="load-glossary"` |
| F058 | 保存 Prompt | 术语提示词 | Done | 保存自定义提示词 | `POST /api/novel/prompts`；`data-action="save-prompt"` |
| F059 | 查看模板 | 术语提示词 | Done | 加载提示词列表 | `GET /api/novel/prompts`；`data-action="load-prompts"` |
| F060 | 导出项目 JSON | 导出设置 | Done | 导出整个项目（覆盖全部业务表，永不携带密钥） | `GET /api/novel/export/project`；`data-action="export-project"` |
| F061 | 导出章节 TXT | 导出设置 | Done | 导出当前章节为 TXT 文件 | `GET /api/novel/export/chapter`；`data-action="export-chapter"` |
| F062 | 保存 AI 配置 | 导出设置 | Done | 保存 AI 模型配置（密钥加密落库，永不回显明文） | `POST /api/novel/settings/ai`；`data-action="save-ai-settings"` |
| F063 | 打开日志面板 | AI 辅助 | Done | 打开系统日志侧边面板 | `data-action="open-log"`；抽屉 |
| F064 | 日志级别筛选 | AI 辅助 | Done | 按 DEBUG/INFO/WARN/ERROR 过滤日志（本地 select） | `<select>`（无 data-action） |
| F065 | 压缩日志 | AI 辅助 | Done | 压缩旧日志，保留最近 100 条（本地） | `data-action="compress-logs"` |
| F066 | 清除日志 | AI 辅助 | Done | 清空所有日志记录（本地） | `data-action="clear-logs"` |
| F067 | 刷新日志 | AI 辅助 | Done | 重新渲染日志列表（本地） | `data-action="refresh-logs"` |
| F068 | 知识库面板 | 知识库 | Done | 打开知识库面板：知识图谱/角色关系/情节线索/世界设定/本章提及 | `data-open-panel="knowledge"` |
| F069 | 发布计划面板 | 发布 | Done | 打开发布计划面板：发布队列/定时发布/归档管理 + 调度器状态 | `data-open-panel="publish"` |
| F070 | 图谱类型切换 | 交互/UI | Done | 切换知识图谱视图（综合/知识/人物/时间线/世界观） | `data-graph-type=[all\|knowledge\|character\|timeline\|world]` |
| F071 | 辅助标签切换 | 交互/UI | Done | 切换 AI 辅助侧栏标签（构思/校验/版权） | `data-tab=[ideas\|checks\|risks]` |
| F072 | 关闭面板 | 交互/UI | Done | 关闭当前打开的侧边/下拉面板 | `data-close-panel` |
| F073 | 密钥外泄处置与安全约定 | 安全/基建 | Done | 密钥严禁入库的处置流程与文档约定（F073 配套：`.env` 隔离、轮换失效） | 工程规范；`server/novel-api.js`、`server/web-server.js` 注释 F073 |
| F074 | API 鉴权与本机绑定 | 安全/基建 | Done | 非白名单 Origin 一律 403；所有服务默认绑定 127.0.0.1 | `server/novel-auth.js`；所有 `/api/novel/*` 前置鉴权 |
| F075 | 密钥加密存储 + 主密钥备份引导 | 安全/基建 | Done | API Key 经 AES-256-GCM 加密落库；主密钥 `~/.novel-ai/master.key` + 备份引导 UI | `POST /api/novel/settings/ai`；`GET /api/novel/settings/ai/master-key` |
| F076 | 防丢稿 + 草稿/版本分离 | 安全/基建 | Done | 防抖自动保存走 `/draft`（不进版本表）；手动「存稿」走 `/save` 生成版本 | `POST /api/novel/chapters/:id/draft` 与 `/save` |
| F077 | 测试端口隔离修复 | 工程化 | Done | 修复 HTML 内联脚本覆盖测试端口缺陷；Playwright 夹具隔离测试库 | 工程化（无产品端点） |
| F078 | 导出/导入完整性 | 导出设置 | Done | 导出覆盖全部业务表 + 导入回灌（new 重映射 / replace 覆盖，VACUUM 自动备份，单事务回滚） | `GET /api/novel/export/project`、`POST /api/novel/import` |
| F079 | 多项目支持 | 项目/章节 | Done | `?projectId=` → `X-Project-Id` → 默认项目；存在性校验 404；前端切换器 | `data-action` 经 URL 解析；`#projectSwitcher`（F096） |
| F080 | 自动提及与反链 | 知识库 | Done | 纯扫描器提取章节提及实体 + 反链 + 别名；「本章提及」卡一键标负例 | `POST/GET /api/novel/mentions`、`/mentions/backlink`、`/mentions/rescan`、`/aliases` |
| F081 | 按需召回 | AI 辅助 | Done | 四维加权打分（纯函数）+ 分层 prompt + 正文三段截断 + 引用清单回传 | 内部 `getRecallForChapter`；驱动 AI 上下文 |
| F082 | AI 流式输出 | AI 辅助 | Done | SSE 流式透传 + 可中断（断开不落库）+ 前端实时卡/停止/JSON 降级 | `POST /api/novel/ai/stream` |
| F083 | 大纲结构三视图 | 大纲结构 | Done | 大纲树（章→场景）/ 场景卡片 Corkboard / Plot Grid 情节网格 + 拖拽排序持久化 | `GET /api/novel/outline`；`POST /api/novel/chapters/reorder`、`/scenes/reorder`、`/plotbeats`、`/plotlines` |
| F084 | 伏笔生命周期 | 伏笔 | Done | 伏笔表 + planted→resolved/abandoned 状态机 + 逾期提醒 + 与冲突校验联动 | `POST/GET /api/novel/foreshadows`、`/foreshadows/hints`；`data-open-panel="foreshadow"` |
| F085 | 定时发布调度器 | 发布 | Done | 进程内 `setInterval` 扫描 + 重启补跑 + 运行状态展示（仅服务存活时生效，模拟适配器） | `GET /api/novel/scheduler` |
| F086 | 会话计时 / 快照 / 打卡 | 统计 | Done | 写作会话计时（结束才落库）+ ★里程碑快照 + 连续打卡与 12 周热力图 | `POST /api/novel/sessions/start`、`/sessions/end`；`GET /api/novel/sessions/stats`、`/dashboard` |
| F087 | 表单去硬编码 + 真实选区 | 交互/UI | Done | 开放 11 类硬编码字段；AI 按钮 `selectedText` 接真实编辑器选区（定向类可用） | 各管理面板表单 + `js/events.js` taskMap |
| F088 | FTS5 检索升级 | 知识库 | Done | 统一 `search_fts`（七类实体 bigram）+ 存量回填 + 字面后过滤；移除假网络文献 | `GET /api/novel/search` 底层 |
| F089 | 前端模块化 | 工程化 | Done | `novel-ai.js` → `js/` 目录（≥6 个原生 ES module），保持无构建 | 工程化（无端点）；`js/*.js` |
| F090 | 专注 / 打字机 / 沉浸模式 | 交互/UI | Done | 单类 `body.focus-mode` 驱动；隐藏侧栏/顶栏/面板只留编辑器；Esc 退出；打字机滚动 + 当前段落高亮 | `data-action="focus-toggle"`、`font-dec`、`font-inc`、`width-cycle` |
| F091 | 力导向节点图 | 图谱 | Done | 零依赖 Fruchterman-Reingold 简化版：拖拽固定/双击解除/光标锚缩放/平移；收敛自停 | 自动渲染 + `GET /api/novel/graph`；`data-action="refresh-graph"` |
| F092 | 多格式导出 | 导出设置 | Done | Markdown / DOCX / EPUB + 附录勾选（批注/术语/时间线/伏笔）+ 单章/全书；RFC 5987 中文文件名 | `GET /api/novel/export/{markdown\|docx\|epub}`；`data-action="export-multi"` |
| F093 | 本地模型接入 | AI 辅助 | Done | Ollama / LM Studio / llama.cpp 预设一键填入 + 连接检测；本地模型免密钥（无需 Key） | `POST /api/novel/settings/ai/test`；`GET /api/novel/settings/ai/presets`；`js/local-model.js` |
| F094 | PWA 离线能力 | 工程化 | **Backlog** | Service Worker 离线缓存与「仅本机」鉴权存在张力；M6 后单独立项评估，待用户决策 | 未排期 |
| F095 | 只读分享协作 | 发布 | **Backlog** | 分享 = 服务对外暴露，会推翻 F074 本机 + Origin 白名单鉴权模型；与单机定位冲突，不排期，待用户决策 | 未排期 |
| F096 | 项目切换器 | 项目/章节 | Done | 多项目切换 select（单项目时隐藏；切换经 dirty 拦截） | `#projectSwitcher` |
| F097 | 打里程碑快照（双入口） | 版本 | Done | 编辑器顶栏与版本面板头部「★ 打快照」命名留存当前版本（kind='milestone'） | `POST /api/novel/chapters/:id/milestone`；`data-action="create-milestone"` |
| F098 | 会话计时 | 统计 | Done | 编辑器顶栏显示本次会话时长与字数增量；开始/结束自动落库（不逐键写库） | `POST /api/novel/sessions/start`、`/sessions/end` |
| F099 | 连续打卡 + 热力图 | 统计 | Done | 仪表盘展示连续写作天数与近 12 周日历热力图（零依赖 CSS 网格，本地时区） | `GET /api/novel/sessions/stats`、`/dashboard` |

---

## 二、AI 同步辅助任务矩阵（26 种，F005 统一路由）

所有 AI 辅助按钮经 `js/events.js` 的 `taskMap` → `runAi(task)` 统一路由到 `POST /api/novel/ai`，请求体带 `task` 字段。26 种任务 = F011–F033（23 种编辑器任务）+ F005 同步辅助（`sync`）+ F035 关系设计（`relationship`）+ F036 生成思维图（`mindmap`）。

| task 字段 | 按钮文案 | F 编号 | 所在位置 |
|---|---|---|---|
| sync | 同步辅助 | F005 | 顶栏主按钮 |
| framework | 框架提炼 | F011 | 编辑器工具栏（常显） |
| plot-extract | 情节提炼 | F012 | 编辑器工具栏（常显） |
| outline | 章节构思 | F013 | 编辑器工具栏（常显） |
| polish | 拟人化润色 | F014 | 编辑器工具栏（常显） |
| screenplay | 分镜剧本 | F015 | 编辑器工具栏（常显） |
| continue | 续写建议 | F016 | 编辑器工具栏（常显） |
| hook-boost | 爆点强化 | F017 | 编辑器工具栏（常显） |
| foreshadow | 伏笔回收 | F018 | 编辑器工具栏（常显） |
| platform-rewrite | 平台改写 | F019 | 编辑器工具栏「更多写作工具」折叠区 |
| title | 标题生成 | F020 | 折叠区 |
| synopsis | 简介生成 | F021 | 折叠区 |
| tags | 标签生成 | F022 | 折叠区 |
| dialogue | 对白检查 | F023 | 折叠区 |
| annotation | 批注建议 | F024 | 折叠区 |
| summary | 章节摘要 | F025 | 折叠区 |
| term-extract | 设定抽取 | F026 | 折叠区 |
| sensitive-rewrite | 敏感改写 | F027 | 折叠区 |
| character-bio | 角色小传 | F028 | 折叠区 |
| timeline | 时间线整理 | F029 | 折叠区 |
| scene | 场景描写 | F030 | 折叠区 |
| world | 世界观扩展 | F031 | 折叠区 |
| conflict | 冲突校验 | F032 | 折叠区 |
| copyright | 版权警示 | F033 | 折叠区 |
| relationship | 关系设计 | F035 | 项目管理面板 |
| mindmap | 生成思维图 | F036 | 项目管理面板 |

> **F087 修复**：`selectedText` 现传编辑器真实选区（textarea 用 `selectionStart/End` 捕获，`window.getSelection()` 仅在锚点位于编辑器内时采信），附 `targeted` 标记；无选区时回退正文前 1200 字。定向类功能（润色/改写/对白检查等）真正可用。

---

## 三、统计汇总

| 类型 | 数量 |
|---|---|
| 功能编号总数 | **95**（F001–F095；其中 F094/F095 为 Backlog） |
| 编辑器 AI 任务 | 26（含同步辅助/关系设计/思维图） |
| 交互控制器（UI 触发） | 3（F070/F071/F072） |
| 面板开关注入 | 3（F068 知识库 / F069 发布计划 / F084 伏笔线索） |
| 已交付里程碑 | M1/M2/M3/M4/M5/M6 + F093 |
| Backlog | F094 PWA、F095 只读分享 |

---

## 四、API 连接配置（安全）

> **安全红线**：API Key 属于凭证，**严禁写入任何文档或提交到版本库**。历史版本曾明文记录第三方端点与密钥，已于 F073 流程清除；若曾照抄，请立即到服务商处轮换失效。

配置两种方式二选一：

| 配置项 | 环境变量（推荐） | 设置面板（F075 后支持，密钥加密落库） |
|---|---|---|
| Base URL | `NOVEL_AI_BASE_URL` | 设置 → AI 配置 |
| Model | `NOVEL_AI_MODEL` | 设置 → AI 配置 |
| API Key | `NOVEL_AI_API_KEY` | 设置 → AI 配置（仅保存，永不回显明文） |

- 认证方式：Bearer Token；凭据来源 `process.env.NOVEL_AI_API_KEY` 与项目库加密密钥（优先级：项目库 > 环境变量 > 无=mock）。
- 未配置时 AI 自动降级为本地 mock，界面标注「本地演示模式」，其余功能不受影响。
- 本地模型（Ollama/LM Studio/llama.cpp）通常无需 Key，留空即可调用（F093）。
- 环境变量样例见仓库根目录 `.env.example`。
