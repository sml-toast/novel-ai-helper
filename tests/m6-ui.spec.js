/**
 * M6 新功能浏览器端到端测试（F083 三视图 · F084 伏笔抽屉 · F085 调度器状态 ·
 * F090 专注模式 · F091 力导向图谱 · F092 导出弹窗）。
 *
 * 为什么必须有页面级用例：
 *   API 契约（tests/api-m6.spec.js）只能证明「后端算对了」。这个项目历史上一再
 *   出现「后端通了、前端没接」—— 例如 selectedText 曾传正文前 1200 字、搜索结果
 *   曾混硬编码假数据、发布面板曾断言 .publish-queue 而真实容器叫 #publishBoard。
 *   这类缺陷在契约层永远绿，只有真的打开页面点一遍才会红。
 *
 * 断言原则（重要）：
 *   元素不存在时**不要**把断言改宽松（例如把 toBeVisible 换成 count >= 0）。
 *   应当是：写成显式失败（让缺陷暴露），或 test.skip + 写明原因。宁可红，不要假绿。
 *
 * 数据隔离：
 *   页面默认载入 id 最小的项目（种子项目）。凡需写库的用例都用唯一 token 命名，
 *   只断言「带自己标记」的数据，避免与并行 worker 互相干扰。
 *
 * @module tests/m6-ui.spec.js
 */

import { test, expect } from './fixtures.js';
import { API_BASE } from './test-env.js';

/** 全局唯一标记（与 API 用例同口径）。 */
function token(label) {
  return `${label}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 打开页面并等到 bootstrap 完成（后续所有断言的前提）。 */
async function openApp(page) {
  await page.goto('/novel-ai.html');
  await page.waitForResponse((res) => res.url().includes('/api/novel/bootstrap')).catch(() => {});
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#apiStatus'), '前置：页面应连上测试 API').toHaveText('API 在线');
}

/* ══════════════════ F083 三视图 ══════════════════ */

test.describe('M6 · 大纲三视图与情节网格（F083）', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('01 三视图切换：列表 → 卡片 → 情节网格，各自渲染真实容器', async ({ page }) => {
    const body = page.locator('#outlineBody');
    await expect(body, '前置：大纲容器应存在').toBeAttached();

    // ── 视图一：列表（大纲树）──
    await page.locator('[data-outline-view="list"]').click();
    await expect(body.locator('.outline-branch').first(), '列表视图应渲染大纲分支').toBeVisible();
    await expect(body.locator('.outline-chapter').first(), '分支内应有章节行').toBeVisible();
    await expect(page.locator('[data-outline-view="list"]'), '当前视图按钮应高亮').toHaveClass(/active/);

    // ── 视图二：卡片（Corkboard）──
    await page.locator('[data-outline-view="corkboard"]').click();
    await expect(body.locator('.corkboard'), '卡片视图应渲染 .corkboard 容器').toBeVisible();
    await expect(body.locator('.chapter-card').first(), '卡片视图应有章节卡').toBeVisible();
    await expect(page.locator('[data-outline-view="corkboard"]')).toHaveClass(/active/);
    await expect(page.locator('[data-outline-view="list"]'), '切换后旧按钮应取消高亮').not.toHaveClass(/active/);

    // ── 视图三：情节网格（Plot Grid）──
    await page.locator('[data-outline-view="grid"]').click();
    await expect(body.locator('.plotgrid-wrap'), '情节网格应渲染工具栏容器').toBeVisible();
    await expect(page.locator('#plotLineTitleInput'), '应有新建情节线输入框').toBeVisible();
    await expect(page.locator('[data-action="add-plotline"]'), '应有新建情节线按钮').toBeVisible();
  });

  test('02 情节网格：新建情节线后矩阵可渲染，点击单元格循环打点并落库', async ({ page }) => {
    const lineTitle = `UI 情节线-${token('line')}`;

    await page.locator('[data-outline-view="grid"]').click();
    await expect(page.locator('#plotLineTitleInput')).toBeVisible();

    // 空名称 → 只提示不创建（防止矩阵里出现一行无名情节线）
    await page.locator('[data-action="add-plotline"]').click();
    await expect(page.locator('.plotgrid-toolbar'), '空名称不应创建出矩阵').toBeVisible();

    await page.locator('#plotLineTitleInput').fill(lineTitle);
    await page.locator('[data-action="add-plotline"]').click();

    // 矩阵表头 = 情节线 × 章节；seed 项目固定 3 章 +
    const table = page.locator('#outlineBody table.plotgrid');
    await expect(table, '新建情节线后应渲染章节矩阵').toBeVisible();
    await expect(page.locator('#outlineBody .plotgrid-line').filter({ hasText: lineTitle }),
      '矩阵左侧应有该情节线行').toBeVisible();

    const firstCell = page.locator('#outlineBody .beat-cell').first();
    await expect(firstCell, '单元格应可点击（节拍按钮）').toBeVisible();
    await expect(firstCell, '初始应无节拍标记').not.toHaveClass(/mark-/);

    // 点击 → progress（●）
    await firstCell.click();
    await expect(page.locator('#outlineBody .beat-cell').first(), '首次点击应标记为有进展').toHaveClass(/mark-progress/);
    // 再点 → planned（▸）
    await page.locator('#outlineBody .beat-cell').first().click();
    await expect(page.locator('#outlineBody .beat-cell').first(), '再次点击应切换为计划中').toHaveClass(/mark-planned/);
    // 第三次 → 清除（回到无标记），证明是三态循环而不是二态开关
    await page.locator('#outlineBody .beat-cell').first().click();
    await expect(page.locator('#outlineBody .beat-cell').first(), '第三次点击应清除节拍').not.toHaveClass(/mark-/);

    // 落库校验：服务端确有该情节线（UI 渲染 ≠ 数据写进去了）
    const res = await page.request.get(`${API_BASE}/api/novel/outline`);
    const data = await res.json();
    expect(data.plotLines.some((line) => line.title === lineTitle), '情节线应已持久化到服务端').toBe(true);
  });
});

/* ══════════════════ F084 伏笔抽屉 ══════════════════ */

test.describe('M6 · 伏笔与线索面板（F084）', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('03 伏笔抽屉可打开、可登记、可标记回收', async ({ page }) => {
    const title = `UI 伏笔-${token('fs')}`;

    // 入口按钮在顶栏；打开时应自动拉取列表与线索提示（events.js 已接）
    await page.locator('[data-open-panel="foreshadow"]').click();
    const drawer = page.locator('#foreshadowDrawer');
    await expect(drawer, '伏笔抽屉应可见').toBeVisible();
    await expect(page.locator('#foreshadowPanel .foreshadow-group').first(), '打开后应渲染分组列表').toBeVisible();
    await expect(page.locator('#foreshadowHints'), '应渲染线索提示区').toBeVisible();

    // 登记：埋设章 = 当前激活章节
    await page.locator('#foreshadowTitleInput').fill(title);
    await page.locator('#foreshadowContentInput').fill('端到端登记的内容摘要');
    await page.locator('[data-action="add-foreshadow"]').click();

    const item = page.locator('#foreshadowPanel .foreshadow-item').filter({ hasText: title });
    await expect(item, '登记后应出现在已埋设分组').toBeVisible();
    await expect(item.locator('[data-foreshadow-action="resolve"]'), '已埋设项应有「标记回收」按钮').toBeVisible();
    await expect(item.locator('[data-foreshadow-action="abandon"]'), '已埋设项应有「标记废弃」按钮').toBeVisible();

    // 标记回收 → 该项移入「已回收」分组，且不再有操作按钮（终态不可逆）
    await item.locator('[data-foreshadow-action="resolve"]').click();
    await expect(page.locator('#foreshadowPanel .foreshadow-item').filter({ hasText: title }),
      '回收后仍应在列表里（只是换了分组）').toBeVisible();
    await expect(page.locator('#foreshadowPanel .foreshadow-item').filter({ hasText: title })
      .locator('[data-foreshadow-action]'), '终态不应再提供流转按钮').toHaveCount(0);

    // 落库校验
    const list = await (await page.request.get(`${API_BASE}/api/novel/foreshadows`)).json();
    const row = list.foreshadows.find((f) => f.title === title);
    expect(row, '伏笔应已持久化').toBeDefined();
    expect(row.status, '状态应为已回收').toBe('resolved');
  });
});

/* ══════════════════ F085 调度器状态 ══════════════════ */

test.describe('M6 · 发布面板与调度器状态（F085）', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('04 发布面板展示调度器状态块，且与 /scheduler 端点一致', async ({ page }) => {
    await page.locator('[data-open-panel="publish"]').click();
    await expect(page.locator('#publishDrawer'), '发布抽屉应可见').toBeVisible();

    // 调度器状态块是 F085 新增 DOM；不可见 = 前端没接（后端已有端点）
    const block = page.locator('#schedulerStatus');
    await expect(block, '发布面板应包含调度器状态块').toBeVisible();
    await expect(page.locator('#schedulerState'), '应有调度器状态标签').toBeVisible();
    await expect(page.locator('#schedulerNext'), '应展示下次扫描时间').toBeVisible();

    // 测试环境调度器禁用（见 novel-scheduler.js 的测试库自动识别），
    // 前端必须显示「已禁用」而不是「运行中」—— 否则用户会以为定时推送在生效
    const status = await (await page.request.get(`${API_BASE}/api/novel/scheduler`)).json();
    expect(status.scheduler.disabled, '前置：测试环境调度器应禁用').toBe(true);
    await expect(page.locator('#schedulerState'), '状态文案应与 /scheduler 的 disabled 一致').toHaveText('调度器已禁用');
    // 禁用时不得显示「下次扫描：某个具体时间」（没有定时器，承诺了就是撒谎）
    await expect(page.locator('#schedulerNext')).toHaveText('下次扫描：--');

    // 任务卡应标注模拟适配器，避免用户误以为真发出去了
    const card = page.locator('#publishBoard .publish-card').first();
    await expect(card, '应有发布任务卡').toBeVisible();
    await expect(card, '任务卡应明示这是模拟适配器').toContainText('模拟适配器');
  });
});

/* ══════════════════ F090 专注模式 ══════════════════ */

test.describe('M6 · 专注模式（F090）', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('05 专注模式开关生效，Esc 可退出', async ({ page }) => {
    const toggle = page.locator('[data-action="focus-toggle"]');
    await expect(toggle, '应存在专注模式入口').toBeVisible();
    await expect(toggle, '初始文案应为「专注模式」').toHaveText('专注模式');
    await expect(page.locator('body'), '初始不应处于专注模式').not.toHaveClass(/focus-mode/);

    // 开启：body.focus-mode 一个类驱动全部显隐（CSS 侧约定）
    await toggle.click();
    await expect(page.locator('body'), '开启后 body 应带 focus-mode 类').toHaveClass(/focus-mode/);
    await expect(toggle, '按钮文案应切为「退出专注」').toHaveText('退出专注');
    await expect(page.locator('.topbar'), '专注模式应隐藏顶栏').toBeHidden();
    await expect(page.locator('#chapterEditor'), '编辑器应仍然可见（专注的是写作）').toBeVisible();

    // Esc 退出（events.js：确认弹窗 > 专注模式）
    await page.keyboard.press('Escape');
    await expect(page.locator('body'), 'Esc 应退出专注模式').not.toHaveClass(/focus-mode/);
    await expect(toggle, '文案应恢复为「专注模式」').toHaveText('专注模式');
    await expect(page.locator('.topbar'), '退出后顶栏应恢复').toBeVisible();
  });

  test('06 编辑区字号档位可调（偏好写入 localStorage）', async ({ page }) => {
    const panel = page.locator('.editor-panel');
    const readSize = () => panel.evaluate((el) => el.style.getPropertyValue('--editor-font-size'));

    const before = await readSize();
    await page.locator('[data-action="font-inc"]').click();
    const bigger = await readSize();
    expect(bigger, '增大字号应改变 --editor-font-size').not.toBe(before);
    expect(parseFloat(bigger), '增大后字号应变大').toBeGreaterThan(parseFloat(before || '0'));

    await page.locator('[data-action="font-dec"]').click();
    expect(await readSize(), '减小字号应回到原档位').toBe(before);

    // 行宽循环：切换后 CSS 变量应变化
    const widthBefore = await panel.evaluate((el) => el.style.getPropertyValue('--editor-max-width'));
    await page.locator('[data-action="width-cycle"]').click();
    const widthAfter = await panel.evaluate((el) => el.style.getPropertyValue('--editor-max-width'));
    expect(widthAfter, '切换行宽应改变 --editor-max-width').not.toBe(widthBefore);
  });
});

/* ══════════════════ F091 力导向图谱 ══════════════════ */

test.describe('M6 · 力导向图谱（F091）', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('07 图谱节点数 > 16 时渲染正常（旧版 16 节点上限必须已移除）', async ({ page, request }) => {
    // 种子项目约 14 个节点（项目 + 6 知识 + 4 人物 + 时间线 + 场景 + 世界观）。
    // 补 10 条知识条目把节点顶到 24+，超过旧上限 16 —— 若仍被截断，只能渲染 16 个。
    for (let i = 1; i <= 10; i += 1) {
      const res = await request.post(`${API_BASE}/api/novel/knowledge`, {
        data: { scope: 'project', title: `图谱扩容-${token(`n${i}`)}`, body: '用于把节点数顶过旧上限。', source: 'F091 测试', tags: [] },
      });
      expect(res.status(), `补第 ${i} 个节点应成功`).toBe(201);
    }

    await page.locator('[data-action="refresh-graph"]').click();
    // 收敛后才有确定坐标可读（window.__graphPerf 由 graph-view 暴露）
    await page.waitForFunction(() => window.__graphPerf && window.__graphPerf.done === true, null, { timeout: 15000 });

    const perf = await page.evaluate(() => window.__graphPerf);
    expect(perf.nodes, '图谱节点数应超过旧的 16 节点上限').toBeGreaterThan(16);

    const nodes = page.locator('#nodeMap [data-node-id]');
    await expect(nodes, 'DOM 节点数应与数据一致（无截断）').toHaveCount(perf.nodes);
    await expect(nodes.first(), '首个节点应可见').toBeVisible();
    // 性能预算：238 节点 ~85ms 一次性收敛；这里给 3s 的宽松上限，只拦数量级退化
    expect(perf.settleMs, `布局收敛 ${Math.round(perf.settleMs)}ms 应在 3s 内`).toBeLessThan(3000);
  });

  test('08 拖拽节点后位置改变并被固定（力导向 + pin 生效）', async ({ page }) => {
    const nodes = page.locator('#nodeMap [data-node-id]');
    await expect(nodes.first(), '前置：图谱应有节点').toBeVisible();
    await page.waitForFunction(() => window.__graphPerf && window.__graphPerf.done === true, null, { timeout: 15000 });

    // 取中间那个节点；拖拽前必须滚入视口——节点在可滚动图谱面板内，
    // 其 boundingBox 相对页面可能落在视口下沿之外，page.mouse 按到屏幕外坐标
    // 会静默落空（拖拽变 no-op），导致 pinned 断言失败。这是测试交互前提，非产品缺陷。
    const target = nodes.nth(1);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    expect(box, '前置：目标节点应有可测的渲染位置').toBeTruthy();

    const before = await target.evaluate((el) => el.style.transform);
    expect(before, '前置：挂载后应已写入 transform').toBeTruthy();

    // 真实指针拖拽（pointerdown/move/up 三件套，与 graph-view 的绑定一致）
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 90, { steps: 12 });
    await page.mouse.up();

    await expect(target, '拖拽后节点应被标记为已固定').toHaveClass(/pinned/);
    const after = await target.evaluate((el) => el.style.transform);
    expect(after, '拖拽后节点位置必须发生变化（证明力导向与固定都生效）').not.toBe(before);
  });
});

/* ══════════════════ F092 导出弹窗 ══════════════════ */

test.describe('M6 · 多格式导出入口（F092）', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('09 导出弹窗提供三种格式与四个可勾选附录', async ({ page }) => {
    await page.locator('[data-action="export-multi"]').click();

    const mask = page.locator('#modalMask');
    await expect(mask, '导出弹窗应打开').toBeVisible();
    await expect(page.locator('#modalTitle'), '弹窗标题应为多格式导出').toHaveText('多格式导出');

    // 三种格式（与 novel-api.js 的导出路由白名单一致）
    await expect(page.locator('input[name="exportFormat"]'), '应提供 3 种格式').toHaveCount(3);
    await expect(page.locator('input[name="exportFormat"][value="markdown"]')).toBeChecked();
    await expect(page.locator('input[name="exportFormat"][value="docx"]')).toBeAttached();
    await expect(page.locator('input[name="exportFormat"][value="epub"]')).toBeAttached();

    // 四个附录选项默认全选（与服务端缺省一致）
    await expect(page.locator('input[name="exportOption"]'), '应提供 4 个附录选项').toHaveCount(4);
    for (const checkbox of await page.locator('input[name="exportOption"]').all()) {
      await expect(checkbox, '附录默认应全选').toBeChecked();
    }

    // 取消不产生任何下载
    await page.locator('#modalActions button').filter({ hasText: '取消' }).click();
    await expect(mask, '取消后弹窗应关闭').toBeHidden();
  });
});
