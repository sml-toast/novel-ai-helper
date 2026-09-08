import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { migrate, currentVersion } from './novel-migrate.js';
import { decryptSecret, encryptSecret, maskSecret } from './novel-secret.js';
import { buildMentionScanner } from './novel-mentions.js';
import { scoreRecallCandidates } from './novel-recall.js';
import { diffDays, localDate, shiftDate } from './novel-date.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const defaultDbPath = join(projectRoot, '.data', 'novel-ai.sqlite');

/**
 * 数据库路径解析（T003）
 * 支持 NOVEL_DB_PATH 环境变量，用于测试库与开发库隔离（需求 F077 的前置）。
 * - 绝对路径：原样使用
 * - 相对路径：相对项目根目录解析
 * - 未设置：默认 .data/novel-ai.sqlite
 */
function resolveDbPath() {
  const raw = process.env.NOVEL_DB_PATH;
  if (!raw) return defaultDbPath;
  return isAbsolute(raw) ? raw : resolve(projectRoot, raw);
}

export const dbPath = resolveDbPath();

mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
// X3 实测：跨进程并发写时，无 busy_timeout 的失败率为 88%（1411/1600 次写失败）；
// 设为 5000ms 后失败率降为 0。这是解除 Playwright workers:1 限制的前提。
db.exec('PRAGMA busy_timeout = 5000');

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function now() {
  return new Date().toISOString();
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}

/* ════════════════════════════════════════════════════════════════════
 * 中文全文检索（F088 / T012，实测依据：design 文档 A 节）
 *
 * 默认 unicode61 分词器把整段连续中文当成一个 token，2 字词召回 3/10；
 * bigram 手工切分 10/10（稀有词在 150 万字下比 LIKE 快 166x）。
 * trigram 更差（2 字词无法成 3-gram，6/10），**不要改用 trigram**。
 *
 * bigram 的代价是子串误召（搜「黑潮」会命中「黑潮生」），必须配合
 * searchAll 里的字面后过滤 —— FTS 粗筛出候选，回原表 LIKE 精确校验。
 * ════════════════════════════════════════════════════════════════════ */

/** 相邻字符两两成 token；单字符原样保留（FTS5 单 token 仍可命中）。 */
function bigram(text) {
  const chars = Array.from(String(text || ''));
  if (chars.length <= 1) return chars.join('');
  const grams = [];
  for (let i = 0; i < chars.length - 1; i += 1) grams.push(chars[i] + chars[i + 1]);
  return grams.join(' ');
}

/** 查询词 → FTS5 MATCH 表达式。逐 token 加引号防 FTS5 语法字符注入；空查询返回 null。 */
function ftsMatchExpression(query) {
  const tokens = bigram(String(query || '')).split(' ').filter(Boolean);
  if (!tokens.length) return null;
  return tokens.map(token => `"${token.replace(/"/g, '')}"`).join(' ');
}

/**
 * 统一检索索引的写入端：先删后插，保证幂等。
 * textParts 为空（如空正文）时删除索引行 —— 不索引空内容。
 */
function syncSearchFts(entityType, entityId, textParts) {
  run('DELETE FROM search_fts WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
  const text = (textParts || []).filter(Boolean).join('\n');
  const indexed = bigram(text);
  if (indexed) run('INSERT INTO search_fts(text, entity_type, entity_id) VALUES (?, ?, ?)', [indexed, entityType, entityId]);
}

/* ════════════════════════════════════════════════════════════════════
 * 实体提及与反链（F080 / T013，算法依据：design 文档 E 节实测）
 *
 * 提及 = 章节正文里出现了已登记实体（主名或正例别名）。
 * 负例（polarity=-1）= 人工登记的遮蔽串（如「黑潮生」），命中即整段跳过；
 * 剩余误报（「他黑潮化了」这类）无法靠算法消除，由提及管理 UI 人工兜底。
 * ════════════════════════════════════════════════════════════════════ */

export const MENTION_ENTITY_TYPES = new Set(['character', 'knowledge', 'scene', 'world', 'timeline', 'glossary']);

/** 提及实体的名字列（标题解析与反链展示共用） */
const MENTION_ENTITY_SOURCES = {
  character: ['characters', 'name'],
  knowledge: ['knowledge_entries', 'title'],
  scene: ['scene_locations', 'name'],
  world: ['world_settings', 'title'],
  timeline: ['timeline_events', 'title'],
  glossary: ['glossary_terms', 'term']
};

/**
 * 组装某项目的提及词典：实体主名 + 别名表（正/负例）。
 * 别名逐条校验实体仍存在（实体被删后别名不产出悬空提及）。
 */
function loadMentionDictionary(projectId) {
  const rows = [];
  const push = (entityType, entityId, alias, polarity = 1) =>
    rows.push({ entity_type: entityType, entity_id: entityId, alias, polarity });

  for (const [type, [table, nameColumn]] of Object.entries(MENTION_ENTITY_SOURCES)) {
    const scoped = type === 'knowledge'
      ? "scope = 'global' OR project_id = ?"
      : 'project_id = ?';
    for (const row of all(`SELECT id, ${nameColumn} AS name FROM ${table} WHERE ${scoped}`, [projectId])) {
      push(type, row.id, row.name);
    }
  }
  for (const alias of all('SELECT entity_type, entity_id, alias, polarity FROM entity_aliases WHERE project_id = ?', [projectId])) {
    push(alias.entity_type, alias.entity_id, alias.alias, alias.polarity);
  }
  return rows;
}

/**
 * 重建一个章节的提及记录（先删后插）。
 * 词典规模实测无关紧要（首字符索引 2.5ms/10 万字），因此不做跨请求缓存，
 * 保证别名变更后下一次保存立即生效。草稿保存（3s 防抖）走这里同样无压力。
 */
function syncChapterMentions(chapterId) {
  const chapter = get('SELECT id, project_id, content FROM chapters WHERE id = ?', [chapterId]);
  if (!chapter) return;
  const scan = buildMentionScanner(loadMentionDictionary(chapter.project_id));
  const hits = scan(chapter.content || '');
  // SAVEPOINT 而非 BEGIN：本函数也会被 importProject 在其事务内调用，
  // 嵌套 BEGIN 会报错；SAVEPOINT 两种场景都合法。逐条 INSERT 自动提交
  // 会产生每条一次的 WAL fsync（实测 150 条提及 ≈ 10ms），包起来后一次落盘。
  db.exec('SAVEPOINT mentions_sync');
  try {
    run('DELETE FROM entity_mentions WHERE chapter_id = ?', [chapterId]);
    const timestamp = now();
    for (const hit of hits) {
      run(
        'INSERT INTO entity_mentions (project_id, chapter_id, entity_type, entity_id, surface, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [chapter.project_id, chapterId, hit.entityType, hit.entityId, hit.surface, hit.position, timestamp]
      );
    }
    db.exec('RELEASE mentions_sync');
  } catch (error) {
    db.exec('ROLLBACK TO mentions_sync');
    db.exec('RELEASE mentions_sync');
    throw error;
  }
  return hits.length;
}

/** 全项目重扫（别名增删后调用；200 章 × 3KB 实测量级 ≈ 数十毫秒） */
function rescanProjectMentions(projectId) {
  const chapters = all('SELECT id FROM chapters WHERE project_id = ?', [projectId]);
  let mentions = 0;
  for (const chapter of chapters) {
    mentions += syncChapterMentions(chapter.id) || 0;
  }
  logAudit('mentions.rescan', { projectId, chapters: chapters.length, mentions });
  return { chapters: chapters.length, mentions };
}

/** 章节提及（按实体分组 + 标题解析），供「本章提及」卡与 T014 召回使用 */
function listChapterMentions(chapterId) {
  const grouped = all(
    `SELECT entity_type, entity_id, COUNT(*) AS count, MIN(position) AS first_position, MIN(surface) AS surface
     FROM entity_mentions WHERE chapter_id = ?
     GROUP BY entity_type, entity_id ORDER BY first_position`,
    [chapterId]
  );
  const titles = {};
  for (const type of new Set(grouped.map(row => row.entity_type))) {
    const ids = grouped.filter(row => row.entity_type === type).map(row => row.entity_id);
    const [table, nameColumn] = MENTION_ENTITY_SOURCES[type];
    for (const row of all(`SELECT id, ${nameColumn} AS title FROM ${table} WHERE id IN (${ids.join(',')})`)) {
      titles[`${type}-${row.id}`] = row.title;
    }
  }
  return grouped.map(row => ({ ...row, title: titles[`${row.entity_type}-${row.entity_id}`] || row.surface }));
}

/** 反链：哪些章节提到了该实体（当前项目范围） */
function listEntityBacklinks(projectId, entityType, entityId) {
  return all(
    `SELECT c.id, c.title, c.status, COUNT(*) AS count
     FROM entity_mentions m JOIN chapters c ON c.id = m.chapter_id
     WHERE m.project_id = ? AND m.entity_type = ? AND m.entity_id = ?
     GROUP BY c.id ORDER BY count DESC, c.id`,
    [projectId, entityType, entityId]
  );
}

function listEntityAliases(projectId, entityType, entityId) {
  return all(
    'SELECT id, alias, polarity, created_at FROM entity_aliases WHERE project_id = ? AND entity_type = ? AND entity_id = ? ORDER BY id',
    [projectId, entityType, entityId]
  );
}

function addEntityAlias({ projectId, entityType, entityId, alias, polarity }) {
  const text = String(alias || '').trim();
  if (!text) throw new Error('alias is required');
  if (polarity !== -1 && polarity !== 1) throw new Error('polarity must be 1 or -1');
  // 幂等：同一实体的同一字符串只存一条（改极性=先删后插）
  run('DELETE FROM entity_aliases WHERE project_id = ? AND entity_type = ? AND entity_id = ? AND alias = ?',
    [projectId, entityType, entityId, text]);
  const result = run(
    'INSERT INTO entity_aliases (project_id, entity_type, entity_id, alias, polarity, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, entityType, entityId, text, polarity, now()]
  );
  logAudit('alias.add', { projectId, entityType, entityId, alias: text, polarity });
  return get('SELECT * FROM entity_aliases WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function deleteEntityAlias(id) {
  const alias = get('SELECT * FROM entity_aliases WHERE id = ?', [id]);
  if (!alias) return null;
  run('DELETE FROM entity_aliases WHERE id = ?', [id]);
  logAudit('alias.delete', { id, alias: alias.alias });
  return alias;
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      world_view TEXT NOT NULL,
      target_platform TEXT NOT NULL,
      writing_style TEXT NOT NULL,
      ai_base_url TEXT NOT NULL DEFAULT '',
      ai_model TEXT NOT NULL DEFAULT 'mock-novel-copilot',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS chapter_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      motivation TEXT NOT NULL,
      arc TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS character_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      source_name TEXT NOT NULL,
      target_name TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      description TEXT NOT NULL,
      strength INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      scope TEXT NOT NULL CHECK(scope IN ('global','project')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      embedding_ref TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      chapter_id INTEGER,
      task_type TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    );

    CREATE TABLE IF NOT EXISTS publish_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      chapter_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      scheduled_at TEXT,
      status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      rules TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      task_type TEXT NOT NULL,
      title TEXT NOT NULL,
      template TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS writing_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL UNIQUE,
      daily_words INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS writing_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      progress_date TEXT NOT NULL,
      words INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS ai_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES ai_tasks(id)
    );

    CREATE TABLE IF NOT EXISTS chapter_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      quote TEXT NOT NULL,
      note TEXT NOT NULL,
      severity TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    );

    CREATE TABLE IF NOT EXISTS creative_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      due_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS glossary_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      definition TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS sensitive_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      term TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      severity TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      event_time TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS scene_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      mood TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS world_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(text, entity_type UNINDEXED, entity_id UNINDEXED);
  `);

  const user = get('SELECT id FROM users WHERE username = ?', ['local-author']);
  if (!user) seedDb();
}

function seedDb() {
  const timestamp = now();
  const userResult = run('INSERT INTO users (username, display_name, created_at) VALUES (?, ?, ?)', ['local-author', '本地作者', timestamp]);
  const userId = Number(userResult.lastInsertRowid);

  const projectResult = run(
    `INSERT INTO projects (user_id, title, genre, world_view, target_platform, writing_style, ai_model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, '雾港星火', '蒸汽玄幻', '雾港由秘仪学院维持记忆封印，黑潮周期性唤醒城市真史。', '模拟平台 A', '悬疑、克制、意象化', 'mock-novel-copilot', timestamp, timestamp]
  );
  const projectId = Number(projectResult.lastInsertRowid);

  const chapterSeed = [
    ['第 10 章 · 黑潮钟声', '钟声第一次响起时，雾港的煤气灯同时熄灭。林祈站在档案馆门口，听见海潮从城市地下反向涌来。', '今晚 21:30 定时推送', '2026-07-10T21:30:00+08:00'],
    ['第 11 章 · 秘仪学院', '学院的穹顶像一只合拢的铁鸟，所有导师都避开了伊莱娜的名字。', '已存稿 · 待校验', null],
    ['第 12 章 · 钟楼下的背叛', '雨水沿着钟楼的铜管往下淌，像一行行被擦掉的证词。\n\n林祈把那枚裂开的星火徽章按在掌心，终于意识到罗文从一开始就没有站在调查局这边。可真正让他停下脚步的，不是背叛本身，而是罗文留下的那句暗语：黑潮不是灾难，是归乡。\n\n伊莱娜站在阴影里，斗篷边缘沾着银色粉尘。她没有解释，只把一张旧船票递过来。船票背面写着七年前失踪名单中的最后一个名字——林祈。', '写作中 · AI 同步辅助', null]
  ];

  const chapterIds = chapterSeed.map(([title, content, status, scheduledAt]) => {
    const result = run(
      `INSERT INTO chapters (project_id, title, content, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [projectId, title, content, status, scheduledAt, timestamp, timestamp]
    );
    return Number(result.lastInsertRowid);
  });

  for (const chapterId of chapterIds) {
    const chapter = get('SELECT content, version FROM chapters WHERE id = ?', [chapterId]);
    run('INSERT INTO chapter_versions (chapter_id, content, version, created_at) VALUES (?, ?, ?, ?)', [chapterId, chapter.content, chapter.version, timestamp]);
  }

  const characters = [
    ['林祈', '失忆调查员', '寻找黑潮真相与自己的过去', '从被动追查到主动揭开封印'],
    ['伊莱娜', '秘仪学院叛逃者', '阻止学院继续篡改城市记忆', '从沉默守护到公开选择'],
    ['罗文', '调查局线人', '用背叛引导林祈进入钟楼地下', '保护型背叛者']
  ];
  characters.forEach(item => run('INSERT INTO characters (project_id, name, role, motivation, arc) VALUES (?, ?, ?, ?, ?)', [projectId, ...item]));

  const relations = [
    ['林祈', '伊莱娜', '信任恢复中', '她知道林祈失忆真相，但不能直接说出封印关键词。', 72],
    ['林祈', '罗文', '保护型背叛', '罗文用背叛制造追踪路径，引导林祈进入钟楼地下。', 61],
    ['伊莱娜', '学院导师', '师徒决裂', '导师希望继续封印黑潮历史，伊莱娜选择公开真相。', 84]
  ];
  relations.forEach(item => run('INSERT INTO character_relations (project_id, source_name, target_name, relation_type, description, strength) VALUES (?, ?, ?, ?, ?, ?)', [projectId, ...item]));

  const entries = [
    [null, 'global', '网文黄金三章', '开局目标、冲突、金手指、悬念钩子需要在前三章建立。', '写作知识库', ['结构', '开篇']],
    [null, 'global', '角色弧光模板', '欲望、恐惧、错误信念、关键选择、代价与成长。', '写作知识库', ['人物', '弧光']],
    [null, 'global', '分镜式剧本', '场景目标、镜头节奏、人物调度、台词潜台词。', '写作知识库', ['剧本', '分镜']],
    [projectId, 'project', '黑潮', '来自雾港地下的周期性能量潮，被学院包装成灾难。', '项目设定', ['世界观']],
    [projectId, 'project', '星火徽章', '调查局旧制信物，可唤醒林祈失去的航海记忆。', '项目设定', ['道具', '伏笔']],
    [projectId, 'project', '秘仪学院', '表面培养术士，实际维护城市记忆封印。', '项目设定', ['组织']]
  ];
  entries.forEach(([entryProjectId, scope, title, body, source, tags]) => addKnowledgeEntry({ projectId: entryProjectId, scope, title, body, source, tags }));

  run(
    `INSERT INTO publish_tasks (project_id, chapter_id, platform, scheduled_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [projectId, chapterIds[0], '模拟平台 A', '2026-07-10T21:30:00+08:00', 'waiting', timestamp, timestamp]
  );
  run(
    `INSERT INTO publish_tasks (project_id, chapter_id, platform, scheduled_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [projectId, chapterIds[1], '模拟平台 B', '2026-07-11T20:00:00+08:00', 'checking', timestamp, timestamp]
  );

  run(
    `INSERT INTO platform_configs (project_id, platform, account_name, rules, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [projectId, '模拟平台 A', '雾港作者号', '每日 21:30 推送，标题不超过 24 字，章节末尾保留互动问题。', 'enabled', timestamp, timestamp]
  );

  run(
    `INSERT INTO prompt_templates (project_id, task_type, title, template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [projectId, 'polish', '拟人化润色模板', '保持作者原意，把静态描写改为具有动作意志的拟人化表达，避免过度华丽。', timestamp, timestamp]
  );

  run(
    `INSERT INTO writing_goals (project_id, daily_words, deadline, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [projectId, 3000, '2026-08-31', '第一卷完稿，保持每日更新节奏。', timestamp, timestamp]
  );

  run('INSERT INTO sensitive_rules (project_id, term, suggestion, severity, created_at) VALUES (?, ?, ?, ?, ?)', [projectId, '血腥', '改为“惨烈”或用氛围侧写替代', 'warning', timestamp]);
  run('INSERT INTO creative_todos (project_id, title, status, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, '回收黑潮钟声伏笔', 'open', '2026-07-15', timestamp, timestamp]);
  run('INSERT INTO timeline_events (project_id, event_time, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, '七年前', '林祈登上旧船', '失踪名单的源头事件，关联旧船票。', timestamp, timestamp]);
  run('INSERT INTO scene_locations (project_id, name, mood, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, '雾港钟楼', '阴冷、压迫、潮湿', '铜管布满水痕，地下传来反向海潮声。', timestamp, timestamp]);
  run('INSERT INTO world_settings (project_id, category, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, '能量规则', '黑潮周期', '黑潮每七年唤醒一次被封印的城市记忆。', timestamp, timestamp]);
}

function addKnowledgeEntry({ projectId, scope, title, body, source, tags = [] }) {
  const timestamp = now();
  const result = run(
    `INSERT INTO knowledge_entries (project_id, scope, title, body, source, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [projectId, scope, title, body, source, JSON.stringify(tags), timestamp, timestamp]
  );
  const id = Number(result.lastInsertRowid);
  syncSearchFts('knowledge', id, [title, body, source]);
  return id;
}

function logAudit(action, payload, userId = 1) {
  run('INSERT INTO audit_logs (user_id, action, payload, created_at) VALUES (?, ?, ?, ?)', [userId, action, JSON.stringify(payload), now()]);
}

function getBootstrapData(projectId = null) {
  const user = get('SELECT * FROM users WHERE username = ?', ['local-author']);
  // F079：projectId 为空时保持旧行为（取 id 最小的项目），零破坏；指定时取该项目
  const rawProject = projectId
    ? get('SELECT * FROM projects WHERE user_id = ? AND id = ?', [user.id, projectId])
    : get('SELECT * FROM projects WHERE user_id = ? ORDER BY id LIMIT 1', [user.id]);
  if (!rawProject) throw new Error('PROJECT_NOT_FOUND');
  // F075：project 一律走 sanitizeProject，响应体里不留 cipher/salt/明文
  const project = { ...sanitizeProject(rawProject), ...getProjectKeyMeta(rawProject.id) };
  return {
    user,
    project,
    projects: listProjects(),
    chapters: all('SELECT * FROM chapters WHERE project_id = ? ORDER BY id', [project.id]),
    knowledge: {
      global: all("SELECT * FROM knowledge_entries WHERE scope = 'global' ORDER BY id"),
      project: all("SELECT * FROM knowledge_entries WHERE scope = 'project' AND project_id = ? ORDER BY id", [project.id])
    },
    relations: all('SELECT * FROM character_relations WHERE project_id = ? ORDER BY id', [project.id]),
    publishTasks: listPublishTasks(project.id),
    graph: buildGraph(project.id)
  };
}

/**
 * 项目切换器数据源（F079）：id/标题/题材/更新时间 + 章节数（子查询计数，
 * 项目数量是个位数，逐行子查询成本可忽略）。
 */
function listProjects() {
  return all(`
    SELECT p.id, p.title, p.genre, p.updated_at,
           (SELECT COUNT(*) FROM chapters c WHERE c.project_id = p.id) AS chapter_count
    FROM projects p
    ORDER BY p.id
  `);
}

/** 项目存在性校验（F079）：主键查询。不存在 → 调用方返回 404，绝不静默回落。 */
function projectExists(projectId) {
  return Boolean(get('SELECT id FROM projects WHERE id = ?', [projectId]));
}

/**
 * 当前项目 id（单用户场景下 bootstrap 固定取 id 最小的项目，F079 将改为可切换）。
 *
 * 性能关键路径：handle() 的每个请求都需要 projectId。此前实现是先无条件拉整个
 * getBootstrapData()（全部章节正文 + 图谱构建）再取其中的 id——200 章 × 3KB 实测
 * 让每个轻量请求固定多付约 5ms，且成本随章节数线性增长。这里只做一次主键查询。
 */
function getCurrentProjectId() {
  const row = get('SELECT id FROM projects ORDER BY id LIMIT 1');
  return row ? row.id : null;
}

/** 章节计数：create-chapter 的默认标题用，避免为取个数为拉全量章节。 */
function countChapters(projectId) {
  return get('SELECT COUNT(*) AS count FROM chapters WHERE project_id = ?', [projectId]).count;
}

/**
 * AI 任务上下文：/ai 分支专用。
 * 此前直接复用 getBootstrapData()，一次 AI 调用会连带拉全部章节正文并构建图谱——
 * 两者都不进 prompt（buildPrompt 只用项目设定与当前章）。只取真正需要的部分。
 */
/**
 * AI 项目设定（F081 改造后 /ai 分支只需项目行本身；召回与上下文见 getRecallForChapter）
 */
function getAiProject(projectId) {
  return sanitizeProject(get('SELECT * FROM projects WHERE id = ?', [projectId]));
}

/** 前情记忆：上一章标题 + 尾部摘录（F086 章节摘要落库前的过渡方案） */
function getPreviousChapterTail(projectId, chapterId, tailLength = 200) {
  if (!chapterId) return null;
  const previous = get(
    'SELECT id, title, content FROM chapters WHERE project_id = ? AND id < ? ORDER BY id DESC LIMIT 1',
    [projectId, chapterId]
  );
  if (!previous) return null;
  const content = String(previous.content || '');
  return { title: previous.title, tail: content.slice(-tailLength) };
}

/**
 * 按需召回（F081 / T014）：对本章候选实体四维加权打分，返回 Top-K。
 * 候选 = 项目实体 + global 知识；打分算法在 novel-recall.js（纯函数）。
 * 旧实现把 relations/knowledge 全量塞进 prompt（JSON.stringify 整包），
 * prompt 长度随知识库线性膨胀且大多是噪声 —— 现在只带真正相关的条目。
 */
function getRecallForChapter(projectId, chapter, { topK = 8 } = {}) {
  if (!chapter) return [];
  const candidates = [];
  for (const row of all('SELECT id, name, role, motivation, arc FROM characters WHERE project_id = ?', [projectId])) {
    candidates.push({ entityType: 'character', entityId: row.id, title: row.name, text: [row.name, row.role, row.motivation, row.arc].join('\n') });
  }
  for (const row of all("SELECT id, title, body, source FROM knowledge_entries WHERE scope = 'global' OR project_id = ?", [projectId])) {
    candidates.push({ entityType: 'knowledge', entityId: row.id, title: row.title, text: [row.title, row.body, row.source].join('\n') });
  }
  for (const row of all('SELECT id, title, description FROM timeline_events WHERE project_id = ?', [projectId])) {
    candidates.push({ entityType: 'timeline', entityId: row.id, title: row.title, text: [row.title, row.description].join('\n') });
  }
  for (const row of all('SELECT id, name, mood, description FROM scene_locations WHERE project_id = ?', [projectId])) {
    candidates.push({ entityType: 'scene', entityId: row.id, title: row.name, text: [row.name, row.mood, row.description].join('\n') });
  }
  for (const row of all('SELECT id, title, content FROM world_settings WHERE project_id = ?', [projectId])) {
    candidates.push({ entityType: 'world', entityId: row.id, title: row.title, text: [row.title, row.content].join('\n') });
  }
  for (const row of all('SELECT id, term, definition FROM glossary_terms WHERE project_id = ?', [projectId])) {
    candidates.push({ entityType: 'glossary', entityId: row.id, title: row.term, text: [row.term, row.definition].join('\n') });
  }
  if (!candidates.length) return [];

  // 信号①：本章提及计数（T013 提及表）
  const mentionCounts = {};
  for (const row of all(
    'SELECT entity_type, entity_id, COUNT(*) AS count FROM entity_mentions WHERE chapter_id = ? GROUP BY entity_type, entity_id',
    [chapter.id]
  )) {
    mentionCounts[`${row.entity_type}:${row.entity_id}`] = row.count;
  }

  // 信号④：各实体最近一次被提及的章节位置（邻近度）
  const chapterIndex = get('SELECT COUNT(*) AS count FROM chapters WHERE project_id = ? AND id < ?', [projectId, chapter.id]).count;
  const indexById = new Map(
    all('SELECT id FROM chapters WHERE project_id = ? ORDER BY id', [projectId]).map((row, index) => [row.id, index])
  );
  const lastMentionIndex = {};
  for (const row of all(
    'SELECT entity_type, entity_id, MAX(chapter_id) AS last_chapter FROM entity_mentions WHERE project_id = ? GROUP BY entity_type, entity_id',
    [projectId]
  )) {
    const index = indexById.get(row.last_chapter);
    if (index != null) lastMentionIndex[`${row.entity_type}:${row.entity_id}`] = index;
  }

  return scoreRecallCandidates(candidates, {
    chapterText: chapter.content || '',
    mentionCounts,
    chapterIndex,
    lastMentionIndex,
    topK
  });
}

function createProject({ title, genre, worldView, targetPlatform, writingStyle }) {
  const timestamp = now();
  const user = get('SELECT id FROM users WHERE username = ?', ['local-author']);
  const result = run(
    `INSERT INTO projects (user_id, title, genre, world_view, target_platform, writing_style, ai_model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.id, title, genre, worldView, targetPlatform, writingStyle, 'mock-novel-copilot', timestamp, timestamp]
  );
  const projectId = Number(result.lastInsertRowid);
  const chapterResult = run(
    `INSERT INTO chapters (project_id, title, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [projectId, '第 1 章 · 新故事开篇', '在这里写下新故事的第一幕。', '写作中 · AI 同步辅助', timestamp, timestamp]
  );
  run('INSERT INTO chapter_versions (chapter_id, content, version, created_at) VALUES (?, ?, ?, ?)', [Number(chapterResult.lastInsertRowid), '在这里写下新故事的第一幕。', 1, timestamp]);
  logAudit('project.create', { projectId, title });
  return get('SELECT * FROM projects WHERE id = ?', [projectId]);
}

function listPublishTasks(projectId) {
  return all(
    `SELECT pt.*, c.title AS chapter_title
     FROM publish_tasks pt
     JOIN chapters c ON c.id = pt.chapter_id
     WHERE pt.project_id = ?
     ORDER BY pt.id`,
    [projectId]
  );
}

function createChapter({ projectId, title, content }) {
  const timestamp = now();
  const result = run(
    'INSERT INTO chapters (project_id, title, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, title, content, '写作中 · AI 同步辅助', timestamp, timestamp]
  );
  const chapterId = Number(result.lastInsertRowid);
  run("INSERT INTO chapter_versions (chapter_id, content, version, kind, name, created_at) VALUES (?, ?, ?, 'auto', '初始版本', ?)", [chapterId, content, 1, timestamp]);
  syncSearchFts('chapter', chapterId, [title, content]);
  syncChapterMentions(chapterId);
  logAudit('chapter.create', { projectId, chapterId, title });
  return get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
}

/**
 * 草稿保存（F076）：只更新正文，**不写入 chapter_versions**。
 *
 * 依据 X4 实测：2 小时写作 × 3s 防抖 = 单章 360 个版本 / 3.18MB，
 * 折算 100 章约 318MB，且版本列表单次返回 108 万字。
 * 因此防抖自动保存走草稿通道，只有「手动存稿」与「里程碑快照」才生成版本。
 */
function saveDraft(chapterId, content) {
  const chapter = get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
  if (!chapter) return null;
  const timestamp = now();
  run('UPDATE chapters SET content = ?, updated_at = ? WHERE id = ?', [content, timestamp, chapterId]);
  // 刻意不写 chapter_versions、不写审计日志 —— 否则高频自动保存会撑爆两张表。
  // 检索索引要同步：它只是 0.4ms 级的索引行替换，不属于「历史」，不违背上面的原则
  syncSearchFts('chapter', chapterId, [chapter.title, content]);
  syncChapterMentions(chapterId);
  return get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
}

function saveChapter(chapterId, content) {
  const chapter = get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
  if (!chapter) return null;
  const version = chapter.version + 1;
  const timestamp = now();
  run('UPDATE chapters SET content = ?, version = ?, status = ?, updated_at = ? WHERE id = ?', [content, version, '已存稿 · 待校验', timestamp, chapterId]);
  // kind='manual'：手动存稿才进版本表（kind/name 由 v1 迁移新增）
  run("INSERT INTO chapter_versions (chapter_id, content, version, kind, name, created_at) VALUES (?, ?, ?, 'manual', '', ?)", [chapterId, content, version, timestamp]);
  syncSearchFts('chapter', chapterId, [chapter.title, content]);
  syncChapterMentions(chapterId);
  logAudit('chapter.save', { chapterId, version });
  return get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
}

/**
 * 里程碑快照（F086，对标 Scrivener Snapshot）：作者**主动命名**打点。
 *
 * 与 saveChapter 的唯一区别是 kind/name：
 *   - kind='manual'    —— 手动存稿（顺手存一下）
 *   - kind='milestone' —— 「这一版有意义，我要留个记号」（大改前 / 定稿前打点）
 * 与 saveDraft 的区别是**必须进版本表**：草稿态不写版本（X4 实测：否则 100 章 318MB），
 * 但快照的目的就是留档，不写等于没打。
 *
 * @param {{chapterId:number, name:string, content?:string}} params content 缺省时以库中正文为准
 * @returns {object|null} 更新后的章节；章节不存在返回 null
 */
function createMilestone({ chapterId, name, content }) {
  const chapter = get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
  if (!chapter) return null;
  const version = chapter.version + 1;
  const timestamp = now();
  // 前端会把编辑器当前内容传过来 —— 「大改前打快照」要留住的就是屏幕上这一版
  const snapshot = typeof content === 'string' ? content : chapter.content;
  run('UPDATE chapters SET content = ?, version = ?, status = ?, updated_at = ? WHERE id = ?',
    [snapshot, version, '已存稿 · 里程碑', timestamp, chapterId]);
  run("INSERT INTO chapter_versions (chapter_id, content, version, kind, name, created_at) VALUES (?, ?, ?, 'milestone', ?, ?)",
    [chapterId, snapshot, version, String(name || '').trim(), timestamp]);
  syncSearchFts('chapter', chapterId, [chapter.title, snapshot]);
  syncChapterMentions(chapterId);
  logAudit('chapter.milestone', { chapterId, version, name });
  return get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
}

function archiveChapter(chapterId) {
  const timestamp = now();
  run('UPDATE chapters SET status = ?, updated_at = ? WHERE id = ?', ['已归档', timestamp, chapterId]);
  logAudit('chapter.archive', { chapterId });
  return get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
}

function listChapterVersions(chapterId) {
  return all('SELECT id, chapter_id, version, content, kind, name, created_at FROM chapter_versions WHERE chapter_id = ? ORDER BY version DESC', [chapterId]);
}

function rollbackChapter(chapterId, version) {
  const target = get('SELECT * FROM chapter_versions WHERE chapter_id = ? AND version = ?', [chapterId, version]);
  if (!target) return null;
  const chapter = get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
  const nextVersion = chapter.version + 1;
  const timestamp = now();
  run('UPDATE chapters SET content = ?, version = ?, status = ?, updated_at = ? WHERE id = ?', [target.content, nextVersion, '已回滚 · 待校验', timestamp, chapterId]);
  run("INSERT INTO chapter_versions (chapter_id, content, version, kind, name, created_at) VALUES (?, ?, ?, 'manual', ?, ?)", [chapterId, target.content, nextVersion, `回滚自 v${version}`, timestamp]);
  syncSearchFts('chapter', chapterId, [chapter.title, target.content]);
  syncChapterMentions(chapterId);
  logAudit('chapter.rollback', { chapterId, fromVersion: version, nextVersion });
  return get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
}

function addKnowledge({ projectId, scope, title, body, source, tags }) {
  const id = addKnowledgeEntry({ projectId: scope === 'project' ? projectId : null, scope, title, body, source, tags });
  logAudit('knowledge.add', { id, scope, title });
  return get('SELECT * FROM knowledge_entries WHERE id = ?', [id]);
}

function deleteKnowledge(id) {
  const entry = get('SELECT * FROM knowledge_entries WHERE id = ?', [id]);
  if (!entry) return null;
  run('DELETE FROM search_fts WHERE entity_type = ? AND entity_id = ?', ['knowledge', id]);
  run('DELETE FROM entity_mentions WHERE entity_type = ? AND entity_id = ?', ['knowledge', id]);
  run('DELETE FROM entity_aliases WHERE entity_type = ? AND entity_id = ?', ['knowledge', id]);
  run('DELETE FROM knowledge_entries WHERE id = ?', [id]);
  logAudit('knowledge.delete', { id, title: entry.title });
  return entry;
}

function addRelation({ projectId, sourceName, targetName, relationType, description, strength }) {
  const result = run(
    'INSERT INTO character_relations (project_id, source_name, target_name, relation_type, description, strength) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, sourceName, targetName, relationType, description, strength]
  );
  const id = Number(result.lastInsertRowid);
  logAudit('relation.add', { id, sourceName, targetName, relationType });
  return get('SELECT * FROM character_relations WHERE id = ?', [id]);
}

function addCharacterProfile({ projectId, name, role, motivation, arc }) {
  const result = run('INSERT INTO characters (project_id, name, role, motivation, arc) VALUES (?, ?, ?, ?, ?)', [projectId, name, role, motivation, arc]);
  syncSearchFts('character', Number(result.lastInsertRowid), [name, role, motivation, arc]);
  logAudit('character.add', { projectId, name });
  return get('SELECT * FROM characters WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listCharacters(projectId) {
  return all('SELECT * FROM characters WHERE project_id = ? ORDER BY id', [projectId]);
}

function addTimelineEvent({ projectId, eventTime, title, description }) {
  const timestamp = now();
  const result = run('INSERT INTO timeline_events (project_id, event_time, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, eventTime, title, description, timestamp, timestamp]);
  syncSearchFts('timeline', Number(result.lastInsertRowid), [title, description]);
  logAudit('timeline.add', { projectId, title });
  return get('SELECT * FROM timeline_events WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listTimeline(projectId) {
  return all('SELECT * FROM timeline_events WHERE project_id = ? ORDER BY id', [projectId]);
}

function addSceneLocation({ projectId, name, mood, description }) {
  const timestamp = now();
  const result = run('INSERT INTO scene_locations (project_id, name, mood, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, name, mood, description, timestamp, timestamp]);
  syncSearchFts('scene', Number(result.lastInsertRowid), [name, mood, description]);
  logAudit('scene.add', { projectId, name });
  return get('SELECT * FROM scene_locations WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listScenes(projectId) {
  return all('SELECT * FROM scene_locations WHERE project_id = ? ORDER BY id', [projectId]);
}

function addWorldSetting({ projectId, category, title, content }) {
  const timestamp = now();
  const result = run('INSERT INTO world_settings (project_id, category, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, category, title, content, timestamp, timestamp]);
  syncSearchFts('world', Number(result.lastInsertRowid), [title, content]);
  logAudit('world.add', { projectId, title });
  return get('SELECT * FROM world_settings WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listWorldSettings(projectId) {
  return all('SELECT * FROM world_settings WHERE project_id = ? ORDER BY id', [projectId]);
}

function listAiTasks(projectId, limit = 20) {
  return all(
    `SELECT id, chapter_id, task_type, output, provider, created_at
     FROM ai_tasks WHERE project_id = ? ORDER BY id DESC LIMIT ?`,
    [projectId, limit]
  ).map(row => ({ ...row, output: safeJsonParse(row.output) }));
}

function listAuditLogs(limit = 30) {
  return all('SELECT id, action, payload, created_at FROM audit_logs ORDER BY id DESC LIMIT ?', [limit])
    .map(row => ({ ...row, payload: safeJsonParse(row.payload) }));
}

function upsertPlatformConfig({ projectId, platform, accountName, rules }) {
  const timestamp = now();
  const existing = get('SELECT * FROM platform_configs WHERE project_id = ? AND platform = ?', [projectId, platform]);
  if (existing) {
    run('UPDATE platform_configs SET account_name = ?, rules = ?, status = ?, updated_at = ? WHERE id = ?', [accountName, rules, 'enabled', timestamp, existing.id]);
    logAudit('platform.update', { projectId, platform });
    return get('SELECT * FROM platform_configs WHERE id = ?', [existing.id]);
  }
  const result = run(
    'INSERT INTO platform_configs (project_id, platform, account_name, rules, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [projectId, platform, accountName, rules, 'enabled', timestamp, timestamp]
  );
  logAudit('platform.create', { projectId, platform });
  return get('SELECT * FROM platform_configs WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listPlatformConfigs(projectId) {
  return all('SELECT * FROM platform_configs WHERE project_id = ? ORDER BY id', [projectId]);
}

function getDashboardStats(projectId) {
  const chapterCount = get('SELECT COUNT(*) AS count FROM chapters WHERE project_id = ?', [projectId]).count;
  const knowledgeCount = get('SELECT COUNT(*) AS count FROM knowledge_entries WHERE scope = ? OR project_id = ?', ['global', projectId]).count;
  const aiTaskCount = get('SELECT COUNT(*) AS count FROM ai_tasks WHERE project_id = ?', [projectId]).count;
  const publishWaiting = get("SELECT COUNT(*) AS count FROM publish_tasks WHERE project_id = ? AND status IN ('waiting','checking')", [projectId]).count;
  const relationCount = get('SELECT COUNT(*) AS count FROM character_relations WHERE project_id = ?', [projectId]).count;
  const today = new Date().toISOString().slice(0, 10);
  const goal = get('SELECT * FROM writing_goals WHERE project_id = ?', [projectId]);
  const todayWords = get('SELECT COALESCE(SUM(words), 0) AS count FROM writing_progress WHERE project_id = ? AND progress_date = ?', [projectId, today]).count;
  return { chapterCount, knowledgeCount, aiTaskCount, publishWaiting, relationCount, goal, todayWords };
}

function upsertWritingGoal({ projectId, dailyWords, deadline, note }) {
  const timestamp = now();
  const existing = get('SELECT * FROM writing_goals WHERE project_id = ?', [projectId]);
  if (existing) {
    run('UPDATE writing_goals SET daily_words = ?, deadline = ?, note = ?, updated_at = ? WHERE project_id = ?', [dailyWords, deadline, note, timestamp, projectId]);
  } else {
    run('INSERT INTO writing_goals (project_id, daily_words, deadline, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, dailyWords, deadline, note, timestamp, timestamp]);
  }
  logAudit('goal.upsert', { projectId, dailyWords, deadline });
  return get('SELECT * FROM writing_goals WHERE project_id = ?', [projectId]);
}

function addWritingProgress({ projectId, words, note }) {
  const timestamp = now();
  const progressDate = timestamp.slice(0, 10);
  const result = run('INSERT INTO writing_progress (project_id, progress_date, words, note, created_at) VALUES (?, ?, ?, ?, ?)', [projectId, progressDate, words, note, timestamp]);
  logAudit('progress.add', { projectId, words, progressDate });
  return get('SELECT * FROM writing_progress WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listWritingProgress(projectId, limit = 14) {
  return all('SELECT * FROM writing_progress WHERE project_id = ? ORDER BY id DESC LIMIT ?', [projectId, limit]);
}

function addAiFeedback({ taskId, rating, note }) {
  const timestamp = now();
  const result = run('INSERT INTO ai_feedback (task_id, rating, note, created_at) VALUES (?, ?, ?, ?)', [taskId, rating, note, timestamp]);
  logAudit('ai.feedback', { taskId, rating });
  return get('SELECT * FROM ai_feedback WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function addAnnotation({ chapterId, quote, note, severity }) {
  const timestamp = now();
  const result = run('INSERT INTO chapter_annotations (chapter_id, quote, note, severity, created_at) VALUES (?, ?, ?, ?, ?)', [chapterId, quote, note, severity, timestamp]);
  logAudit('annotation.add', { chapterId, severity });
  return get('SELECT * FROM chapter_annotations WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listAnnotations(chapterId) {
  return all('SELECT * FROM chapter_annotations WHERE chapter_id = ? ORDER BY id DESC', [chapterId]);
}

function addTodo({ projectId, title, dueAt }) {
  const timestamp = now();
  const result = run('INSERT INTO creative_todos (project_id, title, status, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, title, 'open', dueAt, timestamp, timestamp]);
  logAudit('todo.add', { projectId, title });
  return get('SELECT * FROM creative_todos WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listTodos(projectId) {
  return all('SELECT * FROM creative_todos WHERE project_id = ? ORDER BY id DESC', [projectId]);
}

function toggleTodo(id) {
  const todo = get('SELECT * FROM creative_todos WHERE id = ?', [id]);
  if (!todo) return null;
  const status = todo.status === 'done' ? 'open' : 'done';
  run('UPDATE creative_todos SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
  logAudit('todo.toggle', { id, status });
  return get('SELECT * FROM creative_todos WHERE id = ?', [id]);
}

function addGlossaryTerm({ projectId, term, definition, category }) {
  const timestamp = now();
  const result = run('INSERT INTO glossary_terms (project_id, term, definition, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, term, definition, category, timestamp, timestamp]);
  syncSearchFts('glossary', Number(result.lastInsertRowid), [term, definition]);
  logAudit('glossary.add', { projectId, term });
  return get('SELECT * FROM glossary_terms WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listGlossary(projectId) {
  return all('SELECT * FROM glossary_terms WHERE project_id = ? ORDER BY id DESC', [projectId]);
}

function checkSensitiveText(projectId, text) {
  const rules = all('SELECT * FROM sensitive_rules WHERE project_id = ? OR project_id IS NULL ORDER BY id', [projectId]);
  const matches = rules.filter(rule => text.includes(rule.term)).map(rule => ({ term: rule.term, suggestion: rule.suggestion, severity: rule.severity }));
  logAudit('sensitive.check', { projectId, count: matches.length });
  return { matches, checkedAt: now() };
}

/**
 * 项目对象脱敏（F075）：接口层永不返回密钥原文、密文或盐。
 *
 * 只要一个 `SELECT * FROM projects` 的结果直接进响应体，cipher/salt 就会跟着出去。
 * 密文虽然不可直接利用，但落到浏览器缓存 / 导出的 JSON 里等于把加密材料拱手让人，
 * 因此这里统一「白名单字段 + 布尔标记 + 掩码」，而不是「删掉两个字段」。
 *
 * @param {object|null|undefined} project 原始 projects 行
 * @returns {object|null} 脱敏后的项目对象
 */
export function sanitizeProject(project) {
  if (!project) return null;
  const { api_key_cipher, api_key_salt, ...rest } = project;
  void api_key_salt; // 未使用，仅用于从 rest 中剔除
  return {
    ...rest,
    hasApiKey: Boolean(api_key_cipher)
  };
}

/**
 * 读取项目已保存密钥的掩码（用于 UI 回填 placeholder）。
 * 解密失败不抛异常 —— 掩码只是展示，失败时退化为「已配置但无法解密」。
 *
 * @param {number} projectId 项目 ID
 * @returns {{hasApiKey: boolean, apiKeyMasked: string, decryptable: boolean}}
 */
export function getProjectKeyMeta(projectId) {
  const row = get('SELECT api_key_cipher, api_key_salt FROM projects WHERE id = ?', [projectId]);
  if (!row || !row.api_key_cipher) return { hasApiKey: false, apiKeyMasked: '', decryptable: true };
  try {
    return {
      hasApiKey: true,
      apiKeyMasked: maskSecret(decryptSecret(row.api_key_cipher, row.api_key_salt)),
      decryptable: true
    };
  } catch {
    // 主密钥被换掉时走到这里。UI 需要能区分「没配」和「配了但解不开」，
    // 否则用户会以为自己从没保存过密钥，反复重试。
    return { hasApiKey: true, apiKeyMasked: '已配置但无法解密', decryptable: false };
  }
}

/**
 * 取出项目已保存密钥的明文，供 AI 调用使用。
 *
 * 刻意返回 { apiKey, error } 而不是直接抛：调用方（/api/novel/ai）需要把
 * 「解密失败」转成人能看懂的提示。若在这里抛异常，最终只剩一个 500，
 * 用户看到的是「AI 挂了」而不是「你的主密钥丢了」。
 *
 * @param {number} projectId 项目 ID
 * @returns {{apiKey: string, error: string|null}}
 */
export function loadProjectSecret(projectId) {
  const row = get('SELECT api_key_cipher, api_key_salt FROM projects WHERE id = ?', [projectId]);
  if (!row || !row.api_key_cipher) return { apiKey: '', error: null };
  try {
    return { apiKey: decryptSecret(row.api_key_cipher, row.api_key_salt), error: null };
  } catch (error) {
    return {
      apiKey: '',
      error: `项目已保存的密钥无法解密（${error.message}）。常见原因是 ~/.novel-ai/master.key 被替换、丢失或版本不匹配的备份覆盖；请恢复主密钥备份，或在 AI 配置中重新填写密钥。`
    };
  }
}

/** 「移除密钥」哨兵值：前端传这个字符串表示清空，避免与「留空不修改」歧义 */
export const CLEAR_API_KEY = '__CLEAR__';

/**
 * 更新 AI 配置（F075）。
 *
 * apiKey 三态语义（关键，避免用户「只改模型」就把密钥清空）：
 *   - 非空且非哨兵 → 加密后覆盖写入
 *   - 空字符串 / 不传 → 不修改，保持原值
 *   - '__CLEAR__'   → 清空密文与盐
 *
 * @param {{projectId:number, baseUrl?:string, model?:string, apiKey?:string}} params
 * @returns {object|null} 脱敏后的项目配置
 */
function updateAiSettings({ projectId, baseUrl, model, apiKey }) {
  const timestamp = now();

  if (apiKey === CLEAR_API_KEY) {
    run('UPDATE projects SET ai_base_url = ?, ai_model = ?, api_key_cipher = ?, api_key_salt = ?, updated_at = ? WHERE id = ?',
      [baseUrl, model, '', '', timestamp, projectId]);
    logAudit('settings.ai.update', { projectId, baseUrl: baseUrl ? '[configured]' : '', model, apiKey: '[cleared]' });
  } else if (apiKey) {
    const { cipher, salt } = encryptSecret(apiKey);
    run('UPDATE projects SET ai_base_url = ?, ai_model = ?, api_key_cipher = ?, api_key_salt = ?, updated_at = ? WHERE id = ?',
      [baseUrl, model, cipher, salt, timestamp, projectId]);
    // 审计日志只记动作与掩码，绝不记明文
    logAudit('settings.ai.update', { projectId, baseUrl: baseUrl ? '[configured]' : '', model, apiKey: maskSecret(apiKey) });
  } else {
    run('UPDATE projects SET ai_base_url = ?, ai_model = ?, updated_at = ? WHERE id = ?', [baseUrl, model, timestamp, projectId]);
    logAudit('settings.ai.update', { projectId, baseUrl: baseUrl ? '[configured]' : '', model, apiKey: '[unchanged]' });
  }

  return get('SELECT id, ai_base_url, ai_model FROM projects WHERE id = ?', [projectId]);
}

function upsertPromptTemplate({ projectId, taskType, title, template }) {
  const timestamp = now();
  const existing = get('SELECT * FROM prompt_templates WHERE project_id = ? AND task_type = ?', [projectId, taskType]);
  if (existing) {
    run('UPDATE prompt_templates SET title = ?, template = ?, updated_at = ? WHERE id = ?', [title, template, timestamp, existing.id]);
    logAudit('prompt.update', { projectId, taskType });
    return get('SELECT * FROM prompt_templates WHERE id = ?', [existing.id]);
  }
  const result = run(
    'INSERT INTO prompt_templates (project_id, task_type, title, template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, taskType, title, template, timestamp, timestamp]
  );
  logAudit('prompt.create', { projectId, taskType });
  return get('SELECT * FROM prompt_templates WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listPromptTemplates(projectId) {
  return all('SELECT * FROM prompt_templates WHERE project_id = ? OR project_id IS NULL ORDER BY id', [projectId]);
}

function bulkAddKnowledge({ projectId, scope, text }) {
  const rows = text.split('\n').map(line => line.trim()).filter(Boolean);
  const entries = rows.map((line, index) => {
    const [titlePart, ...bodyParts] = line.split(/[：:]/);
    const title = titlePart?.trim() || `批量知识 ${index + 1}`;
    const body = bodyParts.join('：').trim() || line;
    return addKnowledge({ projectId, scope, title, body, source: '批量导入', tags: ['bulk'] });
  });
  logAudit('knowledge.bulk', { projectId, scope, count: entries.length });
  return entries;
}

function exportChapter(chapterId) {
  const chapter = get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
  if (!chapter) return null;
  const project = get('SELECT * FROM projects WHERE id = ?', [chapter.project_id]);
  return { projectTitle: project.title, title: chapter.title, content: chapter.content, version: chapter.version, exportedAt: now() };
}

/**
 * 项目导出（F078 / T008）。
 *
 * 历史版本只覆盖 6 块数据（缺版本、批注、待办、术语、时间线、场景、世界观、目标等），
 * 作为「唯一内建的数据逃生通道」不完整。现在覆盖除 users / audit_logs 外的全部业务表：
 *   - users  ：单用户由首次启动 seed 重建，导出无意义；
 *   - audit_logs：运营噪音而非稿件资产，导入也不会回灌。
 * 密钥材料（api_key_cipher/salt）经 sanitizeProject 白名单剔除，导出 JSON 永不携带。
 *
 * @returns {object|null} 导出快照；项目不存在返回 null
 */
function exportProject(projectId) {
  const project = get('SELECT * FROM projects WHERE id = ?', [projectId]);
  if (!project) return null;
  return {
    formatVersion: 1,
    schemaVersion: currentVersion(db),
    exportedAt: now(),
    project: sanitizeProject(project),
    chapters: all('SELECT * FROM chapters WHERE project_id = ? ORDER BY id', [projectId]),
    chapterVersions: all(
      'SELECT cv.* FROM chapter_versions cv JOIN chapters c ON c.id = cv.chapter_id WHERE c.project_id = ? ORDER BY cv.id',
      [projectId]
    ),
    characters: all('SELECT * FROM characters WHERE project_id = ? ORDER BY id', [projectId]),
    relations: all('SELECT * FROM character_relations WHERE project_id = ? ORDER BY id', [projectId]),
    knowledge: all('SELECT * FROM knowledge_entries WHERE scope = ? OR project_id = ? ORDER BY id', ['global', projectId]),
    aiTasks: all('SELECT id, project_id, chapter_id, task_type, input, output, provider, created_at FROM ai_tasks WHERE project_id = ? ORDER BY id', [projectId]),
    aiFeedback: all(
      'SELECT f.* FROM ai_feedback f JOIN ai_tasks t ON t.id = f.task_id WHERE t.project_id = ? ORDER BY f.id',
      [projectId]
    ),
    publishTasks: all('SELECT * FROM publish_tasks WHERE project_id = ? ORDER BY id', [projectId]),
    platforms: listPlatformConfigs(projectId),
    prompts: listPromptTemplates(projectId),
    writingGoals: all('SELECT * FROM writing_goals WHERE project_id = ?', [projectId]),
    writingProgress: all('SELECT * FROM writing_progress WHERE project_id = ? ORDER BY id', [projectId]),
    todos: listTodos(projectId),
    annotations: all(
      'SELECT a.* FROM chapter_annotations a JOIN chapters c ON c.id = a.chapter_id WHERE c.project_id = ? ORDER BY a.id',
      [projectId]
    ),
    glossary: listGlossary(projectId),
    sensitiveRules: all('SELECT * FROM sensitive_rules WHERE project_id = ? OR project_id IS NULL ORDER BY id', [projectId]),
    timeline: listTimeline(projectId),
    scenes: listScenes(projectId),
    world: listWorldSettings(projectId)
  };
}

/** 导出格式版本：结构不兼容变更时递增，导入按此拒绝旧格式。 */
export const IMPORT_FORMAT_VERSION = 1;

/**
 * 导入载荷非法。API 层按 error.name 映射为 400（其余异常仍是 500）。
 */
export class ImportPayloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportPayloadError';
  }
}

/**
 * 导入前对整库做文件级备份（F078 / R5）。
 * 用 `VACUUM INTO` 生成压缩快照：单条 SQL、零依赖，且必须在事务外执行 ——
 * 因此本函数必须在 importProject 的 BEGIN 之前调用；备份失败 = 中止导入。
 */
function backupDatabase() {
  const backupDir = join(dirname(dbPath), 'backups');
  mkdirSync(backupDir, { recursive: true });
  // VACUUM INTO 的目标文件必须不存在；时间戳 + 随机后缀保证幂等重试不冲突
  const stamp = now().replace(/[:.]/g, '-');
  const target = join(backupDir, `pre-import-${stamp}-${Math.random().toString(36).slice(2, 8)}.sqlite`);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  return target;
}

/**
 * 校验导入载荷，非法直接抛 ImportPayloadError。
 * 宽进严出的边界：字段缺失按空集合处理（向后兼容更早的 6 块导出），
 * 但「根本不是导出 JSON」「格式版本不认识」必须拒绝。
 */
function assertImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ImportPayloadError('导入内容必须是本工具导出的项目 JSON 对象');
  }
  if (payload.formatVersion !== IMPORT_FORMAT_VERSION) {
    throw new ImportPayloadError(`不支持的导出格式版本：${payload.formatVersion ?? '缺失'}（当前支持 v${IMPORT_FORMAT_VERSION}，请先用当前版本重新导出）`);
  }
  if (!payload.project || typeof payload.project !== 'object') {
    throw new ImportPayloadError('导出 JSON 缺少 project 字段');
  }
  const arrayFields = ['chapters', 'chapterVersions', 'characters', 'relations', 'knowledge', 'aiTasks', 'aiFeedback',
    'publishTasks', 'platforms', 'prompts', 'writingGoals', 'writingProgress', 'todos', 'annotations',
    'glossary', 'sensitiveRules', 'timeline', 'scenes', 'world'];
  for (const field of arrayFields) {
    if (payload[field] !== undefined && !Array.isArray(payload[field])) {
      throw new ImportPayloadError(`导出 JSON 字段 ${field} 应为数组`);
    }
  }
}

/**
 * 删除项目的全部业务子树（F078 replace 模式）。
 * 外键顺序必须是「先子后父」，否则 foreign_keys=ON 下会直接报错中断：
 *   ai_feedback → ai_tasks → chapter_annotations / chapter_versions / publish_tasks → chapters → 其余
 * global 共享数据（global 知识/提示词/敏感词）刻意不删，导入侧用「存在即跳过」去重。
 */
function deleteProjectSubtree(projectId) {
  run('DELETE FROM ai_feedback WHERE task_id IN (SELECT id FROM ai_tasks WHERE project_id = ?)', [projectId]);
  run('DELETE FROM ai_tasks WHERE project_id = ?', [projectId]);
  // 检索索引随实体一并清理（F088）：按 project 归属批量删
  run(`DELETE FROM search_fts WHERE rowid IN (
        SELECT f.rowid FROM search_fts f
        JOIN chapters c ON f.entity_type = 'chapter' AND f.entity_id = c.id
        WHERE c.project_id = ?)`, [projectId]);
  // 检索索引随实体一并清理（F088）：章节按归属表联删，其余按 project_id 批删
  run(`DELETE FROM search_fts WHERE entity_type = 'chapter' AND entity_id IN (SELECT id FROM chapters WHERE project_id = ?)`, [projectId]);
  for (const [type, table] of Object.entries({
    character: 'characters',
    timeline: 'timeline_events',
    scene: 'scene_locations',
    world: 'world_settings',
    glossary: 'glossary_terms'
  })) {
    run(`DELETE FROM search_fts WHERE entity_type = ? AND entity_id IN (SELECT id FROM ${table} WHERE project_id = ?)`, [type, projectId]);
  }
  run(`DELETE FROM search_fts WHERE entity_type = 'knowledge' AND entity_id IN (SELECT id FROM knowledge_entries WHERE scope = 'project' AND project_id = ?)`, [projectId]);
  run('DELETE FROM chapter_annotations WHERE chapter_id IN (SELECT id FROM chapters WHERE project_id = ?)', [projectId]);
  run('DELETE FROM chapter_versions WHERE chapter_id IN (SELECT id FROM chapters WHERE project_id = ?)', [projectId]);
  run('DELETE FROM publish_tasks WHERE project_id = ?', [projectId]);
  run('DELETE FROM chapters WHERE project_id = ?', [projectId]);
  run('DELETE FROM writing_goals WHERE project_id = ?', [projectId]);
  run('DELETE FROM writing_progress WHERE project_id = ?', [projectId]);
  run('DELETE FROM creative_todos WHERE project_id = ?', [projectId]);
  run('DELETE FROM glossary_terms WHERE project_id = ?', [projectId]);
  run('DELETE FROM characters WHERE project_id = ?', [projectId]);
  run('DELETE FROM character_relations WHERE project_id = ?', [projectId]);
  run('DELETE FROM timeline_events WHERE project_id = ?', [projectId]);
  run('DELETE FROM scene_locations WHERE project_id = ?', [projectId]);
  run('DELETE FROM world_settings WHERE project_id = ?', [projectId]);
  run('DELETE FROM platform_configs WHERE project_id = ?', [projectId]);
  run('DELETE FROM prompt_templates WHERE project_id = ?', [projectId]);
  run('DELETE FROM sensitive_rules WHERE project_id = ?', [projectId]);
  run("DELETE FROM knowledge_entries WHERE scope = 'project' AND project_id = ?", [projectId]);
  logAudit('project.import.replace', { projectId });
}

/**
 * 导入回灌（F078 / T008）。两种模式：
 *   new（默认）—— 全量重映射 ID 导入为新项目，绝不触碰现有数据；
 *   replace    —— 清空目标项目的业务子树后回灌，项目 id 与账号归属保持不变。
 *
 * 安全链路：载荷校验（400）→ 整库 VACUUM INTO 备份（失败即中止）→ 单事务回灌（失败整体回滚）。
 * 全程外键顺序与 deleteProjectSubtree 相反（先父后子）；global 共享数据「存在即跳过」避免重复。
 *
 * @param {object} payload exportProject 的返回值（前端原样回传 + mode/projectId 字段）
 * @param {{mode?: 'new'|'replace', targetProjectId?: number|null}} options
 * @returns {{mode:string, projectId:number, backupPath:string, summary:Record<string,number>}}
 */
function importProject(payload, { mode = 'new', targetProjectId = null } = {}) {
  assertImportPayload(payload);
  if (mode !== 'new' && mode !== 'replace') {
    throw new ImportPayloadError(`不支持的导入模式：${mode}`);
  }
  const backupPath = backupDatabase();
  const data = payload;
  const ts = now();
  const summary = {};

  db.exec('BEGIN');
  try {
    let projectId;
    if (mode === 'replace') {
      projectId = Number(targetProjectId) || get('SELECT id FROM projects ORDER BY id LIMIT 1').id;
      if (!get('SELECT id FROM projects WHERE id = ?', [projectId])) {
        throw new ImportPayloadError(`覆盖目标项目不存在：${projectId}`);
      }
      deleteProjectSubtree(projectId);
      run(
        `UPDATE projects SET title = ?, genre = ?, world_view = ?, target_platform = ?, writing_style = ?,
         ai_base_url = ?, ai_model = ?, updated_at = ? WHERE id = ?`,
        [String(data.project.title || '导入项目'), String(data.project.genre || '类型待定'),
          String(data.project.world_view || ''), String(data.project.target_platform || ''),
          String(data.project.writing_style || ''), String(data.project.ai_base_url || ''),
          String(data.project.ai_model || 'mock-novel-copilot'), ts, projectId]
      );
    } else {
      const user = get('SELECT id FROM users WHERE username = ?', ['local-author']);
      const result = run(
        `INSERT INTO projects (user_id, title, genre, world_view, target_platform, writing_style, ai_base_url, ai_model, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, String(data.project.title || '导入项目'), String(data.project.genre || '类型待定'),
          String(data.project.world_view || ''), String(data.project.target_platform || ''),
          String(data.project.writing_style || ''), String(data.project.ai_base_url || ''),
          String(data.project.ai_model || 'mock-novel-copilot'), ts, ts]
      );
      projectId = Number(result.lastInsertRowid);
      logAudit('project.import.new', { projectId, title: data.project.title });
    }

    // ── 章节 + 版本（先父后子，保留 version 号与时间戳）──
    const chapterMap = new Map();
    for (const c of data.chapters || []) {
      const result = run(
        `INSERT INTO chapters (project_id, title, content, status, scheduled_at, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, String(c.title ?? '未命名章节'), String(c.content ?? ''), String(c.status ?? ''),
          c.scheduled_at ?? null, Number(c.version) || 1, c.created_at || ts, c.updated_at || ts]
      );
      const chapterId = Number(result.lastInsertRowid);
      chapterMap.set(Number(c.id), chapterId);
      syncSearchFts('chapter', chapterId, [c.title, c.content]);
      syncChapterMentions(chapterId);
    }
    summary.chapters = chapterMap.size;

    let versionCount = 0;
    for (const v of data.chapterVersions || []) {
      const chapterId = chapterMap.get(Number(v.chapter_id));
      if (!chapterId) continue;
      run(
        `INSERT INTO chapter_versions (chapter_id, content, version, kind, name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [chapterId, String(v.content ?? ''), Number(v.version) || 1, v.kind || 'auto', v.name || '', v.created_at || ts]
      );
      versionCount += 1;
    }
    summary.chapterVersions = versionCount;

    // ── 人物与关系 ──
    for (const ch of data.characters || []) {
      const result = run('INSERT INTO characters (project_id, name, role, motivation, arc) VALUES (?, ?, ?, ?, ?)',
        [projectId, String(ch.name ?? '未命名角色'), String(ch.role ?? ''), String(ch.motivation ?? ''), String(ch.arc ?? '')]);
      syncSearchFts('character', Number(result.lastInsertRowid), [ch.name, ch.role, ch.motivation, ch.arc]);
    }
    summary.characters = (data.characters || []).length;

    for (const r of data.relations || []) {
      run(
        `INSERT INTO character_relations (project_id, source_name, target_name, relation_type, description, strength)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, String(r.source_name ?? '角色 A'), String(r.target_name ?? '角色 B'),
          String(r.relation_type ?? '待设计'), String(r.description ?? ''), Number(r.strength) || 50]
      );
    }
    summary.relations = (data.relations || []).length;

    // ── 知识（global 共享数据存在即跳过；project 知识插入并同步 FTS）──
    let knowledgeCount = 0;
    for (const k of data.knowledge || []) {
      const scope = k.scope === 'global' ? 'global' : 'project';
      const title = String(k.title ?? '未命名知识');
      const body = String(k.body ?? '');
      const source = String(k.source ?? '');
      if (scope === 'global' && get("SELECT id FROM knowledge_entries WHERE scope = 'global' AND title = ?", [title])) {
        continue;
      }
      const result = run(
        `INSERT INTO knowledge_entries (project_id, scope, title, body, source, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [scope === 'global' ? null : projectId, scope, title, body, source,
          typeof k.tags === 'string' ? k.tags : JSON.stringify(k.tags || []), k.created_at || ts, k.updated_at || ts]
      );
      syncSearchFts('knowledge', Number(result.lastInsertRowid), [title, body, source]);
      knowledgeCount += 1;
    }
    summary.knowledge = knowledgeCount;

    // ── AI 任务与反馈（task_id 重映射）──
    const taskMap = new Map();
    for (const t of data.aiTasks || []) {
      const chapterId = t.chapter_id ? chapterMap.get(Number(t.chapter_id)) ?? null : null;
      const result = run(
        `INSERT INTO ai_tasks (project_id, chapter_id, task_type, input, output, provider, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [projectId, chapterId, String(t.task_type ?? 'sync'), String(t.input ?? '{}'), String(t.output ?? '[]'),
          String(t.provider ?? 'mock'), t.created_at || ts]
      );
      taskMap.set(Number(t.id), Number(result.lastInsertRowid));
    }
    let feedbackCount = 0;
    for (const f of data.aiFeedback || []) {
      const taskId = taskMap.get(Number(f.task_id));
      if (!taskId) continue;
      run('INSERT INTO ai_feedback (task_id, rating, note, created_at) VALUES (?, ?, ?, ?)',
        [taskId, Number(f.rating) || 5, String(f.note ?? ''), f.created_at || ts]);
      feedbackCount += 1;
    }
    summary.aiTasks = taskMap.size;
    summary.aiFeedback = feedbackCount;

    // ── 发布任务（chapter_id 重映射）──
    let publishCount = 0;
    for (const p of data.publishTasks || []) {
      const chapterId = chapterMap.get(Number(p.chapter_id));
      if (!chapterId) continue;
      run(
        `INSERT INTO publish_tasks (project_id, chapter_id, platform, scheduled_at, status, retry_count, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, chapterId, String(p.platform ?? ''), p.scheduled_at ?? null, String(p.status ?? 'waiting'),
          Number(p.retry_count) || 0, String(p.last_error ?? ''), p.created_at || ts, p.updated_at || ts]
      );
      publishCount += 1;
    }
    summary.publishTasks = publishCount;

    // ── 平台 / 提示词（global 提示词存在即跳过）──
    for (const p of data.platforms || []) {
      run(
        `INSERT INTO platform_configs (project_id, platform, account_name, rules, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [projectId, String(p.platform ?? ''), String(p.account_name ?? ''), String(p.rules ?? ''),
          String(p.status ?? 'enabled'), p.created_at || ts, p.updated_at || ts]
      );
    }
    summary.platforms = (data.platforms || []).length;

    let promptCount = 0;
    for (const p of data.prompts || []) {
      const isGlobal = p.project_id == null;
      if (isGlobal && get('SELECT id FROM prompt_templates WHERE project_id IS NULL AND task_type = ? AND title = ?', [p.task_type, p.title])) {
        continue;
      }
      run(
        `INSERT INTO prompt_templates (project_id, task_type, title, template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [isGlobal ? null : projectId, String(p.task_type ?? 'sync'), String(p.title ?? '自定义 Prompt'),
          String(p.template ?? ''), p.created_at || ts, p.updated_at || ts]
      );
      promptCount += 1;
    }
    summary.prompts = promptCount;

    // ── 目标 / 进度 / 待办 / 术语 / 时间线 / 场景 / 世界观 / 敏感词 ──
    for (const g of data.writingGoals || []) {
      run(
        `INSERT INTO writing_goals (project_id, daily_words, deadline, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, Number(g.daily_words) || 3000, String(g.deadline || ''), String(g.note ?? ''), g.created_at || ts, g.updated_at || ts]
      );
    }
    summary.writingGoals = (data.writingGoals || []).length;

    for (const p of data.writingProgress || []) {
      run('INSERT INTO writing_progress (project_id, progress_date, words, note, created_at) VALUES (?, ?, ?, ?, ?)',
        [projectId, String(p.progress_date || ts.slice(0, 10)), Number(p.words) || 0, String(p.note ?? ''), p.created_at || ts]);
    }
    summary.writingProgress = (data.writingProgress || []).length;

    for (const t of data.todos || []) {
      run(
        `INSERT INTO creative_todos (project_id, title, status, due_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, String(t.title ?? '未命名待办'), String(t.status ?? 'open'), t.due_at ?? null, t.created_at || ts, t.updated_at || ts]
      );
    }
    summary.todos = (data.todos || []).length;

    for (const t of data.glossary || []) {
      const result = run(
        `INSERT INTO glossary_terms (project_id, term, definition, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, String(t.term ?? '未命名词条'), String(t.definition ?? ''), String(t.category ?? '设定'), t.created_at || ts, t.updated_at || ts]
      );
      syncSearchFts('glossary', Number(result.lastInsertRowid), [t.term, t.definition]);
    }
    summary.glossary = (data.glossary || []).length;

    for (const e of data.timeline || []) {
      const result = run(
        `INSERT INTO timeline_events (project_id, event_time, title, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, String(e.event_time || '未知时间'), String(e.title ?? '未命名事件'), String(e.description ?? ''), e.created_at || ts, e.updated_at || ts]
      );
      syncSearchFts('timeline', Number(result.lastInsertRowid), [e.title, e.description]);
    }
    summary.timeline = (data.timeline || []).length;

    for (const s of data.scenes || []) {
      const result = run(
        `INSERT INTO scene_locations (project_id, name, mood, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, String(s.name ?? '未命名场景'), String(s.mood ?? ''), String(s.description ?? ''), s.created_at || ts, s.updated_at || ts]
      );
      syncSearchFts('scene', Number(result.lastInsertRowid), [s.name, s.mood, s.description]);
    }
    summary.scenes = (data.scenes || []).length;

    for (const w of data.world || []) {
      const result = run(
        `INSERT INTO world_settings (project_id, category, title, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, String(w.category ?? '设定'), String(w.title ?? '未命名设定'), String(w.content ?? ''), w.created_at || ts, w.updated_at || ts]
      );
      syncSearchFts('world', Number(result.lastInsertRowid), [w.title, w.content]);
    }
    summary.world = (data.world || []).length;

    let ruleCount = 0;
    for (const r of data.sensitiveRules || []) {
      const isGlobal = r.project_id == null;
      if (isGlobal && get('SELECT id FROM sensitive_rules WHERE project_id IS NULL AND term = ?', [r.term])) {
        continue;
      }
      run(
        'INSERT INTO sensitive_rules (project_id, term, suggestion, severity, created_at) VALUES (?, ?, ?, ?, ?)',
        [isGlobal ? null : projectId, String(r.term ?? ''), String(r.suggestion ?? ''), String(r.severity ?? 'warning'), r.created_at || ts]
      );
      ruleCount += 1;
    }
    summary.sensitiveRules = ruleCount;

    // ── 批注（chapter_id 重映射）──
    let annotationCount = 0;
    for (const a of data.annotations || []) {
      const chapterId = chapterMap.get(Number(a.chapter_id));
      if (!chapterId) continue;
      run('INSERT INTO chapter_annotations (chapter_id, quote, note, severity, created_at) VALUES (?, ?, ?, ?, ?)',
        [chapterId, String(a.quote ?? ''), String(a.note ?? ''), String(a.severity ?? 'info'), a.created_at || ts]);
      annotationCount += 1;
    }
    summary.annotations = annotationCount;

    db.exec('COMMIT');
    logAudit('project.import.done', { projectId, mode, backupPath });
    return { mode, projectId, backupPath, summary };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * 全库检索（F088 / T012）：FTS5 bigram 粗筛 → 字面后过滤 → 项目隔离。
 *
 * 为什么两段式：bigram 用召回换精确（搜「黑潮」必中「黑潮生」），FTS 只出候选 rowid，
 * 回原表 LIKE 精确校验才算命中。项目隔离在后过滤 SQL 里完成（global 知识全项目可见）。
 * 章节结果刻意不回传 content（单章可达数千字，列表页只需要定位信息）。
 */
function searchAll(projectId, query) {
  const keyword = String(query || '').trim();
  logAudit('search.query', { projectId, query: keyword });
  const empty = { query: keyword, knowledge: [], chapters: [], characters: [], timeline: [], scenes: [], world: [], glossary: [] };
  const match = ftsMatchExpression(keyword);
  if (!match) return empty;

  const candidates = all(
    `SELECT entity_type, entity_id FROM search_fts WHERE search_fts MATCH ? LIMIT 400`,
    [match]
  );
  if (!candidates.length) return empty;

  const idsByType = {};
  for (const row of candidates) {
    (idsByType[row.entity_type] ??= []).push(row.entity_id);
  }
  // 单类型上限：LIKE 后过滤在 100 个主键 IN 内进行，不会失控
  const ids = (type) => (idsByType[type] || []).slice(0, 100);
  const like = `%${keyword}%`;
  const queryIn = (type) => `id IN (${ids(type).join(',')})`;

  // 后过滤 + 项目隔离。knowledge 的 global 条目全项目可见（与 bootstrap 语义一致）
  const knowledge = ids('knowledge').length
    ? all(`SELECT * FROM knowledge_entries
           WHERE ${queryIn('knowledge')}
             AND (scope = 'global' OR project_id = ?)
             AND (title LIKE ? OR body LIKE ? OR source LIKE ?)
           ORDER BY scope, id`, [projectId, like, like, like])
    : [];
  const chapters = ids('chapter').length
    ? all(`SELECT id, title, status, updated_at FROM chapters
           WHERE ${queryIn('chapter')}
             AND project_id = ? AND (title LIKE ? OR content LIKE ?)
           ORDER BY id`, [projectId, like, like])
    : [];
  const characters = ids('character').length
    ? all(`SELECT id, name, role, arc FROM characters
           WHERE ${queryIn('character')}
             AND project_id = ? AND (name LIKE ? OR role LIKE ? OR motivation LIKE ? OR arc LIKE ?)
           ORDER BY id`, [projectId, like, like, like, like])
    : [];
  const timeline = ids('timeline').length
    ? all(`SELECT id, event_time, title, description FROM timeline_events
           WHERE ${queryIn('timeline')}
             AND project_id = ? AND (title LIKE ? OR description LIKE ?)
           ORDER BY id`, [projectId, like, like])
    : [];
  const scenes = ids('scene').length
    ? all(`SELECT id, name, mood, description FROM scene_locations
           WHERE ${queryIn('scene')}
             AND project_id = ? AND (name LIKE ? OR mood LIKE ? OR description LIKE ?)
           ORDER BY id`, [projectId, like, like, like])
    : [];
  const world = ids('world').length
    ? all(`SELECT id, category, title, content FROM world_settings
           WHERE ${queryIn('world')}
             AND project_id = ? AND (title LIKE ? OR content LIKE ?)
           ORDER BY id`, [projectId, like, like])
    : [];
  const glossary = ids('glossary').length
    ? all(`SELECT id, term, definition, category FROM glossary_terms
           WHERE ${queryIn('glossary')}
             AND project_id = ? AND (term LIKE ? OR definition LIKE ?)
           ORDER BY id`, [projectId, like, like])
    : [];

  return { query: keyword, knowledge, chapters, characters, timeline, scenes, world, glossary };
}

function buildGraph(projectId, graphType = 'all') {
  const project = get('SELECT title FROM projects WHERE id = ?', [projectId]);
  const entries = all('SELECT title, body, scope FROM knowledge_entries WHERE scope = ? OR project_id = ? ORDER BY id', ['global', projectId]);
  const relationRows = all('SELECT source_name, target_name, relation_type, strength FROM character_relations WHERE project_id = ?', [projectId]);
  const characters = all('SELECT name, role, motivation, arc FROM characters WHERE project_id = ? ORDER BY id', [projectId]);
  const timeline = all('SELECT event_time, title, description FROM timeline_events WHERE project_id = ? ORDER BY id', [projectId]);
  const scenes = all('SELECT name, mood, description FROM scene_locations WHERE project_id = ? ORDER BY id', [projectId]);
  const worldSettings = all('SELECT category, title, content FROM world_settings WHERE project_id = ? ORDER BY id', [projectId]);
  const nodes = [{ id: 'project', label: project.title, type: 'core', group: 'project', detail: '当前小说项目中心节点' }];
  const edges = [
    ...entries.map(entry => ({ source: 'project', target: `kb-${entry.title}`, label: entry.scope === 'global' ? '参考' : '设定', group: 'knowledge' })),
    ...relationRows.map(row => ({ source: `char-${row.source_name}`, target: `char-${row.target_name}`, label: row.relation_type, strength: row.strength, group: 'character' })),
    ...timeline.map(row => ({ source: 'project', target: `time-${row.title}`, label: row.event_time, group: 'timeline' })),
    ...scenes.map(row => ({ source: 'project', target: `scene-${row.name}`, label: row.mood, group: 'scene' })),
    ...worldSettings.map(row => ({ source: 'project', target: `world-${row.title}`, label: row.category, group: 'world' }))
  ];
  entries.forEach(entry => nodes.push({ id: `kb-${entry.title}`, label: entry.title, type: entry.scope, group: 'knowledge', detail: entry.body }));
  // Characters first so their full detail (role/motivation/arc) survives dedup over relation-only entries
  characters.forEach(row => nodes.push({ id: `char-${row.name}`, label: row.name, type: 'character', group: 'character', detail: `${row.role}｜${row.motivation}｜${row.arc}` }));
  timeline.forEach(row => nodes.push({ id: `time-${row.title}`, label: row.title, type: 'timeline', group: 'timeline', detail: `${row.event_time}｜${row.description}` }));
  scenes.forEach(row => nodes.push({ id: `scene-${row.name}`, label: row.name, type: 'scene', group: 'scene', detail: `${row.mood}｜${row.description}` }));
  worldSettings.forEach(row => nodes.push({ id: `world-${row.title}`, label: row.title, type: 'world', group: 'world', detail: `${row.category}｜${row.content}` }));
  // Relations last — they may add characters not in the characters table, but won't overwrite character details.
  // 用 Set 判重：此前对每条关系都线性扫描 nodes（O(关系数×节点数)），节点一多就是白费的开销
  const nodeIds = new Set(nodes.map(node => node.id));
  relationRows.forEach(row => {
    const sourceId = `char-${row.source_name}`;
    const targetId = `char-${row.target_name}`;
    if (!nodeIds.has(sourceId)) {
      nodes.push({ id: sourceId, label: row.source_name, type: 'character', group: 'character', detail: row.relation_type });
      nodeIds.add(sourceId);
    }
    if (!nodeIds.has(targetId)) {
      nodes.push({ id: targetId, label: row.target_name, type: 'character', group: 'character', detail: row.relation_type });
      nodeIds.add(targetId);
    }
  });
  const uniqueNodes = Array.from(new Map(nodes.map(node => [node.id, node])).values());
  const filteredNodes = graphType === 'all' ? uniqueNodes : uniqueNodes.filter(node => node.group === graphType || node.type === 'core');
  const ids = new Set(filteredNodes.map(node => node.id));
  const filteredEdges = edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && (graphType === 'all' || edge.group === graphType));
  const groups = filteredNodes.reduce((acc, node) => ({ ...acc, [node.group]: (acc[node.group] || 0) + 1 }), {});
  return { type: graphType, nodes: filteredNodes, edges: filteredEdges, stats: { nodeCount: filteredNodes.length, edgeCount: filteredEdges.length, groups } };
}

function recordAiTask({ projectId, chapterId, taskType, input, output, provider }) {
  const result = run(
    'INSERT INTO ai_tasks (project_id, chapter_id, task_type, input, output, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [projectId, chapterId, taskType, JSON.stringify(input), JSON.stringify(output), provider, now()]
  );
  return Number(result.lastInsertRowid);
}

initDb();

// T004：schema 版本迁移（零依赖，基于 PRAGMA user_version）
// 迁移失败会直接抛出异常终止启动 —— 绝不带半截 schema 继续运行。
const migrationResult = migrate(db);
if (migrationResult.applied.length) {
  console.log(`[db] schema v${migrationResult.from} → v${migrationResult.to}，已应用迁移 ${migrationResult.applied.join(', ')}`);
}

export { addEntityAlias, addAiFeedback, addAnnotation, addCharacterProfile, addGlossaryTerm, addKnowledge, addRelation, addSceneLocation, addTimelineEvent, addTodo, addWorldSetting, addWritingProgress, archiveChapter, buildGraph, bulkAddKnowledge, checkSensitiveText, countChapters, createChapter, createProject, deleteEntityAlias, deleteKnowledge, exportChapter, exportProject, getBootstrapData, get, getAiProject, getDashboardStats, getCurrentProjectId, getPreviousChapterTail, getRecallForChapter, importProject, listAiTasks, listEntityAliases, listEntityBacklinks, listChapterMentions, listProjects, projectExists, rescanProjectMentions, listAnnotations, listAuditLogs, listChapterVersions, listCharacters, listGlossary, listPlatformConfigs, listPromptTemplates, listPublishTasks, listScenes, listTimeline, listTodos, listWorldSettings, listWritingProgress, logAudit, recordAiTask, rollbackChapter, run, saveChapter, saveDraft, searchAll, toggleTodo, updateAiSettings, upsertPlatformConfig, upsertPromptTemplate, upsertWritingGoal };
