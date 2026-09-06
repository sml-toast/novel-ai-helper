// 用共享夹具而非 @playwright/test：夹具会给页面注入测试用的 API 端口，
// 否则 novel-ai.js 会按默认值去连 8787（开发进程 / 开发库）。
import { test, expect } from './fixtures.js';

test.describe('Novel AI 助手 - 基础验证', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/novel-ai.html');
    await page.waitForLoadState('networkidle');
  });

  test('页面打开并显示UI结构', async ({ page }) => {
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.brand')).toBeVisible();
    await expect(page.locator('[data-open-panel="knowledge"]')).toBeVisible();
    await expect(page.locator('[data-open-panel="publish"]')).toBeVisible();
  });

  test('知识库面板可打开', async ({ page }) => {
    await page.locator('[data-open-panel="knowledge"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#knowledgeDrawer')).toBeVisible();
  });

  test('发布计划面板可打开', async ({ page }) => {
    await page.locator('[data-open-panel="publish"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#publishDrawer')).toBeVisible();
  });

  test('系统日志面板可打开', async ({ page }) => {
    await page.locator('[data-action="open-log"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#logDrawer')).toBeVisible();
  });

  // F079：项目切换器。注意并行契约用例也会往共享测试库建项目，
  // 因此不能假设「初始只有一个项目」/选项总数，只断言与本次操作相关的行为。
  test('项目切换器：新建项目后自动切换并可切回', async ({ page }) => {
    const switcher = page.locator('#projectSwitcher');
    const cardTitle = page.locator('.project-card h2');
    const previousValue = await switcher.inputValue();
    const previousTitle = (await cardTitle.textContent()) ?? '';

    await page.locator('[data-action="new-project"]').click();
    // 向导弹窗：标题留空 → 服务端默认「未命名小说」（并行契约用例的项目不会重名）
    await page.locator('#newProjectTitleInput').fill('');
    await page.locator('#modalActions button').filter({ hasText: '创建' }).click();
    await expect(cardTitle, '新建后应自动切换到新项目').toHaveText('未命名小说');
    await expect(switcher, '切换器应包含新项目').toBeVisible();
    await expect(switcher.locator('option').filter({ hasText: '未命名小说' })).toHaveCount(1);

    // 按项目 id 切回（标题可能与其他并行项目重名，不能用 label 定位）
    await switcher.selectOption(previousValue);
    await expect(cardTitle, '切回后项目卡标题应恢复').toHaveText(previousTitle);
  });

  // F082/T015：前端流式消费端到端。mock 流确定性分片（40 字符 × 15ms），
  // done 后流式卡被结构化结果卡替换 —— 断言终态卡片内容即可，无需断言中间帧
  test('同步辅助走流式通道并渲染结构化结果', async ({ page }) => {
    await page.locator('[data-action="run-sync-ai"]').click();
    await expect(
      page.locator('#assistFeed .assist-card').filter({ hasText: 'AI 同步辅助完成' }).first(),
      '流式完成后应出现结构化结果卡（mock 模板第一条）'
    ).toBeVisible();
    await expect(
      page.locator('#assistFeed .assist-card').filter({ hasText: '生成完成' }).first(),
      '应显示来源徽章（可信标识）'
    ).toContainText('本地演示');
  });
});
