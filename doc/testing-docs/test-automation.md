# Novel AI 自动化测试体系

| 项目 | 内容 |
|---|---|
| 文档日期 | 2026-09-05 |
| 测试基线 | 39 条 Playwright 用例（契约 27 + 页面 12），T013 后全绿 |
| 手工测试计划 | `doc/testing-docs/test-plan.md`（B/F/T 编号清单，与本文互补） |

## 一、测试分层

```
┌─────────────────────────────────────────────────────┐
│ 页面烟雾层（basic / knowledge / publishing.spec.js）  │  真实浏览器 + 真实 API + 真实库
│   面板开关、图谱渲染、搜索链路、状态指示器、项目切换器   │  12 条，防「页面根本没接上 API」
├─────────────────────────────────────────────────────┤
│ API 契约层（api-contract.spec.js）                    │  request fixture 直打 HTTP
│   鉴权、CORS、413、404、草稿/版本语义、迁移幂等、       │  24 条，重构的回归防线
│   导出/导入回灌（F078）、多项目上下文（F079）、检索（F088）│
├─────────────────────────────────────────────────────┤
│ 单元层：刻意没有                                      │  全部 SQL 收敛在 novel-db.js 且
│                                                      │  只经 HTTP 暴露，契约层已覆盖语义
└─────────────────────────────────────────────────────┘
```

**为什么契约层是主体**：前端（novel-ai.js 单文件）在持续改造，页面级用例会跟着 UI 抖；
契约只依赖 URL + 状态码 + 响应头 + 库状态，服务端行为不变则用例稳定。
**为什么不直接读 SQLite 断言**：测试进程另开连接会绕过「多进程共享同一文件」的真实语义；
版本行数、正文一律经 API 间接校验。唯一例外是 `user_version`——服务端没有暴露它的端点，
用只读探针 `tests/helpers/db-probe.mjs`（readOnly 打开，不参与写锁竞争）。

## 二、运行方式

```bash
npm test              # 全量：自动拉起 8788(API) + 5176(Web) 两个测试服务，结束自动回收
npm run test:ui       # Playwright UI 模式（调试单个用例）
npm run test:report   # 打开上次 HTML 报告（test-results/playwright-report）
```

- **无需手工先起服务**：`playwright.config.js` 的 `webServer` 数组自动拉起两个进程，
  且 `reuseExistingServer: false`——绝不复用可能存在的开发进程（复用 = 测试写进开发库）。
- 并发：`fullyParallel: true`，`workers` 本地 4 / CI 2；`retries` 仅 CI 1（本地要看见真实失败，
  避免偶发问题被重试掩盖成「通过」）。

## 三、测试环境隔离（关键设计）

常量唯一真源：`tests/test-env.js`（端口、库路径、Origin 全部从这里取，禁止手写）。

| 维度 | 开发环境 | 测试环境 |
|---|---|---|
| Web 端口 | 5175 | **5176** |
| API 端口 | 8787 | **8788**（契约用 `http://127.0.0.1:8788`，避免 localhost 解析成 IPv6 连不上） |
| 数据库 | `.data/novel-ai.sqlite` | **`.data/novel-test.sqlite`**（每次运行前整体重置） |
| 合法 Origin | `http://localhost:5175` 等 | `http://localhost:5176` |

隔离的三个机制：

1. **测试库重置在打开连接之前**：`tests/start-test-api.js`（webServer 命令）先删库（含 `-wal`/`-shm`
   两个 WAL 伴生文件），再 `import` API 服务。清理不能放 `globalSetup`——它的执行顺序晚于 webServer，
   那时进程已持有被 unlink 的旧 inode，等于没清。
2. **护栏**：`start-test-api.js` 校验测试库与开发库路径不同，相同直接拒绝启动（防止一次误配删掉真实稿件）。
3. **页面夹具注入端口**：`tests/fixtures.js` 用 `context.addInitScript` 在页面脚本求值前注入
   `window.NOVEL_API_PORT = 8788`。前端写死 `|| 8787`，不注入就会连去开发进程/开发库。
   **页面用例必须从 `./fixtures.js` 导入 test**，直接用 `@playwright/test` 会静默打到开发库。

### 并发与 busy_timeout（X3 实测结论）

原配置 `workers: 1` 的理由「多 worker 并发写 SQLite 会 SQLITE_BUSY」是**错误归因**：根因是缺
`busy_timeout`。实测无它时 4 进程 × 400 次写失败 88%；`PRAGMA busy_timeout = 5000` 后失败 0。
`server/novel-db.js` 已设置该参数，因此 `workers: 4` 安全。
**若将来出现偶发 `database is locked`，先查 busy_timeout 是否被改掉，而不是调回 1。**

并发用例的数据隔离模式：每个写用例用 `token(label)` 生成全局唯一标记（pid + 时间 + 随机），
建章/写正文都带标记，断言只统计自己的数据——worker 之间互不干扰。

## 四、用例清单

### API 契约层（tests/api-contract.spec.js，17 条）

| # | 用例 | 验证点 |
|---|---|---|
| 01 | 无 Origin 请求 bootstrap | 200 且**不带任何 CORS 头**（本机直连语义） |
| 02 | 白名单 Origin | 精确回显该 Origin + `Vary: Origin`（不再是 `*`，F074） |
| 03 | 恶意 Origin 读请求 | 403，错误信息含 `origin not allowed` |
| 04 | 恶意 Origin 写请求 | 403 且**数据库确实没多出章节**（不只看响应码） |
| 05/06 | OPTIONS 预检 | 白名单 204 / 恶意 403 |
| 07 | 超过 2MB 请求体 | 413 且库未变更（X5） |
| 08/09 | 不存在的端点 / 章节 | 404 |
| 10 | 草稿语义 | 连打 10 次 `/draft` **版本行数不变**但正文已更新（F076 核心） |
| 11 | 版本语义 | `/save` 一次新增恰好 1 个 `manual` 版本 |
| 12 | 创建章节 | 初始化 1 个 `auto` 版本 |
| 13 | 迁移幂等 | 重复启动服务后 `user_version` 稳定为 4（v1 密钥列；v2 外键索引；v3 检索重建；v4 提及/别名+回填） |
| 14 | 导出完整性（F078） | 19 个集合齐全 + formatVersion/schemaVersion；种子数据在场；**不含密钥材料** |
| 15 | 导入校验 | 数组载荷 / 缺 project / 未来格式版本 → 400，服务保持健康 |
| 16 | 导入为新项目 | ID 全量重映射、`?projectId=` 可再导出、章节/版本/角色/关系/发布任务内容逐项一致、global 知识不重复插入 |
| 17 | 覆盖模式导入 | 牺牲项目被整体替换且项目 id 不变，bootstrap 项目毫发无损 |
| 18 | bootstrap 项目列表 | 默认（无 projectId）= id 最小项目，旧请求零破坏 |
| 19 | 项目数据隔离 | `?projectId=` 的写入落到指定项目；其他项目章节不串入 |
| 20 | X-Project-Id 头 | 与查询参数等效 |
| 21 | 非法/不存在 projectId | 格式非法回落默认；不存在显式 404（读与写同样拦截） |
| 22 | 中文 2 字词召回 | 「黑潮」命中知识条目与章节正文；假网络文献已移除 |
| 23 | 字面后过滤 | 散落 token 候选（青鸾…密码）被剔除；全名召回不误杀 |
| 24 | 章节检索与隔离 | 正文/标题命中；结果不回传正文；跨项目不串 |
| 25 | 提及识别 | 种子实体分组计数（林祈×2 等）；草稿保存同步重扫 |
| 26 | 负例遮蔽 | 登记「黑潮生」→ 自动重扫 → 内部「黑潮」不再误报；重复登记幂等 |
| 27 | 反链隔离 | 反链含本章且计数正确；其他项目视角为空 |

### 页面烟雾层（11 条）

| 文件 | 用例 | 验证点 |
|---|---|---|
| basic.spec.js ×4 | 页面结构 / 知识库 / 发布计划 / 系统日志面板 | 核心面板可打开，API 离线时整组失败 |
| knowledge.spec.js ×4 | 面板 / 图谱节点 / 搜索 / 交互 | `#nodeMap` 渲染出节点、`#graphStats` 同源、搜索结果出现在 `#assistFeed` |
| publishing.spec.js ×3 | 面板 / 队列 / 状态指示器 | `#publishBoard` 渲染种子数据的 2 张任务卡；`#apiStatus` 文本为「API 在线」 |

## 五、历史教训（两条都已付出过代价）

**教训一：空过断言（F077 立项原因）**

重构前 knowledge / publishing 两个文件的用例全是「条件断言」或零断言：

- `if (await graph.count() > 0)` 包裹断言——元素不存在时**整条用例静默跳过，照样绿**；
- `fill()` 之后一条断言没有——纯空转；
- 选择器写错（`.publish-queue` 不存在，实际是 `#publishBoard`）——从来没校验过任何东西。

这类测试比没有测试更危险：覆盖率看着有、实际为零。现在全部改为**直断**：
元素不存在就直接失败，由人来判断是选择器错了还是功能没实现。新增用例禁止：

1. `if`/`try-catch` 包裹 `expect`；
2. 只操作不断言；
3. 断言文案与被断言对象不符（复制粘贴痕迹）。

**教训二：HTML 内联脚本覆盖注入端口（2026-09-05 修复）**

`novel-ai.html` 曾写死 `window.NOVEL_API_PORT = 8787`（无条件赋值）。夹具的 `addInitScript`
虽然先于页面脚本执行，但 HTML 内联脚本随后**把注入值覆盖回 8787**——注入机制自 F077 起
形同虚设，页面永远连不上测试 API：knowledge/publishing 的 `waitForResponse(bootstrap)`
等一个永远不会来的响应直到超时（改对之前这些用例从未真正通过）。修复：HTML 只在
**未设置时**给默认值（`window.NOVEL_API_PORT = window.NOVEL_API_PORT || 8787`）。
任何「环境注入 + 页面内默认值」的组合都必须用 `||` 守卫，不允许无条件赋值。

## 六、如何新增用例

**API 行为** → `tests/api-contract.spec.js` 追加：

```js
test('14 xxx', async ({ request }) => {
  const tk = token('t14');                        // 并发隔离标记
  const res = await request.post(`${API_BASE}/api/novel/chapters`, {
    data: { title: `T14-${tk}`, content: '…' },   // 带标记建数据
  });
  expect(res.status()).toBe(201);
  // 需要读库状态时经 API 间接校验（bootstrap / versions），不直连 SQLite
});
```

**页面交互** → 新建 `tests/xxx.spec.js`：

```js
import { test, expect } from './fixtures.js';     // 不是 '@playwright/test'
test.beforeEach(async ({ page }) => {
  await page.goto('/novel-ai.html');
  await page.waitForResponse((res) => res.url().includes('/api/novel/bootstrap')).catch(() => {});
  await page.waitForLoadState('networkidle');
});
```

规范：选择器以 `novel-ai.html` 实际 DOM 为准（用例文件头注释里都有说明）；
断言种子数据数量时记住测试库每次从零重建（固定 2 条发布任务、3 章）。

## 七、当前未覆盖（诚实清单）

| 缺口 | 原因 | 计划 |
|---|---|---|
| AI 真实 provider 调用 | 依赖外部密钥，测试只覆盖 mock 降级与密钥错误分支 | 保持 mock 路径自动化；真实调用属手工验收（`.env` 配置后手测） |
| SSE 流式输出 | 功能未实现（T015） | 实现时按设计文档 R12：`?mock=1` 确定性假流，断言最终拼接文本而非中间帧 |
| 导入回灌 | 功能未实现（F078） | 实现时补「导出→清空→导入→比对」往返用例 |
| 性能/负载 | 未立项 | design 文档已有 150 万字检索等实测数据，可按需转成基准用例 |
| 手工验收项 | 69 按钮 × 全交互的组合 | `doc/testing-docs/test-plan.md` 的 B/F/T 清单，人工按表回归 |

## 八、失败排查

| 症状 | 最可能原因 |
|---|---|
| 页面用例断言「API 在线」失败 | 夹具没生效（用例直接 import 了 `@playwright/test`）→ 端口注入缺失；或 HTML 内联脚本无条件覆盖了注入值（见教训二） |
| 页面用例在 `goto`/`networkidle`/`waitForResponse` 超时 | 外部资源（Google Fonts）请求被网络黑洞挂起——夹具已 abort 字体域名；若新增外链资源，需同步加入夹具拦截清单 |
| 契约用例 403 | 请求带了非白名单 Origin；或测试服务的 `NOVEL_WEB_PORT` 环境变量丢失（白名单自动追加失效） |
| 「版本行数 +1」类相对断言第二次跑就挂 | 测试库没重置——检查 `start-test-api.js` 是否被绕过（例如手动起服务跑测试） |
| 偶发 `database is locked` | `novel-db.js` 的 `PRAGMA busy_timeout` 被移除 |
| 第一次跑绿、删除 `.data` 后红 | 依赖了脏数据（用例没带 token 隔离，或断言写死全局计数） |
| 断言种子项目章节数失败 | 用了绝对数——并行的草稿/存稿用例会合法地往种子项目建章，种子集合只能下界断言或按标记过滤 |
