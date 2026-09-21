/**
 * server/novel-scheduler.js —— 定时发布进程内调度器（F085）
 *
 * Q4 拍板结论：先做进程内 setInterval，系统级 launchd/cron 不做。
 * 因此验收项 1/3 的「重启不丢任务」靠两条兜底实现：
 *   ① 启动即扫描一次：scheduled_at 已过期且仍为 waiting 的任务一律补跑
 *      （覆盖「停机期间过期」场景）；
 *   ② 残留 publishing 行回置 waiting：单实例下，进程启动时还处于 publishing
 *      的任务必然是上次执行中途崩溃留下的，回置后由 ① 正常接管 ——
 *      「跑完没来得及写状态就崩」不会造成漏发，抢占式 UPDATE 保证不会双发。
 *
 * 与测试共存（硬约束）：46 条既有用例假设测试库数据不被后台进程改动。
 * 双保险禁用开关：
 *   1. NOVEL_SCHEDULER_DISABLED=1 环境变量（显式关闭，tests/start-test-api.js
 *      直接透传进程环境，外部设置即可生效，无需改 tests/ 任何文件）；
 *   2. 测试库路径自动识别：playwright.config.js 的 webServer env 由测试侧
 *      固定声明、server 侧无法注入，因此按 NOVEL_DB_PATH 含 novel-test.sqlite
 *      识别测试进程并自动禁用 —— 默认 `npx playwright test` 无需任何额外配置。
 *
 * 生命周期：刻意**不**对 interval unref（unref 后事件循环空闲会直接退出，
 * 调度器随之死亡）；优雅关闭由 novel-api.js 在 SIGINT/SIGTERM 时调用 stop()。
 */

import { all, dbPath, logAudit, run } from './novel-db.js';
import { executePublishTask, listPublishAdapters } from './novel-publish.js';

/** 默认扫描周期 30s（PRD 建议；误差 ≤ 60s 即达标）。 */
const DEFAULT_INTERVAL_MS = 30000;

/** 调度器单例状态。进程内单实例，无分布式问题。 */
const state = {
  timer: null,          // setInterval 句柄；null = 未启动/已停止
  running: false,
  disabled: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  nextScanAt: null,     // 下次计划扫描时间（ISO，UI 展示「下次扫描时间」）
  lastScanAt: null,     // 上次实际完成扫描的时间
  lastTriggered: 0,     // 上次扫描实际触发的任务数
  scanning: false       // 扫描重入保护：上一次没扫完就跳过本轮，防止慢适配器堆积
};

/**
 * 判定调度器是否应禁用。测试进程识别逻辑见文件头说明。
 * @returns {boolean}
 */
export function isSchedulerDisabled() {
  if (process.env.NOVEL_SCHEDULER_DISABLED === '1') return true;
  return /novel-test\.sqlite/i.test(dbPath);
}

/**
 * 启动调度器。幂等：重复调用只保留第一个实例。
 * @param {{intervalMs?:number}} [options]
 * @returns {{running:boolean, disabled:boolean, intervalMs:number, nextScanAt:string|null}} 启动后状态
 */
export function startPublishScheduler({ intervalMs } = {}) {
  if (state.timer) return getSchedulerStatus();

  state.intervalMs = Number(intervalMs || process.env.NOVEL_SCHEDULER_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  state.disabled = isSchedulerDisabled();

  if (state.disabled) {
    state.running = false;
    console.log('[scheduler] 定时发布调度器已禁用（NOVEL_SCHEDULER_DISABLED=1 或测试库环境）');
    return getSchedulerStatus();
  }

  // ① 补跑兜底：先回置残留的 publishing 行（上次崩溃残留），再立即扫描一次。
  //    回置必须先于扫描，否则崩溃残留行会永远卡在 publishing。
  recoverStalePublishing();
  void runScan('startup');

  // ② 周期扫描。刻意持有句柄不 unref —— 见文件头「生命周期」说明。
  state.timer = setInterval(() => void runScan('interval'), state.intervalMs);
  state.running = true;
  console.log(`[scheduler] 定时发布调度器已启动：每 ${Math.round(state.intervalMs / 1000)}s 扫描一次到期任务`);
  return getSchedulerStatus();
}

/** 停止调度器（优雅关闭路径调用）。进行中的一轮扫描让其自然收尾。 */
export function stopPublishScheduler() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.running = false;
  state.nextScanAt = null;
}

/** 调度器状态快照（GET /api/novel/scheduler 与发布面板展示用）。 */
export function getSchedulerStatus() {
  return {
    running: state.running,
    disabled: state.disabled,
    intervalMs: state.intervalMs,
    nextScanAt: state.nextScanAt,
    lastScanAt: state.lastScanAt,
    lastTriggered: state.lastTriggered,
    adapters: listPublishAdapters()
  };
}

/**
 * 启动兜底：回置所有 publishing 残留行为 waiting。
 * 单实例前提下该状态只可能是「执行中崩溃」留下的 —— 回置是安全的。
 */
function recoverStalePublishing() {
  const stale = all(`SELECT id FROM publish_tasks WHERE status = 'publishing'`);
  for (const row of stale) {
    run(`UPDATE publish_tasks SET status = 'waiting', updated_at = ? WHERE id = ? AND status = 'publishing'`,
      [new Date().toISOString(), row.id]);
    logAudit('publish.recover', { taskId: row.id, from: 'publishing', to: 'waiting', reason: 'process restart' });
  }
  if (stale.length) {
    console.log(`[scheduler] 已回置 ${stale.length} 条崩溃残留的执行中任务为待发布`);
  }
}

/**
 * 一轮扫描：找出全部到期（scheduled_at ≤ now）的 waiting 任务并逐个执行。
 * 执行走 executePublishTask 的抢占路径 —— 与手动模拟/重试并发安全，且
 * 即使「上次跑完没来得及写状态就崩」，本轮也只会成功抢占一次。
 *
 * 全库扫描而非按项目扫描：调度器是进程级单例，不属于任何项目上下文。
 *
 * @param {'startup'|'interval'} trigger 触发来源（审计用）
 */
async function runScan(trigger) {
  if (state.scanning) return; // 上一轮未结束（慢适配器/大量补跑），跳过本轮防堆积
  state.scanning = true;
  try {
    const nowMs = Date.now();
    // 到期判定在 JS 侧做时间戳比较（库里 ISO 串带不同时区后缀，SQL 字符串比较不可靠）
    const due = all(`SELECT id, scheduled_at FROM publish_tasks WHERE status = 'waiting' AND scheduled_at IS NOT NULL`)
      .filter(row => {
        const at = new Date(row.scheduled_at).getTime();
        return !Number.isNaN(at) && at <= nowMs;
      });
    for (const row of due) {
      await executePublishTask(row.id, { onlyWaiting: true });
    }
    state.lastScanAt = new Date().toISOString();
    state.lastTriggered = due.length;
    state.nextScanAt = new Date(Date.now() + state.intervalMs).toISOString();
    if (due.length) {
      logAudit('scheduler.scan', { trigger, triggered: due.length });
    }
  } catch (error) {
    // 扫描失败绝不能让进程崩溃（定时器回调里的异常没人接）—— 记审计后照常运行
    logAudit('scheduler.error', { trigger, message: error.message });
    console.error(`[scheduler] 扫描失败：${error.message}`);
  } finally {
    state.scanning = false;
  }
}
