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
 * 零依赖：仅用 node:sqlite 原生能力。
 */

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
  }
  // v3 起由 M5/M6 任务追加：F080 提及表、F084 伏笔表、F083 情节线、F088 FTS5 bigram 重建
];

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
