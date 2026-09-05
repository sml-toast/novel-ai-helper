/**
 * API 契约测试（F077）—— 用 Playwright 的 `request` fixture 直接打接口。
 *
 * 为什么走 HTTP 而不是走页面：
 *   前端正在并行改造（F074 之后的鉴权、F076 的草稿通道都会改 novel-ai.js），
 *   页面级用例会跟着抖。契约层只依赖 URL + 状态码 + 响应头 + 库里的行，
 *   只要服务端行为不变，用例就稳定 —— 这是后续大规模重构的回归防线。
 *
 * 为什么不直接读 SQLite 校验：
 *   在测试进程里另开一个连接，会绕过「多进程共享同一文件」的真实语义，
 *   把 SQLITE_BUSY 这类问题藏起来。因此版本行数、正文内容一律通过
 *   `GET /api/novel/chapters/:id/versions` 与 `GET /api/novel/bootstrap` 间接校验。
 *   唯一例外是 user_version —— 服务端没有暴露它的端点，只能只读探针
 *   （tests/helpers/db-probe.mjs，readOnly 打开，不参与写锁竞争）。
 *
 * 并发安全：每个用例生成全局唯一标记，只统计带自己标记的数据，
 *   因此多个 worker 同时建章、写正文也不会互相干扰（X3：busy_timeout=5000
 *   已把多进程写失败率从 88% 降到 0，这是放开 workers 的前提）。
 *
 * @module tests/api-contract.spec.js
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  API_BASE,
  ALLOWED_ORIGIN,
  EVIL_ORIGIN,
  PROJECT_ROOT,
  TEST_DB_PATH,
} from './test-env.js';

const here = dirname(fileURLToPath(import.meta.url));
const DB_PROBE = join(here, 'helpers', 'db-probe.mjs');

/** 全局唯一标记：并发 worker 同时建章时，断言只统计「自己」的数据。 */
function token(label) {
  return `${label}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 取全部章节（bootstrap 是唯一一次返回全量章节的端点）。 */
async function fetchChapters(request) {
  const res = await request.get(`${API_BASE}/api/novel/bootstrap`);
  // bootstrap 挂了意味着后面的契约断言全都失去前提，直接失败更好定位。
  expect(res.status(), 'bootstrap 应可用').toBe(200);
  return (await res.json()).chapters;
}

/** 只统计带本用例标记的章节 —— 别的 worker 建的章不该影响本用例的计数。 */
function countOwn(chapters, tk) {
  return chapters.filter((chapter) => String(chapter.title).includes(tk)).length;
}

async function createChapter(request, tk, content = '初稿内容') {
  const res = await request.post(`${API_BASE}/api/novel/chapters`, {
    data: { title: `F077-${tk}`, content },
  });
  expect(res.status(), '创建章节应成功（201）').toBe(201);
  return (await res.json()).chapter;
}

/** 版本列表。服务端按 version DESC 返回，最新的一行在首位。 */
async function fetchVersions(request, chapterId) {
  const res = await request.get(`${API_BASE}/api/novel/chapters/${chapterId}/versions`);
  expect(res.status(), '版本列表应可读取').toBe(200);
  return (await res.json()).versions;
}

/** 读取测试库当前的 schema 版本号。 */
function readUserVersion() {
  const result = spawnSync(process.execPath, [DB_PROBE, join(PROJECT_ROOT, TEST_DB_PATH)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`读取 user_version 失败：${result.stderr || result.stdout}`);
  }
  return Number(result.stdout.trim());
}

test.describe('API 契约 · CORS 与鉴权（F074）', () => {
  test('01 无 Origin 请求 bootstrap：200 且不带任何 CORS 头', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/novel/bootstrap`);

    // 无 Origin = 同源 / curl / 服务端直连，鉴权放行。
    expect(res.status()).toBe(200);
    // 关键回归点：F074 之前是写死的 `access-control-allow-origin: *`，
    // 意味着任何网页都能读写本机稿件。现在必须一个 CORS 头都不给。
    expect(res.headers()['access-control-allow-origin'], '无 Origin 时不应回显 CORS 头').toBeUndefined();
  });

  test('02 白名单 Origin：精确回显该 Origin 并带 Vary: Origin', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/novel/bootstrap`, {
      headers: { origin: ALLOWED_ORIGIN },
    });

    expect(res.status()).toBe(200);
    // 必须精确回显来源（而不是 `*`），否则等于对所有站点开放。
    expect(res.headers()['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    // Vary: Origin 不能少 —— 响应随 Origin 变化，缺了会让 CDN/浏览器缓存串号。
    expect(res.headers()['vary'], '回显 CORS 时必须声明 Vary: Origin').toContain('Origin');
  });

  test('03 恶意 Origin 读请求：403 且错误信息含 origin not allowed', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/novel/bootstrap`, {
      headers: { origin: EVIL_ORIGIN },
    });

    expect(res.status(), '非白名单来源的读请求也应拒绝（单机工具不对外提供读取）').toBe(403);
    expect((await res.json()).error).toContain('origin not allowed');
    // 被拒绝时同样不能回显 CORS 头，否则浏览器会放行这次跨域响应。
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('04 恶意 Origin 写请求：403 且数据库确实没多出章节', async ({ request }) => {
    const tk = token('evil-write');
    const before = countOwn(await fetchChapters(request), tk);

    const res = await request.post(`${API_BASE}/api/novel/chapters`, {
      headers: { origin: EVIL_ORIGIN },
      data: { title: `F077-${tk}`, content: '恶意写入' },
    });

    expect(res.status(), '非白名单来源的写请求必须拒绝').toBe(403);
    // 只断言状态码是不够的 —— 万一实现「先写入再返回 403」就漏了。
    // 这里回查一次，确认是真的拦住了。
    expect(countOwn(await fetchChapters(request), tk), '恶意请求不应在库中留下任何章节').toBe(before);
  });

  test('05 OPTIONS 预检，白名单 Origin：204', async ({ request }) => {
    const res = await request.fetch(`${API_BASE}/api/novel/bootstrap`, {
      method: 'OPTIONS',
      headers: { origin: ALLOWED_ORIGIN },
    });

    expect(res.status()).toBe(204);
    expect(res.headers()['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  test('06 OPTIONS 预检，恶意 Origin：403', async ({ request }) => {
    const res = await request.fetch(`${API_BASE}/api/novel/bootstrap`, {
      method: 'OPTIONS',
      headers: { origin: EVIL_ORIGIN },
    });

    // F074 之前 OPTIONS 无脑返回 204，预检都拦不住。
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toContain('origin not allowed');
  });
});

test.describe('API 契约 · 请求体上限与错误码', () => {
  test('07 超过 2MB 的请求体：拒绝且数据库未变更', async ({ request }) => {
    test.setTimeout(30000); // 3MB 请求体 + 服务端中断连接，留足时间

    const tk = token('oversize');
    const before = countOwn(await fetchChapters(request), tk);

    // X5 实测：无上限时 50MB 请求会被完整读入内存，堆占用 109MB。
    const oversize = 'x'.repeat(3 * 1024 * 1024);

    let status = null;
    let thrown = null;
    try {
      const res = await request.post(`${API_BASE}/api/novel/chapters`, {
        data: { title: `F077-${tk}`, content: oversize },
      });
      status = res.status();
    } catch (error) {
      // 服务端发出 413 后会主动 destroy 连接，客户端可能只看到
      // socket hang up / ECONNRESET 而收不到响应体。两种表现都算防护生效，
      // 真正的判据是下面这条：数据不能被写进去。
      thrown = error;
    }

    if (thrown) {
      expect(thrown.message, '连接被中断应伴随错误信息，便于定位').toBeTruthy();
    } else {
      expect(status, '超限请求应返回 413').toBe(413);
    }

    expect(countOwn(await fetchChapters(request), tk), '超限请求不应写入任何章节').toBe(before);

    // 服务端被大请求打过之后必须还活着，否则等于被一发请求打挂。
    const alive = await request.get(`${API_BASE}/api/novel/bootstrap`);
    expect(alive.status(), '遭遇超限请求后服务仍应可用').toBe(200);
  });

  test('08 不存在的端点：404', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/novel/does-not-exist`);

    expect(res.status()).toBe(404);
    expect((await res.json()).error).toContain('not found');
  });

  test('09 不存在的章节：404', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/novel/chapters/999999/save`, {
      data: { content: '不该被保存' },
    });

    // 不能返回 200 —— 否则前端会以为存稿成功，用户直接丢稿。
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toContain('chapter not found');
  });
});

test.describe('API 契约 · 草稿态与版本态（F076）', () => {
  test('10 草稿语义：连打 10 次 /draft 不新增版本行，但正文已更新', async ({ request }) => {
    const tk = token('draft');
    const chapter = await createChapter(request, tk, '初稿内容');
    const before = await fetchVersions(request, chapter.id);

    for (let i = 1; i <= 10; i += 1) {
      const res = await request.post(`${API_BASE}/api/novel/chapters/${chapter.id}/draft`, {
        data: { content: `第 ${i} 次自动保存` },
      });
      // 每次都要 200 —— 自动保存失败一次，用户就丢一段稿。
      expect(res.status(), `第 ${i} 次草稿保存应成功`).toBe(200);
    }

    const after = await fetchVersions(request, chapter.id);
    // X4 实测：2h 写作 × 3s 防抖 = 单章 360 个版本 / 3.18MB。
    // 草稿通道的立身之本就是「只 UPDATE 主表、不写 chapter_versions」。
    expect(after, '草稿保存不应新增任何版本行').toHaveLength(before.length);

    const fresh = (await fetchChapters(request)).find((item) => item.id === chapter.id);
    expect(fresh.content, '正文应更新为最后一次草稿').toBe('第 10 次自动保存');
  });

  test('11 版本语义：/save 一次新增 1 个 manual 版本', async ({ request }) => {
    const tk = token('save');
    const chapter = await createChapter(request, tk, '初稿内容');

    // 先模拟真实写作：10 次自动保存不应留下任何版本
    for (let i = 1; i <= 10; i += 1) {
      await request.post(`${API_BASE}/api/novel/chapters/${chapter.id}/draft`, {
        data: { content: `草稿 ${i}` },
      });
    }
    const before = await fetchVersions(request, chapter.id);

    const res = await request.post(`${API_BASE}/api/novel/chapters/${chapter.id}/save`, {
      data: { content: '手动存稿内容' },
    });
    expect(res.status(), '手动存稿应成功').toBe(200);

    const after = await fetchVersions(request, chapter.id);
    // 关键区分点：/draft 不进版本表，/save 必须进 —— 否则里程碑快照就丢了。
    expect(after, '手动存稿应恰好新增 1 个版本').toHaveLength(before.length + 1);
    expect(after[0].kind, '手动存稿的版本类型应为 manual').toBe('manual');
    expect(after[0].content).toBe('手动存稿内容');
  });

  test('12 创建章节时初始化 auto 版本', async ({ request }) => {
    const chapter = await createChapter(request, token('init'), '初始正文');

    const versions = await fetchVersions(request, chapter.id);
    expect(versions, '新章节应有且仅有 1 个初始版本').toHaveLength(1);
    // kind='auto'：区分「自动草稿版本」与「里程碑快照」，供版本列表筛选展示。
    expect(versions[0].kind).toBe('auto');
    expect(versions[0].name).toBe('初始版本');
    expect(versions[0].content).toBe('初始正文');
  });
});

test.describe('API 契约 · 迁移框架（T004）', () => {
  test('13 迁移幂等：重复启动服务后 user_version 稳定为 1', async ({ request }) => {
    expect(readUserVersion(), '服务首次启动应已完成 v1 迁移').toBe(1);

    // 再「启动一次服务」：import novel-db.js 等价于 API 进程启动时的
    // initDb + migrate。若迁移不幂等（例如重复 ALTER TABLE 未容错），
    // 这里会直接抛错、退出码非 0。
    const restart = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', "await import('./server/novel-db.js');"],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, NOVEL_DB_PATH: TEST_DB_PATH },
        encoding: 'utf8',
      }
    );
    expect(restart.status, `第二次启动不应失败：${restart.stderr || ''}`).toBe(0);

    expect(readUserVersion(), '重复启动后 schema 版本号不应漂移').toBe(1);

    // 幂等不等于可用：确认在线服务仍然正常响应。
    const res = await request.get(`${API_BASE}/api/novel/bootstrap`);
    expect(res.status()).toBe(200);
  });
});
