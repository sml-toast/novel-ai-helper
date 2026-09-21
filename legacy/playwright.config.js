/**
 * Playwright 测试配置。
 *
 * 相比上一版的三处关键变化（F077）：
 *   1. `webServer` 使用数组（Playwright 1.61 起支持），`npm test` 会自动拉起
 *      API 与静态服务，无需手工先跑 `npm run dev`，保证「一条命令出结果」。
 *   2. **测试库隔离**：API 进程带 NOVEL_DB_PATH 指向 .data/novel-test.sqlite，
 *      与开发库 .data/novel-ai.sqlite 彻底分开；且每次运行前由
 *      tests/start-test-api.js 重置该库，从干净状态开始。
 *   3. **放开并发**：workers 不再锁死为 1。
 *
 * 关于 workers —— 这里是实测结论，不是拍脑袋：
 *   原配置写 `workers: 1` 的理由是「多 worker 并发写同一个 SQLite 会 SQLITE_BUSY」。
 *   但 X3 实测表明，真正原因是**缺少 busy_timeout**：
 *     - 无 busy_timeout：4 进程 × 400 次写，失败 1411/1600，失败率 88%
 *     - PRAGMA busy_timeout = 5000 后：同样压力下失败率 0
 *   server/novel-db.js 已设置该参数，因此多 worker 不再受限。
 *   本次在真实用例上复测：见 doc/testing-docs/ 的测试报告。
 *   （若将来又出现偶发失败，请先查 busy_timeout 是否被改掉，而不是调回 1。）
 *
 * @see doc/testing-docs/test-plan.md
 */

import { defineConfig } from '@playwright/test';
import { API_PORT, TEST_DB_PATH, WEB_PORT } from './tests/test-env.js';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 7000 },

  // busy_timeout 已消除多进程写冲突（详见文件头注释），允许用例并行跑。
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,

  // 失败重试只在 CI 开：本地要看见真实失败，避免把偶发问题掩盖成「通过」。
  retries: process.env.CI ? 1 : 0,

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // 注意：HTML 报告目录必须放在测试产物目录 test-results/ 之外，
  // 否则 Playwright 会报 "HTML reporter output folder clashes with the tests
  // output folder" 的 Configuration Error。报告落在仓库根的 playwright-report/，
  // 已被 .gitignore 忽略；CI 上传路径在 ci.yml 中同步调整。
  reporter: [['html', { outputFolder: 'playwright-report' }]],

  webServer: [
    {
      // 不用 `node server/novel-api.js` 而是走一层启动器：
      // 必须在打开数据库**之前**删掉上次的测试库，否则服务端会一直持有
      // 已被 unlink 的旧 inode（清理不能放 globalSetup，它晚于 webServer 执行）。
      command: 'node tests/start-test-api.js',
      port: API_PORT,
      // 测试端口为测试专用，绝不复用可能存在的开发进程 ——
      // 复用就意味着测试写进了开发库。
      reuseExistingServer: false,
      env: {
        NOVEL_API_PORT: String(API_PORT),
        // F074 后 API 只放行白名单来源，缺 NOVEL_WEB_PORT 会让页面请求被 403。
        NOVEL_WEB_PORT: String(WEB_PORT),
        // 测试库隔离：与开发库 .data/novel-ai.sqlite 完全分开（相对项目根解析）。
        NOVEL_DB_PATH: TEST_DB_PATH,
      },
    },
    {
      command: 'node server/web-server.js',
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { NOVEL_WEB_PORT: String(WEB_PORT) },
    },
  ],
});
