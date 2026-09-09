/**
 * 静态文件服务器 —— 替代原 blog-design 的 vite dev server。
 *
 * 设计目标：
 *   1. 零第三方依赖，仅使用 Node 内置模块（node:http / node:fs / node:path / node:url）。
 *   2. 默认端口 5175，可通过环境变量 NOVEL_WEB_PORT 覆盖。
 *   3. `/` 映射到 `/novel-ai.html`，使根路径即可进入工作台，无需新增 index.html。
 *   4. 目录穿越防护（R-09）：任何逃逸出项目根目录的请求一律 403。
 *   5. `.js` 必须以 text/javascript 响应（R-08），否则 ES module 会被浏览器拒绝加载导致白屏。
 *
 * @module server/web-server.js
 */

import './load-env.js'; // 必须在读取 process.env 的其它 import 之前（F073 配套）
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 项目根目录：本文件位于 <root>/server/ 下，故向上退一级。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 监听端口，默认 5175。 */
const PORT = Number(process.env.NOVEL_WEB_PORT || 5175);

/** 根路径 `/` 的默认页面。 */
const DEFAULT_PAGE = '/novel-ai.html';

/**
 * 扩展名 → Content-Type 映射表。
 * 注意 `.js` 必须是 `text/javascript`，这是 ES module 的标准 MIME；
 * 使用 `application/octet-stream` 或省略会导致浏览器拒绝执行脚本（白屏）。
 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * 将 URL 路径解析为项目内的绝对文件路径，并保证不会逃逸出 ROOT。
 *
 * 采用三层防护：
 *   1. 百分号解码失败（非法 %XX 序列）→ 拒绝；
 *   2. 逐段走查，出现把层级抬到根之上的 `..` → 判定为穿越，拒绝（R-09）；
 *   3. resolve + startsWith(ROOT + sep) 兜底，双重校验。
 *
 * 之所以在 normalize 之前先做逐段走查：path.normalize() 会把绝对路径中的
 * 越界 `..` 静默吞掉（`/../../etc/passwd` → `/etc/passwd`），虽然最终仍安全
 * （落在 ROOT 内、返回 404），但无法区分「穿越意图」与「文件不存在」。
 * 提前走查可以让穿越尝试明确返回 403，而非与 404 混淆。
 *
 * @param {string} urlPath 已去除 query/hash 的 URL 路径，形如 `/novel-ai.html`。
 * @returns {{ ok: true, filePath: string } | { ok: false, reason: string }}
 */
function resolveWithinRoot(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (error) {
    return { ok: false, reason: 'bad-encoding' };
  }

  // NUL 字节会截断底层系统调用，直接拒绝。
  if (decoded.includes('\0')) {
    return { ok: false, reason: 'nul-byte' };
  }

  // 逐段走查：depth < 0 表示试图走到项目根目录之上。
  let depth = 0;
  for (const segment of decoded.split(/[/\\]+/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      depth -= 1;
      if (depth < 0) return { ok: false, reason: 'traversal' };
      continue;
    }
    depth += 1;
  }

  // 兜底：normalize 后解析，确认最终路径仍在 ROOT 之内。
  const filePath = resolve(join(ROOT, normalize(decoded)));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    return { ok: false, reason: 'traversal' };
  }

  return { ok: true, filePath };
}

/**
 * 读取请求 URL 中的 pathname，非法 URL 时返回 null。
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {string | null}
 */
function safePathname(req) {
  try {
    return new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`).pathname;
  } catch (error) {
    return null;
  }
}

const server = createServer((req, res) => {
  const method = (req.method || 'GET').toUpperCase();

  // 静态服务器只接受 GET / HEAD。
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, {
      'content-type': 'text/plain; charset=utf-8',
      allow: 'GET, HEAD',
    });
    res.end('405 Method Not Allowed');
    return;
  }

  const urlPath = safePathname(req);
  if (urlPath === null) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  const target = urlPath === '/' ? DEFAULT_PAGE : urlPath;
  const resolved = resolveWithinRoot(target);

  // 目录穿越：403 Forbidden（R-09）
  if (!resolved.ok) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // 不存在或不是普通文件（含目录）：404
  if (!existsSync(resolved.filePath) || !statSync(resolved.filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const contentType =
    MIME[extname(resolved.filePath).toLowerCase()] || 'application/octet-stream';

  res.writeHead(200, {
    'content-type': contentType,
    // 开发期禁用缓存，避免改了 css/js 不生效。
    'cache-control': 'no-cache',
  });

  // HEAD 请求只回头部，不回包体。
  if (method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(resolved.filePath)
    .on('error', () => {
      // 流读取过程中出错（如权限问题）：头部未发出则补 500。
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      }
      res.end('500 Internal Server Error');
    })
    .pipe(res);
});

// 与 API 一致（F074）：默认仅绑定本机回环，避免静态服务暴露到局域网。
// 需要其他设备访问时：NOVEL_WEB_HOST=0.0.0.0（请自行评估风险）
const HOST = process.env.NOVEL_WEB_HOST || '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log(`Novel AI Web listening on http://${HOST}:${PORT}${DEFAULT_PAGE}`);
});
