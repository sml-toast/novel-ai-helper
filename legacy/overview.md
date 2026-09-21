# 交付概览 · F093 本地模型接入 + M6 回归测试补测

> 收口时间：2026-09-09 · 全部经独立验证后提交

## TL;DR
F093（本地模型接入 Ollama/LM Studio）代码 + M6 功能回归测试已全部完成、验证并分两笔提交；全量回归 **75 passed (8.6s)**。

## 交付状态
| 项 | 状态 |
|----|------|
| F093 三条核心路径验证 | ✅ 全部符合预期 |
| 全量测试 | ✅ 75 passed / 0 failed |
| F093 代码提交 | ✅ `e117eb5`（13 文件，+1111/−440）|
| M6 测试提交 | ✅ `572ea29`（2 文件，+1026）|

## F093 验证结论（独立脚本 `/tmp/f093-check.mjs`）
1. **本地端点 + 无 API Key** → `provider=openai-compatible`，请求不携带 `Authorization` 头 → 本地模型免密钥调用成功 ✅
2. **连不上的本地端点** → `provider=connection-error`（tone=danger）→ 给出可行动报错，**不降级 mock** ✅
3. **云模型 + Key** → `provider=openai-compatible`，`Authorization: Bearer sk-fake` ✅

关键改动：`canCallReal` 短路判定从 `!baseUrl || !apiKey` 改为 `!baseUrl || (!apiKey && !local)`；本地错误走 `connectionErrorResult`，云模型保留 mock 降级。provider 拆分为 `prompt / mock / stream / local-model / probe` 五个子模块；前端新增 `js/local-model.js`（预设一键填入 + 连接检测 + 模型名补全）。

## 文件清单
**提交 `e117eb5`（F093 代码）**
- 修改：`server/novel-ai-provider.js`、`server/novel-api.js`、`js/ai-settings.js`、
  `js/constants.js`（清 nodePositions）、`js/events.js`、`js/log.js`（清 logLevel）、`novel-ai.html`
- 新增：`js/local-model.js`、`server/novel-ai-mock.js`、`server/novel-ai-prompt.js`、
  `server/novel-ai-stream.js`、`server/novel-local-model.js`、`server/novel-ai-probe.js`

**提交 `572ea29`（M6 测试）**
- 新增：`tests/api-m6.spec.js`（F083/F084/F085/F092 API 契约）、`tests/m6-ui.spec.js`（F083-F085/F090/F091/F092 浏览器 E2E）
- 修复：`m6-ui.spec.js:08` 拖拽断言前加 `scrollIntoViewIfNeeded`（节点超出视口会导致 `page.mouse` 点击落空、拖拽静默 no-op——属测试 bug，非产品 bug）

## 待用户拍板（延续，非阻塞）
- **Q1**：是否用 `git filter-repo` 重写历史清除密钥（将改变 9 个提交 hash）。
- **泄露的 API Key** 需在对应 provider 后台轮换（非代码可完成）。

## 用户下一步
1. `npm test` 可复跑全量回归（自动拉起 API + Web 服务，测试库隔离）。
2. 试用本地模型：设置面板选「Ollama / LM Studio」预设 → 填入 `http://127.0.0.1:11434/v1` → 留空 Key → 保存并连接检测。
3. 推送前处理上面两条待拍板项。
4. 未排期功能：F094 PWA / F095 只读分享，待决策。
