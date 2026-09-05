/**
 * 知识库功能测试。
 *
 * F077 改动说明：本文件原来的三条用例都是「空过」的 ——
 *   - 知识图谱：`if (await graph.count() > 0)` 包裹断言，元素不存在时整条跳过；
 *   - 搜索：fill() 之后一条断言都没有，纯空转。
 * 这类写法会让覆盖率看起来有、实际为零，比没有测试更危险。
 * 现在全部改为直断：元素不存在就直接失败，由人来判断是选择器错了
 * 还是功能没实现 —— 测试的价值就在于把不确定性暴露出来。
 *
 * 选择器依据 novel-ai.html / novel-ai.js 的实际 DOM：
 *   #nodeMap（.node-map）渲染图谱节点，#knowledgeSearch 是搜索框，
 *   搜索按钮为 [data-action="search-knowledge"]，结果落在
 *   #globalKnowledge / #projectKnowledge，提示走 #assistFeed。
 */

import { test, expect } from './fixtures.js';

test.describe('Novel AI 助手 - 知识库功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/novel-ai.html');
    // 等 bootstrap 拉取完成：图谱与知识列表都依赖这次请求的结果。
    await page.waitForResponse((res) => res.url().includes('/api/novel/bootstrap')).catch(() => {});
    await page.waitForLoadState('networkidle');
  });

  test('知识库面板应可打开', async ({ page }) => {
    const kbBtn = page.locator('[data-open-panel="knowledge"]');
    await expect(kbBtn).toBeVisible();
    await kbBtn.click();

    const drawer = page.locator('#knowledgeDrawer');
    await expect(drawer).toBeVisible();
  });

  test('知识图谱区域应存在并渲染出节点', async ({ page }) => {
    const graph = page.locator('#nodeMap');

    // 直断存在性：容器都没有，就是功能缺失，不该静默跳过。
    await expect(graph, '知识图谱容器 #nodeMap 应存在').toBeVisible();

    // renderNodeMap 会把每个节点渲染成一个 .node 按钮；
    // 一个节点都没有说明图谱数据没接上（API 离线或 buildGraph 返回空）。
    await expect(graph.locator('.node').first(), '图谱应至少渲染出 1 个节点').toBeVisible();

    // 图谱统计区应由同一份数据驱动，避免出现「有节点但统计为 0」的半截渲染。
    await expect(page.locator('#graphStats')).toBeVisible();
  });

  test('知识库搜索功能应可用', async ({ page }) => {
    await page.locator('[data-open-panel="knowledge"]').click();

    const searchInput = page.locator('#knowledgeSearch');
    await expect(searchInput, '知识库面板应提供搜索框').toBeVisible();

    await searchInput.fill('黑潮');
    await page.locator('[data-action="search-knowledge"]').click();

    // searchKnowledge() 无论走 API 还是本地兜底，都会在 #assistFeed
    // 顶部插一张结果卡片。原来那条用例只 fill 不点击、也不断言，等于没测。
    await expect(
      page.locator('#assistFeed .assist-card').first(),
      '点击搜索后应在辅助区出现「历史与文献搜索」结果卡片'
    ).toContainText('历史与文献搜索');

    // 搜索结果最终落在两个知识列表容器里，容器必须存在。
    // 「黑潮」只命中项目知识里的《黑潮》词条；写作知识库（global）无匹配 ——
    // 空结果容器高度为 0，Playwright 视为不可见，这是正常行为，
    // 因此这里断言「命中卡片可见 + 空容器仍在文档中」，而不是无脑要求两者可见。
    await expect(
      page.locator('#projectKnowledge .knowledge-card').filter({ hasText: '黑潮' }).first(),
      '搜索「黑潮」应命中项目知识中的《黑潮》词条'
    ).toBeVisible();
    await expect(page.locator('#globalKnowledge'), 'global 容器应存在（可能为空结果）').toBeAttached();
    await expect(page.locator('#projectKnowledge')).toBeAttached();
  });

  test('知识库节点应可交互', async ({ page }) => {
    const node = page.locator('#nodeMap .node').first();
    await expect(node, '图谱节点应存在，否则无法验证交互').toBeVisible();

    const label = (await node.textContent())?.trim();
    await node.click();

    // 点击节点应在详情区展示该节点，而不是毫无反应。
    // #graphDetail 由 renderNodeMap 统一写入，节点点击会更新它。
    await expect(page.locator('#graphDetail')).toContainText(label ?? '');
  });
});
