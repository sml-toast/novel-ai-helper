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
});
