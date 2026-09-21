/**
 * M6 新功能 API 契约测试（F083 大纲/Plot Grid · F084 伏笔 · F085 调度器 · F092 多格式导出）。
 *
 * 为什么单独开一个文件而不是往 api-contract.spec.js 里追加：
 *   原文件 846 行已经是「按需求批次分组」的结构（F074/F076/F078/F079/F080/F081/F082），
 *   M6 有 4 个独立需求、21 条用例，塞进去会让文件再膨胀一倍、编号体系也断掉
 *   （原文件用例编号到 33）。独立文件 + 延续编号（34 起）更好定位。
 *
 * 隔离策略（关键）：
 *   M6 的排序/归类端点要求「全量覆盖」载荷（reorderChapters / assignScenes
 *   都校验 id 集合与项目现有集合完全相等）。种子项目会被 api-contract.spec.js
 *   的并行用例持续建章，在那里做全量断言必然偶发 400。因此本文件**每条用例
 *   自建专属项目**，用 ?projectId= 限定作用域 —— 既有 33 条用例零影响。
 *
 * 「导入回灌后顺序不漂移」为什么必须测：
 *   v7 迁移引入 sort_order 作为权威顺序后，export/import 若漏带该列，
 *   回灌后章节会退回 id 序 —— 用户辛苦排好的卷序一夜回到解放前。
 *   这是排序契约最容易回归、也最难被人工发现的一处。
 *
 * @module tests/api-m6.spec.js
 */

import { test, expect } from '@playwright/test';
import { API_BASE, EVIL_ORIGIN } from './test-env.js';

/** 全局唯一标记：并发 worker 同时建数据时，断言只统计「自己」的数据。 */
function token(label) {
  return `${label}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 建一个专属项目，返回 id。M6 用例一律不碰种子项目（并行写会污染全量载荷断言）。 */
async function makeProject(request, label) {
  const res = await request.post(`${API_BASE}/api/novel/projects`, { data: { title: label } });
  expect(res.status(), '建专属项目应成功').toBe(201);
  return (await res.json()).project.id;
}

/** 在指定项目里建章，返回 {id, title}。 */
async function makeChapter(request, projectId, title, content = '正文内容。') {
  const res = await request.post(`${API_BASE}/api/novel/chapters?projectId=${projectId}`, {
    data: { title, content },
  });
  expect(res.status(), `建章《${title}》应成功`).toBe(201);
  return (await res.json()).chapter;
}

/** 取大纲数据包（GET /outline）。 */
async function outline(request, projectId) {
  const res = await request.get(`${API_BASE}/api/novel/outline?projectId=${projectId}`);
  expect(res.status()).toBe(200);
  return res.json();
}

/** audit_logs.payload 在库里是 JSON 字符串，统一解析后再比对。 */
function payloadOf(log) {
  return typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
}

/**
 * 读取 ZIP 流的第一个本地文件头（local file header）。
 * 为什么手写解析：EPUB 的合法性命门是「第一个条目必须是 STORED 的 mimetype」——
 * 只断言 `body.includes('mimetype')` 无法区分「STORED 首条目」与「被 deflate 的
 * 第十个条目」。必须读出压缩方法（偏移 8）与文件名（偏移 30）才能证明格式合法。
 */
function firstZipEntry(buf) {
  return {
    signature: buf.readUInt32LE(0),
    method: buf.readUInt16LE(8),      // 0 = STORED，8 = DEFLATED
    compressedSize: buf.readUInt32LE(18),
    nameLength: buf.readUInt16LE(26),
    extraLength: buf.readUInt16LE(28),
    name: buf.toString('utf8', 30, 30 + buf.readUInt16LE(26)),
    data: buf.toString('utf8', 30 + buf.readUInt16LE(26) + buf.readUInt16LE(28),
      30 + buf.readUInt16LE(26) + buf.readUInt16LE(28) + buf.readUInt32LE(18)),
  };
}

/* ══════════════════ F083 大纲树 / 场景卡片 / 情节网格 ══════════════════ */

test.describe('M6 · 大纲与排序契约（F083）', () => {
  test('34 大纲数据包：章节按 sort_order 返回并带 1 起连续序号', async ({ request }) => {
    const projectId = await makeProject(request, `F083-大纲-${token('ol')}`);
    // createProject 自带 1 章，再建 2 章凑 3 章
    await makeChapter(request, projectId, 'A 章');
    await makeChapter(request, projectId, 'B 章');

    const data = await outline(request, projectId);

    expect(data.chapters, '大纲应返回全部 3 章').toHaveLength(3);
    // ordinal 由服务端按权威顺序（sort_order, id）现算，前端不参与计算 —— 这是契约
    expect(data.chapters.map((c) => c.ordinal)).toEqual([1, 2, 3]);
    // sort_order 必须严格递增，否则 ORDER BY sort_order 会与插入序不一致。
    // 注意：createProject 的初始章走列默认值 sort_order=0（未显式赋值），
    // 因此新项目的实际取值是 0..n-1 而非 1..n —— 排序语义不受影响，
    // 但与 v7 回填口径不一致，已作为 P3 观察项记录（详见 doc/testing-docs）。
    const sortOrders = data.chapters.map((c) => c.sort_order);
    expect(sortOrders, 'sort_order 应严格递增（权威顺序）').toEqual([...sortOrders].sort((x, y) => x - y));
    expect(new Set(sortOrders).size, 'sort_order 不得重复').toBe(3);
    // 三视图共用同一包数据：缺任何一块，卡片/网格就会渲染成空
    for (const field of ['scenes', 'foreshadows', 'plotLines', 'beats']) {
      expect(Array.isArray(data[field]), `大纲应包含 ${field}`).toBe(true);
    }
    // 大纲刻意不回传正文（200 章 × 3KB 只为渲染卡片是浪费），只给字数
    expect(data.chapters[0]).not.toHaveProperty('content');
    expect(data.chapters[0]).toHaveProperty('char_count');
  });

  test('35 章节拖拽重排：改顺序后持久化，再次拉取顺序保持', async ({ request }) => {
    const projectId = await makeProject(request, `F083-重排-${token('reorder')}`);
    const a = await makeChapter(request, projectId, 'A 章');
    const b = await makeChapter(request, projectId, 'B 章');

    const before = await outline(request, projectId);
    const ids = before.chapters.map((c) => c.id);
    // 整体倒序：最直观的「顺序确实被改写」判据
    const res = await request.post(`${API_BASE}/api/novel/chapters/reorder?projectId=${projectId}`, {
      data: { items: [...ids].reverse().map((id) => ({ id })) },
    });
    expect(res.status()).toBe(200);
    const reordered = (await res.json()).chapters;
    expect(reordered.map((c) => c.id), '响应应返回重排后的权威顺序').toEqual([...ids].reverse());
    expect(reordered.map((c) => c.sort_order), '序号应压实为 1..n（不留空洞）').toEqual([1, 2, 3]);

    // 持久化的唯一判据：重新拉取仍然是新顺序（而不是只改了内存）
    const after = await outline(request, projectId);
    expect(after.chapters.map((c) => c.id)).toEqual([...ids].reverse());
    expect(after.chapters.map((c) => c.ordinal)).toEqual([1, 2, 3]);

    // 第二个读取方（bootstrap）也必须同序 —— 否则编辑器左侧章序与大纲打架
    const bootstrap = await (await request.get(`${API_BASE}/api/novel/bootstrap?projectId=${projectId}`)).json();
    expect(bootstrap.chapters.map((c) => c.id), 'bootstrap 应与大纲同序').toEqual([...ids].reverse());

    // 倒序后首章必然是原来最后建的 B 章 —— 证明拖拽确实生效而非被忽略
    expect(after.chapters[0].id, '倒序后首位应是原来的末位章节').toBe(b.id);
  });

  test('36 章节重排载荷非法：一律 400 且库中顺序分毫未动', async ({ request }) => {
    const projectId = await makeProject(request, `F083-非法-${token('bad')}`);
    await makeChapter(request, projectId, 'A 章');
    const otherProjectId = await makeProject(request, `F083-他项目-${token('other')}`);
    const foreign = await makeChapter(request, otherProjectId, '他项目章');

    const before = await outline(request, projectId);
    const ids = before.chapters.map((c) => c.id);

    const cases = [
      ['缺一章（部分提交会把序号写散）', ids.slice(0, 1)],
      ['多一章（含不属于本项目的 id）', [...ids, foreign.id]],
      ['重复 id', [...ids, ids[0]]],
      ['空数组', []],
    ];
    for (const [label, items] of cases) {
      const res = await request.post(`${API_BASE}/api/novel/chapters/reorder?projectId=${projectId}`, {
        data: { items: items.map((id) => ({ id })) },
      });
      expect(res.status(), `${label} 应被拒绝`).toBe(400);
      expect((await res.json()).error).toContain('invalid chapter order');
    }

    // 拒绝要拒绝得干净：顺序不能被写坏
    const after = await outline(request, projectId);
    expect(after.chapters.map((c) => c.id), '非法载荷不得改动任何顺序').toEqual(ids);
  });

  test('37 场景归属：新建 → 归入章节 → 移回未分配，且跨项目章节被拒', async ({ request }) => {
    const projectId = await makeProject(request, `F083-场景-${token('scene')}`);
    const target = await makeChapter(request, projectId, '目标章');
    const otherProjectId = await makeProject(request, `F083-场景他项目-${token('scene2')}`);
    const foreignChapter = await makeChapter(request, otherProjectId, '他项目章');

    const s1 = await (await request.post(`${API_BASE}/api/novel/scenes?projectId=${projectId}`, {
      data: { name: `场景甲-${token('s1')}`, mood: '阴冷', description: '铜管布满水痕。' },
    })).json();
    const s2 = await (await request.post(`${API_BASE}/api/novel/scenes?projectId=${projectId}`, {
      data: { name: `场景乙-${token('s2')}`, mood: '潮湿', description: '地下传来反向海潮声。' },
    })).json();

    const initial = await outline(request, projectId);
    expect(initial.scenes, '两个场景都应出现在大纲里').toHaveLength(2);
    expect(initial.scenes.every((s) => s.chapter_id === null), '新建场景默认未分配（chapter_id 为 null）').toBe(true);

    // 全量覆盖式归类：s1 → 目标章，s2 → 未分配
    const res = await request.post(`${API_BASE}/api/novel/scenes/reorder?projectId=${projectId}`, {
      data: { items: [{ id: s1.scene.id, chapterId: target.id }, { id: s2.scene.id, chapterId: null }] },
    });
    expect(res.status()).toBe(200);
    const assigned = (await res.json()).scenes;
    expect(assigned.find((s) => s.id === s1.scene.id).chapter_id, 's1 应归入目标章').toBe(target.id);
    expect(assigned.find((s) => s.id === s2.scene.id).chapter_id, 's2 应留在未分配桶').toBe(null);

    const persisted = await outline(request, projectId);
    expect(persisted.scenes.find((s) => s.id === s1.scene.id).chapter_id, '归属应已持久化').toBe(target.id);
    // 章节侧的场景计数跟着变（大纲树的「N 场景」就不能是脏的）
    expect(persisted.chapters.find((c) => c.id === target.id).scene_count).toBe(1);

    // 移回未分配：chapterId = null
    await request.post(`${API_BASE}/api/novel/scenes/reorder?projectId=${projectId}`, {
      data: { items: [{ id: s1.scene.id, chapterId: null }, { id: s2.scene.id, chapterId: null }] },
    });
    const back = await outline(request, projectId);
    expect(back.scenes.every((s) => s.chapter_id === null), '可再移回未分配').toBe(true);

    // 越权：把本项目场景挂到他项目的章节上，必须 400
    const evil = await request.post(`${API_BASE}/api/novel/scenes/reorder?projectId=${projectId}`, {
      data: { items: [{ id: s1.scene.id, chapterId: foreignChapter.id }, { id: s2.scene.id, chapterId: null }] },
    });
    expect(evil.status(), '跨项目章节归属必须被拒绝').toBe(400);
  });

  test('38 情节线 CRUD 与节拍矩阵：创建/打点/覆盖/清除/删除连带节拍', async ({ request }) => {
    const projectId = await makeProject(request, `F083-节拍-${token('beat')}`);
    const chapter = await makeChapter(request, projectId, '矩阵章');

    // 空标题 → 400（否则矩阵会出现一行无名情节线，用户不知道自己在标什么）
    const blank = await request.post(`${API_BASE}/api/novel/plotlines?projectId=${projectId}`, { data: { title: '   ' } });
    expect(blank.status(), '空标题应被拒绝').toBe(400);

    const line1 = await (await request.post(`${API_BASE}/api/novel/plotlines?projectId=${projectId}`, {
      data: { title: `主线-${token('l1')}` },
    })).json();
    expect(line1.plotLine.color, '未指定颜色应回落默认紫').toBe('#8b5cf6');
    expect(line1.plotLine.sort_order).toBe(1);

    const line2 = await (await request.post(`${API_BASE}/api/novel/plotlines?projectId=${projectId}`, {
      data: { title: `支线-${token('l2')}`, color: '#ff8800' },
    })).json();
    expect(line2.plotLine.color, '合法 hex 颜色应保留').toBe('#ff8800');
    expect(line2.plotLine.sort_order).toBe(2);

    // 打点：progress
    const first = await request.post(`${API_BASE}/api/novel/plotbeats?projectId=${projectId}`, {
      data: { plotLineId: line1.plotLine.id, chapterId: chapter.id, mark: 'progress', notes: '钟声伏笔' },
    });
    expect(first.status()).toBe(200);
    expect((await first.json()).beats, '应写入 1 个节拍').toHaveLength(1);
    expect((await first.json()).beats[0].mark).toBe('progress');

    // 同（线 × 章）重复设置 = 覆盖，绝不产生第二行（否则矩阵一格会出现两个符号）
    const second = await request.post(`${API_BASE}/api/novel/plotbeats?projectId=${projectId}`, {
      data: { plotLineId: line1.plotLine.id, chapterId: chapter.id, mark: 'planned' },
    });
    const beats = (await second.json()).beats;
    expect(beats, '同格重复设置应覆盖而非新增').toHaveLength(1);
    expect(beats[0].mark).toBe('planned');

    // 非法 mark 归一化为 progress（防御前端传脏值）
    const weird = await request.post(`${API_BASE}/api/novel/plotbeats?projectId=${projectId}`, {
      data: { plotLineId: line1.plotLine.id, chapterId: chapter.id, mark: 'nonsense' },
    });
    expect((await weird.json()).beats[0].mark, '非法 mark 应归一化为 progress').toBe('progress');

    // mark = null → 清除该格
    const cleared = await request.post(`${API_BASE}/api/novel/plotbeats?projectId=${projectId}`, {
      data: { plotLineId: line1.plotLine.id, chapterId: chapter.id, mark: null },
    });
    expect((await cleared.json()).beats, 'mark=null 应清除该格节拍').toHaveLength(0);

    // 跨项目情节线 → 404（多项目隔离）
    const otherProjectId = await makeProject(request, `F083-节拍他项目-${token('beat2')}`);
    const foreign = await request.post(`${API_BASE}/api/novel/plotbeats?projectId=${otherProjectId}`, {
      data: { plotLineId: line1.plotLine.id, chapterId: chapter.id, mark: 'progress' },
    });
    expect(foreign.status(), '他项目的情节线不得被写入节拍').toBe(404);

    // 删除情节线：连带其节拍（先子后父）。先补一个节拍再删，验证级联
    await request.post(`${API_BASE}/api/novel/plotbeats?projectId=${projectId}`, {
      data: { plotLineId: line2.plotLine.id, chapterId: chapter.id, mark: 'progress' },
    });
    const removed = await request.post(`${API_BASE}/api/novel/plotlines/delete?projectId=${projectId}`, {
      data: { id: line2.plotLine.id },
    });
    expect(removed.status()).toBe(200);
    const afterDelete = await outline(request, projectId);
    expect(afterDelete.plotLines.map((l) => l.id), '情节线应被删除').not.toContain(line2.plotLine.id);
    expect(afterDelete.beats.filter((b) => b.plot_line_id === line2.plotLine.id), '其节拍应被级联删除').toHaveLength(0);

    const missing = await request.post(`${API_BASE}/api/novel/plotlines/delete?projectId=${projectId}`, {
      data: { id: 999999 },
    });
    expect(missing.status(), '删除不存在的情节线应 404').toBe(404);
  });

  test('39 导入回灌后章节顺序不漂移（v7 排序契约回归）', async ({ request }) => {
    const projectId = await makeProject(request, `F083-回灌-${token('roundtrip')}`);
    const a = await makeChapter(request, projectId, 'A 章');
    const b = await makeChapter(request, projectId, 'B 章');

    // 排成「初始章 → B → A」这种不按 id 也不按字母的自定义顺序
    const before = await outline(request, projectId);
    const initialId = before.chapters.find((c) => c.id !== a.id && c.id !== b.id).id;
    const customOrder = [initialId, b.id, a.id];
    await request.post(`${API_BASE}/api/novel/chapters/reorder?projectId=${projectId}`, {
      data: { items: customOrder.map((id) => ({ id })) },
    });
    // 再挂一条情节线 + 一个节拍，一并验证 F083 新增表是否随导出/导入往返
    const line = await (await request.post(`${API_BASE}/api/novel/plotlines?projectId=${projectId}`, {
      data: { title: `回灌线-${token('line')}` },
    })).json();
    await request.post(`${API_BASE}/api/novel/plotbeats?projectId=${projectId}`, {
      data: { plotLineId: line.plotLine.id, chapterId: a.id, mark: 'progress' },
    });

    const preImport = await outline(request, projectId);
    const snapshot = await (await request.get(`${API_BASE}/api/novel/export/project?projectId=${projectId}`)).json();
    expect(snapshot.chapters.map((c) => c.id), '导出章节必须按权威顺序（sort_order）').toEqual(customOrder);

    const imported = await (await request.post(`${API_BASE}/api/novel/import`, {
      data: { ...snapshot, mode: 'new' },
    })).json();
    expect(imported.projectId, '导入应生成新项目').toBeGreaterThan(0);

    const postImport = await outline(request, imported.projectId);
    // 核心断言：ID 全部重映射，但顺序与内容逐项一致 —— 顺序漂移 = 用户卷序被毁
    expect(postImport.chapters.map((c) => c.sort_order), '回灌后序号应压实为 1..n').toEqual([1, 2, 3]);
    expect(postImport.chapters.map((c) => c.title), '回灌后章节顺序不得漂移').toEqual(preImport.chapters.map((c) => c.title));
    expect(postImport.chapters.map((c) => c.id), 'ID 必须被重映射').not.toEqual(customOrder);
    expect(postImport.plotLines, '情节线应随项目回灌').toHaveLength(1);
    expect(postImport.beats, '节拍应随项目回灌').toHaveLength(1);
  });
});

/* ══════════════════ F084 伏笔与线索生命周期 ══════════════════ */

test.describe('M6 · 伏笔与线索生命周期（F084）', () => {
  test('41 登记伏笔：成功落库，空标题/非法章号 400，不存在或跨项目章节 404', async ({ request }) => {
    const projectId = await makeProject(request, `F084-登记-${token('fs')}`);
    const chapter = await makeChapter(request, projectId, '埋设章');
    const otherProjectId = await makeProject(request, `F084-他项目-${token('fs2')}`);
    const foreignChapter = await makeChapter(request, otherProjectId, '他项目章');

    const created = await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: chapter.id, title: '银色粉尘', content: '斗篷边缘的粉尘', expectedChapter: 99 },
    });
    expect(created.status()).toBe(201);
    const row = (await created.json()).foreshadow;
    expect(row.status, '新登记伏笔应为已埋设').toBe('planted');
    expect(row.chapter_id).toBe(chapter.id);
    expect(row.resolved_chapter).toBe(null);

    // 装饰字段（章节序号 / 逾期标记）以列表端点为准 —— 判定只在服务端做，
    // 前端一律读列表渲染。注意：POST 的创建响应是**未装饰**的原始行
    // （addForeshadow 直接返回 INSERT 后的裸行），与 GET 列表/流转响应不一致。
    // 当前前端只提示不读响应，暂无用户可见影响，已作为 P3 观察项记录。
    const listed = (await (await request.get(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`)).json()).foreshadows;
    const decorated = listed.find((f) => f.id === row.id);
    expect(decorated.chapter_ordinal, '列表应回带埋设章序号（初始章 + 本章 = 第 2 章）').toBe(2);
    expect(decorated.overdue, '预期章号远大于当前章数 → 未逾期').toBe(false);

    const blank = await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: chapter.id, title: '   ' },
    });
    expect(blank.status(), '空标题应 400').toBe(400);
    expect((await blank.json()).error).toContain('title is required');

    const badChapter = await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: chapter.id, title: '合法标题', expectedChapter: 0 },
    });
    expect(badChapter.status(), '预期章号必须是正整数').toBe(400);
    expect((await badChapter.json()).error).toContain('positive integer');

    const missingChapter = await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: 999999, title: '合法标题' },
    });
    expect(missingChapter.status(), '不存在的章节应 404').toBe(404);

    const foreignResult = await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: foreignChapter.id, title: '越权伏笔' },
    });
    expect(foreignResult.status(), '他项目章节不得作为埋设章（多项目隔离）').toBe(404);
  });

  test('42 状态机单向流转：planted → resolved / abandoned，终态再流转一律 400', async ({ request }) => {
    const projectId = await makeProject(request, `F084-状态机-${token('sm')}`);
    const chapter = await makeChapter(request, projectId, '埋设章');

    const mk = async (title) => (await (await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: chapter.id, title },
    })).json()).foreshadow;

    const resolvedRow = await mk(`回收测试-${token('r')}`);
    const resolved = await request.post(`${API_BASE}/api/novel/foreshadows/${resolvedRow.id}/resolve?projectId=${projectId}`);
    expect(resolved.status()).toBe(200);
    const resolvedBody = (await resolved.json()).foreshadow;
    expect(resolvedBody.status).toBe('resolved');
    expect(resolvedBody.resolved_chapter, '回收应记录实际发生时的最新章号').toBe(2);

    // 终态不可逆（如需改回，删除重登）—— 这是状态机的核心承诺
    const again = await request.post(`${API_BASE}/api/novel/foreshadows/${resolvedRow.id}/resolve?projectId=${projectId}`);
    expect(again.status(), '已回收再回收应 400').toBe(400);
    expect((await again.json()).error).toContain('终态');

    const abandonedRow = await mk(`废弃测试-${token('a')}`);
    await request.post(`${API_BASE}/api/novel/foreshadows/${abandonedRow.id}/abandon?projectId=${projectId}`);
    const crossTransition = await request.post(`${API_BASE}/api/novel/foreshadows/${abandonedRow.id}/resolve?projectId=${projectId}`);
    expect(crossTransition.status(), '已废弃再回收应 400').toBe(400);

    // 废弃不记录 resolved_chapter（只有回收才有「实际回收章」语义）
    const abandoned = await (await request.get(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`)).json();
    expect(abandoned.foreshadows.find((f) => f.id === abandonedRow.id).resolved_chapter).toBe(null);

    const missing = await request.post(`${API_BASE}/api/novel/foreshadows/999999/resolve?projectId=${projectId}`);
    expect(missing.status(), '不存在的伏笔应 404').toBe(404);
  });

  test('43 逾期判定在服务端：expected_chapter ≤ 章节数即逾期，并计入仪表盘统计', async ({ request }) => {
    const projectId = await makeProject(request, `F084-逾期-${token('od')}`);
    const chapter = await makeChapter(request, projectId, '埋设章'); // 共 2 章

    // 预期第 1 章回收 → 已经过了（当前 2 章）→ 逾期
    await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: chapter.id, title: `逾期伏笔-${token('over')}`, expectedChapter: 1 },
    });
    // 预期第 99 章 → 远未到期 → 不逾期
    await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: chapter.id, title: `未到期-${token('future')}`, expectedChapter: 99 },
    });

    const list = (await (await request.get(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`)).json()).foreshadows;
    const overdueRows = list.filter((f) => f.overdue);
    expect(overdueRows, '预期章号 ≤ 当前章数且仍为已埋设 → 逾期').toHaveLength(1);
    expect(overdueRows[0].title).toContain('逾期伏笔');
    // 未预期回收章号的伏笔永远不逾期（还不知道哪章回收，无从判定）
    expect(list.filter((f) => f.expected_chapter == null).every((f) => !f.overdue)).toBe(true);

    // 仪表盘口径必须与列表一致（前端两块 UI 不能一个说有、一个说没有）
    const stats = (await (await request.get(`${API_BASE}/api/novel/dashboard?projectId=${projectId}`)).json()).stats;
    expect(stats.foreshadowOverdue, '仪表盘逾期计数应与列表一致').toBe(overdueRows.length);

    // 回收后不再逾期：逾期是「该回收却没回收」，不是永久标签
    await request.post(`${API_BASE}/api/novel/foreshadows/${overdueRows[0].id}/resolve?projectId=${projectId}`);
    const after = (await (await request.get(`${API_BASE}/api/novel/dashboard?projectId=${projectId}`)).json()).stats;
    expect(after.foreshadowOverdue, '回收后逾期计数应回落').toBe(0);
  });

  test('44 跨项目隔离：列表互不可见，跨项目流转 404', async ({ request }) => {
    const projectId = await makeProject(request, `F084-隔离A-${token('isoA')}`);
    const otherProjectId = await makeProject(request, `F084-隔离B-${token('isoB')}`);
    const chapter = await makeChapter(request, projectId, 'A 项目章');

    const row = (await (await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: chapter.id, title: `A 的伏笔-${token('secret')}` },
    })).json()).foreshadow;

    const otherList = (await (await request.get(`${API_BASE}/api/novel/foreshadows?projectId=${otherProjectId}`)).json()).foreshadows;
    expect(otherList.some((f) => f.id === row.id), 'B 项目不得看到 A 项目的伏笔').toBe(false);

    // 用 B 项目的上下文去流转 A 项目的伏笔 → 404（而不是静默成功）
    const hijack = await request.post(`${API_BASE}/api/novel/foreshadows/${row.id}/resolve?projectId=${otherProjectId}`);
    expect(hijack.status(), '跨项目流转必须 404').toBe(404);

    const stillPlanted = (await (await request.get(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`)).json()).foreshadows;
    expect(stillPlanted.find((f) => f.id === row.id).status, '越权尝试不得改变原伏笔状态').toBe('planted');
  });

  test('45 conflict 任务的上下文确实包含未回收伏笔（L3.5 分层注入）', async ({ request }) => {
    const projectId = await makeProject(request, `F084-注入-${token('inject')}`);
    const chapter = await makeChapter(request, projectId, '校验章', '林祈站在钟楼下，雨水顺着铜管往下淌。');
    await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: chapter.id, title: `暗语伏笔-${token('clue')}`, content: '罗文留下的暗语', expectedChapter: 3 },
    });

    const conflict = await (await request.post(`${API_BASE}/api/novel/ai?projectId=${projectId}`, {
      data: { taskType: 'conflict', chapterId: chapter.id },
    })).json();
    expect(conflict.prompt, 'conflict 任务必须注入未回收伏笔层').toContain('【未回收伏笔清单】');
    expect(conflict.prompt).toContain('暗语伏笔');

    // 其余任务不注入 —— 只增 token 不增价值（F084 明确的边界）
    const sync = await (await request.post(`${API_BASE}/api/novel/ai?projectId=${projectId}`, {
      data: { taskType: 'sync', chapterId: chapter.id },
    })).json();
    expect(sync.prompt, '非 conflict 任务不得注入伏笔层').not.toContain('【未回收伏笔清单】');

    // 回收后不再出现在清单里：注入的是「未回收」伏笔
    const list = (await (await request.get(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`)).json()).foreshadows;
    await request.post(`${API_BASE}/api/novel/foreshadows/${list[0].id}/resolve?projectId=${projectId}`);
    const after = await (await request.post(`${API_BASE}/api/novel/ai?projectId=${projectId}`, {
      data: { taskType: 'conflict', chapterId: chapter.id },
    })).json();
    expect(after.prompt, '全部回收后不应再有伏笔层').not.toContain('【未回收伏笔清单】');
  });

  test('46 线索提示：已登记伏笔在别的章被提及 → mention 提示（只提示不建库）', async ({ request }) => {
    const projectId = await makeProject(request, `F084-提示-${token('hint')}`);
    const withClue = await makeChapter(request, projectId, '提及章', '她斗篷边缘沾着银色粉尘，没有解释。');
    const plantChapter = await makeChapter(request, projectId, '埋设章', '一段与线索无关的正文。');

    // 埋设章不是提及章，才可能产生「在别的章被提及」的提示
    await request.post(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`, {
      data: { chapterId: plantChapter.id, title: '银色粉尘' },
    });

    const hints = (await (await request.get(`${API_BASE}/api/novel/foreshadows/hints?projectId=${projectId}`)).json()).hints;
    const mention = hints.find((h) => h.kind === 'mention' && h.title === '银色粉尘');
    expect(mention, '伏笔名在别的章正文出现应产出 mention 提示').toBeDefined();
    expect(mention.chapterId, '提示应指向提及发生的章节').toBe(withClue.id);

    // 提示是只读的：扫完不得自动建库（PRD：人工登记为主）
    const list = (await (await request.get(`${API_BASE}/api/novel/foreshadows?projectId=${projectId}`)).json()).foreshadows;
    expect(list, '扫描提示不得自动新增任何伏笔').toHaveLength(1);
  });
});

/* ══════════════════ F085 定时发布调度器 ══════════════════ */

test.describe('M6 · 定时发布调度器（F085）', () => {
  test('47 测试库环境调度器必须禁用：到期任务不会被后台自动打发', async ({ request }) => {
    // 为什么先断言「禁用」：46 条既有用例全部假设测试库数据不被后台进程改动。
    // 真跑起来调度器会把 waiting 任务悄悄推成 published，令所有发布相关断言随机翻车。
    const status = (await (await request.get(`${API_BASE}/api/novel/scheduler`)).json()).scheduler;
    expect(status.disabled, '测试环境（NOVEL_DB_PATH 含 novel-test.sqlite）应自动禁用调度器').toBe(true);
    expect(status.running, '禁用时不得有任何定时器在跑').toBe(false);
    expect(status.lastScanAt, '禁用状态下不应产生任何扫描记录').toBe(null);
    expect(status.lastTriggered, '禁用状态下触发计数必须为 0').toBe(0);
    // 适配器注册表：本期只有 simulate，必须显式标注 simulated（UI 要明示这是模拟推送）
    expect(status.adapters.some((a) => a.name === 'simulate' && a.simulated === true),
      '应注册 simulate 适配器且标注 simulated').toBe(true);

    // 造一个「已到期」的任务：真调度器在跑，它现在就该被推走
    const projectId = await makeProject(request, `F085-禁用-${token('disabled')}`);
    const chapter = await makeChapter(request, projectId, '到期章');
    const task = (await (await request.post(`${API_BASE}/api/novel/publish?projectId=${projectId}`, {
      data: { chapterId: chapter.id, platform: '模拟平台 A', scheduledAt: new Date(Date.now() - 3600_000).toISOString() },
    })).json()).task;
    expect(task.status).toBe('waiting');

    // 给一个足够长的窗口（默认周期 30s，这里只等 1.2s —— 真在跑也够触发一轮启动补跑）
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const audit = (await (await request.get(`${API_BASE}/api/novel/audit?limit=300`)).json()).logs;
    expect(audit.some((log) => log.action === 'scheduler.scan'), '禁用时绝不应出现调度器扫描审计').toBe(false);
    expect(audit.some((log) => log.action === 'publish.recover'), '禁用时不应有崩溃残留回置').toBe(false);

    const after = (await (await request.get(`${API_BASE}/api/novel/scheduler`)).json()).scheduler;
    expect(after.lastTriggered, '等待期间调度器触发数应始终为 0').toBe(0);
  });

  test('48 手动路径状态机：simulate 推成功/失败，retry 回置 waiting 并可再推', async ({ request }) => {
    const projectId = await makeProject(request, `F085-手推-${token('manual')}`);
    const chapter = await makeChapter(request, projectId, '推送章');
    const future = new Date(Date.now() + 3600_000).toISOString();

    const okTask = (await (await request.post(`${API_BASE}/api/novel/publish?projectId=${projectId}`, {
      data: { chapterId: chapter.id, platform: '模拟平台 A', scheduledAt: future },
    })).json()).task;
    const pushed = await (await request.post(`${API_BASE}/api/novel/publish/${okTask.id}/simulate`)).json();
    expect(pushed.task.status, '模拟推送应成功').toBe('published');
    expect(pushed.task.last_error).toBe('');

    // 平台名含「失败」→ 模拟失败（保留既有语义，供 UI/测试构造失败样例）
    const failTask = (await (await request.post(`${API_BASE}/api/novel/publish?projectId=${projectId}`, {
      data: { chapterId: chapter.id, platform: '失败平台', scheduledAt: future },
    })).json()).task;
    const failed = await (await request.post(`${API_BASE}/api/novel/publish/${failTask.id}/simulate`)).json();
    expect(failed.task.status, '模拟平台限流应判失败').toBe('failed');
    expect(failed.task.last_error).toContain('模拟平台限流');
    expect(failed.task.retry_count, '失败应累计重试次数').toBe(1);

    // retry：failed → waiting，清空错误，由下一次推送接管
    const retried = await (await request.post(`${API_BASE}/api/novel/publish/${failTask.id}/retry`)).json();
    expect(retried.task.status, '重试应回置为待发布').toBe('waiting');
    expect(retried.task.last_error, '重试应清空上次错误').toBe('');

    const secondFail = await (await request.post(`${API_BASE}/api/novel/publish/${failTask.id}/simulate`)).json();
    expect(secondFail.task.status).toBe('failed');
    expect(secondFail.task.retry_count, '再次失败应继续累计').toBe(2);

    // 列表侧：全部任务都应带 simulated 标注（UI 明示「这是模拟推送」）
    const board = (await (await request.get(`${API_BASE}/api/novel/publish?projectId=${projectId}`)).json()).tasks;
    expect(board.length).toBeGreaterThan(0);
    expect(board.every((t) => t.simulated === true), '本期所有推送都应标注为模拟适配器').toBe(true);
  });

  test('49 抢占式执行：同一到期任务重复扫描只跑一次，绝不双发', async ({ request }) => {
    const projectId = await makeProject(request, `F085-抢占-${token('claim')}`);
    const chapter = await makeChapter(request, projectId, '到期章');
    const task = (await (await request.post(`${API_BASE}/api/novel/publish?projectId=${projectId}`, {
      data: { chapterId: chapter.id, platform: '模拟平台 A', scheduledAt: new Date(Date.now() - 60_000).toISOString() },
    })).json()).task;

    // GET /publish 的惰性触发路径与调度器共用同一条抢占路径（onlyWaiting=true）
    const first = (await (await request.get(`${API_BASE}/api/novel/publish?projectId=${projectId}`)).json()).tasks;
    expect(first.find((t) => t.id === task.id).status, '到期任务应被惰性扫描推走').toBe('published');

    // 再扫两次：published 是终态，抢占失败 → 不重复执行
    await request.get(`${API_BASE}/api/novel/publish?projectId=${projectId}`);
    await request.get(`${API_BASE}/api/novel/publish?projectId=${projectId}`);

    const audit = (await (await request.get(`${API_BASE}/api/novel/audit?limit=300`)).json()).logs;
    const executions = audit.filter((log) => log.action === 'publish.execute' && payloadOf(log).taskId === task.id);
    expect(executions, '同一任务只能被真正执行一次（双发即重复发帖）').toHaveLength(1);
  });

  test('50 发布任务创建校验：缺 platform 显式报错，不留下脏任务', async ({ request }) => {
    const projectId = await makeProject(request, `F085-校验-${token('guard')}`);
    const chapter = await makeChapter(request, projectId, '推送章');

    const res = await request.post(`${API_BASE}/api/novel/publish?projectId=${projectId}`, {
      data: { chapterId: chapter.id, scheduledAt: new Date().toISOString() },
    });
    // 抛出 Error 会走 500 兜底；重点是任务没被创建（静默建成空平台任务会在面板炸掉）
    expect(res.status(), '缺 platform 不应静默成功').toBeGreaterThanOrEqual(400);

    const board = (await (await request.get(`${API_BASE}/api/novel/publish?projectId=${projectId}`)).json()).tasks;
    expect(board, '非法创建不得留下任何任务').toHaveLength(0);
  });
});

/* ══════════════════ F092 多格式导出 ══════════════════ */

test.describe('M6 · 多格式导出（F092）', () => {
  /** 建一个内容可控的项目：3 章（含初始章），用于校验导出正文与目录。 */
  async function makeExportProject(request) {
    const title = `F092 导出项目-${token('exp')}`;
    const projectId = await makeProject(request, title);
    await makeChapter(request, projectId, '第二章节', '这是第二章的正文，含中文标点与换行。\n第二行。');
    await makeChapter(request, projectId, '第三章节', '这是第三章的正文。');
    return { projectId, title };
  }

  test('51 Markdown 导出：附件头 + 中文文件名 RFC 5987 + 目录与多章齐全', async ({ request }) => {
    const { projectId, title } = await makeExportProject(request);

    const res = await request.get(`${API_BASE}/api/novel/export/markdown?projectId=${projectId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/markdown');
    // 没有 attachment 头，浏览器会直接把 .md 渲染在页面里而不是下载
    expect(res.headers()['content-disposition']).toContain('attachment');
    // 中文文件名必须走 RFC 5987（filename*=UTF-8''…），否则非中文环境全变乱码
    expect(res.headers()['content-disposition']).toMatch(/filename\*=UTF-8''/);
    expect(decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(res.headers()['content-disposition'])[1]))
      .toContain('F092');

    const body = await res.text();
    expect(body).toContain(`# ${title}`);
    expect(body, '全书导出必须带目录').toContain('## 目录');
    expect(body).toContain('## 第 1 章');
    expect(body).toContain('## 第 3 章');
    expect(body).toContain('这是第二章的正文');

    // 单章导出：不含目录（目录对单章无意义）
    const chapters = (await outline(request, projectId)).chapters;
    const single = await request.get(`${API_BASE}/api/novel/export/markdown?projectId=${projectId}&chapterId=${chapters[1].id}`);
    expect(single.status()).toBe(200);
    const singleBody = await single.text();
    expect(singleBody, '单章导出不应带目录').not.toContain('## 目录');
    expect(singleBody).toContain('这是第二章的正文');
    expect(singleBody, '单章导出不应混入其他章节正文').not.toContain('这是第三章的正文');
  });

  test('52 DOCX 导出：ZIP 签名 PK\\x03\\x04 且能定位 [Content_Types].xml', async ({ request }) => {
    const { projectId } = await makeExportProject(request);

    const res = await request.get(`${API_BASE}/api/novel/export/docx?projectId=${projectId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'], 'DOCX 必须用 WordprocessingML 的 MIME').toContain('wordprocessingml');
    expect(res.headers()['content-disposition']).toContain('attachment');

    const buf = await res.body();
    // OOXML 本质是 ZIP：前 4 字节必须是本地文件头签名，否则 Word 直接判损坏
    expect(buf.subarray(0, 4).toString('latin1'), 'DOCX 必须以 PK\\x03\\x04 开头').toBe('PK\x03\x04');
    // [Content_Types].xml 是 OOXML 的强制件，缺了 Word 打不开
    const raw = buf.toString('latin1');
    expect(raw, '包内应包含 [Content_Types].xml').toContain('[Content_Types].xml');
    expect(raw, '包内应包含 word/document.xml').toContain('word/document.xml');
    // 中央目录结束签名存在 → ZIP 结构完整（不是被截断的半截流）
    expect(buf.subarray(buf.length - 22, buf.length - 18).toString('latin1'), '应存在 EOCD 签名').toBe('PK\x05\x06');
  });

  test('53 EPUB 导出：首条目必须是 STORED 的 mimetype 且内容 application/epub+zip', async ({ request }) => {
    const { projectId } = await makeExportProject(request);

    const res = await request.get(`${API_BASE}/api/novel/export/epub?projectId=${projectId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/epub+zip');

    const buf = await res.body();
    const entry = firstZipEntry(buf);
    // OCF 规范硬约束：mimetype 必须第一个、必须未压缩 —— 阅读器靠它识别容器，
    // 压了或排后面，Apple Books / Calibre 直接拒开。这是 EPUB 合法性的命门。
    expect(entry.signature.toString(16), '应为本地文件头签名').toBe('4034b50');
    expect(entry.name, '第一个条目必须是 mimetype').toBe('mimetype');
    expect(entry.method, 'mimetype 必须 STORED（method 0），不能 deflate').toBe(0);
    expect(entry.data, 'mimetype 内容必须逐字节为 application/epub+zip').toBe('application/epub+zip');
    // OCF 还要求 META-INF/container.xml 指向 OPF
    expect(buf.toString('latin1')).toContain('META-INF/container.xml');
  });

  test('54 导出负面路径：非白名单 Origin 403，不存在的章节 404，非法格式 404', async ({ request }) => {
    const { projectId } = await makeExportProject(request);

    for (const format of ['markdown', 'docx', 'epub']) {
      const evil = await request.get(`${API_BASE}/api/novel/export/${format}?projectId=${projectId}`, {
        headers: { origin: EVIL_ORIGIN },
      });
      expect(evil.status(), `${format} 导出必须拒绝非白名单来源`).toBe(403);
      expect(evil.headers()['access-control-allow-origin']).toBeUndefined();
    }

    const missingChapter = await request.get(`${API_BASE}/api/novel/export/markdown?projectId=${projectId}&chapterId=999999`);
    expect(missingChapter.status(), '导出不存在的章节应 404 而不是空文件').toBe(404);

    const unknownFormat = await request.get(`${API_BASE}/api/novel/export/pdf?projectId=${projectId}`);
    expect(unknownFormat.status(), '未支持的格式应 404（白名单路由）').toBe(404);
  });
});
