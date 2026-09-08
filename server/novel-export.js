/**
 * server/novel-export.js —— 多格式导出（F092）
 *
 * 职责：
 *   1. collectExportBundle —— 三种格式共用的数据装配（显式列名，不碰密钥材料）
 *   2. exportMarkdown      —— 全书 / 单章 Markdown（章节合并 + 目录 + 可选附录）
 *   3. exportDocx / exportEpub —— 见 novel-docx.js / novel-epub.js（本模块只做转发）
 *
 * 约定：
 *   - 章节按 sort_order, id 排序（F083 引入显式序号后的权威顺序）
 *   - 选项默认全开（annotations/glossary/timeline/foreshadows），与前端默认全选一致
 *   - 文件名规范：<项目名>-<格式>-<日期>.<ext>，日期用 novel-date 的本地日期
 *   - 零依赖：只返回 { filename, mime, body }，HTTP 头由 novel-api 的 sendFile 统一处理
 */

import { all, get } from './novel-db.js';
import { listForeshadows } from './novel-foreshadow.js';
import { localDate } from './novel-date.js';
import { buildDocx } from './novel-docx.js';
import { buildEpub } from './novel-epub.js';

/** @typedef {{annotations:boolean, glossary:boolean, timeline:boolean, foreshadows:boolean, chapterId?:number|null}} ExportOptions */

/** 归一化导出选项：缺省 = 全选（与前端默认勾选一致） */
function normalizeOptions(options = {}) {
  const on = value => value !== 0 && value !== '0' && value !== false && value !== 'false';
  return {
    annotations: on(options.annotations),
    glossary: on(options.glossary),
    timeline: on(options.timeline),
    foreshadows: on(options.foreshadows),
    chapterId: Number(options.chapterId) || null
  };
}

/**
 * 装配导出数据包。项目不存在返回 null（API 层映射 404）。
 * 章节带 1 起序号 ordinal（按权威顺序）；单章模式只保留目标章。
 */
export function collectExportBundle(projectId, rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const project = get('SELECT id, title, genre, world_view, writing_style FROM projects WHERE id = ?', [projectId]);
  if (!project) return null;

  let chapters = all(
    'SELECT id, title, content, status, sort_order FROM chapters WHERE project_id = ? ORDER BY sort_order, id',
    [projectId]
  ).map((row, index) => ({ ...row, ordinal: index + 1 }));
  if (options.chapterId) {
    chapters = chapters.filter(chapter => chapter.id === options.chapterId);
    if (!chapters.length) return null;
  }

  // 批注按章分组（单章导出时 JOIN 天然只剩本章）
  const annotations = options.annotations
    ? all(
      `SELECT c.id AS chapter_id, c.title AS chapter_title, a.quote, a.note, a.severity, a.created_at
       FROM chapter_annotations a JOIN chapters c ON c.id = a.chapter_id
       WHERE c.project_id = ? ORDER BY a.id`,
      [projectId]
    )
    : [];

  return {
    project,
    chapters,
    annotations,
    glossary: options.glossary ? all('SELECT term, definition, category FROM glossary_terms WHERE project_id = ? ORDER BY id', [projectId]) : [],
    timeline: options.timeline ? all('SELECT event_time, title, description FROM timeline_events WHERE project_id = ? ORDER BY id', [projectId]) : [],
    foreshadows: options.foreshadows ? listForeshadows(projectId) : []
  };
}

/** 总字数（中文按字符数近似，与编辑器字数统计口径一致） */
function totalChars(chapters) {
  return chapters.reduce((sum, chapter) => sum + String(chapter.content || '').length, 0);
}

/** XML / Markdown 通用：项目文件名里的路径非法字符替换为连字符 */
export function safeFilename(text) {
  return String(text || '导出').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || '导出';
}

/**
 * Markdown 附录节：批注按章分组渲染为引用块。
 * @param {Array} annotations collectExportBundle.annotations
 */
function annotationsSection(annotations) {
  if (!annotations.length) return '';
  const byChapter = new Map();
  for (const row of annotations) {
    if (!byChapter.has(row.chapter_id)) byChapter.set(row.chapter_id, []);
    byChapter.get(row.chapter_id).push(row);
  }
  const lines = ['', '## 附录 · 批注', ''];
  for (const [chapterId, rows] of byChapter) {
    lines.push(`### ${rows[0].chapter_title || `章节 ${chapterId}`}`);
    for (const row of rows) {
      lines.push(`> 【批注 · ${row.severity}】${row.quote || '（无原文）'} —— ${row.note || ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Markdown 附录节：两列简表（标题 + 内容 + 分类） */
function listSection(title, rows, formatter) {
  if (!rows.length) return '';
  const lines = ['', `## 附录 · ${title}`, ''];
  for (const row of rows) lines.push(formatter(row));
  return lines.join('\n');
}

/**
 * 全书 / 单章 Markdown 导出。
 * 正文原样保留换行（不重排段落），目录按权威章节顺序编号。
 * @returns {{filename:string, mime:string, body:string}|null}
 */
export function exportMarkdown(projectId, rawOptions = {}) {
  const bundle = collectExportBundle(projectId, rawOptions);
  if (!bundle) return null;
  const { project, chapters } = bundle;
  const single = Boolean(normalizeOptions(rawOptions).chapterId);
  const lines = [];

  lines.push(`# ${project.title}`);
  lines.push('');
  lines.push(`> 导出于 ${localDate()} · ${chapters.length} 章 · 约 ${totalChars(chapters).toLocaleString('zh-CN')} 字`);
  if (project.genre) lines.push(`> 题材：${project.genre}`);
  lines.push('');

  if (!single) {
    lines.push('## 目录', '');
    for (const chapter of chapters) {
      lines.push(`${chapter.ordinal}. ${chapter.title}`);
    }
    lines.push('', '---', '');
  }

  for (const chapter of chapters) {
    lines.push(`## 第 ${chapter.ordinal} 章 · ${chapter.title.replace(/^第\s*\d+\s*章\s*·?\s*/, '')}`, '');
    lines.push(String(chapter.content || '').trim(), '');
  }

  lines.push(annotationsSection(bundle.annotations));
  lines.push(listSection('术语表', bundle.glossary, row => `- **${row.term}**（${row.category}）：${row.definition}`));
  lines.push(listSection('时间线', bundle.timeline, row => `- **${row.event_time}** ${row.title}：${row.description}`));
  lines.push(listSection('伏笔清单', bundle.foreshadows, row => {
    const status = { planted: '已埋设', resolved: '已回收', abandoned: '已废弃' }[row.status] || row.status;
    const expected = row.expected_chapter ? ` · 预期第 ${row.expected_chapter} 章回收` : '';
    return `- **${row.title}**（第 ${row.chapter_ordinal ?? '?'} 章埋设 · ${status}${expected}）：${row.content}`;
  }));

  const date = localDate();
  const scope = single ? '单章' : '全书';
  return {
    filename: `${safeFilename(project.title)}-markdown-${scope}-${date}.md`,
    mime: 'text/markdown; charset=utf-8',
    body: lines.join('\n').replace(/\n{3,}/g, '\n\n')
  };
}

/**
 * DOCX 导出（实现见 novel-docx.js）。带 chapterId 时只导出单章。
 * @returns {{filename:string, mime:string, body:Buffer}|null}
 */
export function exportDocx(projectId, rawOptions = {}) {
  const bundle = collectExportBundle(projectId, rawOptions);
  if (!bundle) return null;
  const single = Boolean(normalizeOptions(rawOptions).chapterId);
  return {
    filename: `${safeFilename(bundle.project.title)}-docx-${single ? '单章' : '全书'}-${localDate()}.docx`,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    body: buildDocx(bundle)
  };
}

/**
 * EPUB 导出（实现见 novel-epub.js）。单章模式同样只含目标章。
 * @returns {{filename:string, mime:string, body:Buffer}|null}
 */
export function exportEpub(projectId, rawOptions = {}) {
  const bundle = collectExportBundle(projectId, rawOptions);
  if (!bundle) return null;
  const single = Boolean(normalizeOptions(rawOptions).chapterId);
  return {
    filename: `${safeFilename(bundle.project.title)}-epub-${single ? '单章' : '全书'}-${localDate()}.epub`,
    mime: 'application/epub+zip',
    body: buildEpub(bundle)
  };
}
