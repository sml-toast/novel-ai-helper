/**
 * 共享测试夹具。
 *
 * 前端 novel-ai.js 里 API 端口写死为 `window.NOVEL_API_PORT || 8787`。
 * 测试跑在独立端口（见 test-env.js），因此必须在页面脚本求值之前注入该变量，
 * 否则页面会去连 8787 —— 那里要么没有服务，要么是开发进程的开发库。
 *
 * 用 context 级 addInitScript（而非 page 级）可以保证该 context 下
 * 每个页面、每次导航都生效。
 *
 * 纯 API 用例不需要这个夹具，直接用 `request` 即可。
 *
 * @module tests/fixtures.js
 */

import { test as base, expect } from '@playwright/test';
import { API_PORT } from './test-env.js';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript((port) => {
      window.NOVEL_API_PORT = port;
    }, API_PORT);
    await use(context);
  },
});

export { expect };
