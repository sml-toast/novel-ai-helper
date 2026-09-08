/**
 * server/novel-foreshadow.js —— 伏笔与线索生命周期（F084）
 *
 * 职责边界（PRD 拍板结论：人工登记为主、AI 建议为辅）：
 *   - CRUD + 状态机流转（planted → resolved / abandoned，单向，走 logAudit 留审计痕迹）
 *   - 逾期判定在服务端：expected_chapter ≤ 当前章节数 且状态仍为 planted。
 *     章节表无显式序号列，全项目统一按 id 升序编号（1 起），前端只展示不计算。
 *   - 与 F080 提及联动：纯词面匹配的「提示」（复用 novel-mentions 扫描器），
 *     只提示不建议库、更不自动建伏笔 —— 误报由作者人工判断。
 *
 * 零依赖：SQL 复用 novel-db 的 run/get/all，词面匹配复用 novel-mentions 纯函数。
 */

import { all, get, logAudit, run } from './novel-db.js';
import { buildMentionScanner } from './novel-mentions.js';

/** 合法状态集合（与 v6 迁移的 CHECK 约束一致，双侧校验） */
const FORESHADOW_STATUSES = new Set(['planted', 'resolved', 'abandoned']);

/** 状态流转表：只允许从 planted 流出到终态；终态不可再流转（如需改回去，删除重登）。 */
const TRANSITIONS = {
  resolve: { to: 'resolved', action: 'foreshadow.resolve' },
  abandon: { to: 'abandoned', action: 'foreshadow.abandon' }
};

function nowIso() {
  return new Date().toISOString();
}

/**
 * 章节 id → 全项目序号（1 起，按 id 升序）。
 * 章节数很小（长篇数百），每次现算即可，无需缓存。
 */
function chapterOrdinalMap(projectId) {
  const rows = all('SELECT id FROM chapters WHERE project_id = ? ORDER BY id', [projectId]);
  const map = new Map();
  rows.forEach((row, index) => map.set(row.id, index + 1));
  return map;
}

/** 展示层装饰：章节序号 + 逾期标记（判定只在服务端做，前端只展示）。 */
function decorate(row, ordinals, chapterCount) {
  const overdue =
    row.status === 'planted' &&
    row.expected_chapter != null &&
    Number(row.expected_chapter) <= chapterCount;
  return { ...row, chapter_ordinal: ordinals.get(row.chapter_id) || null, overdue };
}

/**
 * 登记伏笔（埋设于指定章节）。
 * @returns {object|null} 登记后的行；章节不存在或不属于该项目返回 null（多项目隔离）
 * @throws {Error} 标题为空时抛出（API 层映射 400）
 */
export function addForeshadow({ projectId, chapterId, title, content = '', expectedChapter = null }) {
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) throw new Error('foreshadow title is required');

  const chapter = get('SELECT id, project_id FROM chapters WHERE id = ?', [Number(chapterId)]);
  if (!chapter || chapter.project_id !== projectId) return null;

  // expectedChapter 允许留空（还不知道哪章回收）；给了就必须是正整数
  let expected = null;
  if (expectedChapter != null && expectedChapter !== '') {
    expected = Number(expectedChapter);
    if (!Number.isInteger(expected) || expected <= 0) {
      throw new Error('expectedChapter must be a positive integer');
    }
  }

  const timestamp = nowIso();
  const result = run(
    `INSERT INTO foreshadows (project_id, chapter_id, title, content, expected_chapter, resolved_chapter, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'planted', ?, ?)`,
    [projectId, Number(chapterId), trimmedTitle, String(content || ''), expected, timestamp, timestamp]
  );
  logAudit('foreshadow.create', { projectId, chapterId, title: trimmedTitle, expectedChapter: expected });
  return get('SELECT * FROM foreshadows WHERE id = ?', [Number(result.lastInsertRowid)]);
}

/**
 * 项目伏笔全量列表（带章节标题/序号/逾期标记），按登记顺序返回。
 * 前端按 status 分组展示，逾期行标红。
 */
export function listForeshadows(projectId) {
  const ordinals = chapterOrdinalMap(projectId);
  const chapterCount = ordinals.size;
  return all(
    `SELECT f.*, c.title AS chapter_title
     FROM foreshadows f JOIN chapters c ON c.id = f.chapter_id
     WHERE f.project_id = ?
     ORDER BY f.id`,
    [projectId]
  ).map(row => decorate(row, ordinals, chapterCount));
}

/** 单条伏笔（带项目归属校验；跨项目访问返回 null，与多项目隔离语义一致）。 */
export function getForeshadow(id, projectId) {
  const row = get(
    `SELECT f.*, c.title AS chapter_title
     FROM foreshadows f JOIN chapters c ON c.id = f.chapter_id
     WHERE f.id = ?`,
    [Number(id)]
  );
  if (!row || (projectId != null && row.project_id !== projectId)) return null;
  const ordinals = chapterOrdinalMap(row.project_id);
  return decorate(row, ordinals, ordinals.size);
}

/**
 * 状态流转：resolve（回收）/ abandon（废弃）。
 * @returns {object|null} 流转后的行；伏笔不存在或跨项目返回 null
 * @throws {Error} action 非法或状态机不允许（已回收/已废弃再流转）时抛出（API 层映射 400）
 */
export function transitionForeshadow(id, action, { projectId } = {}) {
  const transition = TRANSITIONS[action];
  if (!transition) throw new Error('invalid foreshadow action');

  const row = get('SELECT * FROM foreshadows WHERE id = ?', [Number(id)]);
  if (!row) return null;
  if (projectId != null && row.project_id !== projectId) return null;
  if (!FORESHADOW_STATUSES.has(row.status)) throw new Error('foreshadow status is corrupted');
  if (row.status !== 'planted') {
    throw new Error(`foreshadow already ${row.status}，终态不可再流转`);
  }

  // resolved_chapter 记录「回收动作发生在当前最新章」，为后续回顾提供锚点
  const ordinals = chapterOrdinalMap(row.project_id);
  const resolvedChapter = transition.to === 'resolved' ? ordinals.size : null;
  run(
    'UPDATE foreshadows SET status = ?, resolved_chapter = ?, updated_at = ? WHERE id = ?',
    [transition.to, resolvedChapter, nowIso(), row.id]
  );
  // 审计痕迹：状态机每次流转都留痕（who/when 由 audit_logs 行本身携带）
  logAudit(transition.action, {
    foreshadowId: row.id,
    projectId: row.project_id,
    title: row.title,
    from: 'planted',
    to: transition.to
  });
  return getForeshadow(row.id, row.project_id);
}

/**
 * 未回收伏笔清单（planted，按登记顺序）—— 两个消费方：
 *   1. F032 冲突校验的上下文注入（作为分层 prompt 的一层，见 novel-ai-provider）
 *   2. F080 联动提示的扫描词典
 */
export function listOpenForeshadows(projectId) {
  return all(
    `SELECT f.id, f.project_id, f.chapter_id, f.title, f.content, f.expected_chapter, c.title AS chapter_title
     FROM foreshadows f JOIN chapters c ON c.id = f.chapter_id
     WHERE f.project_id = ? AND f.status = 'planted'
     ORDER BY f.id`,
    [projectId]
  );
}

/**
 * F080 联动：词面匹配线索提示。纯提示，不写任何表。
 *
 * 两类信号（都复用 novel-mentions 的首字符索引扫描器，词典规模无关性能）：
 *   A. mention       已登记伏笔的名称在其他章节正文出现且未回收 —— 该伏笔正被
 *                    间接推进，作者可能忘了回收；
 *   B. unregistered  术语表中分类为「线索」的词条出现在正文，却没有同名伏笔
 *                    登记 —— 提示作者可在编辑器选中相关文字一键登记。
 *
 * @returns {Array<{kind:string, title:string, chapterId:number, chapterTitle:string, message:string}>}
 */
export function scanForeshadowHints(projectId) {
  const hints = [];
  const chapters = all('SELECT id, title, content FROM chapters WHERE project_id = ? ORDER BY id', [projectId]);

  // ── A. 已登记伏笔在别的章被提及 ──
  const openList = listOpenForeshadows(projectId);
  if (openList.length) {
    const byId = new Map(openList.map(row => [row.id, row]));
    const scan = buildMentionScanner(
      openList.map(row => ({ entity_type: 'foreshadow', entity_id: row.id, alias: row.title, polarity: 1 }))
    );
    for (const chapter of chapters) {
      // 每章每伏笔只报一次（取首个命中位置即可，提示不是全文检索）
      const firstSeen = new Map();
      for (const hit of scan(chapter.content || '')) {
        if (!firstSeen.has(hit.entityId)) firstSeen.set(hit.entityId, hit.position);
      }
      for (const [foreshadowId] of firstSeen) {
        const foreshadow = byId.get(foreshadowId);
        if (!foreshadow || foreshadow.chapter_id === chapter.id) continue; // 埋设章自身不算
        hints.push({
          kind: 'mention',
          title: foreshadow.title,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          message: `伏笔《${foreshadow.title}》（埋设于《${foreshadow.chapter_title}》）在《${chapter.title}》正文中被提及，且尚未回收。`
        });
      }
    }
  }

  // ── B. 线索类术语未登记为伏笔 ──
  const clueTerms = all(
    `SELECT id, term FROM glossary_terms WHERE project_id = ? AND category = '线索' ORDER BY id`,
    [projectId]
  );
  if (clueTerms.length) {
    const registeredTitles = new Set(
      all('SELECT title FROM foreshadows WHERE project_id = ?', [projectId]).map(row => row.title)
    );
    const candidates = clueTerms.filter(row => !registeredTitles.has(row.term));
    if (candidates.length) {
      const scan = buildMentionScanner(
        candidates.map(row => ({ entity_type: 'clue', entity_id: row.id, alias: row.term, polarity: 1 }))
      );
      for (const chapter of chapters) {
        const firstSeen = new Map();
        for (const hit of scan(chapter.content || '')) {
          if (!firstSeen.has(hit.entityId)) firstSeen.set(hit.entityId, hit.position);
        }
        for (const [clueId] of firstSeen) {
          const term = candidates.find(row => row.id === clueId);
          if (!term) continue;
          hints.push({
            kind: 'unregistered',
            title: term.term,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            message: `《${chapter.title}》提到线索词「${term.term}」，尚无对应伏笔登记；可在编辑器选中相关文字一键登记。`
          });
        }
      }
    }
  }

  return hints;
}
