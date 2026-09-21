// 发布：任务看板、模拟推送/重试、平台配置、定时发布、调度器状态展示（F085）。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml, formatDate, formatDateTime } from './utils.js';
import { flashAssist } from './ui.js';
import { refreshDashboard } from './dashboard.js';

export function renderPublishBoard(tasks = store.state.publishTasks) {
  document.querySelector('#publishBoard').innerHTML = tasks.map(task => `
    <article class="publish-card">
      <span class="tag status-${task.status}">${escapeHtml(formatPublishStatus(task.status))}</span>
      <h3>${escapeHtml(task.chapter_title || task.title || '未命名章节')}</h3>
      <p>${escapeHtml(task.platform)} · ${escapeHtml(formatDate(task.scheduled_at))}${task.simulated ? ' · 模拟适配器' : ''}</p>
      <div class="card-actions">
        <button type="button" data-publish-id="${escapeHtml(String(task.id))}" data-publish-action="simulate">模拟推送</button>
        <button type="button" data-publish-id="${escapeHtml(String(task.id))}" data-publish-action="retry">重试</button>
      </div>
    </article>
  `).join('');
}

export function formatPublishStatus(status) {
  return ({ waiting: '等待推送', checking: '版权校验中', published: '已推送', failed: '推送失败' })[status] || status || '章节存稿';
}

/**
 * F085：调度器状态展示（发布面板顶部）。
 * 「运行中/已停止 + 下次扫描时间」由服务端计算返回，前端只展示。
 * offline 时把状态置灰，避免误读成「还在定时推送」。
 */
export async function refreshSchedulerStatus() {
  const stateEl = document.querySelector('#schedulerState');
  const nextEl = document.querySelector('#schedulerNext');
  if (!stateEl || !nextEl) return;
  if (!store.apiOnline) {
    stateEl.textContent = '调度器离线';
    stateEl.classList.add('offline');
    nextEl.textContent = '下次扫描：--';
    return;
  }
  try {
    const result = await apiFetch('/scheduler');
    const scheduler = result.scheduler || {};
    stateEl.textContent = scheduler.running ? '调度器运行中' : scheduler.disabled ? '调度器已禁用' : '调度器已停止';
    stateEl.classList.toggle('offline', !scheduler.running);
    nextEl.textContent = `下次扫描：${scheduler.nextScanAt ? formatDateTime(scheduler.nextScanAt) : '--'}`
      + (Number.isInteger(scheduler.lastTriggered) && scheduler.lastTriggered > 0 ? ` · 上轮触发 ${scheduler.lastTriggered} 个任务` : '');
  } catch {
    stateEl.textContent = '调度器状态未知';
    nextEl.textContent = '下次扫描：--';
  }
}

export async function handlePublishAction(taskId, action) {
  if (!store.apiOnline) return flashAssist('发布模拟', 'API 未启动，当前无法更新发布任务。', 'warning');
  try {
    await apiFetch(`/publish/${taskId}/${action}`, { method: 'POST' });
    const result = await apiFetch('/publish');
    renderPublishBoard(result.tasks);
    flashAssist(action === 'retry' ? '发布任务已重试' : '发布模拟完成', `任务 ${taskId} 状态已更新。`);
  } catch (error) {
    flashAssist('发布操作失败', error.message, 'danger');
  }
}

export async function savePlatform() {
  const platform = document.querySelector('#platformNameInput').value.trim();
  if (!store.apiOnline) return flashAssist('平台配置', 'API 未启动，无法保存平台配置。', 'warning');
  try {
    const result = await apiFetch('/platforms', {
      method: 'POST',
      body: JSON.stringify({
        platform,
        // F087：账号名/规则开放录入，留空回落服务端既有默认
        accountName: document.querySelector('#platformAccountInput')?.value.trim() || '',
        rules: document.querySelector('#platformRulesInput')?.value.trim() || ''
      })
    });
    flashAssist('平台配置已保存', `${result.platform.platform} · ${result.platform.account_name}`);
    refreshDashboard();
  } catch (error) {
    flashAssist('平台配置失败', error.message, 'danger');
  }
}

export async function schedulePublish() {
  const platform = document.querySelector('#platformNameInput').value.trim();
  if (!store.apiOnline) return flashAssist('定时发布', 'API 未启动，无法创建发布任务。', 'warning');
  // F087：发布时间开放选择（datetime-local），不再是写死的「+1 小时」。
  // 留空才回落 +1h（保守兜底，避免误发一个立刻触发的任务）；datetime-local
  // 无时区后缀，按本地时区解析，与「作者感知的推送时间」一致。
  const scheduledInput = document.querySelector('#scheduledAtInput')?.value;
  const scheduledAt = scheduledInput
    ? new Date(scheduledInput).toISOString()
    : new Date(Date.now() + 60 * 60 * 1000).toISOString();
  try {
    await apiFetch('/publish', { method: 'POST', body: JSON.stringify({ chapterId: store.activeChapter.id, platform, scheduledAt }) });
    const result = await apiFetch('/publish');
    store.state.publishTasks = result.tasks;
    renderPublishBoard(result.tasks);
    flashAssist('定时发布已创建', `${store.activeChapter.title} 将于 ${formatDateTime(scheduledAt)} 推送到 ${platform}。`);
    refreshDashboard();
  } catch (error) {
    flashAssist('定时发布失败', error.message, 'danger');
  }
}

export async function refreshPublish() {
  if (!store.apiOnline) return renderPublishBoard();
  try {
    const result = await apiFetch('/publish');
    store.state.publishTasks = result.tasks;
    renderPublishBoard(result.tasks);
  } catch (error) {
    flashAssist('发布计划刷新失败', error.message, 'danger');
  }
  // F085：面板打开时同步拉取调度器状态（独立端点，/publish 契约不变）
  refreshSchedulerStatus();
}
