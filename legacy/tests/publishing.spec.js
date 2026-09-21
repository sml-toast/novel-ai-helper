/**
 * 发布计划功能测试。
 *
 * F077 改动说明：原文件里两条用例都是条件断言
 * （`if (await queue.count() > 0)` 才校验），而且选择器本身就写错了 ——
 * 实际 DOM 里既没有 .publish-queue 也没有 #publishQueue，发布任务列表是
 * `#publishBoard`（.publish-board）。所以这两条用例从来没真正校验过任何东西。
 *
 * 现在改为：先打开抽屉（抽屉默认隐藏，不开就永远不可见），再直接断言
 * 真实存在的元素与真实渲染出的任务卡片数量（种子数据固定 2 条）。
 */

import { test, expect } from './fixtures.js';

test.describe('Novel AI 助手 - 发布功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/novel-ai.html');
    await page.waitForResponse((res) => res.url().includes('/api/novel/bootstrap')).catch(() => {});
    await page.waitForLoadState('networkidle');
  });

  test('发布计划面板应可打开', async ({ page }) => {
    const pubBtn = page.locator('[data-open-panel="publish"]');
    await expect(pubBtn).toBeVisible();
    await pubBtn.click();

    const drawer = page.locator('#publishDrawer');
    await expect(drawer).toBeVisible();
  });

  test('发布队列应显示任务列表', async ({ page }) => {
    await page.locator('[data-open-panel="publish"]').click();
    await expect(page.locator('#publishDrawer')).toBeVisible();

    // 发布任务列表的真实容器是 #publishBoard，不是原来写的 .publish-queue。
    const board = page.locator('#publishBoard');
    await expect(board, '发布面板应包含任务看板容器').toBeVisible();

    // 种子数据固定写入 2 条推送任务（模拟平台 A / 模拟平台 B）。
    // 渲染出 0 张卡片说明数据没接上 —— 属于真实缺陷，不该被条件断言吞掉。
    await expect(board.locator('.publish-card'), '应渲染出种子数据中的 2 条推送任务').toHaveCount(2);
  });

  test('系统状态指示器应显示连接信息', async ({ page }) => {
    const status = page.locator('#apiStatus');

    await expect(status, '顶栏应存在 API 状态指示器').toBeVisible();
    // 测试环境由 webServer 拉起真实 API，bootstrap 成功后应显示「API 在线」。
    // 若显示「本地演示」，说明页面根本没连上 API —— 通常是端口或 CORS 白名单配错。
    await expect(status, 'bootstrap 成功后状态应显示 API 在线').toHaveText('API 在线');
    await expect(status, '在线时不应带 offline 样式').not.toHaveClass(/offline/);
  });
});
