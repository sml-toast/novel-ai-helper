# Novel AI 助手 - 功能文档（编号版）

## 核心功能清单

### 1. 项目基础操作
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F001 | 新建项目 | `new-project` | 创建新写作项目 |
| F002 | 存稿 | `save-draft` | 保存当前章节草稿 |
| F003 | 新建章节 | `create-chapter` | 添加章节到当前项目 |
| F004 | 创建项目 | `create-project` | 生成完整项目结构 |

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

### 5. 发布管理
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F037 | 保存平台配置 | `save-platform` | 保存发布平台设置 |
| F038 | 创建定时发布 | `schedule-publish` | 设置定时发布任务 |
| F039 | 归档当前章节 | `archive-chapter` | 归档已发布章节 |
| F040 | 查看版本 | `load-versions` | 查看章节历史版本 |

### 6. 进度与目标
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F041 | 刷新仪表盘 | `refresh-dashboard` | 刷新仪表盘数据 |
| F042 | 保存目标 | `save-goal` | 保存写作目标 |
| F043 | 记录进度 | `add-progress` | 记录写作进度 |

### 7. 内容管理（角色/场景/时间线/世界观）
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F044 | 新增角色 | `add-character` | 添加新角色 |
| F045 | 查看角色 | `load-characters` | 加载角色列表 |
| F046 | 新增场景 | `add-scene` | 添加新场景 |
| F047 | 查看场景 | `load-scenes` | 加载场景列表 |
| F048 | 新增时间线 | `add-timeline` | 添加新时间线条目 |
| F049 | 查看时间线 | `load-timeline` | 加载时间线列表 |
| F050 | 新增世界观 | `add-world` | 添加新世界观元素 |
| F051 | 查看世界观 | `load-world` | 加载世界观列表 |

### 8. 批注与待办
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F052 | 新增批注 | `add-annotation` | 添加新注释 |
| F053 | 查看批注 | `load-annotations` | 加载注释列表 |
| F054 | 新增待办 | `add-todo` | 添加新待办事项 |
| F055 | 查看待办 | `load-todos` | 加载待办列表 |

### 9. 术语与提示词
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F056 | 新增术语 | `add-glossary` | 添加新术语 |
| F057 | 查看术语表 | `load-glossary` | 加载术语列表 |
| F058 | 保存 Prompt | `save-prompt` | 保存自定义提示词 |
| F059 | 查看模板 | `load-prompts` | 加载提示词列表 |

### 10. 导出与设置
| 编号 | 功能名称 | data-action | 说明 |
|------|----------|-------------|------|
| F060 | 导出项目 JSON | `export-project` | 导出整个项目 |
| F061 | 导出章节 TXT | `export-chapter` | 导出当前章节为文件 |
| F062 | 保存 AI 配置 | `save-ai-settings` | 保存 AI 模型配置 |

### 10. 交互控制器（非 data-action 触发器）
| 编号 | 功能 | 触发方式 | 说明 |
|------|------|----------|------|
| F070 | 图谱类型切换 | `data-graph-type=[all|character|knowledge|timeline|world]` | 切换知识图谱视图模式 |
| F071 | 辅助面板标签 | `data-tab=[ideas| risks| checks]` | 切换 AI 辅助侧栏标签 |
| F072 | 关闭面板 | `data-close-panel` | 关闭打开的侧边/下拉面板 |

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
| 总计功能编号 | **72** |
| 编辑器 AI 按钮 | 23
| 交互控制器 | 3
| 面板开关按钮 | 2
| 面板开关按钮 | 2 |
| 项目管理按钮 | 8 |
| 内容管理按钮 | 8 |
| 导出/设置按钮 | 4 |
| 日志系统按钮 | 5 |

## API 连接配置

- **Base URL**: `http://39.102.76.107:20128/v1`
- **认证方式**: Bearer Token
- **API Key**: `sk-6afe15f60ab05ce8-x1cjv4-81b4fac0`
