/**
 * 零依赖 .env 加载器（F073 配套）。
 *
 * 为什么需要：Node 不会自动读取 .env，而本项目的 AI / 服务配置都来自环境变量
 * （NOVEL_AI_BASE_URL / NOVEL_AI_API_KEY / NOVEL_AI_MODEL / NOVEL_*_PORT …）。
 * 部署时让进程自动读取项目根目录的 .env，省去手工 export。
 *
 * 行为约定：
 *   1. 仅当项目根目录存在 .env 时生效；文件缺失则静默跳过（无 .env 也能跑，靠 shell 注入）。
 *   2. **不覆盖**已在 process.env 中的变量 —— shell / Playwright 注入的值优先。
 *      这是「测试隔离」的关键：测试通过 env 注入的值绝不会被 .env 冲掉。
 *   3. 设为 NOVEL_NO_DOTENV=1 可彻底禁用（测试进程用它避免加载到真实密钥）。
 *   4. 路径基于本文件位置（server/）向上退一级，与进程 cwd 无关。
 *
 * 使用方式：在 server 入口文件的最顶部 `import './load-env.js';`，
 * 必须在其它会读取 process.env 的 import 之前。
 *
 * @module server/load-env.js
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

if (process.env.NOVEL_NO_DOTENV !== '1') {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const envPath = join(here, '..', '.env'); // server/ -> 项目根
    if (existsSync(envPath)) {
      const text = readFileSync(envPath, 'utf8');
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        // 去掉可选的引号包裹（"..." 或 '...'）
        if (
          (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
          (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
        ) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
      }
      console.log('[load-env] 已从 .env 注入环境变量');
    }
  } catch (e) {
    // 加载失败绝不应阻断启动
    console.warn('[load-env] 读取 .env 失败（已忽略）：', e.message);
  }
}
