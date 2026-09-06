/**
 * server/novel-migrate.js —— 零依赖 schema 版本迁移框架（T004）
 *
 * 背景：initDb() 全部使用 CREATE TABLE IF NOT EXISTS，只能建新表、无法改已有表。
 * F075（密钥列）、F086（版本语义）、F080/F083/F084（新表）都需要改 schema，
 * 因此引入基于 SQLite `PRAGMA user_version` 的迁移机制。
 *
 * 设计约定（实测已验证：事务回滚、幂等、老数据存活）：
 *   1. 每个迁移 version 严格递增，且**永不修改已发布的迁移**
 *   2. 单个迁移包在一个事务里，失败整体回滚（绝不带半截 schema 继续跑）
 *   3. 迁移必须幂等 —— 用 safeExec 跳过「列已存在 / 表已存在」的重复执行
 *   4. 迁移失败 = 启动失败，由调用方决定是否中止进程
 *
 * 零依赖：仅用 node:sqlite 原生能力（novel-mentions 为无依赖纯函数模块）。
 */

import { buildMentionScanner } from './novel-mentions.js';

/**
 * ALTER TABLE 对已存在的列会抛 "duplicate column"，CREATE TABLE 对已存在的表会抛
 * "already exists"。迁移可能被重复执行（例如手工回滚 user_version 后重跑），
 * 因此需要容错跳过。其他错误一律上抛，不做静默吞掉。
 */
function safeExec(db, sql) {
  try {
    db.exec(sql);
    return true;
  } catch (error) {
    if (/duplicate column|already exists/i.test(error.message)) return false;
    throw error;
  }
}

/**
 * 迁移脚本数组。
 * 后续需求在对应任务中往这里追加，不要修改已发布的内容。
 */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'F075 密钥列 + F086 版本语义',
    up(db) {
      // F075：AI 配置闭环，密钥加密落库（密文 + 盐，永不明文）
      safeExec(db, `ALTER TABLE projects ADD COLUMN api_key_cipher TEXT NOT NULL DEFAULT ''`);
      safeExec(db, `ALTER TABLE projects ADD COLUMN api_key_salt   TEXT NOT NULL DEFAULT ''`);
      // F086：区分「自动草稿版本」与「里程碑快照」，配合 F076 防抖自动保存，
      // 避免每次自动保存都生成版本导致版本表爆炸（X4 实测：2h 写作可产生 360 个版本）
      safeExec(db, `ALTER TABLE chapter_versions ADD COLUMN kind TEXT NOT NULL DEFAULT 'auto'`);
      safeExec(db, `ALTER TABLE chapter_versions ADD COLUMN name TEXT NOT NULL DEFAULT ''`);
    }
  },
  {
    version: 2,
    name: '性能索引：project_id / chapter_id 外键列',
    up(db) {
      // SQLite 的 FOREIGN KEY 声明不会自动建索引，而本项目几乎全部查询都以
      // project_id（或 chapter_id）为过滤条件。数据量小时全表扫描无感，
      // 长篇（数百章 × 数千字 + 高频审计行）后会线性劣化，先补齐。
      const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_chapters_project    ON chapters(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_versions_chapter    ON chapter_versions(chapter_id)`,
        `CREATE INDEX IF NOT EXISTS idx_characters_project  ON characters(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_relations_project   ON character_relations(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_knowledge_project   ON knowledge_entries(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_ai_tasks_project    ON ai_tasks(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_publish_project     ON publish_tasks(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_platforms_project   ON platform_configs(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_prompts_project     ON prompt_templates(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_goals_project       ON writing_goals(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_progress_day        ON writing_progress(project_id, progress_date)`,
        `CREATE INDEX IF NOT EXISTS idx_todos_project       ON creative_todos(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_annotations_chapter ON chapter_annotations(chapter_id)`,
        `CREATE INDEX IF NOT EXISTS idx_glossary_project    ON glossary_terms(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_timeline_project    ON timeline_events(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_scenes_project      ON scene_locations(project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_world_project       ON world_settings(project_id)`
      ];
      for (const sql of indexes) db.exec(sql);
    }
  },
  {
    version: 3,
    name: 'F088 检索索引重建：knowledge_fts → search_fts（bigram）',
    up(db) {
      // 旧 knowledge_fts 是 external-content 表且写入的是明文，unicode61 把整段中文
      // 当一个 token，2 字词召回 3/10（design 文档 A 节实测）。重建为统一 search_fts：
      //   - 全实体覆盖（章节/知识/角色/时间线/场景/世界观/术语）
      //   - 全部按 bigram 切分写入；查询侧配合字面后过滤防「黑潮生」误召
      db.exec('DROP TABLE IF EXISTS knowledge_fts');
      db.exec('DROP TABLE IF EXISTS search_fts');
      db.exec(`CREATE VIRTUAL TABLE search_fts USING fts5(text, entity_type UNINDEXED, entity_id UNINDEXED)`);
      const insert = db.prepare('INSERT INTO search_fts(text, entity_type, entity_id) VALUES (?, ?, ?)');
      const toBigram = (text) => {
        const chars = Array.from(String(text || ''));
        if (chars.length <= 1) return chars.join('');
        const grams = [];
        for (let i = 0; i < chars.length - 1; i += 1) grams.push(chars[i] + chars[i + 1]);
        return grams.join(' ');
      };
      const sources = [
        ['chapter', "SELECT c.id, c.title, c.content FROM chapters c"],
        ['knowledge', "SELECT ke.id, ke.title, ke.body, ke.source FROM knowledge_entries ke"],
        ['character', "SELECT ch.id, ch.name, ch.role, ch.motivation, ch.arc FROM characters ch"],
        ['timeline', "SELECT te.id, te.title, te.description FROM timeline_events te"],
        ['scene', "SELECT sl.id, sl.name, sl.mood, sl.description FROM scene_locations sl"],
        ['world', "SELECT ws.id, ws.title, ws.content FROM world_settings ws"],
        ['glossary', "SELECT gt.id, gt.term, gt.definition FROM glossary_terms gt"]
      ];
      for (const [type, sql] of sources) {
        for (const row of db.prepare(sql).all()) {
          const text = Object.values(row).slice(1).filter(Boolean).join('\n');
          const indexed = toBigram(text);
          if (indexed) insert.run(indexed, type, row.id);
        }
      }
    }
  },
  {
    version: 4,
    name: 'F080 实体提及表 + 别名表（含负例）+ 存量回填',
    up(db) {
      // 提及表：一行 = 章节正文中一次实体命中（position 供 UI 定位高亮）
      db.exec(`CREATE TABLE IF NOT EXISTS entity_mentions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id  INTEGER NOT NULL,
        chapter_id  INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id   INTEGER NOT NULL,
        surface     TEXT NOT NULL,
        position    INTEGER NOT NULL,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (chapter_id) REFERENCES chapters(id)
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_mentions_chapter ON entity_mentions(chapter_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_mentions_entity ON entity_mentions(entity_type, entity_id)');

      // 别名表：正例（alias 是实体的另一种叫法）与负例（polarity=-1，
      // 遮蔽字符串，如「黑潮生」防止内部「黑潮」误报 —— design E.3）
      db.exec(`CREATE TABLE IF NOT EXISTS entity_aliases (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id  INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id   INTEGER NOT NULL,
        alias       TEXT NOT NULL,
        polarity    INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_aliases_entity ON entity_aliases(project_id, entity_type, entity_id)');

      // 存量回填：对全部章节按当前词典（实体主名）重建提及。
      // 词典在迁移内直接组装（novel-mentions 纯函数，无 SQL 依赖）。
      const chapters = db.prepare('SELECT id, project_id, content FROM chapters ORDER BY id').all();
      const dictionaryCache = new Map();
      const insertMention = db.prepare(
        'INSERT INTO entity_mentions (project_id, chapter_id, entity_type, entity_id, surface, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      const timestamp = new Date().toISOString();
      for (const chapter of chapters) {
        if (!dictionaryCache.has(chapter.project_id)) {
          dictionaryCache.set(chapter.project_id, buildDictionaryForProject(db, chapter.project_id));
        }
        const scan = buildMentionScanner(dictionaryCache.get(chapter.project_id));
        for (const hit of scan(chapter.content || '')) {
          insertMention.run(chapter.project_id, chapter.id, hit.entityType, hit.entityId, hit.surface, hit.position, timestamp);
        }
      }
    }
  }
  // v5 起由 M5/M6 任务追加：F084 伏笔表、F083 情节线
];

/** 迁移内使用的词典组装：实体主名（项目 + global 知识）。与 novel-db.js 的加载语义一致。 */
function buildDictionaryForProject(db, projectId) {
  const rows = [];
  const push = (entityType, entityId, alias) =>
    rows.push({ entity_type: entityType, entity_id: entityId, alias, polarity: 1 });
  for (const row of db.prepare('SELECT id, name FROM characters WHERE project_id = ?').all(projectId)) push('character', row.id, row.name);
  for (const row of db.prepare('SELECT id, title FROM timeline_events WHERE project_id = ?').all(projectId)) push('timeline', row.id, row.title);
  for (const row of db.prepare('SELECT id, name FROM scene_locations WHERE project_id = ?').all(projectId)) push('scene', row.id, row.name);
  for (const row of db.prepare('SELECT id, title FROM world_settings WHERE project_id = ?').all(projectId)) push('world', row.id, row.title);
  for (const row of db.prepare('SELECT id, term FROM glossary_terms WHERE project_id = ?').all(projectId)) push('glossary', row.id, row.term);
  for (const row of db.prepare("SELECT id, title FROM knowledge_entries WHERE scope = 'global' OR project_id = ?").all(projectId)) push('knowledge', row.id, row.title);
  return rows;
}

/** 只读：当前 schema 版本 */
export function currentVersion(db) {
  return Number(db.prepare('PRAGMA user_version').get().user_version);
}

/**
 * 执行迁移。
 * @returns {{from:number,to:number,applied:number[]}} 迁移审计记录
 * @throws 任一迁移失败时抛出（已回滚到该迁移之前的状态）
 */
export function migrate(db, migrations = MIGRATIONS) {
  const current = currentVersion(db);
  const target = migrations.length ? migrations[migrations.length - 1].version : current;
  const applied = [];

  for (const migration of migrations) {
    if (migration.version <= current) continue;

    db.exec('BEGIN');
    try {
      migration.up(db);
      // 整数拼接，无注入风险（PRAGMA 不支持参数绑定）
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      applied.push(migration.version);
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(
        `[migrate] 迁移 v${migration.version}（${migration.name}）失败，已回滚：${error.message}`
      );
    }
  }

  return { from: current, to: target, applied };
}
