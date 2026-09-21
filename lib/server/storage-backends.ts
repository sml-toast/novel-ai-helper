// 服务端存储后端（仅在 Node 运行时的 Route Handler 中调用，绝不被浏览器打包）。
// 支持三种本地保存方式 + WebDAV 云端压缩同步：
//   md    —— 服务器本地 Markdown 文件
//   sqlite—— 本地 SQLite 文件（用 sql.js / WASM，无需原生编译）
//   mysql —— MySQL 数据库（连接成功自动建库 novel + 建表）
// 云端   —— WebDAV：md 压缩 / SQLite 数据文本压缩 / MySQL 导出 SQL 压缩

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
import type { DataConfig } from "@/lib/settings-config";
import type { ManuscriptDoc } from "@/lib/storage";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function ensureDir(p: string) {
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ---------- 文稿 <-> Markdown ----------

function mdText(doc: ManuscriptDoc): string {
  return `# ${doc.title || "未命名"}\n\n${doc.content}\n`;
}

function parseMd(text: string): ManuscriptDoc {
  const lines = text.split(/\r?\n/);
  let title = "未命名";
  let start = 0;
  if (lines[0]?.startsWith("# ")) {
    title = lines[0].slice(2).trim() || "未命名";
    start = 1;
  }
  const content = lines.slice(start).join("\n").trim();
  const now = Date.now();
  return { id: "main", title, content, createdAt: now, updatedAt: now };
}

// ---------- SQLite（sql.js / WASM）----------

interface SqlJsStatic {
  Database: new (data?: Uint8Array) => SqlJsDb;
}
interface SqlJsDb {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
  export(): Uint8Array;
  close(): void;
}

let sqlPromise: Promise<SqlJsStatic> | null = null;
async function getSQL(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      // 不能用 require.resolve 定位 wasm：Turbopack 会把字面量静态替换成模块 ID。
      // sql.js(WASM) 在 Node 下默认以自身模块目录定位 sql-wasm.wasm，直接初始化即可。
      const mod = (await import("sql.js")) as unknown as {
        default: () => Promise<SqlJsStatic>;
      };
      return mod.default();
    })();
  }
  return sqlPromise;
}

const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS manuscripts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

async function openSqlite(path: string): Promise<SqlJsDb> {
  const SQL = await getSQL();
  if (existsSync(path)) {
    return new SQL.Database(new Uint8Array(readFileSync(path)));
  }
  return new SQL.Database();
}

async function writeSQLite(path: string, doc: ManuscriptDoc): Promise<void> {
  const db = await openSqlite(path);
  try {
    db.run(SQL_SCHEMA);
    db.run(
      "INSERT OR REPLACE INTO manuscripts (id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)",
      [doc.id, doc.title, doc.content, doc.createdAt, doc.updatedAt],
    );
    ensureDir(path);
    writeFileSync(path, Buffer.from(db.export()));
  } finally {
    db.close();
  }
}

async function readSQLite(path: string): Promise<ManuscriptDoc | null> {
  if (!existsSync(path)) return null;
  const db = await openSqlite(path);
  try {
    const res = db.exec(
      "SELECT id,title,content,created_at,updated_at FROM manuscripts WHERE id='main'",
    );
    if (!res.length || !res[0].values.length) return null;
    const r = res[0].values[0];
    return {
      id: String(r[0]),
      title: String(r[1]),
      content: String(r[2]),
      createdAt: Number(r[3]),
      updatedAt: Number(r[4]),
    };
  } finally {
    db.close();
  }
}

// ---------- MySQL ----------

import mysql from "mysql2/promise";

function safeDbName(raw: string): string {
  const n = (raw || "novel").replace(/[^A-Za-z0-9_]/g, "");
  return n || "novel";
}

async function getMysql(cfg: DataConfig) {
  return mysql.createConnection({
    host: cfg.mysqlHost || "127.0.0.1",
    port: Number(cfg.mysqlPort) || 3306,
    user: cfg.mysqlUser,
    password: cfg.mysqlPassword,
    multipleStatements: true,
  });
}

async function writeMySQL(cfg: DataConfig, doc: ManuscriptDoc): Promise<void> {
  const db = safeDbName(cfg.mysqlDatabase);
  const conn = await getMysql(cfg);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\``);
    await conn.query(`USE \`${db}\``);
    await conn.query(SQL_SCHEMA.replace(/^[\s\S]*?CREATE TABLE/, "CREATE TABLE"));
    await conn.query(
      `INSERT INTO manuscripts (id,title,content,created_at,updated_at)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE title=VALUES(title),content=VALUES(content),created_at=VALUES(created_at),updated_at=VALUES(updated_at)`,
      [doc.id, doc.title, doc.content, doc.createdAt, doc.updatedAt],
    );
  } finally {
    await conn.end();
  }
}

async function readMySQL(cfg: DataConfig): Promise<ManuscriptDoc | null> {
  const db = safeDbName(cfg.mysqlDatabase);
  const conn = await getMysql(cfg);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\``);
    await conn.query(`USE \`${db}\``);
    await conn.query(SQL_SCHEMA.replace(/^[\s\S]*?CREATE TABLE/, "CREATE TABLE"));
    const [rows] = (await conn.query(
      "SELECT id,title,content,created_at,updated_at FROM manuscripts WHERE id='main'",
    )) as unknown as [Record<string, unknown>[], unknown];
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: String(r.id),
      title: String(r.title),
      content: String(r.content),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  } finally {
    await conn.end();
  }
}

// ---------- 云端 WebDAV（压缩备份）----------

function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

function generateSqlDump(doc: ManuscriptDoc, withDatabase: boolean): string {
  const header = withDatabase ? "CREATE DATABASE IF NOT EXISTS novel;\nUSE novel;\n" : "";
  const create = `CREATE TABLE IF NOT EXISTS manuscripts (
  id VARCHAR(64) PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);\n`;
  const insert = `INSERT INTO manuscripts (id,title,content,created_at,updated_at) VALUES ('${sqlEscape(doc.id)}','${sqlEscape(doc.title)}','${sqlEscape(doc.content)}',${doc.createdAt},${doc.updatedAt});\n`;
  return header + create + insert;
}

function buildCloudPayload(cfg: DataConfig, doc: ManuscriptDoc): { buf: Buffer; fileName: string } {
  if (cfg.webdavFormat === "md") {
    return { buf: gzipSync(Buffer.from(mdText(doc), "utf8")), fileName: "novel.md.gz" };
  }
  if (cfg.webdavFormat === "mysql") {
    return {
      buf: gzipSync(Buffer.from(generateSqlDump(doc, true), "utf8")),
      fileName: "novel.mysql.sql.gz",
    };
  }
  return {
    buf: gzipSync(Buffer.from(generateSqlDump(doc, false), "utf8")),
    fileName: "novel.sqlite.sql.gz",
  };
}

async function pushWebdav(cfg: DataConfig, doc: ManuscriptDoc): Promise<void> {
  const base = (cfg.webdavUrl || "").replace(/\/+$/, "");
  if (!base) throw new Error("未填写 WebDAV 地址");
  const auth = cfg.webdavUser
    ? "Basic " + Buffer.from(`${cfg.webdavUser}:${cfg.webdavPassword}`).toString("base64")
    : "";
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;

  const remoteDir = (cfg.webdavRemoteDir || "").replace(/\/+$/, "") || "";
  const dirPath = remoteDir.startsWith("/") ? remoteDir : remoteDir ? "/" + remoteDir : "";
  if (dirPath) {
    await fetch(base + dirPath, { method: "MKCOL", headers }).catch(() => {});
  }

  const { buf, fileName } = buildCloudPayload(cfg, doc);
  const fileUrl = base + dirPath + "/" + fileName;
  const res = await fetch(fileUrl, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/gzip" },
    body: buf,
  });
  if (!res.ok) throw new Error(`WebDAV PUT 失败：${res.status} ${res.statusText}`);
}

// ---------- 统一入口 ----------

export interface SaveResult {
  ok: boolean;
  backend: string;
  cloud?: { ok: boolean; error?: string };
  error?: string;
}

export async function saveDoc(cfg: DataConfig, doc: ManuscriptDoc): Promise<SaveResult> {
  const backend = cfg.saveMode;
  try {
    if (cfg.saveMode === "md") {
      ensureDir(cfg.mdPath);
      writeFileSync(cfg.mdPath, mdText(doc), "utf8");
    } else if (cfg.saveMode === "sqlite") {
      await writeSQLite(cfg.sqlitePath, doc);
    } else if (cfg.saveMode === "mysql") {
      await writeMySQL(cfg, doc);
    } else {
      return { ok: false, backend, error: `未知保存方式：${cfg.saveMode}` };
    }
  } catch (e) {
    console.error("[storage:save]", backend, e);
    return { ok: false, backend, error: msg(e) };
  }

  let cloud: SaveResult["cloud"];
  if (cfg.cloudEnabled && cfg.webdavUrl?.trim()) {
    try {
      await pushWebdav(cfg, doc);
      cloud = { ok: true };
    } catch (e) {
      cloud = { ok: false, error: msg(e) };
    }
  }
  return { ok: true, backend, cloud };
}

export async function loadDoc(cfg: DataConfig): Promise<ManuscriptDoc | null> {
  if (cfg.saveMode === "md") {
    return existsSync(cfg.mdPath) ? parseMd(readFileSync(cfg.mdPath, "utf8")) : null;
  }
  if (cfg.saveMode === "sqlite") return readSQLite(cfg.sqlitePath);
  if (cfg.saveMode === "mysql") return readMySQL(cfg);
  return null;
}
