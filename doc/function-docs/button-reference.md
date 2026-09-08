# Novel AI 助手 · 按钮功能对照表（编号版）

本文档列出 `novel-ai.html` 页面中所有可交互按钮，说明其功能、对应 API 端点及是否弹窗。

## 一、顶部操作栏

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B001 | 同步辅助 | `run-sync-ai` | 触发 AI 对当前章节进行同步辅助 | `POST /v1/sync` | 是（侧边面板） |
| B002 | AI 历史 | `load-history` | 打开 AI 交互历史记录面板 | `GET /v1/history` | 是（侧边面板） |
| B003 | 审计日志 | `load-audit` | 打开审计日志面板，查看操作记录 | `GET /v1/audit` | 是（侧边面板） |
| B004 | 系统日志 | `open-log` | 打开系统日志面板 | N/A（本地） | 是（侧边面板） |
| B005 | 搜索知识 | `search-knowledge` | 搜索知识库条目 | `GET /v1/search` | 否（内联展示） |
| B006 | 刷新图谱 | `refresh-graph` | 重新加载知识图谱数据 | `GET /v1/graph` | 否（内联刷新） |
| B007 | **知识库** | `data-open-panel="knowledge"` | **打开知识库面板，包含知识图谱、角色关系、情节线索、世界设定** | `GET /v1/knowledge` | **是（侧边面板）** |
| B008 | **发布计划** | `data-open-panel="publish"` | **打开发布计划面板，包含发布队列、定时发布、归档管理** | `GET /v1/publish` | **是（侧边面板）** |

## 二、交互控制器

| 编号 | 按钮名称 | 触发方式 | 功能描述 | 弹窗/面板 |
|------|----------|----------|----------|-----------|
| B070 | 图谱类型切换 | `data-graph-type=[all|character|knowledge|timeline|world]` | 切换知识图谱视图模式（综合图/人物图/知识图/时间线/世界观） | 否（内联刷新） |
| B071 | 辅助标签切换 | `data-tab=[ideas|risks|checks]` | 切换 AI 辅助侧栏标签页 | 否（内联切换） |
| B072 | 关闭面板 | `data-close-panel` | 关闭当前打开的所有侧边/下拉面板 | 否（自动关闭） |

---

## 三、编辑器工具栏

> **F087 修复**：本组所有 AI 按钮的请求体 `selectedText` 已改为编辑器**真实选区**（textarea 用 selectionStart/End 捕获），并附 `targeted` 标记（`true` = 作者划选了内容，后端 prompt 追加定向指令）；无选区时回退正文前 1200 字。
> **F086 新增**：工具栏首位新增「★ 打快照」（见 B030a）。

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B030a | **★ 打快照**（F086） | `create-milestone` | **里程碑快照：弹窗命名 → 留存当前版本（kind='milestone'），版本列表 ★ 醒目标记；版本面板头部有同款入口** | `POST /v1/chapters/:id/milestone` | **是（模态框）** |
| B007 | 框架提炼 | `framework` | 从正文中提取故事框架结构 | `POST /v1/framework` | 否（内联展示） |
| B008 | 情节提炼 | `plot-extract` | 提取章节核心情节线 | `POST /v1/plot-extract` | 否（内联展示） |
| B009 | 章节构思 | `outline` | 生成章节大纲 | `POST /v1/outline` | 否（内联展示） |
| B010 | 拟人化润色 | `polish` | 对文本进行拟人化润色 | `POST /v1/polish` | 否（内联展示） |
| B011 | 分镜剧本 | `screenplay` | 将文本转为分镜剧本格式 | `POST /v1/screenplay` | 否（内联展示） |
| B012 | 续写建议 | `continue-writing` | 提供续写建议 | `POST /v1/continue` | 否（内联展示） |
| B013 | 爆点强化 | `hook-boost` | 强化章节冲突爆点 | `POST /v1/hook-boost` | 否（内联展示） |
| B014 | 伏笔回收 | `foreshadow` | 管理伏笔与回收计划 | `POST /v1/foreshadow` | 否（内联展示） |
| B015 | 平台改写 | `platform-rewrite` | 适配不同发布平台 | `POST /v1/platform-rewrite` | 否（内联展示） |
| B016 | 标题生成 | `title-ai` | 自动生成章节标题 | `POST /v1/title` | 否（内联展示） |
| B017 | 简介生成 | `synopsis-ai` | 自动生成章节简介 | `POST /v1/synopsis` | 否（内联展示） |
| B018 | 标签生成 | `tags-ai` | 自动生成标签 | `POST /v1/tags` | 否（内联展示） |
| B019 | 对白检查 | `dialogue-check` | 检查对白质量 | `POST /v1/dialogue` | 否（内联展示） |
| B020 | 批注建议 | `annotation-ai` | 提供批注建议 | `POST /v1/annotation` | 否（内联展示） |
| B021 | 章节摘要 | `summary-ai` | 生成章节摘要 | `POST /v1/summary` | 否（内联展示） |
| B022 | 设定抽取 | `term-extract` | 抽取关键设定术语 | `POST /v1/terms` | 否（内联展示） |
| B023 | 敏感改写 | `sensitive-rewrite` | 处理敏感内容 | `POST /v1/sensitive-rewrite` | 否（内联展示） |
| B024 | 角色小传 | `character-bio` | 生成角色小传 | `POST /v1/character-bio` | 否（内联展示） |
| B025 | 时间线整理 | `timeline-ai` | 整理故事时间线 | `POST /v1/timeline` | 否（内联展示） |
| B026 | 场景描写 | `scene-ai` | 增强场景描写 | `POST /v1/scene` | 否（内联展示） |
| B027 | 世界观扩展 | `world-ai` | 扩展世界观元素 | `POST /v1/world` | 否（内联展示） |
| B028 | 冲突校验 | `conflict-check` | 校验情节冲突 | `POST /v1/conflict` | 否（内联展示） |
| B029 | 版权警示 | `copyright-check` | 检查版权风险 | `POST /v1/copyright` | 否（内联展示） |

### F090 编辑器排版与专注按钮

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B073 | 专注模式 | `focus-toggle` | 隐藏侧栏/顶栏/面板只留编辑器（Esc 退出）；开启后打字机滚动 + 当前段落高亮生效 | N/A（本地） | 否 |
| B074 | A－ | `font-dec` | 编辑区字号减一档（15–24px 六档），localStorage 持久化 | N/A（本地） | 否 |
| B075 | A＋ | `font-inc` | 编辑区字号加一档，localStorage 持久化 | N/A（本地） | 否 |
| B076 | 行宽 | `width-cycle` | 编辑区最大行宽四档循环（全宽/860/720/600px），localStorage 持久化 | N/A（本地） | 否 |

## 三、侧边栏

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B030 | 新建项目 | `new-project` | 创建新项目（F087：世界观/目标平台/写作风格可录入） | `POST /v1/projects` | 是（模态框） |
| B031 | 存稿 | `save-draft` | 手动存稿（生成 `kind='manual'` 版本；防抖自动保存走 `/draft` 不生成版本） | `POST /v1/chapters/:id/save` | 否（自动保存） |
| B030b | **会话计时器**（F086） | 自动（非按钮） | **编辑器顶栏显示本次会话时长与 +字数；结束（切章/每 5 分钟/关页面）自动落库** | `POST /v1/sessions/start`、`POST /v1/sessions/end` | 否 |

## 四、知识图谱面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B032 | 刷新图谱 | `refresh-graph` | 重新加载知识图谱数据 | `GET /v1/graph` | 否（内联刷新） |

## 五、项目管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B033 | 创建项目 | `create-project` | 创建新项目 | `POST /v1/projects` | 是（模态框） |
| B034 | 新建章节 | `create-chapter` | 为当前项目新建章节 | `POST /v1/chapters` | 是（模态框） |
| B035 | 导入项目知识 | `import-knowledge` | 导入外部知识文件 | `POST /v1/knowledge/import` | 是（文件选择） |
| B036 | 关系设计 | `relationship-ai` | AI 辅助设计角色关系 | `POST /v1/relationships` | 否（内联展示） |
| B037 | 生成思维图 | `mindmap` | 生成思维导图 | `POST /v1/mindmap` | 是（独立窗口） |

## 六、发布管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B038 | 保存平台配置 | `save-platform` | 保存发布平台设置（F087：账号名/规则可录入） | `POST /v1/platforms` | 否（自动保存） |
| B039 | 创建定时发布 | `schedule-publish` | 设置定时发布任务（F087：时间自选，留空 = +1h） | `POST /v1/publish` | 是（模态框） |
| B040 | 归档当前章节 | `archive-chapter` | 归档已发布章节 | `POST /v1/archive` | 否（自动执行） |

## 七、版本管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B041 | 查看版本 | `load-versions` | 查看章节历史版本（F086：卡片标注 kind——自动版本/手动存稿/★里程碑快照） | `GET /v1/chapters/:id/versions` | 是（侧边面板） |
| B041a | **★ 打快照**（F086） | `create-milestone` | **与编辑器顶栏同入口：命名打里程碑快照** | `POST /v1/chapters/:id/milestone` | **是（模态框）** |

## 八、进度管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B042 | 刷新统计 | `refresh-dashboard` | 刷新仪表盘数据（F086：含连续打卡天数与 12 周热力图，`GET /v1/sessions/stats`） | `GET /v1/dashboard` | 否（内联刷新） |
| B043 | 保存目标 | `save-goal` | 保存写作目标（F087：deadline/note 可录入） | `POST /v1/goals` | 否（自动保存） |
| B044 | 记录进度 | `add-progress` | 记录写作进度 | `POST /v1/progress` | 否（内联添加） |

## 九、角色管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B045 | 新增角色 | `add-character` | 添加新角色（F087：motivation/arc 可录入） | `POST /v1/characters` | 否（内联添加） |
| B046 | 查看角色 | `load-characters` | 加载角色列表 | `GET /v1/characters` | 否（内联展示） |

## 十、场景管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B047 | 新增场景 | `add-scene` | 添加新场景 | `POST /v1/scenes` | 否（内联添加） |
| B048 | 查看场景 | `load-scenes` | 加载场景列表 | `GET /v1/scenes` | 否（内联展示） |

## 十一、时间线管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B049 | 新增时间线 | `add-timeline` | 添加新时间线条目 | `POST /v1/timeline` | 否（内联添加） |
| B050 | 查看时间线 | `load-timeline` | 加载时间线列表 | `GET /v1/timeline` | 否（内联展示） |

## 十二、世界观管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B051 | 新增世界观 | `add-world` | 添加新世界观元素（F087：content 可录入） | `POST /v1/world` | 否（内联添加） |
| B052 | 查看世界观 | `load-world` | 加载世界观列表 | `GET /v1/world` | 否（内联展示） |

## 十三、注释与待办面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B053 | 新增批注 | `add-annotation` | 添加新注释 | `POST /v1/annotations` | 否（内联添加） |
| B054 | 查看批注 | `load-annotations` | 加载注释列表 | `GET /v1/annotations` | 否（内联展示） |
| B055 | 新增待办 | `add-todo` | 添加新待办事项 | `POST /v1/todos` | 否（内联添加） |
| B056 | 查看待办 | `load-todos` | 加载待办列表 | `GET /v1/todos` | 否（内联展示） |

## 十四、术语与提示词面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B057 | 新增术语 | `add-glossary` | 添加新术语 | `POST /v1/glossary` | 否（内联添加） |
| B058 | 查看术语表 | `load-glossary` | 加载术语列表 | `GET /v1/glossary` | 否（内联展示） |
| B059 | 敏感词检查 | `sensitive-check` | 检查文本敏感内容 | `POST /v1/sensitive-check` | 否（内联展示） |
| B060 | 保存 Prompt | `save-prompt` | 保存自定义提示词 | `POST /v1/prompts` | 否（自动保存） |
| B061 | 查看模板 | `load-prompts` | 加载提示词列表 | `GET /v1/prompts` | 否（内联展示） |

## 十五、导出与设置面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B062 | 批量导入知识 | `bulk-knowledge` | 批量导入知识数据 | `POST /v1/knowledge/bulk` | 是（文件选择） |
| B063 | 导出项目 JSON | `export-project` | 导出整个项目 | `GET /v1/export/project` | 否（下载文件） |
| B064 | 导出章节 TXT | `export-chapter` | 导出当前章节为文件 | `GET /v1/export/chapter` | 否（下载文件） |
| B065 | 保存 AI 配置 | `save-ai-settings` | 保存 AI 模型配置 | `POST /v1/settings` | 否（自动保存） |

## 十六、系统日志面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B066 | 级别筛选 | N/A (select) | 按级别过滤日志显示 | N/A（本地） | 是（侧边面板） |
| B067 | 压缩日志 | N/A (button) | 压缩旧日志，保留最近 100 条 | N/A（本地） | 否（自动执行） |
| B068 | 清除日志 | N/A (button) | 清空所有日志记录 | N/A（本地） | 否（自动执行） |
| B069 | 刷新日志 | N/A (button) | 重新渲染日志列表 | N/A（本地） | 否（自动执行） |

---

## 十八、知识图谱力导向交互（F091）

| 编号 | 交互 | 触发方式 | 功能描述 |
|------|------|----------|----------|
| B077 | 拖拽节点 | pointer 拖拽 | 力导向布局中拖动节点并固定（📌 虚线描边），邻居随之重排；拖拽结束不触发详情（click 抑制） |
| B078 | 解除固定 | 双击节点 | 双击钉住的节点恢复力学迭代；节点重叠时就近解除 60px 内的固定节点 |
| B079 | 缩放画布 | 滚轮 | 以光标为锚点缩放（0.35x–2.6x） |
| B080 | 平移画布 | 拖动空白 | 按住容器空白处拖动平移视口 |

## 统计汇总

| 类型 | 数量 |
|------|------|
| 总计按钮数 | **76**（F086 新增 B030a/B030b/B041a） |
| 触发弹窗/面板 | **16** |
| 内联操作 | **60** |
| 涉及 API 端点 | **~48** |

## API 连接配置

所有按钮调用统一经由前端 `apiFetch()` 拼接本机 API 地址，外部大模型地址不在此处配置。

> **安全提示**：本文件历史版本曾明文记录第三方端点与 Bearer 密钥，已于 2026-09-02 清除（需求 F073）。
> **严禁**在任何文档中填写真实 API Key —— 请改用环境变量 `NOVEL_AI_API_KEY`（见 `.env.example`）。

### 请求头示例（由服务端自行附加，前端不接触密钥）
```http
Authorization: Bearer ${process.env.NOVEL_AI_API_KEY}
Content-Type: application/json
```

### 响应格式
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功",
  "timestamp": "2026-07-12T12:00:00Z"
}
```

## M6 新增按钮（F083 / F092）

| 按钮/入口 | 选择器 | 行为 | 端点 |
|---|---|---|---|
| 视图切换：列表 | `[data-outline-view="list"]` | 大纲树（章→场景，拖拽排序） | `GET /outline` |
| 视图切换：卡片 | `[data-outline-view="corkboard"]` | Corkboard 场景卡片，可拖拽归类 | `POST /scenes/reorder` |
| 视图切换：情节网格 | `[data-outline-view="grid"]` | Plot Grid 矩阵，单元格循环节拍 | `POST /plotbeats` |
| 刷新结构 | `[data-action="refresh-outline"]` | 重新拉取大纲数据 | `GET /outline` |
| + 新情节线 | `[data-action="add-plotline"]`（Plot Grid 工具栏） | 创建情节线行 | `POST /plotlines` |
| 删除情节线 | `[data-plotline-id]`（每行 × 按钮） | 删除情节线及其节拍 | `POST /plotlines/delete` |
| 多格式导出 | `[data-action="export-multi"]` | 弹窗选 MD/DOCX/EPUB + 附录勾选 + 单章/全书 | `GET /export/{markdown\|docx\|epub}` |
| 章节拖拽把手 | `[data-drag-chapter]` | 拖到目标章节标题上 → 插到其前 | `POST /chapters/reorder` |

新增导出/结构端点全部走 F074 Origin 白名单与 `send()`/`sendFile` 同款 CORS 逻辑，非白名单 Origin 一律 403。

---

*文档最后更新: 2026-07-13*
*作者: Codex*
