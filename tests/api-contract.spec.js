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
  test('13 迁移幂等：重复启动服务后 user_version 稳定为 3', async ({ request }) => {
    // v1 = F075 密钥列 + F086 版本语义；v2 = 外键性能索引；v3 = F088 检索索引重建
    expect(readUserVersion(), '服务首次启动应已完成 v3 迁移').toBe(3);

    // 再「启动一次服务」：import novel-db.js 等价于 API 进程启动时的
    // initDb + migrate。若迁移不幂等（例如重复建索引未容错），
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

    expect(readUserVersion(), '重复启动后 schema 版本号不应漂移').toBe(3);

    // 幂等不等于可用：确认在线服务仍然正常响应。
    const res = await request.get(`${API_BASE}/api/novel/bootstrap`);
    expect(res.status()).toBe(200);
  });
});

test.describe('API 契约 · 导出导入回灌（F078 / T008）', () => {
  test('14 导出项目：全量数据集合且不携带密钥材料', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/novel/export/project`);
    expect(res.status()).toBe(200);
    const data = await res.json();

    // formatVersion 是导入侧拒识旧/新格式的唯一依据；schemaVersion 用于升级排障。
    expect(data.formatVersion, '导出必须携带格式版本').toBe(1);
    expect(data.schemaVersion, '导出应记录导出时的 schema 版本').toBeGreaterThanOrEqual(1);
    expect(typeof data.exportedAt).toBe('string');

    // 历史版本只导 6 块数据，作为逃生通道不完整 —— 现在必须覆盖全部业务表。
    for (const field of ['chapters', 'chapterVersions', 'characters', 'relations', 'knowledge',
      'aiTasks', 'aiFeedback', 'publishTasks', 'platforms', 'prompts', 'writingGoals',
      'writingProgress', 'todos', 'annotations', 'glossary', 'sensitiveRules', 'timeline', 'scenes', 'world']) {
      expect(Array.isArray(data[field]), `导出应包含 ${field} 集合`).toBe(true);
    }

    // 种子项目固定 3 章 3 角色 3 关系。章节数只能下界断言 —— 并行的草稿/存稿用例
    // 会合法地往种子项目里建章；角色/关系没有别的写入方，可以精确断言。
    expect(data.chapters.length, '种子章节应全部在导出中').toBeGreaterThanOrEqual(3);
    for (const seedTitle of ['第 10 章 · 黑潮钟声', '第 11 章 · 秘仪学院', '第 12 章 · 钟楼下的背叛']) {
      expect(data.chapters.some((chapter) => chapter.title === seedTitle), `导出应包含 ${seedTitle}`).toBe(true);
    }
    expect(data.chapterVersions.length).toBeGreaterThanOrEqual(3);
    expect(data.characters).toHaveLength(3);
    expect(data.relations).toHaveLength(3);

    // 密钥材料永不进导出（F073/F075 的延续）：sanitizeProject 白名单剔除。
    const projectJson = JSON.stringify(data.project);
    expect(projectJson, '导出 JSON 不得包含密文列').not.toContain('api_key_cipher');
    expect(projectJson, '导出 JSON 不得包含盐列').not.toContain('api_key_salt');
  });

  test('15 导入校验：非导出 JSON / 不认识的格式版本一律 400 且不落库', async ({ request }) => {
    // 数组不是合法的导出对象
    const notExport = await request.post(`${API_BASE}/api/novel/import`, { data: [1, 2, 3] });
    expect(notExport.status(), '非对象载荷应被拒绝').toBe(400);
    expect((await notExport.json()).error).toContain('项目 JSON');

    // 有格式版本但缺 project 字段
    const noProject = await request.post(`${API_BASE}/api/novel/import`, {
      data: { formatVersion: 1 },
    });
    expect(noProject.status(), '缺少 project 字段应被拒绝').toBe(400);
    expect((await noProject.json()).error).toContain('project');

    // 未来格式版本必须显式拒绝而不是猜
    const futureVersion = await request.post(`${API_BASE}/api/novel/import`, {
      data: { formatVersion: 99, project: { title: '未来格式' }, chapters: [] },
    });
    expect(futureVersion.status()).toBe(400);
    expect((await futureVersion.json()).error).toContain('格式版本');

    // 拒绝要拒绝得干净：服务必须仍然健康（不留下半截导入状态）。
    const alive = await request.get(`${API_BASE}/api/novel/bootstrap`);
    expect(alive.status(), '非法导入后服务应保持可用').toBe(200);
  });

  test('16 导入为新项目：全量重映射 ID，可经 ?projectId= 再次导出比对', async ({ request }) => {
    const snapshot = await (await request.get(`${API_BASE}/api/novel/export/project`)).json();

    const importRes = await request.post(`${API_BASE}/api/novel/import`, {
      data: { ...snapshot, mode: 'new' },
    });
    expect(importRes.status()).toBe(201);
    const result = await importRes.json();

    expect(result.mode).toBe('new');
    expect(result.projectId, '导入必须生成新项目，绝不复用现有项目 id').toBeGreaterThan(1);
    expect(result.backupPath, '导入前必须留下整库备份').toContain('backups');
    expect(result.summary.chapters).toBe(snapshot.chapters.length);

    // ?projectId= 是 F078 为导出加的参数：没有它，新导入的项目无法验证也无法再导出。
    const roundTripRes = await request.get(`${API_BASE}/api/novel/export/project?projectId=${result.projectId}`);
    expect(roundTripRes.status()).toBe(200);
    const roundTrip = await roundTripRes.json();
    expect(roundTrip.project.id).toBe(result.projectId);
    expect(roundTrip.project.title).toBe(snapshot.project.title);

    // ID 已重映射，但内容逐项一致（章节按导出顺序对比）。
    expect(roundTrip.chapters).toHaveLength(snapshot.chapters.length);
    roundTrip.chapters.forEach((chapter, index) => {
      expect(chapter.title).toBe(snapshot.chapters[index].title);
      expect(chapter.content).toBe(snapshot.chapters[index].content);
      expect(chapter.version, '章节版本号应原样保留').toBe(snapshot.chapters[index].version);
    });
    expect(roundTrip.chapterVersions).toHaveLength(snapshot.chapterVersions.length);
    expect(roundTrip.characters).toHaveLength(snapshot.characters.length);
    expect(roundTrip.relations).toHaveLength(snapshot.relations.length);
    expect(roundTrip.publishTasks).toHaveLength(snapshot.publishTasks.length);

    // 项目知识全部回灌；global 共享数据「存在即跳过」，不应重复插入。
    const projectScoped = snapshot.knowledge.filter((entry) => entry.scope === 'project');
    expect(roundTrip.knowledge.filter((entry) => entry.scope === 'project')).toHaveLength(projectScoped.length);
  });

  test('17 覆盖模式：目标项目数据被整体替换，其他项目不受影响', async ({ request }) => {
    const tk = token('import-replace');
    // 建一个牺牲项目作为覆盖目标 —— 绝不覆盖 bootstrap 项目，
    // 否则并行 worker 正在往种子里写章节，两边都会 flaky。
    const created = await request.post(`${API_BASE}/api/novel/projects`, {
      data: { title: `F078-${tk}` },
    });
    expect(created.status()).toBe(201);
    const target = (await created.json()).project;

    const targetSnapshot = await (await request.get(`${API_BASE}/api/novel/export/project?projectId=${target.id}`)).json();
    expect(targetSnapshot.chapters, '新建项目自带 1 章（createProject 的初始章节）').toHaveLength(1);

    const seedSnapshot = await (await request.get(`${API_BASE}/api/novel/export/project`)).json();

    const importRes = await request.post(`${API_BASE}/api/novel/import`, {
      data: { ...seedSnapshot, mode: 'replace', projectId: target.id },
    });
    expect(importRes.status()).toBe(201);
    const result = await importRes.json();
    expect(result.mode).toBe('replace');
    expect(result.projectId, '覆盖模式必须保持项目 id 不变').toBe(target.id);

    const replaced = await (await request.get(`${API_BASE}/api/novel/export/project?projectId=${target.id}`)).json();
    // 项目行只改内容字段，id 与归属不变；业务子树被来源快照整体替换。
    expect(replaced.project.id).toBe(target.id);
    expect(replaced.project.title).toBe(seedSnapshot.project.title);
    expect(replaced.chapters).toHaveLength(seedSnapshot.chapters.length);
    replaced.chapters.forEach((chapter, index) => {
      expect(chapter.title).toBe(seedSnapshot.chapters[index].title);
      expect(chapter.content).toBe(seedSnapshot.chapters[index].content);
    });
    expect(replaced.chapterVersions).toHaveLength(seedSnapshot.chapterVersions.length);
    expect(replaced.characters).toHaveLength(seedSnapshot.characters.length);

    // 覆盖目标之外的 bootstrap 项目应毫发无损：标题不被改写即为守恒判据
    // （章节数不能当判据 —— 并行用例会合法地往种子里建章）。
    const bootstrap = await (await request.get(`${API_BASE}/api/novel/export/project`)).json();
    expect(bootstrap.project.title).toBe(seedSnapshot.project.title);
    expect(bootstrap.project.id).toBe(seedSnapshot.project.id);
  });
});

test.describe('API 契约 · 多项目上下文（F079 / T011）', () => {
  test('18 bootstrap 携带项目列表，默认行为与旧请求一致', async ({ request }) => {
    const data = await (await request.get(`${API_BASE}/api/novel/bootstrap`)).json();

    expect(Array.isArray(data.projects), 'bootstrap 应携带项目列表供切换器使用').toBe(true);
    expect(data.projects.length).toBeGreaterThanOrEqual(1);
    // 默认（无 projectId）= id 最小的项目 —— 旧请求零破坏（F079 验收项）
    expect(data.project.id).toBe(Math.min(...data.projects.map((project) => project.id)));
    expect(data.projects[0]).toHaveProperty('chapter_count');
  });

  test('19 ?projectId= 指定项目：数据完全隔离', async ({ request }) => {
    const tk = token('ctx');
    const created = await request.post(`${API_BASE}/api/novel/projects`, {
      data: { title: `F079-${tk}` },
    });
    expect(created.status()).toBe(201);
    const target = (await created.json()).project;

    // 写端点必须尊重 ?projectId=：往新项目里建一章
    const chapter = await request.post(`${API_BASE}/api/novel/chapters?projectId=${target.id}`, {
      data: { title: `F079 章-${tk}`, content: '隔离内容' },
    });
    expect(chapter.status(), '带 projectId 的写入应落到指定项目').toBe(201);

    // 新项目的 bootstrap：只见自己的章（createProject 自带 1 初始章 + 本用例写入 1 章）
    const scoped = await (await request.get(`${API_BASE}/api/novel/bootstrap?projectId=${target.id}`)).json();
    expect(scoped.project.id).toBe(target.id);
    expect(scoped.chapters.some((c) => c.title === `F079 章-${tk}`), '写入应落到指定项目').toBe(true);
    expect(scoped.chapters.some((c) => c.title.startsWith('第 1 章')), '初始章应在新项目内').toBe(true);

    // 种子项目（默认 bootstrap）不受影响：新项目的章不得串进来
    const fallback = await (await request.get(`${API_BASE}/api/novel/bootstrap`)).json();
    expect(fallback.project.id).not.toBe(target.id);
    expect(fallback.chapters.some((c) => c.title === `F079 章-${tk}`), '其他项目的章节不得串进默认项目').toBe(false);
  });

  test('20 X-Project-Id 请求头与查询参数等效', async ({ request }) => {
    const created = await request.post(`${API_BASE}/api/novel/projects`, {
      data: { title: `F079-${token('hdr')}` },
    });
    const target = (await created.json()).project;

    const byHeader = await request.get(`${API_BASE}/api/novel/bootstrap`, {
      headers: { 'x-project-id': String(target.id) },
    });
    expect(byHeader.status()).toBe(200);
    expect((await byHeader.json()).project.id).toBe(target.id);
  });

  test('21 非法 projectId 回落默认，不存在的 projectId 显式 404', async ({ request }) => {
    // 非数字格式 = 「未表达意图」→ 回落默认项目（设计约定，不算错误）
    const badFormat = await request.get(`${API_BASE}/api/novel/bootstrap?projectId=abc`);
    expect(badFormat.status(), '格式非法应回落默认项目而不是报错').toBe(200);
    expect((await badFormat.json()).project.id).toBe((await (await request.get(`${API_BASE}/api/novel/bootstrap`)).json()).project.id);

    // 不存在 = 「意图指向虚空」→ 404，写端点同样拦截
    // （静默回落会让用户在错误的项目里继续写稿，比 404 危险得多）
    const missing = await request.get(`${API_BASE}/api/novel/bootstrap?projectId=999999`);
    expect(missing.status()).toBe(404);
    const write = await request.post(`${API_BASE}/api/novel/chapters?projectId=999999`, {
      data: { title: 'x', content: 'x' },
    });
    expect(write.status(), '写入不存在的项目必须被拦截').toBe(404);
  });
});

test.describe('API 契约 · 中文检索升级（F088 / T012）', () => {
  test('22 中文 2 字词可召回：知识、章节、多实体命中', async ({ request }) => {
    // 种子数据：项目知识《黑潮》、第 12 章正文含「黑潮不是灾难」。
    // 2 字词「黑潮」必须能召回前两者 —— unicode61 时代召回 3/10，这就是升级的意义
    const res = await request.get(`${API_BASE}/api/novel/search?q=${encodeURIComponent('黑潮')}`);
    expect(res.status()).toBe(200);
    const result = await res.json();

    expect(result.knowledge.some((entry) => entry.title === '黑潮'), '知识条目《黑潮》应命中').toBe(true);
    expect(result.chapters.some((chapter) => chapter.title === '第 12 章 · 钟楼下的背叛'), '正文含黑潮的章节应命中').toBe(true);
    expect(result.network, '假网络文献已随 T012 移除').toBeUndefined();
  });

  test('23 字面后过滤：散落 token 的 FTS 误召必须被剔除', async ({ request }) => {
    const tk = token('fts');
    // FTS5 对「青鸾密码」是 AND 语义（青鸾+鸾密+密码 各自出现即命中），
    // 因此「青鸾鸟的鸾密档案里藏着密码」会进候选 —— 但它不含连续子串
    // 「青鸾密码」，后过滤必须把它剔掉。这正是两段式检索的意义。
    const created = await request.post(`${API_BASE}/api/novel/knowledge`, {
      data: { scope: 'project', title: `散落命中-${tk}`, body: '青鸾鸟的鸾密档案里藏着密码', source: '检索测试', tags: [] },
    });
    expect(created.status()).toBe(201);

    const result = await (await request.get(`${API_BASE}/api/novel/search?q=${encodeURIComponent('青鸾密码')}`)).json();
    expect(result.knowledge.some((entry) => entry.title.startsWith('散落命中')), '散落 token 的候选应被字面后过滤剔除').toBe(false);

    // 连续子串的真实命中不受影响（T024 用例会在章节侧再验一次）
    expect(result.query).toBe('青鸾密码');

    // 2 字查询是严格子串语义：「黑潮生」包含「黑潮」，会一并命中 ——
    // 按实体边界排除（负例词典/提及管理）属于 T013，不在检索层做。
    // 这里只验证全名可召回（后过滤不误杀）：
    const created2 = await request.post(`${API_BASE}/api/novel/knowledge`, {
      data: { scope: 'project', title: `黑潮生-${tk}`, body: '港口的老渔民', source: '检索测试', tags: [] },
    });
    expect(created2.status()).toBe(201);
    const fullResult = await (await request.get(`${API_BASE}/api/novel/search?q=${encodeURIComponent('黑潮生')}`)).json();
    expect(fullResult.knowledge.some((entry) => entry.title.startsWith('黑潮生')), '搜全名应召回').toBe(true);
  });

  test('24 章节正文与标题检索，且项目隔离', async ({ request }) => {
    const tk = token('chap-fts');
    // 「青鸾密码」种子数据不含，命中即为本用例写入（bigram：青鸾 + 鸾密 + 密码 AND 命中）
    const marker = '青鸾密码';
    const created = await request.post(`${API_BASE}/api/novel/chapters`, {
      data: { title: `检索章-${tk}`, content: `雾港深处藏着${marker}的线索。` },
    });
    expect(created.status()).toBe(201);
    const chapterId = (await created.json()).chapter.id;

    const byBody = await (await request.get(`${API_BASE}/api/novel/search?q=${encodeURIComponent(marker)}`)).json();
    expect(byBody.chapters.some((chapter) => chapter.id === chapterId), '正文关键词应命中章节').toBe(true);
    expect(byBody.chapters[0], '章节结果不回传正文（定位信息即可）').not.toHaveProperty('content');

    const byTitle = await (await request.get(`${API_BASE}/api/novel/search?q=${encodeURIComponent('检索章')}`)).json();
    expect(byTitle.chapters.some((chapter) => chapter.id === chapterId), '标题应命中章节').toBe(true);

    // 项目隔离：在其他项目里搜同一关键词，不得串出本项目章节
    const project = await request.post(`${API_BASE}/api/novel/projects`, { data: { title: `F088-${tk}` } });
    const otherProjectId = (await project.json()).project.id;
    const scoped = await (await request.get(`${API_BASE}/api/novel/search?projectId=${otherProjectId}&q=${encodeURIComponent(marker)}`)).json();
    expect(scoped.chapters.some((chapter) => chapter.id === chapterId), '其他项目不得搜到本项目章节').toBe(false);
  });
});
