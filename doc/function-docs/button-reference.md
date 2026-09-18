# Novel AI 助手 · 按钮功能对照表（编号版 · M6 / schema v7）

> 文档日期：2026-09-17（重写，据 `novel-ai.html` 当前结构核实）
> 编号体系：按钮 `B001–B099`，功能 `F001–F095`（见 `functions.md`）。
> 本表列出页面中所有可交互按钮 / 入口，标注**所在区域**（含近期收进「更多写作工具 ▾」原生 `<details>` 折叠区、顶栏「更多 ▾」下拉、导航「视图 ▾」下拉与各抽屉面板的位置），触发动作（`data-action` / `data-open-panel` / `data-graph-type` / `data-tab`），以及对应功能 F 编号。

## 编号原则与位置说明

- 编辑器 23 个 AI 任务按钮保留旧编号 **B007–B029**（框架提炼…版权警示），与 F011–F033 一一对应。
- 顶栏「知识库 / 发布计划 / 伏笔线索」面板开关注为新编号 **B091 / B092 / B093**（旧文档中 B007/B008 与 AI 按钮重号，已解除冲突）。
- 顶栏「更多 ▾」、导航「视图 ▾」、编辑器「更多写作工具 ▾」均为原生 `<details>` 折叠区，默认收起，已逐条标注。
- 抽屉面板（知识库 / 伏笔线索 / 发布计划 / 系统日志）由 `data-open-panel` 打开，关闭统一为 `data-close-panel`（B072）。

---

## 一、顶栏操作栏（header.topbar）

| 编号 | 按钮文案 | 所在区域 | 触发动作 | 对应功能 F | 端点 / 行为 | 弹窗 |
|---|---|---|---|---|---|---|
| B001 | 同步辅助 | 顶栏主按钮 | `run-sync-ai` | F005 | `POST /api/novel/ai`（task=`sync`） | 侧边辅助卡 |
| B004 | 系统日志 | 顶栏 | `open-log` | F008 | 本地面板 | 抽屉 |
| B091 | 知识库 | 顶栏 | `data-open-panel="knowledge"` | F068 | 打开知识库抽屉 | 抽屉 |
| B093 | 伏笔线索 | 顶栏 | `data-open-panel="foreshadow"` | F084 | 打开伏笔抽屉 | 抽屉 |
| B092 | 发布计划 | 顶栏 | `data-open-panel="publish"` | F069 | 打开发布抽屉 | 抽屉 |
| B002 | AI 历史 | 顶栏「更多 ▾」下拉（原生 details，默认收起） | `load-history` | F006 | `GET /api/novel/ai/history` | 抽屉 |
| B003 | 审计日志 | 顶栏「更多 ▾」下拉 | `load-audit` | F007 | `GET /api/novel/audit` | 抽屉 |

## 二、页面导航栏（workspace-nav）

| 编号 | 按钮文案 | 所在区域 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|---|
| B082 | 展开录入 | 导航「视图 ▾」下拉（原生 details，默认收起） | `toggle-forms` | — | 切换 `body.forms-collapsed`，展开/收起各管理面板录入表单 |
| B083 | 整理视图 | 导航「视图 ▾」下拉 | `toggle-compact` | — | 切换 compact 类，折叠辅助模块专注写作 |

> 导航锚点（写作/大纲结构/知识图谱/项目版本/运营统计/AI 配置/编辑部/设定库）为页面内跳转，非 `data-action`，不编号。

## 三、编辑器工具栏（常显 toolbar-primary）

| 编号 | 按钮文案 | 所在区域 | 触发动作 | 对应功能 F | 端点 / 行为 | 弹窗 |
|---|---|---|---|---|---|---|
| B030a | ★ 打快照 | 工具栏常显 | `create-milestone` | F097 | `POST /api/novel/chapters/:id/milestone`（命名留存） | 模态框 |
| B007 | 框架提炼 | 常显 | `framework` | F011 | AI task=`framework` | 内联 |
| B008 | 情节提炼 | 常显 | `plot-extract` | F012 | AI task=`plot-extract` | 内联 |
| B009 | 章节构思 | 常显 | `outline` | F013 | AI task=`outline` | 内联 |
| B010 | 拟人化润色 | 常显 | `polish` | F014 | AI task=`polish` | 内联 |
| B011 | 分镜剧本 | 常显 | `screenplay` | F015 | AI task=`screenplay` | 内联 |
| B012 | 续写建议 | 常显 | `continue-writing` | F016 | AI task=`continue` | 内联 |
| B013 | 爆点强化 | 常显 | `hook-boost` | F017 | AI task=`hook-boost` | 内联 |
| B014 | 伏笔回收 | 常显 | `foreshadow` | F018 | AI task=`foreshadow` | 内联 |
| B073 | 专注模式 | 常显 | `focus-toggle` | F090 | 本地面板切换（Esc 退出） | 否 |
| B074 | A－ | 常显 | `font-dec` | F090a | 编辑区字号减档（localStorage） | 否 |
| B075 | A＋ | 常显 | `font-inc` | F090a | 编辑区字号加档（localStorage） | 否 |
| B076 | 行宽 | 常显 | `width-cycle` | F090b | 编辑区行宽四档循环（localStorage） | 否 |

## 三-b、编辑器工具栏「更多写作工具 ▾」折叠区（原生 details，默认收起）

> 以下按钮均位于编辑器工具栏内、点击「更多写作工具 ▾」展开后才可见。

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B087 | 登记伏笔 | `register-foreshadow` | F084 | 把编辑器选区文字登记为当前章节伏笔（`POST /api/novel/foreshadows`） |
| B015 | 平台改写 | `platform-rewrite` | F019 | AI task=`platform-rewrite` |
| B016 | 标题生成 | `title-ai` | F020 | AI task=`title` |
| B017 | 简介生成 | `synopsis-ai` | F021 | AI task=`synopsis` |
| B018 | 标签生成 | `tags-ai` | F022 | AI task=`tags` |
| B019 | 对白检查 | `dialogue-check` | F023 | AI task=`dialogue` |
| B020 | 批注建议 | `annotation-ai` | F024 | AI task=`annotation` |
| B021 | 章节摘要 | `summary-ai` | F025 | AI task=`summary` |
| B022 | 设定抽取 | `term-extract` | F026 | AI task=`term-extract` |
| B023 | 敏感改写 | `sensitive-rewrite` | F027 | AI task=`sensitive-rewrite` |
| B024 | 角色小传 | `character-bio` | F028 | AI task=`character-bio` |
| B025 | 时间线整理 | `timeline-ai` | F029 | AI task=`timeline` |
| B026 | 场景描写 | `scene-ai` | F030 | AI task=`scene` |
| B027 | 世界观扩展 | `world-ai` | F031 | AI task=`world` |
| B028 | 冲突校验 | `conflict-check` | F032 | AI task=`conflict` |
| B029 | 版权警示 | `copyright-check` | F033 | AI task=`copyright` |

## 四、侧栏（sidebar）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 | 弹窗 |
|---|---|---|---|---|---|
| B030 | 新建项目 | `new-project` | F001 | `POST /api/novel/projects` | 模态框 |
| B031 | 存稿 | `save-draft` | F002 | `POST /api/novel/chapters/:id/save`（手动存稿进版本；自动防抖走 `/draft`） | 否（自动） |
| B096 | 项目切换器 | `#projectSwitcher`（select） | F096/F079 | 切换当前项目（经 dirty 拦截；单项目时隐藏） | 否 |

## 五、大纲结构视图（sec-outline）

| 编号 | 按钮文案 | 所在区域 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|---|
| — | 列表 / 卡片 / 情节网格 | 视图切换 tab | `data-outline-view="list\|corkboard\|grid"` | F083 | 切换三视图（无独立端点，UI 态） |
| B097 | 刷新结构 | 视图区头部 | `refresh-outline` | F083 | `GET /api/novel/outline` |

> 章节拖拽排序（pointer 拖拽标题）、场景卡片拖拽归类为 pointer 交互，非按钮；落库端点 `POST /api/novel/chapters/reorder`、`/scenes/reorder`、`/plotbeats`、`/plotlines`、`/plotlines/delete`。

## 六、知识图谱（sec-graph）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B032 | 刷新图谱 | `refresh-graph` | F010/F091 | `GET /api/novel/graph` |
| B070 | 图谱类型切换 | `data-graph-type="all\|knowledge\|character\|timeline\|world"` | F070 | 切换视图（UI 态） |
| B071 | 辅助标签切换 | `data-tab="ideas\|checks\|risks"`（编辑器同步辅助侧栏） | F071 | 切换「构思/校验/版权」标签页（UI 态） |

> 节点图 pointer 交互（非按钮）：B077 拖拽节点固定、B078 双击解除固定、B079 滚轮以光标锚缩放（0.35x–2.6x）、B080 拖拽空白平移。

## 七、项目管理面板（sec-project）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 | 弹窗 |
|---|---|---|---|---|---|
| B033 | 创建项目 | `create-project` | F004 | `POST /api/novel/projects` | 模态框 |
| B034 | 新建章节 | `create-chapter` | F003 | `POST /api/novel/chapters` | 模态框 |
| B035 | 导入项目知识 | `import-knowledge` | F034 | `POST /api/novel/knowledge` | 文件选择 |
| B036 | 关系设计 | `relationship-ai` | F035 | AI task=`relationship` | 内联 |
| B037 | 生成思维图 | `mindmap` | F036 | AI task=`mindmap` | 内联 |
| B038 | 保存平台配置 | `save-platform` | F037 | `POST /api/novel/platforms` | 自动 |
| B039 | 创建定时发布 | `schedule-publish` | F038 | `POST /api/novel/publish` | 模态框 |
| B040 | 归档当前章节 | `archive-chapter` | F039 | `POST /api/novel/chapters/:id/archive` | 自动 |

## 八、版本管理面板（sec-project 第二块）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 | 弹窗 |
|---|---|---|---|---|---|
| B030a | ★ 打快照 | `create-milestone` | F097 | 与编辑器顶栏同入口（复用 B030a） | 模态框 |
| B041 | 查看版本 | `load-versions` | F040 | `GET /api/novel/chapters/:id/versions`（卡片标注 kind） | 抽屉 |

## 九、运营统计面板（sec-dashboard）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B042 | 刷新统计 | `refresh-dashboard` | F041 | `GET /api/novel/dashboard`（含连续打卡与热力图） |
| B043 | 保存目标 | `save-goal` | F042 | `POST /api/novel/goals` |
| B044 | 记录进度 | `add-progress` | F043 | `POST /api/novel/progress` |

> 连续打卡天数 + 12 周热力图（F099）随 B042 刷新内联展示，无独立按钮。

## 十、AI 配置与 Prompt 模板面板（sec-config）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 | 弹窗 |
|---|---|---|---|---|---|
| B084 | 测试连接 | `test-ai-connection` | F093 | `POST /api/novel/settings/ai/test` | 否（状态提示） |
| B085 | 清除已保存密钥 | `clear-api-key` | F075 | `POST /api/novel/settings/ai`（清除加密密钥） | 否 |
| B086 | 导出主密钥备份 | `export-master-key` | F075 | `GET /api/novel/settings/ai/master-key` | 否（下载/提示） |
| B065 | 保存 AI 配置 | `save-ai-settings` | F062 | `POST /api/novel/settings/ai` | 自动 |
| B060 | 保存 Prompt | `save-prompt` | F058 | `POST /api/novel/prompts` | 自动 |
| B061 | 查看模板 | `load-prompts` | F059 | `GET /api/novel/prompts` | 内联 |

## 十一、导出与批量知识面板（sec-config 第二块）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 | 弹窗 |
|---|---|---|---|---|---|
| B062 | 批量导入知识 | `bulk-knowledge` | F034 | `POST /api/novel/knowledge/bulk` | 文件选择 |
| B063 | 导出项目 JSON | `export-project` | F060 | `GET /api/novel/export/project` | 下载 |
| B064 | 导出章节 TXT | `export-chapter` | F061 | `GET /api/novel/export/chapter` | 下载 |
| B098 | 多格式导出（MD/DOCX/EPUB） | `export-multi` | F092 | `GET /api/novel/export/{markdown\|docx\|epub}` | 模态框 |
| B099 | 导入项目 JSON | `import-project` | F078 | `POST /api/novel/import`（new/replace 双模式） | 模态框 |

## 十二、章节批注与待办面板（sec-editorial）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B053 | 新增批注 | `add-annotation` | F052 | `POST /api/novel/chapters/:id/annotations` |
| B054 | 查看批注 | `load-annotations` | F053 | `GET /api/novel/chapters/:id/annotations` |
| B055 | 新增待办 | `add-todo` | F054 | `POST /api/novel/todos` |
| B056 | 查看待办 | `load-todos` | F055 | `GET /api/novel/todos` |

## 十三、术语表与敏感词面板（sec-editorial 第二块）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B057 | 新增术语 | `add-glossary` | F056 | `POST /api/novel/glossary` |
| B058 | 查看术语表 | `load-glossary` | F057 | `GET /api/novel/glossary` |
| B059 | 敏感词检查 | `sensitive-check` | F027 | `POST /api/novel/sensitive/check` |

## 十四、角色档案与时间线 / 场景库与世界观（sec-story）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B045 | 新增角色 | `add-character` | F044 | `POST /api/novel/characters` |
| B046 | 查看角色 | `load-characters` | F045 | `GET /api/novel/characters` |
| B048 | 新增时间线 | `add-timeline` | F048 | `POST /api/novel/timeline` |
| B049 | 查看时间线 | `load-timeline` | F049 | `GET /api/novel/timeline` |
| B047 | 新增场景 | `add-scene` | F046 | `POST /api/novel/scenes` |
| B052 | 查看场景 | `load-scenes` | F047 | `GET /api/novel/scenes` |
| B050 | 新增设定 | `add-world` | F050 | `POST /api/novel/world` |
| B051 | 查看设定 | `load-world` | F051 | `GET /api/novel/world` |

## 十五、系统日志面板（logDrawer）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B066 | 级别筛选 | `<select>`（无 data-action） | F064 | 按 DEBUG/INFO/WARN/ERROR 本地过滤 |
| B067 | 压缩日志 | `compress-logs` | F065 | 本地：压缩旧日志保留最近 100 条 |
| B068 | 清除日志 | `clear-logs` | F066 | 本地：清空所有日志 |
| B069 | 刷新 | `refresh-logs` | F067 | 本地：重新渲染日志列表 |
| B072 | 关闭面板 | `data-close-panel` | F072 | 关闭当前抽屉 |

## 十六、知识库抽屉（knowledgeDrawer）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B005 | 搜索 | `search-knowledge` | F009 | `GET /api/novel/search?q=` |
| B072 | 关闭 | `data-close-panel` | F072 | 关闭抽屉 |

## 十七、伏笔线索抽屉（foreshadowDrawer）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B088 | 登记为当前章节伏笔 | `add-foreshadow` | F084 | `POST /api/novel/foreshadows` |
| B089 | 刷新列表 | `refresh-foreshadows` | F084 | `GET /api/novel/foreshadows` |
| B090 | 扫描线索提示 | `scan-foreshadow-hints` | F084 | `GET /api/novel/foreshadows/hints` |
| B072 | 关闭 | `data-close-panel` | F072 | 关闭抽屉 |

## 十八、发布计划抽屉（publishDrawer）

| 编号 | 按钮文案 | 触发动作 | 对应功能 F | 端点 / 行为 |
|---|---|---|---|---|
| B072 | 关闭 | `data-close-panel` | F072 | 关闭抽屉 |

> 发布队列、定时任务、调度器状态均为内联展示；创建定时发布在项目管理面板（B039），归档在 B040。

---

## 统计汇总

| 类型 | 数量 |
|---|---|
| 按钮/入口总数 | **约 70**（B001–B099，含复用 B030a；纯 UI 控件与 pointer 交互另计） |
| 触发弹窗/模态/抽屉 | 约 18 |
| 内联/本地操作 | 约 50 |
| 23 个 AI 任务按钮 | B007–B029（含折叠区 B015–B029） |
| 折叠区按钮 | 顶栏「更多 ▾」(B002/B003)、导航「视图 ▾」(B082/B083)、编辑器「更多写作工具 ▾」(B087/B015–B029) |

## 安全提示（与 functions.md 一致）

> **严禁**在任何文档中填写真实 API Key。本机大模型地址与 Bearer 密钥仅存在于 `.env`（已 gitignore）与运行环境；文档中出现密钥即按 F073 流程处置并到服务商处轮换失效。所有按钮请求统一经前端 `apiFetch()` 拼接 `/api/novel` 地址，密钥由服务端附加，前端不接触。

---

*文档最后更新：2026-09-17 · 据 `novel-ai.html` 当前结构核实重写*
