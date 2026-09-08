/**
 * server/novel-outline.js —— 大纲树 / 场景卡片 / 情节网格（F083）
 *
 * 职责边界：
 *   - getOutlineData：三视图共用的只读数据装配（章节/场景/伏笔/情节线/节拍）
 *   - reorderChapters / assignScenes：拖拽排序的持久化（sort_order 契约见 v7 迁移）
 *   - plot lines / beats CRUD：Plot Grid 的行与单元格
 *
 * 排序契约（F083 起全项目权威顺序）：章节 ORDER BY sort_order, id；
 * 场景 ORDER BY sort_order, id（归属内相对序）。序号不保证连续——
 * 拖拽后按「最终呈现顺序」整体重写 1..n，把空洞压实。
 *
 * 零依赖：SQL 复用 novel-db 的 run/get/all；伏笔复用 novel-foreshadow 的列表查询。
 */

import { all, get, logAudit, run } from './novel-db.js';
import { listForeshadows } from './novel-foreshadow.js';

function nowIso() {
  return new Date().toISOString();
}

/** 章节 id → 所属项目 id 的归属校验（多项目隔离，跨项目 id 一律拒绝）。 */
function chapterBelongsTo(projectId, chapterId) {
  const row = get('SELECT project_id FROM chapters WHERE id = ?', [Number(chapterId)]);
  return Boolean(row && row.project_id === projectId);
}

/** 场景 id → 所属项目 id 的归属校验。 */
function sceneBelongsTo(projectId, sceneId) {
  const row = get('SELECT project_id FROM scene_locations WHERE id = ?', [Number(sceneId)]);
  return Boolean(row && row.project_id === projectId);
}

/**
 * 三视图共用数据包。章节刻意不带 content（200 章 × 3KB 全量拉取只为渲染卡片
 * 是浪费），字数用 LENGTH(content) 现算；点击定位 / 编辑走既有章节接口。
 */
export function getOutlineData(projectId) {
  const chapters = all(
    `SELECT id, title, status, sort_order, LENGTH(COALESCE(content, '')) AS char_count,
            (SELECT COUNT(*) FROM scene_locations s WHERE s.chapter_id = chapters.id) AS scene_count
     FROM chapters WHERE project_id = ? ORDER BY sort_order, id`,
    [projectId]
  ).map((row, index) => ({ ...row, ordinal: index + 1 }));
  const scenes = all(
    `SELECT id, name, mood, description, pov, chapter_id, sort_order
     FROM scene_locations WHERE project_id = ? ORDER BY sort_order, id`,
    [projectId]
  );
  return {
    chapters,
    scenes,
    // 伏笔带 chapter_ordinal / overdue 装饰（F084），卡片按埋设章归组、逾期标红
    foreshadows: listForeshadows(projectId),
    plotLines: all(
      'SELECT id, title, color, sort_order FROM plot_lines WHERE project_id = ? ORDER BY sort_order, id',
      [projectId]
    ),
    beats: all('SELECT id, plot_line_id, chapter_id, scene_id, mark, notes FROM plot_beats WHERE project_id = ?', [projectId])
  };
}

/**
 * 章节批量重排（拖拽排序持久化）。
 * @param {number} projectId
 * @param {Array<{id:number}>} items 最终顺序的章节 id 列表（必须覆盖该项目全部章节）
 * @returns {{chapters:Array}|null} 重排后的权威章节列表；载荷非法返回 null（API 映射 400）
 */
export function reorderChapters(projectId, items) {
  const existing = all('SELECT id FROM chapters WHERE project_id = ?', [projectId]).map(row => row.id);
  const incoming = Array.isArray(items) ? items.map(item => Number(item?.id ?? item)) : [];
  // 必须是「全量覆盖」：缺一章或多一章都拒绝，避免部分提交把序号写散
  const valid = existing.length === incoming.length && new Set(incoming).size === incoming.length
    && incoming.every(id => existing.includes(id));
  if (!valid) return null;

  const timestamp = nowIso();
  try {
    // SAVEPOINT 而非 BEGIN：拖拽写一半出错也不会留下半截顺序，且与
    // importProject 的嵌套事务语义兼容（本模块当前无嵌套调用方，防御性保留）
    beginSavepoint('chapters_reorder');
    incoming.forEach((id, index) => {
      run('UPDATE chapters SET sort_order = ?, updated_at = ? WHERE id = ?', [index + 1, timestamp, id]);
    });
    releaseSavepoint('chapters_reorder');
    logAudit('chapters.reorder', { projectId, count: incoming.length });
  } catch (error) {
    rollbackSavepoint('chapters_reorder');
    throw error;
  }
  return { chapters: getOutlineData(projectId).chapters };
}

/**
 * 场景归类 + 排序（拖到某章的卡片组里 / 在组内换位）。
 * @param {number} projectId
 * @param {Array<{id:number, chapterId?:number|null}>} items 场景最终归属与顺序（全量覆盖该项目场景）
 * @returns {{scenes:Array}|null}
 */
export function assignScenes(projectId, items) {
  const existing = all('SELECT id FROM scene_locations WHERE project_id = ?', [projectId]).map(row => row.id);
  const incoming = Array.isArray(items) ? items.map(item => item) : [];
  const ids = incoming.map(item => Number(item?.id));
  const valid = existing.length === ids.length && new Set(ids).size === ids.length && ids.every(id => existing.includes(id));
  if (!valid) return null;
  // chapterId 必须属于本项目或为 null（未分配桶）
  const chapterOk = incoming.every(item => item.chapterId == null || chapterBelongsTo(projectId, Number(item.chapterId)));
  if (!chapterOk) return null;

  const timestamp = nowIso();
  try {
    beginSavepoint('scenes_assign');
    incoming.forEach((item, index) => {
      run(
        'UPDATE scene_locations SET chapter_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
        [item.chapterId == null ? null : Number(item.chapterId), index + 1, timestamp, Number(item.id)]
      );
    });
    releaseSavepoint('scenes_assign');
    logAudit('scenes.assign', { projectId, count: incoming.length });
  } catch (error) {
    rollbackSavepoint('scenes_assign');
    throw error;
  }
  return { scenes: getOutlineData(projectId).scenes };
}

/**
 * 新建情节线。
 * @returns {object|null} 新行；标题为空返回 null（API 映射 400）
 */
export function createPlotLine({ projectId, title, color }) {
  const trimmed = String(title || '').trim();
  if (!trimmed) return null;
  const timestamp = nowIso();
  const nextSort = Number(
    get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM plot_lines WHERE project_id = ?', [projectId]).next
  );
  const result = run(
    `INSERT INTO plot_lines (project_id, title, color, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [projectId, trimmed, /^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? color : '#8b5cf6', nextSort, timestamp, timestamp]
  );
  logAudit('plotline.create', { projectId, title: trimmed });
  return get('SELECT id, title, color, sort_order FROM plot_lines WHERE id = ?', [Number(result.lastInsertRowid)]);
}

/**
 * 删除情节线（连带其全部节拍；先子后父，外键顺序要求）。
 * @returns {object|null} 被删行；不存在或跨项目返回 null
 */
export function deletePlotLine(id, projectId) {
  const row = get('SELECT * FROM plot_lines WHERE id = ?', [Number(id)]);
  if (!row || row.project_id !== projectId) return null;
  run('DELETE FROM plot_beats WHERE plot_line_id = ?', [row.id]);
  run('DELETE FROM plot_lines WHERE id = ?', [row.id]);
  logAudit('plotline.delete', { projectId, id: row.id, title: row.title });
  return row;
}

/**
 * 设置 / 清除节拍（Plot Grid 单元格点击循环：无 → progress → planned → 清除）。
 * line × chapter 唯一（同章同线只保留一个节拍，重复设置 = 覆盖）。
 * @param {{projectId:number, plotLineId:number, chapterId:number, mark?:string|null, notes?:string}} params
 * @returns {{beats:Array}|null} 更新后全量节拍（前端直接替换缓存）；line/chapter 不属于本项目返回 null
 */
export function setPlotBeat({ projectId, plotLineId, chapterId, mark = null, notes = '' }) {
  const line = get('SELECT id, project_id FROM plot_lines WHERE id = ?', [Number(plotLineId)]);
  // 线与章都必须属于本项目（多项目隔离；跨项目 id 一律 404）
  if (!line || line.project_id !== projectId) return null;
  if (!chapterBelongsTo(projectId, Number(chapterId))) return null;

  const existing = get(
    'SELECT id FROM plot_beats WHERE plot_line_id = ? AND chapter_id = ?',
    [Number(plotLineId), Number(chapterId)]
  );
  const timestamp = nowIso();

  if (mark == null || mark === '') {
    if (existing) run('DELETE FROM plot_beats WHERE id = ?', [existing.id]);
  } else {
    const normalized = ['progress', 'planned'].includes(String(mark)) ? String(mark) : 'progress';
    if (existing) {
      run('UPDATE plot_beats SET mark = ?, notes = ?, updated_at = ? WHERE id = ?',
        [normalized, String(notes || ''), timestamp, existing.id]);
    } else {
      run(
        `INSERT INTO plot_beats (project_id, plot_line_id, chapter_id, mark, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [projectId, Number(plotLineId), Number(chapterId), normalized, String(notes || ''), timestamp, timestamp]
      );
    }
  }
  logAudit('plotbeat.set', { projectId, plotLineId: Number(plotLineId), chapterId: Number(chapterId), mark: mark ?? null });
  return { beats: all('SELECT id, plot_line_id, chapter_id, scene_id, mark, notes FROM plot_beats WHERE project_id = ?', [projectId]) };
}

/* ── SAVEPOINT 包装：node:sqlite 无事务辅助函数，集中三行避免散落 ── */
function beginSavepoint(name) { run(`SAVEPOINT ${name}`); }
function releaseSavepoint(name) { run(`RELEASE ${name}`); }
function rollbackSavepoint(name) {
  try { run(`ROLLBACK TO ${name}`); } finally { run(`RELEASE ${name}`); }
}
