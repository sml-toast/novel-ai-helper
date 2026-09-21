// @ts-check
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
import { localDate } from './novel-date.js';

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
  },
  {
    version: 5,
    name: 'F086 写作会话表 + 打卡日期本地化',
    up(db) {
      // F086 会话计时：一次会话 = 一行。ended_at 为空表示「进行中」
      // （浏览器崩溃 / 直接关页面会留下这种行，由下次 startWritingSession 兜底关闭）。
      // session_date 冗余存本地日期，让热力图/连续天数直接按日期聚合，不必每次换算时区。
      db.exec(`CREATE TABLE IF NOT EXISTS writing_sessions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id   INTEGER NOT NULL,
        chapter_id   INTEGER,
        started_at   TEXT NOT NULL,
        ended_at     TEXT,
        duration_ms  INTEGER NOT NULL DEFAULT 0,
        start_words  INTEGER NOT NULL DEFAULT 0,
        end_words    INTEGER NOT NULL DEFAULT 0,
        words_delta  INTEGER NOT NULL DEFAULT 0,
        session_date TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (chapter_id) REFERENCES chapters(id)
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_project ON writing_sessions(project_id, started_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_open   ON writing_sessions(project_id, ended_at)');

      // 存量打卡日期本地化：progress_date 此前由 `toISOString().slice(0,10)`
      // 写入，是 UTC 日期。连续天数按它算会把清晨/晚间的写作算到隔壁一天，
      // 老库的连击会凭空断掉。按 created_at 换算回本地日期即可，不增删任何行。
      const rows = db.prepare('SELECT id, created_at, progress_date FROM writing_progress').all();
      const update = db.prepare('UPDATE writing_progress SET progress_date = ? WHERE id = ?');
      for (const row of rows) {
        const corrected = localDate(row.created_at);
        if (corrected && corrected !== row.progress_date) update.run(corrected, row.id);
      }
    }
  },
  {
    version: 6,
    name: 'F084 伏笔与线索生命周期',
    up(db) {
      // 伏笔：一行 = 一条需要回收的叙事线索。
      //   chapter_id       埋设章节（登记时所在章）
      //   expected_chapter 预期回收的章节序号（1 起）。章节表没有显式序号列，
      //                    全项目统一按 id 升序编号；「逾期」= expected_chapter
      //                    ≤ 当前章节数且状态仍为 planted，判定在服务端做。
      //   status           状态机 planted → resolved / abandoned（单向，只从
      //                    planted 流出；流转走 logAudit 留审计痕迹）。
      db.exec(`CREATE TABLE IF NOT EXISTS foreshadows (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id       INTEGER NOT NULL,
        chapter_id       INTEGER NOT NULL,
        title            TEXT NOT NULL,
        content          TEXT NOT NULL DEFAULT '',
        expected_chapter INTEGER,
        resolved_chapter INTEGER,
        status           TEXT NOT NULL DEFAULT 'planted' CHECK (status IN ('planted','resolved','abandoned')),
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (chapter_id) REFERENCES chapters(id)
      )`);
      // 列表页按「项目 + 状态」分组查询；章节卡片需要按埋设章节反查
      db.exec('CREATE INDEX IF NOT EXISTS idx_foreshadows_project ON foreshadows(project_id, status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_foreshadows_chapter ON foreshadows(chapter_id)');
    }
  },
  {
    version: 7,
    name: 'F083/F092 章节排序 + 场景归属章节 + 情节线',
    up(db) {
      // ── 章节显式序号：拖拽排序的数据基础（F083）──
      // 此前章节按 id 升序隐式编号，无序号列。sort_order 按「现有 id 顺序」回填 1..n
      // （每项目独立计数），保证 v6 老库升级后展示顺序零变化。
      // 回填用相关子查询「≤ 自己 id 的同项目章数」，对同一数据重复执行结果不变。
      // WHERE sort_order = 0 让重跑时绝不覆盖已由用户调整过的顺序（额外保险）。
      safeExec(db, `ALTER TABLE chapters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
      db.exec(`UPDATE chapters SET sort_order = (
        SELECT COUNT(*) FROM chapters c2
        WHERE c2.project_id = chapters.project_id AND c2.id <= chapters.id
      ) WHERE sort_order = 0`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_chapters_sort ON chapters(project_id, sort_order)');

      // ── 场景成为一级结构实体（F083）：归属章节 + 排序 + POV ──
      // 复用既有 scene_locations（避免两套场景数据源），chapter_id 为 NULL 的
      // 旧行归入「未分配」，由前端给出归类入口。pov 默认空串（无 POV）。
      safeExec(db, `ALTER TABLE scene_locations ADD COLUMN chapter_id INTEGER`);
      safeExec(db, `ALTER TABLE scene_locations ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
      safeExec(db, `ALTER TABLE scene_locations ADD COLUMN pov TEXT NOT NULL DEFAULT ''`);
      db.exec(`UPDATE scene_locations SET sort_order = (
        SELECT COUNT(*) FROM scene_locations s2
        WHERE s2.project_id = scene_locations.project_id AND s2.id <= scene_locations.id
      ) WHERE sort_order = 0`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scene_locations(project_id, chapter_id)');

      // ── 情节线（F083 Plot Grid）：线索实体 + 节拍矩阵 ──
      // plot_lines 一行 = 一条并行线索（PRD 验收：可追踪 ≥ 5 条）；
      // plot_beats 一行 = 该线索在某章节的一次节拍标记（line × chapter 唯一）。
      db.exec(`CREATE TABLE IF NOT EXISTS plot_lines (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id  INTEGER NOT NULL,
        title       TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT '#8b5cf6',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )`);
      db.exec(`CREATE TABLE IF NOT EXISTS plot_beats (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id    INTEGER NOT NULL,
        plot_line_id  INTEGER NOT NULL,
        chapter_id    INTEGER,
        scene_id      INTEGER,
        mark          TEXT NOT NULL DEFAULT 'progress' CHECK (mark IN ('progress','planned')),
        notes         TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (plot_line_id) REFERENCES plot_lines(id),
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (scene_id) REFERENCES scene_locations(id)
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_plotlines_project ON plot_lines(project_id, sort_order)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_plotbeats_line ON plot_beats(plot_line_id, chapter_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_plotbeats_project ON plot_beats(project_id)');
    }
  }
  // v8 起由后续任务追加
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
