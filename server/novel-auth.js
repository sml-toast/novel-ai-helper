/**
 * server/novel-auth.js —— 零依赖 API 鉴权中间件（T005 / 需求 F074）
 *
 * 背景（X1 实测结论）：
 *   novel-api.js 原为 `listen(port)` 未指定 host，实际绑定 `::`（所有网卡），
 *   实测用局域网 IP 192.168.102.128 可直接访问；而控制台日志却打印
 *   "listening on 127.0.0.1"，极具误导性。叠加 send() 固定返回
 *   `access-control-allow-origin: *`，意味着**任何网页都能读写本机全部稿件**。
 *
 * 防护策略（面向单机单用户场景，不引入账号体系）：
 *   1. 默认仅监听 127.0.0.1（host 绑定在 novel-api.js）
 *   2. Origin 白名单：跨域请求必须来自本机静态服务
 *   3. 写操作保护：非白名单 Origin 的写请求一律 403
 *   4. 请求体上限 2MB（X5 实测：50MB 请求被完整读入，堆占用 109MB）
 *
 * 零依赖：仅用 Node 内置能力。
 */

const DEFAULT_ORIGINS = [
  'http://127.0.0.1:5175',
  'http://localhost:5175'
];

/** 请求体上限（X5：无上限时 50MB 请求可直接打满内存） */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseAllowedOrigins() {
  const raw = process.env.NOVEL_ALLOWED_ORIGINS;
  const list = raw
    ? raw.split(',').map(item => item.trim()).filter(Boolean)
    : [...DEFAULT_ORIGINS];

  // 自定义静态服务端口时自动放行对应来源，避免改了 NOVEL_WEB_PORT 就连不上
  const webPort = Number(process.env.NOVEL_WEB_PORT);
  if (webPort && !list.some(origin => origin.endsWith(`:${webPort}`))) {
    list.push(`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`);
  }
  return list;
}

export const ALLOWED_ORIGINS = new Set(parseAllowedOrigins());

/**
 * 判定是否回显 CORS 头。
 * @returns {string|null} 白名单内的 Origin，或 null（不回显任何 CORS 头）
 */
export function resolveOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null; // 同源 / curl / 服务端直连（如 Playwright request fixture）
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

export function isWriteMethod(req) {
  return WRITE_METHODS.has((req.method || '').toUpperCase());
}

/**
 * 鉴权中间件。
 * 放行规则：
 *   - 无 Origin（curl / 本机直连 / 测试 request fixture）→ 放行
 *   - Origin 在白名单 → 放行并回显该 Origin
 *   - Origin 不在白名单 → 403（读操作一并拒绝：单机工具无需对外部开放）
 */
export function authMiddleware(req) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return { ok: false, status: 403, error: `origin not allowed: ${origin}` };
  }
  return { ok: true, corsOrigin: origin || null };
}
