import { get, listPublishTasks, logAudit, run } from './novel-db.js';

function simulatePublish(taskId) {
  const task = get('SELECT * FROM publish_tasks WHERE id = ?', [taskId]);
  if (!task) return null;
  const timestamp = new Date().toISOString();
  const shouldFail = task.platform.includes('失败');
  const status = shouldFail ? 'failed' : 'published';
  const retryCount = shouldFail ? task.retry_count + 1 : task.retry_count;
  const lastError = shouldFail ? '模拟平台限流，等待下一次重试。' : '';
  run('UPDATE publish_tasks SET status = ?, retry_count = ?, last_error = ?, updated_at = ? WHERE id = ?', [status, retryCount, lastError, timestamp, taskId]);
  logAudit('publish.simulate', { taskId, platform: task.platform, status, retryCount });
  return get('SELECT * FROM publish_tasks WHERE id = ?', [taskId]);
}

function retryPublish(taskId) {
  const task = get('SELECT * FROM publish_tasks WHERE id = ?', [taskId]);
  if (!task) return null;
  const timestamp = new Date().toISOString();
  run('UPDATE publish_tasks SET status = ?, last_error = ?, updated_at = ? WHERE id = ?', ['waiting', '', timestamp, taskId]);
  logAudit('publish.retry', { taskId });
  return get('SELECT * FROM publish_tasks WHERE id = ?', [taskId]);
}

function scanDuePublishTasks(projectId) {
  const now = new Date().toISOString();
  const tasks = listPublishTasks(projectId).filter(task => task.status === 'waiting' && task.scheduled_at && task.scheduled_at <= now);
  return tasks.map(task => simulatePublish(task.id));
}

function createPublishTask({ projectId, chapterId, platform, scheduledAt }) {
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

export { createPublishTask, retryPublish, scanDuePublishTasks, simulatePublish };
