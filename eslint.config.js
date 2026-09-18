// ESLint 扁平配置（ESLint 9+）。
//
// 约定：本项目的 JS 分两侧运行——`server/`、`tests/` 跑在 Node，`js/` 与根 `novel-ai.js`
// 跑在浏览器。按目录分别注入对应的全局变量，避免把 `document` 误报成未定义
// 或把 `process` 误报成未定义。
//
// 注意：`tests/**` 同时需要浏览器与 Node 全局——测试主体跑在 Node，但会在
// `page.evaluate(() => window.xxx)` 的回调里引用浏览器的 `window`/`document`。
//
// 为什么规则先宽松：这是存量 4000+ 行无类型 JS 代码，一次性拉满规则会产生海量噪音。
// 采用「先接上、再逐步收紧」策略：默认只保留能抓真 bug 的规则（no-undef / no-unused-vars /
// no-dupe-keys / no-unreachable 等），`no-console`、`no-empty` 降为提示。
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.data/**',
      'test-results/**',
      'playwright-report/**',
      'doc/**',
      '.workbuddy/**',
      '*.min.js',
    ],
  },
  js.configs.recommended,
  {
    // 后端：纯 Node 环境
    files: ['server/**/*.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // 测试：Node 主体 + 浏览器回调全局
    files: ['tests/**/*.js', 'tests/**/*.mjs', 'tests/**/*.mts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // 独立的 .mjs 脚本（Node）
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // 前端：浏览器环境
    files: ['js/**/*.js', 'novel-ai.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-console': 'off',
      'no-empty': 'warn',
    },
  },
];
