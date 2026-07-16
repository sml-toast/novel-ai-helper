import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', '.data');
const dbPath = join(dbDir, 'novel-ai.sqlite');

mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

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

    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(title, body, source, content='knowledge_entries', content_rowid='id');
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
  run('INSERT INTO knowledge_fts(rowid, title, body, source) VALUES (?, ?, ?, ?)', [id, title, body, source]);
  return id;
}

function logAudit(action, payload, userId = 1) {
  run('INSERT INTO audit_logs (user_id, action, payload, created_at) VALUES (?, ?, ?, ?)', [userId, action, JSON.stringify(payload), now()]);
}

function getBootstrapData() {
  const user = get('SELECT * FROM users WHERE username = ?', ['local-author']);
  const project = get('SELECT * FROM projects WHERE user_id = ? ORDER BY id LIMIT 1', [user.id]);
  return {
    user,
    project,
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
  run('INSERT INTO chapter_versions (chapter_id, content, version, created_at) VALUES (?, ?, ?, ?)', [chapterId, content, 1, timestamp]);
  logAudit('chapter.create', { projectId, chapterId, title });
  return get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
}

function saveChapter(chapterId, content) {
  const chapter = get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
  if (!chapter) return null;
  const version = chapter.version + 1;
  const timestamp = now();
  run('UPDATE chapters SET content = ?, version = ?, status = ?, updated_at = ? WHERE id = ?', [content, version, '已存稿 · 待校验', timestamp, chapterId]);
  run('INSERT INTO chapter_versions (chapter_id, content, version, created_at) VALUES (?, ?, ?, ?)', [chapterId, content, version, timestamp]);
  logAudit('chapter.save', { chapterId, version });
  return get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
}

function archiveChapter(chapterId) {
  const timestamp = now();
  run('UPDATE chapters SET status = ?, updated_at = ? WHERE id = ?', ['已归档', timestamp, chapterId]);
  logAudit('chapter.archive', { chapterId });
  return get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
}

function listChapterVersions(chapterId) {
  return all('SELECT id, chapter_id, version, content, created_at FROM chapter_versions WHERE chapter_id = ? ORDER BY version DESC', [chapterId]);
}

function rollbackChapter(chapterId, version) {
  const target = get('SELECT * FROM chapter_versions WHERE chapter_id = ? AND version = ?', [chapterId, version]);
  if (!target) return null;
  const chapter = get('SELECT * FROM chapters WHERE id = ?', [chapterId]);
  const nextVersion = chapter.version + 1;
  const timestamp = now();
  run('UPDATE chapters SET content = ?, version = ?, status = ?, updated_at = ? WHERE id = ?', [target.content, nextVersion, '已回滚 · 待校验', timestamp, chapterId]);
  run('INSERT INTO chapter_versions (chapter_id, content, version, created_at) VALUES (?, ?, ?, ?)', [chapterId, target.content, nextVersion, timestamp]);
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
  run('DELETE FROM knowledge_fts WHERE rowid = ?', [id]);
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
  logAudit('character.add', { projectId, name });
  return get('SELECT * FROM characters WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listCharacters(projectId) {
  return all('SELECT * FROM characters WHERE project_id = ? ORDER BY id', [projectId]);
}

function addTimelineEvent({ projectId, eventTime, title, description }) {
  const timestamp = now();
  const result = run('INSERT INTO timeline_events (project_id, event_time, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, eventTime, title, description, timestamp, timestamp]);
  logAudit('timeline.add', { projectId, title });
  return get('SELECT * FROM timeline_events WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listTimeline(projectId) {
  return all('SELECT * FROM timeline_events WHERE project_id = ? ORDER BY id', [projectId]);
}

function addSceneLocation({ projectId, name, mood, description }) {
  const timestamp = now();
  const result = run('INSERT INTO scene_locations (project_id, name, mood, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, name, mood, description, timestamp, timestamp]);
  logAudit('scene.add', { projectId, name });
  return get('SELECT * FROM scene_locations WHERE id = ?', [Number(result.lastInsertRowid)]);
}

function listScenes(projectId) {
  return all('SELECT * FROM scene_locations WHERE project_id = ? ORDER BY id', [projectId]);
}

function addWorldSetting({ projectId, category, title, content }) {
  const timestamp = now();
  const result = run('INSERT INTO world_settings (project_id, category, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [projectId, category, title, content, timestamp, timestamp]);
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

function updateAiSettings({ projectId, baseUrl, model }) {
  const timestamp = now();
  run('UPDATE projects SET ai_base_url = ?, ai_model = ?, updated_at = ? WHERE id = ?', [baseUrl, model, timestamp, projectId]);
  logAudit('settings.ai.update', { projectId, baseUrl: baseUrl ? '[configured]' : '', model });
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

function exportProject(projectId) {
  const project = get('SELECT * FROM projects WHERE id = ?', [projectId]);
  return {
    exportedAt: now(),
    project,
    chapters: all('SELECT * FROM chapters WHERE project_id = ? ORDER BY id', [projectId]),
    relations: all('SELECT * FROM character_relations WHERE project_id = ? ORDER BY id', [projectId]),
    knowledge: all('SELECT * FROM knowledge_entries WHERE scope = ? OR project_id = ? ORDER BY id', ['global', projectId]),
    prompts: listPromptTemplates(projectId),
    platforms: listPlatformConfigs(projectId)
  };
}

function searchAll(projectId, query) {
  const keyword = `%${query}%`;
  const knowledgeRows = all(
    `SELECT ke.* FROM knowledge_entries ke
     WHERE (ke.scope = 'global' OR ke.project_id = ?) AND (ke.title LIKE ? OR ke.body LIKE ? OR ke.source LIKE ?)
     ORDER BY ke.scope, ke.id`,
    [projectId, keyword, keyword, keyword]
  );
  const chapterRows = all(
    `SELECT id, title, content, status FROM chapters
     WHERE project_id = ? AND (title LIKE ? OR content LIKE ?)
     ORDER BY id`,
    [projectId, keyword, keyword]
  );
  const networkRows = [
    { title: `网络文献：${query || '蒸汽都市'} 资料索引`, body: '模拟网络文献搜索结果，真实实现时由可替换 provider 返回标题、摘要、URL 与引用时间。', source: 'mock-web-search' }
  ];
  logAudit('search.query', { projectId, query });
  return { knowledge: knowledgeRows, chapters: chapterRows, network: networkRows };
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
  // Relations last — they may add characters not in the characters table, but won't overwrite character details
  relationRows.forEach(row => {
    const sourceId = `char-${row.source_name}`;
    const targetId = `char-${row.target_name}`;
    if (!nodes.some(n => n.id === sourceId)) nodes.push({ id: sourceId, label: row.source_name, type: 'character', group: 'character', detail: row.relation_type });
    if (!nodes.some(n => n.id === targetId)) nodes.push({ id: targetId, label: row.target_name, type: 'character', group: 'character', detail: row.relation_type });
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

export { addAiFeedback, addAnnotation, addCharacterProfile, addGlossaryTerm, addKnowledge, addRelation, addSceneLocation, addTimelineEvent, addTodo, addWorldSetting, addWritingProgress, archiveChapter, buildGraph, bulkAddKnowledge, checkSensitiveText, createChapter, createProject, deleteKnowledge, exportChapter, exportProject, getBootstrapData, get, getDashboardStats, listAiTasks, listAnnotations, listAuditLogs, listChapterVersions, listCharacters, listGlossary, listPlatformConfigs, listPromptTemplates, listPublishTasks, listScenes, listTimeline, listTodos, listWorldSettings, listWritingProgress, logAudit, recordAiTask, rollbackChapter, run, saveChapter, searchAll, toggleTodo, updateAiSettings, upsertPlatformConfig, upsertPromptTemplate, upsertWritingGoal };
