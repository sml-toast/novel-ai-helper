/**
 * 只读探针：打印测试库的 PRAGMA user_version（迁移框架的版本号）。
 *
 * 为什么要在子进程里做，而不是在用例里直接 import server/novel-db.js：
 *   novel-db.js 在 import 时就会执行 initDb + migrate，等于「又启动了一次服务」，
 *   无法区分「读取当前版本」与「刚跑完迁移」；而且测试主进程若长期持有
 *   SQLite 连接，会与 API 进程争抢写锁，掩盖真实的多进程并发行为
 *   （X3 实测的 88% 写失败率就是这种争抢的体现）。
 *
 * 用 readOnly 打开：只读不写，不产生 WAL 写入，也不参与写锁竞争。
 *
 * 用法：node tests/helpers/db-probe.mjs <dbPath>   →   stdout 输出一个整数
 *
 * @module tests/helpers/db-probe.mjs
 */

import { DatabaseSync } from 'node:sqlite';

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('用法：node tests/helpers/db-probe.mjs <dbPath>');
  process.exit(2);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec('PRAGMA busy_timeout = 5000');
console.log(String(db.prepare('PRAGMA user_version').get().user_version));
db.close();
