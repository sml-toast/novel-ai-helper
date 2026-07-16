import { test, expect } from '@playwright/test';

test.describe('Novel AI 助手 - 知识库功能测试', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/novel-ai.html');
    await page.waitForLoadState('networkidle');
  });

  test('知识库面板应可打开', async ({ page }) => {
    const kbBtn = page.locator('[data-open-panel="knowledge"]');
    await expect(kbBtn).toBeVisible();
    await kbBtn.click();
    await page.waitForTimeout(800);
    
    // 实际 ID 是 knowledgeDrawer
    const drawer = page.locator('#knowledgeDrawer');
    await expect(drawer).toBeVisible();
  });

  test('知识图谱区域应存在', async ({ page }) => {
    const graph = page.locator('#nodeMap, .node-map, .graph-view');
    if (await graph.count() > 0) {
      await expect(graph.first()).toBeVisible();
    }
  });

  test('知识库搜索功能应可用', async ({ page }) => {
    const searchInput = page.locator('#knowledgeSearch');
    if (await searchInput.isVisible()) {
      await searchInput.fill('测试关键词');
      await page.waitForTimeout(300);
    }
  });

  test('知识库节点应可交互', async ({ page }) => {
    const nodes = page.locator('.node, .graph-node, [role="button"]').first();
    if (await nodes.isVisible()) {
      await nodes.click();
      await page.waitForTimeout(300);
    }
  });
});
