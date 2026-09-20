# 复盘与错误总结（2026-09-19 · 推倒重来前）

> 本文记录「小说 AI 创作工作台」自 2026-09 以来从 UI 多轮重构到最终决定推倒重来的**全部错误与教训**。
> 写它的目的不是追责，而是让**新项目不再重蹈覆辙**——其中几条（尤其是「假阳性部署」与「错误结论固化进记忆」）代价极高。
>
> 背景：用户经 4 轮 UI 重构仍判定前端「没有丝毫人性」，于 2026-09-19 决定整项目推倒重来。旧成果已锁进安全网：
> 本地 `git tag pre-rebuild-20260919` + 源码快照 `novel-ai.rebuild-backup.20260919.tar.gz`；
> 部署机 `git tag pre-rebuild-20260919` + `.deploy-backup/pre-rebuild-20260919/source.tar.gz`。

---

## 0. 一句话结论

我们一直在**旧骨架上做减法**，没有重新定义一个"为人写作"的体验；同时**验证链脆弱**——
把"解包后那一瞬的快照"当"部署成功"、"本地快"当"CI 一定过"，导致假阳性部署与 CI 首轮红；
更严重的是，**未经充分核实的结论被固化进长期记忆与文档，且与后续实测互相矛盾时未二次核实**。

---

## 1. 产品 / 体验层错误（最致命 · 直接导致"没有人性"）

| # | 错误 | 表现 | 根因 |
|---|---|---|---|
| P1 | 把「工具仪表盘」当「写作环境」 | 满屏功能按钮，编辑器被挤压在中间；AI 是按钮墙而非"身旁搭档" | 以功能/模块为中心设计，不是以文字、以写作者为中心 |
| P2 | 多轮只在旧骨架做减法 | 删 hero 卡片 → 收下拉 → 加分区导航，本质仍是工业仪表盘 | 没有重新定义体验，只在"堆砌"与"藏起"之间反复 |
| P3 | 视觉工业感 | 通用无衬线字体（冷）、纯白/浅灰背景平铺、无主次配色、无情绪 | 没按"有温度"的排版/配色铁律；无记忆点 |
| P4 | 缺乏呼吸感与情绪反馈 | 无氛围、无过渡、无"正在思考"类微动效；出错直接清空输入 | 交互只服务于"能用"，没服务于"让人想写下去" |

**新规矩**：先出设计稿/原型，用户认可"温度"后再写代码（已采纳：见 `doc/design/redesign-concept.md` 与 `concept/index.html`）。
禁止通用字体、纯白背景；界面必须有一个记忆点（本方案=随正文情绪渐变的"氛围光"）。

---

## 2. 部署 / 发布错误（最隐蔽 · 假阳性）

| # | 错误 | 后果 | 正确做法 |
|---|---|---|---|
| D1 | **解包新文件后误跑 `git checkout -- novel-ai.html novel-ai.css`** | 把刚解包的新 UI 回退成旧版并提交同步点 `4d9b709`；live 实际跑旧 UI 近一天。验证恰好抓在回退前一瞬 → **误判部署成功** | 解包后**全程不碰 `git checkout` 已解包文件** |
| D2 | 没建立"解包→先验证→再提交同步点"的强制顺序 | 验证与提交顺序错乱，假阳性无法被拦截 | 顺序：解包 → 备份 → 重启 → **验证（本机 5175 + 公网）** → 再 `git add -A` 提交同步点 |
| D3 | 公网站点"断流"根因前后结论矛盾 | 早期归咎 `:80/:443` 死端口，后确认是 SNI+frps 路由；旧结论差点被据此拿去动服务器 | 矛盾结论以**最新实测**为准，动路由前再核一次 |

**正确部署流程（已验证）**：
1. 本地 `git archive HEAD | gzip > /tmp/novel-<ts>.tar.gz`（仅跟踪文件，排除 node_modules）
2. `scp` 到 `10.144.144.4:/tmp/` → `/opt/novel-ai` 解包覆盖
3. **解包前先备份**将被覆盖的 `novel-ai.html/css/js`、`server/` 到 `.deploy-backup/<ts>/`
4. 重启 `novel-ai-api` + `novel-ai-web`
5. **先验证**：本机 `127.0.0.1:5175` 与公网 `https://novel-ai.xixikeke.cn` 同时命中新 UI、旧 UI 残留为 0
6. 通过后再 `git add -A && commit` 留同步点

---

## 3. 测试 / CI 错误

| # | 错误 | 现象 | 修复 |
|---|---|---|---|
| T1 | Playwright HTML reporter 目录与测试产物冲突 | `reporter` 输出 `test-results/playwright-report`，与默认 `test-results/` clash → Configuration Error；本地被容忍、CI 严格失败 | 改为 `playwright-report/` 并同步 `ci.yml` 上传路径 |
| T2 | F091 图谱用例竞态 | 初始渲染已把 `window.__graphPerf.done` 置 true，刷新后 `waitForFunction(done===true)` 命中**陈旧快照**（nodes≈14）→ `toBeGreaterThan(16)` 失败；本地快、CI 慢走向不同 | 点击刷新前 `page.evaluate(()=>window.__graphPerf=null)` 强制等刷新后渲染 |
| T3 | 加载可见性矩阵维护不足 | 折叠时把 basic 直接 click 的 `open-log` 收进 `<details>` → 测试挂起被 SIGTERM | 凡 `tests/` 直接 click 的入口（尤其 `open-log`）必须留在下拉之外 |
| T4 | wiki 误写"保持 workers:1" | 过时的错误并发结论差点反向指导 | 实际 `workers: CI?2:4`；根因是缺 `busy_timeout`，见 D 类 |

**新规矩**：任何 reporter 输出目录避开 `test-results/`；测试竞态用"动作前清空旧快照"而非依赖 `waitForFunction` 当前状态；
改 UI 前必查 `tests/` 加载可见性矩阵（见 `doc/testing-docs/testing.md`）。

---

## 4. 工程 / 工具错误

| # | 错误 | 后果 | 正确做法 |
|---|---|---|---|
| E1 | `workers:1` 根因误判 | 把并发写失败归咎 SQLite 固有限制，实为缺 `busy_timeout=5000`；错误结论写进记忆/文档 | `busy_timeout=5000` 已设后实测失败率 88%→0；偶发 `database is locked` 先查 busy_timeout 是否被移除 |
| E2 | 同文件并行 Edit 竞态 | 一条消息发 8 个替换，仅落盘 1 个 | 改用一次性 Python 原子替换（读→`assert count==1`→replace→写回），或每处单独成轮 |
| E3 | grep `\|` BSD 语法误判 | 把 `\|` 当字面量，误以为"本地没有 F091 用例"，绕一大圈 | BSD grep 用 `-E` + 真正则；或改用 Grep 工具 |
| E4 | 全量 `@ts-check` = 194 错误未预估 | 被迫改增量策略（per-file `// @ts-check`） | 新项目早期规划类型策略；`querySelector` 返回 `Element` 取 `.value` 是 80% 错误来源，用 `js/dom.js` 类型化 helper |
| E5 | Google Fonts 被墙致 Playwright 挂死 | `waitUntil:'networkidle'` 永不 settle、`screenshot()` 卡 `document.fonts.ready` | `page.route` abort `fonts.googleapis.com`/`fonts.gstatic.com`，改 `domcontentloaded` + 固定 `waitForTimeout` |
| E6 | 结论未经核实就固化进记忆/文档 | D3、E1、T4 等多处互相矛盾，且被后续实测推翻后未二次核实 | **任何"根因/结论"写进记忆/文档前先二次核实；矛盾时以最新实测为准** |
| E7 | 远端仓库替换前未先确认是否已有内容 | 差点误覆盖无关 Python 项目 | force push 前 `git ls-remote` + `ls-tree` 看清远端内容，请用户拍板整合方式 |

---

## 5. 根因共性（给新项目的硬规矩）

1. **验证不足**：把"解包后那一瞬快照"当"部署成功"；把"本地快"当"CI 一定过"。
2. **在旧框架内打补丁**，不重新定义体验——UI 的"人性缺失"本质是**体验定义缺失**，不是按钮摆位问题。
3. **结论未经验证就固化进记忆/文档**，且互相矛盾时未二次核实（E6 是最该被记住的一条）。
4. **先写 UI、后想体验**：没有"以写作者为中心"的体验定义就直接堆界面。

### Do / Don't（新项目红线）

- ✅ 先出设计稿/原型，用户认可"温度"再写代码
- ✅ 部署：解包 → 验证（本机+公网）→ 再提交同步点；不碰 `git checkout` 已解包文件
- ✅ 任何"根因/结论"写进记忆/文档前二次核实，矛盾以最新实测为准
- ✅ 字体/配色/背景按"有温度"七铁律：禁通用字体、禁纯白背景、必有一个记忆点
- ✅ 改 UI 前查 `tests/` 加载可见性矩阵；reporter 输出避开 `test-results/`
- ❌ 不在旧骨架上反复加减法假装"重构"
- ❌ 不把本地验证当部署成功，不把"本地快"当"CI 一定过"
- ❌ 不把未核实的结论写进记忆/文档，更不在矛盾时不动

---

## 6. 本次已沉淀的安全网（可随时回滚）

- 本地：`git tag pre-rebuild-20260919`（`1cc2a06`）+ 源码快照 `novel-ai.rebuild-backup.20260919.tar.gz` + `.env/.data` 快照
- 部署机：`git tag pre-rebuild-20260919` + `.deploy-backup/pre-rebuild-20260919/source.tar.gz`
- 概念原型（框架无关，不绑定栈）：`concept/index.html`
- 新设计方向文档：`doc/design/redesign-concept.md`
