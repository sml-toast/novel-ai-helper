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

## 二、编辑器工具栏

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
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

## 三、侧边栏

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B030 | 新建项目 | `new-project` | 创建新项目 | `POST /v1/projects` | 是（模态框） |
| B031 | 存稿 | `save-draft` | 保存当前章节草稿 | `POST /v1/drafts` | 否（自动保存） |

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
| B038 | 保存平台配置 | `save-platform` | 保存发布平台设置 | `POST /v1/platforms` | 否（自动保存） |
| B039 | 创建定时发布 | `schedule-publish` | 设置定时发布任务 | `POST /v1/schedule` | 是（模态框） |
| B040 | 归档当前章节 | `archive-chapter` | 归档已发布章节 | `POST /v1/archive` | 否（自动执行） |

## 七、版本管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B041 | 查看版本 | `load-versions` | 查看章节历史版本 | `GET /v1/versions` | 是（侧边面板） |

## 八、进度管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B042 | 刷新统计 | `refresh-dashboard` | 刷新仪表盘数据 | `GET /v1/dashboard` | 否（内联刷新） |
| B043 | 保存目标 | `save-goal` | 保存写作目标 | `POST /v1/goals` | 否（自动保存） |
| B044 | 记录进度 | `add-progress` | 记录写作进度 | `POST /v1/progress` | 否（内联添加） |

## 九、角色管理面板

| 编号 | 按钮名称 | data-action | 功能描述 | API 端点 | 弹窗/面板 |
|------|----------|-------------|----------|----------|-----------|
| B045 | 新增角色 | `add-character` | 添加新角色 | `POST /v1/characters` | 否（内联添加） |
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
| B051 | 新增世界观 | `add-world` | 添加新世界观元素 | `POST /v1/world` | 否（内联添加） |
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

## 统计汇总

| 类型 | 数量 |
|------|------|
| 总计按钮数 | **69** |
| 触发弹窗/面板 | **12** |
| 内联操作 | **57** |
| 涉及 API 端点 | **~45** |

## API 连接配置

所有按钮调用统一使用以下 API 基础地址：
- **Base URL**: `http://39.102.76.107:20128/v1`
- **认证方式**: Bearer Token
- **API Key**: `sk-6afe15f60ab05ce8-x1cjv4-81b4fac0`

### 请求头示例
```http
Authorization: Bearer sk-6afe15f60ab05ce8-x1cjv4-81b4fac0
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

---

*文档最后更新: 2026-07-13*
*作者: Codex*
