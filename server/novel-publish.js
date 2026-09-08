/**
 * server/novel-publish.js —— 发布任务与平台适配器（F085 改造）
 *
 * 原实现只有一条假发布路径（平台名含「失败」即失败），且扫描用「先读后写」，
 * 与调度器/手动重试并发时会把同一任务执行两次。
 *
 * 现在的执行模型是**抢占式状态机**：
 *   waiting/published/failed/checking --条件 UPDATE 抢占--> publishing --适配器--> published | failed
 * 抢占靠 `UPDATE ... WHERE status=...` 的 changes 行数判定，同一任务在同一时刻
 * 只能被一个执行方 claim 成功 —— 调度器扫描与手动模拟/重试天然互斥（验收：并发安全）。
 *
 * 状态机语义（重启补跑的幂等基础）：
 *   waiting     待发布（含重试后的任务），scheduled_at 到期即触发
 *   publishing  执行中。进程崩溃可能留下残留行，由调度器启动时兜底回置 waiting
 *   published   已发布（终态，不再触发）
 *   failed      失败（可经 retry 回到 waiting）
 *   checking    版权校验中（种子/人工状态，调度器不碰）
 *
 * 适配器注册表（F085 验收项 5）：{ name, simulated, push(task) }。
 * 本期只内置 simulate，不做任何真实第三方平台调用；结果带 simulated 标注。
 */

import { get, listPublishTasks, logAudit, run } from './novel-db.js';

/**
 * 平台适配器注册表。key = 适配器名，value = { name, simulated, push }。
 * push 可以是同步或异步，返回 { status: 'published'|'failed', error?: string }。
 * 真实平台接入时调用 registerPublishAdapter() 注册，业务代码无感知。
 * @type {Map<string, {name:string, simulated:boolean, push:Function}>}
 */
const publishAdapters = new Map();

/**
 * 注册一个发布适配器。
 * @param {{name:string, simulated?:boolean, push:Function}} adapter
 * @throws 名称重复或缺 push 时抛出（注册错误属开发期错误，fail fast）
 */
export function registerPublishAdapter(adapter) {
  if (!adapter || !adapter.name || typeof adapter.push !== 'function') {
    throw new Error('publish adapter requires { name, push }');
  }
  if (publishAdapters.has(adapter.name)) {
    throw new Error(`publish adapter already registered: ${adapter.name}`);
  }
  publishAdapters.set(adapter.name, { simulated: false, ...adapter, name: adapter.name });
}

/** 缺省适配器：纯模拟，绝不发起真实网络请求。结果显式标注 simulated: true。 */
const simulateAdapter = {
  name: 'simulate',
  simulated: true,
  /** @returns {{status:'published'|'failed', error:string}} */
  push(task) {
    // 保留既有模拟语义：平台名含「失败」→ 失败（供 UI/测试构造失败样例）
    if (task.platform.includes('失败')) {
      return { status: 'failed', error: '模拟平台限流，等待下一次重试。' };
    }
    return { status: 'published', error: '' };
  }
};
registerPublishAdapter(simulateAdapter);

/** 按名取适配器；未知名称回落 simulate（防脏配置把任务卡死在 publishing）。 */
export function getPublishAdapter(name) {
  return publishAdapters.get(name) || simulateAdapter;
}

/** 适配器清单（调度器状态端点与 UI 标注用，不暴露 push 函数本体）。 */
export function listPublishAdapters() {
  return [...publishAdapters.values()].map(({ name, simulated }) => ({ name, simulated }));
}

/**
 * 执行单个发布任务（抢占式）。
 *
 * @param {number} taskId
 * @param {{adapterName?:string, onlyWaiting?:boolean}} [options]
 *   onlyWaiting=true  调度器路径：只抢占 waiting 任务（checking/published 等绝不碰）
 *   onlyWaiting=false 手动路径（模拟推送按钮）：保留旧行为，允许对任意非执行中任务重放
 * @returns {Promise<object|null>} 执行后的任务行；任务不存在返回 null
 */
export async function executePublishTask(taskId, { adapterName = 'simulate', onlyWaiting = false } = {}) {
  const timestamp = new Date().toISOString();
  // 条件 UPDATE = 抢占。changes=0 说明任务已被并发方处理/正在处理：
  // 直接返回当前行让调用方幂等地展示，绝不重复执行（重启补跑的双跑保护也在这层）。
  const claimSql = onlyWaiting
    ? `UPDATE publish_tasks SET status = 'publishing', updated_at = ? WHERE id = ? AND status = 'waiting'`
    : `UPDATE publish_tasks SET status = 'publishing', updated_at = ? WHERE id = ? AND status != 'publishing'`;
  const claimed = run(claimSql, [timestamp, taskId]);
  if (!claimed.changes) {
    return get('SELECT * FROM publish_tasks WHERE id = ?', [taskId]) || null;
  }

  const task = get('SELECT * FROM publish_tasks WHERE id = ?', [taskId]);
  const adapter = getPublishAdapter(adapterName);
  let outcome;
  try {
    outcome = await adapter.push(task);
  } catch (error) {
    // 适配器抛异常 = 本次执行失败（而非任务丢失）——记录后走统一失败落库
    outcome = { status: 'failed', error: `适配器 ${adapter.name} 执行异常：${error.message}` };
  }

  const status = outcome?.status === 'published' ? 'published' : 'failed';
  const retryCount = status === 'failed' ? task.retry_count + 1 : task.retry_count;
  const lastError = status === 'failed' ? (outcome.error || '推送失败') : '';
  run(
    'UPDATE publish_tasks SET status = ?, retry_count = ?, last_error = ?, updated_at = ? WHERE id = ?',
    [status, retryCount, lastError, new Date().toISOString(), taskId]
  );
  logAudit('publish.execute', {
    taskId,
    adapter: adapter.name,
    simulated: adapter.simulated === true,
    status,
    triggeredBy: onlyWaiting ? 'scheduler' : 'manual'
  });
  return get('SELECT * FROM publish_tasks WHERE id = ?', [taskId]);
}

/** 手动模拟推送（发布面板「模拟推送」按钮）。保留旧的宽松语义：任意非执行中任务可重放。 */
export async function simulatePublish(taskId) {
  return executePublishTask(taskId, { onlyWaiting: false });
}

/** 重试：仅把 failed/waiting 任务回置为 waiting，由调度器或下次手动模拟接管。 */
export function retryPublish(taskId) {
  const task = get('SELECT * FROM publish_tasks WHERE id = ?', [taskId]);
  if (!task) return null;
  const timestamp = new Date().toISOString();
  run('UPDATE publish_tasks SET status = ?, last_error = ?, updated_at = ? WHERE id = ?', ['waiting', '', timestamp, taskId]);
  logAudit('publish.retry', { taskId });
  return get('SELECT * FROM publish_tasks WHERE id = ?', [taskId]);
}

/**
 * 扫描某项目下已到期的待发布任务并逐个执行（GET /publish 的惰性触发路径保留）。
 *
 * 到期判定用 Date 解析后的时间戳比较，而非字符串比较 —— 库里同时存在
 * 'Z' 结尾与 '+08:00' 两种 ISO 格式（种子数据就是 +08:00），字符串比较会错判。
 *
 * @param {number} projectId
 */
export async function scanDuePublishTasks(projectId) {
  const nowMs = Date.now();
  const due = listPublishTasks(projectId).filter(task => {
    if (task.status !== 'waiting' || !task.scheduled_at) return false;
    const at = new Date(task.scheduled_at).getTime();
    return !Number.isNaN(at) && at <= nowMs;
  });
  const results = [];
  for (const task of due) {
    // onlyWaiting=true：与调度器同一条抢占路径，重复扫描不会双跑
    results.push(await executePublishTask(task.id, { onlyWaiting: true }));
  }
  return results;
}

export function createPublishTask({ projectId, chapterId, platform, scheduledAt }) {
  if (!chapterId) throw new Error('chapterId is required');
  if (!platform) throw new Error('platform is required');
  const timestamp = new Date().toISOString();
  const result = run(
    'INSERT INTO publish_tasks (project_id, chapter_id, platform, scheduled_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [projectId, chapterId, platform, scheduledAt, 'waiting', timestamp, timestamp]
  );
  logAudit('publish.create', { projectId, chapterId, platform, scheduledAt });
  return get('SELECT * FROM publish_tasks WHERE id = ?', [Number(result.lastInsertRowid)]);
}
