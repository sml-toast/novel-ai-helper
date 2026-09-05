/**
 * 测试用 API 进程启动器 —— 由 playwright.config.js 的 webServer.command 调用。
 *
 * 做两件事，顺序不能反：
 *   1. 删除上一次运行残留的测试库。脏数据会让「版本行数 +1」这类相对断言
 *      在第二次运行时莫名失败，也会让「恶意请求未写入」这类断言失去意义。
 *   2. 再 import 真正的 API 服务（import 即触发 initDb + migrate + listen）。
 *
 * 为什么清理放在这里而不是 globalSetup：
 *   Playwright 的任务顺序是「插件 setup（webServer）→ globalSetup → 跑用例」
 *   （见 node_modules/playwright/lib/runner/index.js 的 createGlobalSetupTasks，
 *   createPluginSetupTasks 排在 globalSetups 之前）。若等 globalSetup 再删库，
 *   服务端已经打开了这个文件，删掉的只是目录项，进程仍持有旧 inode ——
 *   后续写入既看不见也清不掉，测试与数据彻底脱节。
 *
 * @module tests/start-test-api.js
 */

import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEV_DB_ABS, TEST_DB_ABS, TEST_DB_PATH } from './test-env.js';

// 护栏：测试库绝不能与开发库同路径，否则一次测试就会删掉真实稿件。
if (TEST_DB_ABS === DEV_DB_ABS) {
  throw new Error(`[fatal] 测试库与开发库指向同一路径，拒绝启动：${TEST_DB_ABS}`);
}

mkdirSync(dirname(TEST_DB_ABS), { recursive: true });

// WAL 模式下主库外还有 -wal / -shm 两个伴生文件，必须一并删除，
// 否则新库会读到上次的 WAL 帧，等于没清干净。
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(TEST_DB_ABS + suffix, { force: true });
}

console.log(`[test-db] 已重置测试库：${TEST_DB_PATH}（开发库 .data/novel-ai.sqlite 不受影响）`);

await import('../server/novel-api.js');
