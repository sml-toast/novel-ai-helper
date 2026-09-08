# Novel AI 助手 - 功能文档（编号版）

## 核心功能清单

### 1. 项目基础操作
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F001 | 新建项目 | `new-project` | 侧栏「新建」：弹窗收集标题/题材/**世界观/目标平台/写作风格**（F087 后全部可录入，留空回落服务端默认）→ 创建 → **自动切换到新项目**（F079 后为真功能，替代旧的占位提示） |
| F002 | 存稿 | `save-draft` | 手动存稿：写主表并生成 `kind='manual'` 版本（草稿自动保存走 `/draft` 不生成版本，见 F076） |
| F003 | 新建章节 | `create-chapter` | 添加章节到当前项目 |
| F004 | 创建项目 | `create-project` | 设置表单创建；同样自动切换（与 F001 共用后端逻辑） |
| F097 | **打里程碑快照**（F086） | `create-milestone` | **编辑器顶栏「★ 打快照」与版本面板头部双入口：弹窗命名 → `POST /chapters/:id/milestone` 写入 `kind='milestone'` 版本；版本列表以 ★ + 名称醒目标记，与自动版本/手动存稿区分** |

### 2. AI 辅助工具
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F005 | 同步辅助 | `run-sync-ai` | 触发 AI 对当前章节进行同步辅助（续写、润色等） |
| F006 | AI 历史 | `load-history` | 打开 AI 交互历史记录面板 |
| F007 | 审计日志 | `load-audit` | 打开审计日志面板，查看操作记录 |
| F008 | 系统日志 | `open-log` | 打开日志面板（F063-F067） |
| F009 | 知识库搜索 | `search-knowledge` | 查找知识条目 |
| F010 | 刷新图谱 | `refresh-graph` | 重新加载知识图谱数据 |
| F068 | **知识库面板** | `data-open-panel="knowledge"` | **打开知识库面板，展示知识图谱、角色关系、情节线索、世界设定** |
| F069 | **发布计划面板** | `data-open-panel="publish"` | **打开发布计划面板，展示发布队列、定时发布、归档管理** |

### 3. 编辑器工具栏（AI 功能）
所有按钮通过 `taskMap` → `runAi()` 统一路由到 API。
**F087 修复**：`selectedText` 现传编辑器**真实选区**（textarea 用 selectionStart/End 捕获，`window.getSelection()` 仅在锚点位于编辑器内时采信），并附 `targeted` 标记；无选区时回退正文前 1200 字。定向类功能（润色/改写/对白检查等）真正可用。

| 编号 | 功能名称 | data-action | API 端点 |
|------|----------|-------------|----------|
| F011 | 框架提炼 | `framework` | `POST /v1/framework` |
| F012 | 情节提炼 | `plot-extract` | `POST /v1/plot-extract` |
| F013 | 章节构思 | `outline` | `POST /v1/outline` |
| F014 | 拟人化润色 | `polish` | `POST /v1/polish` |
| F015 | 分镜剧本 | `screenplay` | `POST /v1/screenplay` |
| F016 | 续写建议 | `continue-writing` | `POST /v1/continue` |
| F017 | 爆点强化 | `hook-boost` | `POST /v1/hook-boost` |
| F018 | 伏笔回收 | `foreshadow` | `POST /v1/foreshadow` |
| F019 | 平台改写 | `platform-rewrite` | `POST /v1/platform-rewrite` |
| F020 | 标题生成 | `title-ai` | `POST /v1/title` |
| F021 | 简介生成 | `synopsis-ai` | `POST /v1/synopsis` |
| F022 | 标签生成 | `tags-ai` | `POST /v1/tags` |
| F023 | 对白检查 | `dialogue-check` | `POST /v1/dialogue` |
| F024 | 批注建议 | `annotation-ai` | `POST /v1/annotation` |
| F025 | 章节摘要 | `summary-ai` | `POST /v1/summary` |
| F026 | 设定抽取 | `term-extract` | `POST /v1/terms` |
| F027 | 敏感改写 | `sensitive-rewrite` | `POST /v1/sensitive-rewrite` |
| F028 | 角色小传 | `character-bio` | `POST /v1/character-bio` |
| F029 | 时间线整理 | `timeline-ai` | `POST /v1/timeline` |
| F030 | 场景描写 | `scene-ai` | `POST /v1/scene` |
| F031 | 世界观扩展 | `world-ai` | `POST /v1/world` |
| F032 | 冲突校验 | `conflict-check` | `POST /v1/conflict` |
| F033 | 版权警示 | `copyright-check` | `POST /v1/copyright` |

### 4. 知识图谱与项目管理
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F034 | 导入项目知识 | `import-knowledge` | 导入外部知识文件 |
| F035 | 关系设计 | `relationship-ai` | AI 辅助设计角色关系 |
| F036 | 生成思维图 | `mindmap` | 生成思维导图 |
| F091 | **力导向节点图**（F091 重写） | 自动渲染 + `refresh-graph` | **零依赖 Fruchterman-Reingold 简化版（js/graph-layout.js 纯数学 + js/graph-view.js 视图层，DOM 节点 + SVG 边混合方案，保留 data-node-id 点击契约与类型过滤）：①首屏同步收敛后渲染（238 节点 ~200ms）；②拖拽节点 = 固定（📌 虚线描边），双击解除固定（重叠时就近解除 60px 内固定节点）；③滚轮以光标为锚缩放（0.35x–2.6x），拖空白平移；④移除旧 16 节点截断，节点坐标/固定状态跨刷新与类型切换延续；⑤收敛后 alpha 阈值自停、大图（>100）每帧 3 tick 只绘一次 + 隔帧边更新 + 冻结低速节点；⑥0 节点空态提示 / 孤立节点向心聚拢 / 超长标签 170px 截断换行** |

### 5. 发布管理
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F037 | 保存平台配置 | `save-platform` | 保存发布平台设置（F087：账号名/平台规则开放录入） |
| F038 | 创建定时发布 | `schedule-publish` | 设置定时发布任务（F087：发布时间用 datetime-local 自选，留空 = 1 小时后兜底） |
| F039 | 归档当前章节 | `archive-chapter` | 归档已发布章节 |
| F040 | 查看版本 | `load-versions` | 查看章节历史版本（F086：卡片标注 kind——自动版本/手动存稿/★里程碑快照） |

### 6. 进度与目标
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F041 | 刷新仪表盘 | `refresh-dashboard` | 刷新仪表盘数据（F086：同时拉取连续打卡与热力图） |
| F042 | 保存目标 | `save-goal` | 保存写作目标（F087：deadline/note 开放录入） |
| F043 | 记录进度 | `add-progress` | 记录写作进度 |
| F098 | **会话计时**（F086） | 自动（无需点击） | **编辑器顶栏显示本次会话时长与字数增量；开始（载入/切章）→ `/sessions/start`，结束（切章/切项目/每 5 分钟滚动/关页面 keepalive）→ `/sessions/end` 落库一次，不逐键写库** |
| F099 | **连续打卡 + 热力图**（F086） | 随 F041 刷新 | **仪表盘展示连续写作天数与近 12 周日历热力图（零依赖 CSS 网格）；日期一律用本地时区（`server/novel-date.js`），数据源合并会话 `session_date` 与手动进度 `progress_date`** |

### 7. 内容管理（角色/场景/时间线/世界观）
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F044 | 新增角色 | `add-character` | 添加新角色（F087：motivation/arc 开放录入） |
| F045 | 查看角色 | `load-characters` | 加载角色列表 |
| F046 | 新增场景 | `add-scene` | 添加新场景（F087：description 开放录入） |
| F047 | 查看场景 | `load-scenes` | 加载场景列表 |
| F048 | 新增时间线 | `add-timeline` | 添加新时间线条目（F087：description 开放录入） |
| F049 | 查看时间线 | `load-timeline` | 加载时间线列表 |
| F050 | 新增世界观 | `add-world` | 添加新世界观元素（F087：content 开放录入） |
| F051 | 查看世界观 | `load-world` | 加载世界观列表 |

### 8. 批注与待办
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F052 | 新增批注 | `add-annotation` | 添加新注释（F087：severity 改为表单选择 info/warning/danger，服务端白名单校验） |
| F053 | 查看批注 | `load-annotations` | 加载注释列表 |
| F054 | 新增待办 | `add-todo` | 添加新待办事项（F087：dueAt 开放录入，可留空 = 无截止） |
| F055 | 查看待办 | `load-todos` | 加载待办列表 |

### 9. 术语与提示词
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F056 | 新增术语 | `add-glossary` | 添加新术语（F087：definition 开放录入） |
| F057 | 查看术语表 | `load-glossary` | 加载术语列表 |
| F058 | 保存 Prompt | `save-prompt` | 保存自定义提示词 |
| F059 | 查看模板 | `load-prompts` | 加载提示词列表 |

### 10. 导出与设置
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F060 | 导出项目 JSON | `export-project` | 导出整个项目（F078 后覆盖全部业务表） |
| F061 | 导出章节 TXT | `export-chapter` | 导出当前章节为文件 |
| F062 | 保存 AI 配置 | `save-ai-settings` | 保存 AI 模型配置 |
| F078 | **导入项目 JSON** | `import-project` | **导入回灌：可选「覆盖当前项目」（服务端先自动备份数据库）或「导入为新项目」（导入成功后自动切换，T011）** |
| F096 | **项目切换器** | `#projectSwitcher`（select） | **多项目切换（F079/T011）：单项目时隐藏；切换经过与切章相同的 dirty 拦截** |

### 10. 交互控制器（非 data-action 触发器）
| 编号 | 功能 | 触发方式 | 说明 |
|------|------|----------|------|
| F070 | 图谱类型切换 | `data-graph-type=[all|character|knowledge|timeline|world]` | 切换知识图谱视图模式 |
| F071 | 辅助面板标签 | `data-tab=[ideas| risks| checks]` | 切换 AI 辅助侧栏标签 |
| F072 | 关闭面板 | `data-close-panel` | 关闭打开的侧边/下拉面板 |

### 10.5 编辑器专注模式与排版（F090）
| 编号 | 功能名称 | 触发方式 | 说明 |
|------|----------|----------|------|
| F090 | **专注 / 打字机 / 沉浸模式** | `focus-toggle` 按钮 或 Esc 退出 | **`body.focus-mode` 单类驱动：隐藏侧栏/顶栏/概览卡/图谱/运营面板，只留编辑器（自动单列拉满视口）；Esc 优先关确认弹窗、其次退专注。打字机滚动：光标行离开视口 40%~60% 死区才小幅回中（rAF 节流，不逐键强制滚动）；当前段落高亮：textarea 下同排版镜像层 `<mark>` 透出（仅专注模式生效）。与 autosave 互不干扰，Cmd+S 行为不变（js/focus-mode.js）** |
| F090a | 编辑区字号 | `font-dec` / `font-inc` | 15–24px 六档循环步进，`localStorage(novelai.editor.fontSize)` 持久化 |
| F090b | 编辑区行宽 | `width-cycle` | 全宽/860/720/600px 四档循环，`localStorage(novelai.editor.lineWidth)` 持久化；字号/行宽以 `--editor-*` CSS 变量下发，普通模式同样生效 |

### 11. 日志系统
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F063 | 打开日志面板 | `open-log` | 打开日志侧边面板 |
| F064 | 级别筛选 | N/A (select) | 按 DEBUG/INFO/WARN/ERROR 过滤 |
| F065 | 压缩日志 | N/A (button) | 压缩旧日志，保留最近 100 条 |
| F066 | 清除日志 | N/A (button) | 清空所有日志 |
| F067 | 刷新日志 | N/A (button) | 重新渲染日志列表 |

---

## 统计汇总

| 类型 | 数量 |
|------|------|
| 总计功能编号 | **75**（F086/F087 新增 F097-F099） |
| 编辑器 AI 按钮 | 23
| 交互控制器 | 3
| 面板开关按钮 | 2
| 面板开关按钮 | 2 |
| 项目管理按钮 | 8 |
| 内容管理按钮 | 8 |
| 导出/设置按钮 | 4 |
| 日志系统按钮 | 5 |

## API 连接配置

> **安全提示**：API Key 属于凭证，**严禁写入文档或提交到版本库**。
> 历史版本曾在此处明文记录第三方端点与密钥，已于 2026-09-02 清除（对应需求 F073）。
> 若你曾照抄过该密钥，请立即到服务商处**轮换失效**。

配置通过以下两种方式提供，二选一即可：

| 配置项 | 环境变量（推荐） | 设置面板（F075 后支持，密钥加密落库） |
|---|---|---|
| Base URL | `NOVEL_AI_BASE_URL` | 设置 → AI 配置 |
| Model | `NOVEL_AI_MODEL` | 设置 → AI 配置 |
| API Key | `NOVEL_AI_API_KEY` | 设置 → AI 配置（仅保存，永不回显明文） |

- **认证方式**：Bearer Token
- **凭据来源**：`process.env.NOVEL_AI_API_KEY`（`server/novel-ai-provider.js`），文档中不保存任何真实密钥
- **未配置时**：AI 自动降级为本地 mock，界面标注「本地演示模式」，其余功能不受影响

环境变量样例见仓库根目录 `.env.example`。
