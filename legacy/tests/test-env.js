/**
 * 测试环境常量（唯一真源）。
 *
 * playwright.config.js、webServer 启动脚本、各 spec 都从这里取值，
 * 避免「端口改了一处、另一处还写着 8787」这类漂移。
 *
 * @module tests/test-env.js
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** 项目根目录（tests/ 的上一级）。 */
export const PROJECT_ROOT = resolve(here, '..');

/**
 * 测试专用端口。
 *
 * 为什么不用默认的 5175 / 8787：本机很可能正跑着 `npm run dev`，
 * 而 Playwright 默认 reuseExistingServer=!CI 会直接复用那个进程 ——
 * 于是测试会写进开发库 .data/novel-ai.sqlite，既污染稿件又让断言依赖脏数据。
 * 换成独立端口后，测试进程与开发进程互不干扰，可以并行工作（F077 验收项 4）。
 */
export const WEB_PORT = 5176;
export const API_PORT = 8788;

/**
 * API 基址。
 * 用 127.0.0.1 而非 localhost：后者在部分环境会解析成 IPv6 ::1，
 * 而 API 只绑定 IPv4 回环（F074），会直接连不上。
 */
export const API_BASE = `http://127.0.0.1:${API_PORT}`;

/** 白名单内的合法来源（与 NOVEL_WEB_PORT 对应，见 server/novel-auth.js）。 */
export const ALLOWED_ORIGIN = `http://localhost:${WEB_PORT}`;

/** 非白名单来源，用于验证 403 拦截。 */
export const EVIL_ORIGIN = 'http://evil.example.com';

/** 请求体上限，与 server/novel-auth.js 的 MAX_BODY_BYTES 对齐。 */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * 测试库路径。相对路径由 server/novel-db.js 的 resolveDbPath 相对项目根目录解析。
 * 与开发库 .data/novel-ai.sqlite 完全隔离。
 */
export const TEST_DB_PATH = '.data/novel-test.sqlite';

/** 测试库绝对路径。 */
export const TEST_DB_ABS = resolve(PROJECT_ROOT, TEST_DB_PATH);

/** 开发库绝对路径（仅用于护栏校验，绝不被测试写入或删除）。 */
export const DEV_DB_ABS = resolve(PROJECT_ROOT, '.data', 'novel-ai.sqlite');
