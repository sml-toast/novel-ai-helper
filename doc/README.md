# Novel AI 文档索引

最后更新：2026-09-05（代码基线 main @ a1b0946，M4 已交付）

## 文档地图

| 目录 | 文档 | 定位 | 适用读者 |
|---|---|---|---|
| `/`（根） | `README.md` | 快速开始：环境、启动命令、端口、安全基线、已知限制 | 所有 |
| `doc/architecture/` | `architecture.md` | **系统架构（as-built）**：拓扑、代码地图、API 清单、22 表数据模型、安全模型、AI Provider、关键决策记录 | 接手代码的开发者、评审者 |
| `doc/prd/` | `incremental-prd-2026-09-02.md` | 增量需求 PRD（F073–F095）：背景、验收标准、待确认项 | 产品/规划 |
| | `competitive-research-2026-09-02.md` | 竞品调研（Sudowrite / NovelAI / Scrivener 等对标） | 产品/规划 |
| `doc/design/` | `incremental-design-2026-09-02.md` | **增量架构设计 + 技术实测**（A–F 六项验证、X1–X6 发现、T001–T026 任务分解、R1–R16 风险册）——全部「为什么这么做」的依据来源 | 开发者（动工前必读对应章节） |
| `doc/roadmap/` | `roadmap.md` | **未来提升计划**：M4 收尾 → M5 → M6 排期、明确不做的事、远期想法池 | 所有人 |
| `doc/development-docs/` | `development.md` | **开发文档**：上手、代码导览、常见改动指南（加按钮/端点/迁移/测试）、编码约定、调试速查 | 开发者 |
| `doc/testing-docs/` | `test-automation.md` | **自动化测试体系**：分层、环境隔离、28 条用例清单、新增用例规范、两条历史教训、失败排查 | 开发者 |
| | `test-plan.md` | 手工回归清单（B/F/T 编号，69 按钮 × 功能点） | QA / 发布前回归 |
| `doc/function-docs/` | `functions.md` | 功能点编号表（F001–F072）与 API 端点映射、AI 配置说明 | 所有 |
| | `button-reference.md` | 按钮编号表（B001–B069）与界面元素对照 | QA / 文案 |
| `doc/deployment/` | `deployment.md` | **部署文档**：安装、环境变量、备份恢复、换机迁移、进程常驻、局域网风险、升级回滚、故障排查 | 部署/使用者 |
| `doc/task-plan/` | `task-plan.md` | 里程碑状态、工作流、开放风险速览 | 项目管理 |
| `doc/use-cases/` | `human-use.md` + 8 张截图 | 面向作者的操作用例（界面导览） | 使用者 |

## 推荐阅读顺序

1. **想跑起来**：根 `README.md` → `doc/deployment/deployment.md`（备份一定要先看 §四）
2. **想改代码**：`README.md` → `doc/architecture/architecture.md` → `doc/development-docs/development.md` → `doc/testing-docs/test-automation.md`
3. **想知道接下来做什么**：`doc/roadmap/roadmap.md` → design 文档对应实测节
4. **想了解某个功能细节**：`doc/function-docs/functions.md`（F 编号）→ design/PRD 中按 F 编号检索

## 编号约定（全文档通用）

- **F0xx**：功能点需求编号（PRD 定义，F001–F095）
- **B0xx**：界面按钮编号（button-reference 定义，B001–B069）
- **T0xx**：任务编号（design 文档任务分解，T001–T026）
- **X1–X6**：架构复核中的额外发现（design 文档执行摘要）
- **R1–R16**：风险登记册条目
- **QA1–QA4**：架构视角的待明确事项（PRD 的 Q1–Q5 之外）

## 维护约定

- 代码行为与文档冲突时，**以代码为准**并当场修文档（历史教训：2026-07 版文档描述了不存在的 Vite 构建，T010 专项纠偏）。
- 密钥、URL 凭据严禁写入任何文档（F073；functions.md 曾发生明文密钥事故，已清理并轮换）。
- 各文档头部「文档日期 / 代码基线」便于判断时效；改动行为的功能时同步更新对应文档。
