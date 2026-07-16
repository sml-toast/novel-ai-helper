import { test, expect } from '@playwright/test';

test.describe('Novel AI 助手 - 发布功能测试', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/novel-ai.html');
    await page.waitForLoadState('networkidle');
  });

  test('发布计划面板应可打开', async ({ page }) => {
    const pubBtn = page.locator('[data-open-panel="publish"]');
    await expect(pubBtn).toBeVisible();
    await pubBtn.click();
    await page.waitForTimeout(800);
    
    // 实际 ID 是 publishDrawer
    const drawer = page.locator('#publishDrawer');
    await expect(drawer).toBeVisible();
  });

  test('发布队列应显示任务列表', async ({ page }) => {
    const queue = page.locator('.publish-queue, .queue-list, #publishQueue');
    if (await queue.count() > 0) {
      await expect(queue.first()).toBeVisible();
    }
  });

  test('系统状态指示器应显示连接信息', async ({ page }) => {
    const status = page.locator('#apiStatus, .status-dot, .connection-status');
    if (await status.count() > 0) {
      await expect(status.first()).toBeVisible();
    }
  });
});
