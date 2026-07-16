import { test, expect } from '@playwright/test';

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
