# Novel AI 文档总索引

> ⚠️ **项目状态（2026-09-19）**：用户判定旧前端"没有丝毫人性"，决定**整项目推倒重来**。
> 本索引及其余文档描述的是 **pre-rebuild（已废弃）的 Node 零依赖版本**，**仅作追溯参考**。
> 新方向见 👉 [`doc/retrospective/2026-09-19-rebuild-retrospective.md`](retrospective/2026-09-19-rebuild-retrospective.md)（错误总结）+ [`doc/design/redesign-concept.md`](design/redesign-concept.md)（有温度的新设计方向）+ 可交互原型 `concept/index.html`。
> 旧成果已锁进安全网（`git tag pre-rebuild-20260919` + 源码/部署机快照），可随时回滚。

| 项目 | 内容 |
|---|---|
| 文档日期 | 2026-09-17（**全套重写**，替换停留在 M4/2026-09-05 的旧版） |
| 代码基线 | M6 收口（2026-09-09），F093 本地模型已合入，schema **v7**，零运行时依赖 |
| 里程碑 | M1–M6 + F093 全部交付；F094 PWA / F095 只读分享 **未排期** |
| 工程化 | 已在零依赖红线内落地：TS 类型检查（增量）/ ESLint / Prettier / GitHub Actions CI / 多环境 `.env` |

---

## 一、文档地图

| 目录 | 文档 | 定位 | 适用读者 |
|---|---|---|---|
| 根 | `README.md` | 快速开始：环境、启动、端口、安全基线、已知限制 | 所有 |
| 根 | `overview.md` | 一页纸产品概览 | 所有 |
| `doc/` | `README.md`（本文） | **文档总索引**：地图、阅读顺序、编号约定 | 所有 |
| `doc/` | `00-prototype.md` | **原型设计**：信息架构、交互流、设计原则、UI 设计 token、线框 | 产品 / 前端 |
| `doc/prd/` | `prd.md` | **需求文档**：产品目标、用户画像、用户故事、F001–F099 需求总表（含状态）、非目标 | 产品 / 规划 |
| | `competitive-research.md` | 竞品调研（Sudowrite / NovelAI / 彩云小梦 / 墨狐AI / 蛙蛙写作 / Scrivener） | 产品 / 规划 |
| `doc/design/` | `design.md` | **设计文档**：设计原则、关键技术决策、历史技术实测 A–F、发现 X1–X6、任务 T001–T026、风险 R1–R16 | 开发者（动工前必读） |
| `doc/architecture/` | `architecture.md` | **系统架构（as-built）**：拓扑图、进程/端口、代码地图、API 清单、数据模型 v7、安全模型、AI Provider、ADR | 接手开发者 / 评审 |
| `doc/development-docs/` | `development.md` | **开发文档**：上手、目录导览、常见改动指南、编码约定、工程化落地、调试速查 | 开发者 |
| `doc/testing-docs/` | `testing.md` | **测试文档**：分层、环境隔离、75 条用例清单、加载可见性矩阵、新增规范、历史教训、失败排查 | 开发者 / QA |
| `doc/function-docs/` | `functions.md` | **功能文档**：F001–F099 功能点编号表 + 端点映射 + AI 任务矩阵 | 所有 |
| | `button-reference.md` | 按钮编号表 B001–B099 与界面元素对照 | QA / 文案 |
| `doc/deployment/` | `deployment.md` | **部署文档**：环境变量矩阵、live 拓扑图、部署/回滚、备份恢复、换机迁移、故障排查 | 部署 / 运维 |
| `doc/roadmap/` | `roadmap.md` | 路线图：里程碑完成状态、Backlog、明确不做清单、远期想法池 | 所有 |
| `doc/task-plan/` | `task-plan.md` | 里程碑状态、工作流、开放风险速览 | 项目管理 |
| `doc/wiki/` | `index.md` | **Wiki**：术语表、10 分钟上手、FAQ、避坑清单、设计决策速查 | 接手者 |
| `doc/use-cases/` | `human-use.md` + 8 张截图 | 面向作者的操作用例（界面导览） | 使用者 |
| `doc/retrospective/` | `2026-09-19-rebuild-retrospective.md` | **错误总结 / 复盘**（推倒重来前）：产品/部署/测试/工程四层错误 + 给新项目的硬规矩 | 所有（尤其新项目） |
| `doc/design/` | `redesign-concept.md` | **新设计方向**（有温度的写作界面）：七铁律落地、情绪氛围光记忆点、原型对照 | 产品 / 前端 |
| `doc/archive/` | `2026-09-05-superseded/` | **历史归档**：被本轮重写取代的旧文档，仅作追溯，不再维护 | 需要追溯历史者 |

---

## 二、推荐阅读顺序

1. **想跑起来** → 根 `README.md` → `doc/deployment/deployment.md`（备份章节务必先看）。
2. **想改代码** → `doc/architecture/architecture.md` → `doc/development-docs/development.md` → `doc/testing-docs/testing.md`。
3. **想理解设计取舍** → `doc/design/design.md` → `doc/00-prototype.md`。
4. **想知道接下来做什么** → `doc/roadmap/roadmap.md` → `doc/task-plan/task-plan.md`。
5. **想查某个功能/按钮** → `doc/function-docs/functions.md`（F 编号）→ `doc/function-docs/button-reference.md`（B 编号）。
6. **刚接手，想少踩坑** → `doc/wiki/index.md`。

---

## 二之一、推倒重来 · 复盘与新方向（2026-09-19）

旧版经 4 轮 UI 重构仍被判定"没有人性"，已于 2026-09-19 决定整项目推倒重来（安全网见下方横幅）。新增两份关键文档：

1. **[错误总结 / 复盘](retrospective/2026-09-19-rebuild-retrospective.md)** —— 按「产品体验 / 部署发布 / 测试 CI / 工程工具」四层归纳全部错误，含根因与给新项目的 do/don't。**尤其要读 D1（假阳性部署）与 E6（结论未经核实就固化进记忆）**。
2. **[新设计方向](design/redesign-concept.md)** —— "有温度"的七铁律落地：稿纸为主角、文学衬线、暖纸底色、70-20-10 暖赭石、**记忆点=随正文情绪渐变的氛围光**。
3. **可交互概念原型** `concept/index.html`（单文件，浏览器打开即用）—— 直接改正文看背景光晕随情绪变化、点"让墨笺续写"看思考动效、缩到手机宽看抽屉布局。

> 旧文档（本索引其余条目）均反映 **pre-rebuild 的零依赖版本**，技术栈/界面已废弃，仅作追溯；新项目实现时以新方向文档与用户认可的原型为准。

---

## 三、编号约定（全文档通用）

- **F001–F099**：功能点需求编号（PRD 定义，`functions.md` 映射端点）
- **B001–B099**：界面按钮编号（`button-reference.md` 定义）
- **T001–T026**：任务编号（`design.md` 任务分解）
- **X1–X6**：架构复核中的额外发现（`design.md`）
- **R1–R18**：风险登记册条目（`design.md`）

---

## 四、维护约定

- 代码行为与文档冲突时，**以代码为准**并当场修文档（历史教训：早期文档曾描述不存在的 Vite 构建，已专项纠偏）。
- **密钥、URL 凭据严禁写入任何文档**（F073 红线）。`functions.md` 曾发生明文密钥事故，已清理并轮换。
- 各文档头部标注「文档日期 / 代码基线」，改动行为的变更需同步更新对应文档。
- 被取代的旧文档移入 `doc/archive/<日期>-superseded/`，**不再维护**，仅作追溯。
