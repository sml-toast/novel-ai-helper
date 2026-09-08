// 仪表盘：统计卡、进度、连续打卡热力图、逾期伏笔提醒、目标/进度录入、AI 历史与审计日志。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';
import { taskLabels } from './constants.js';

export async function refreshDashboard() {
  const container = document.querySelector('#dashboardStats');
  if (!container) return;
  if (!store.apiOnline) {
    container.innerHTML = renderStatCards({ chapterCount: store.state.chapters.length, knowledgeCount: 6, aiTaskCount: 0, publishWaiting: store.state.publishTasks.length, foreshadowOverdue: 0, relationCount: store.state.relations.length });
    renderProgress([], { goal: { daily_words: 3000, note: '本地演示目标' }, todayWords: 0 });
    renderStreakHeatmap(null);
    renderForeshadowAlerts([]);
    return;
  }
  try {
    const result = await apiFetch('/dashboard');
    container.innerHTML = renderStatCards(result.stats);
    renderProgress(result.progress, result.stats);
  } catch {
    container.innerHTML = '<div class="stat-card"><strong>--</strong><span>统计加载失败</span></div>';
  }
  // F084：仪表盘逾期伏笔提醒（判定在服务端；独立取数避免改动 /dashboard 既有断言）
  try {
    const foreshadowResult = await apiFetch('/foreshadows');
    renderForeshadowAlerts(foreshadowResult.foreshadows || []);
  } catch {
    renderForeshadowAlerts([]);
  }
  // F086：连续打卡 + 热力图单独取数（/dashboard 契约不动，既有测试零影响）
  try {
    const stats = await apiFetch('/sessions/stats?weeks=12');
    renderStreakHeatmap(stats.stats);
  } catch (error) {
    renderStreakHeatmap(null, error.message);
  }
}

/** 热力图格子分级：0 / 1-199 / 200-799 / 800-1999 / ≥2000 字，对标 GitHub contributions */
function heatmapLevel(words) {
  if (words <= 0) return 0;
  if (words < 200) return 1;
  if (words < 800) return 2;
  if (words < 2000) return 3;
  return 4;
}

/**
 * 渲染连续打卡天数与 12 周热力图（零依赖 CSS 网格）。
 * 布局：每列一周、列内 7 格按星期排布（0=周日），首尾列用空占位补齐 ——
 * 与 GitHub contributions 同构，纯 grid 不需要任何图表库。
 * @param {{streak:number, heatmap:Array}|null} stats null 时展示占位（离线/接口失败）
 * @param {string} [errorMessage]
 */
function renderStreakHeatmap(stats, errorMessage) {
  const grid = document.querySelector('#heatmapGrid');
  const streakEl = document.querySelector('#streakValue');
  if (!grid) return;
  if (streakEl) streakEl.textContent = stats ? String(stats.streak) : '--';
  if (!stats) {
    grid.innerHTML = `<span class="heatmap-empty">${errorMessage ? `热力图加载失败：${escapeHtml(errorMessage)}` : 'API 未启动，暂无打卡数据。'}</span>`;
    return;
  }
  // 先平铺成一维格子序列：开头按第一天的星期补空占位（0=周日），
  // 结尾补齐到 7 的倍数，再按每 7 格切一列 —— 每列天然是完整一周
  const leadingBlanks = new Date(`${stats.heatmap[0].date}T12:00:00`).getDay();
  const cells = [];
  for (let pad = 0; pad < leadingBlanks; pad += 1) cells.push('<span class="heatmap-cell empty"></span>');
  for (const day of stats.heatmap) {
    const level = heatmapLevel(day.words);
    const title = `${day.date} · ${day.words} 字${day.sessions ? ` · ${day.sessions} 次会话` : ''}`;
    cells.push(`<span class="heatmap-cell level-${level}" title="${escapeHtml(title)}"></span>`);
  }
  while (cells.length % 7 !== 0) cells.push('<span class="heatmap-cell empty"></span>');

  grid.innerHTML = '';
  for (let offset = 0; offset < cells.length; offset += 7) {
    grid.insertAdjacentHTML('beforeend', `<span class="heatmap-col">${cells.slice(offset, offset + 7).join('')}</span>`);
  }
}

function renderProgress(progress = [], stats = {}) {
  const list = document.querySelector('#progressList');
  if (!list) return;
  const goal = stats.goal?.daily_words || 0;
  const today = stats.todayWords || 0;
  const percent = goal ? Math.min(100, Math.round((today / goal) * 100)) : 0;
  list.innerHTML = `
    <article class="progress-card">
      <h3>今日进度 ${today}/${goal} 字</h3>
      <div class="progress-bar"><span style="width:${percent}%"></span></div>
      <p>${stats.goal?.note || '暂无目标说明'}</p>
    </article>
    ${progress.map(item => `<article class="progress-card"><h3>${item.progress_date} · ${item.words} 字</h3><p>${item.note || '无备注'}</p></article>`).join('')}
  `;
}

function renderStatCards(stats) {
  return [
    ['章节', stats.chapterCount],
    ['知识', stats.knowledgeCount],
    ['AI任务', stats.aiTaskCount],
    ['待推送', stats.publishWaiting],
    ['逾期伏笔', stats.foreshadowOverdue || 0],
    ['关系', stats.relationCount]
  ].map(([label, value]) => `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

export async function loadHistory() {
  const list = document.querySelector('#activityLog');
  if (!store.apiOnline) {
    list.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>API 未启动，暂无 AI 历史。</p></article>';
    return;
  }
  try {
    const result = await apiFetch('/ai/history?limit=12');
    list.innerHTML = result.tasks.map(task => `
      <article class="log-card">
        <h3>${escapeHtml(taskLabels[task.task_type] || task.task_type)} · ${escapeHtml(task.provider)}</h3>
        <p>${escapeHtml((task.output?.[0]?.body || '').slice(0, 110))}</p>
        <button type="button" data-ai-task-id="${escapeHtml(String(task.id))}">有用</button>
      </article>
    `).join('');
  } catch (error) {
    flashAssist('AI 历史加载失败', error.message, 'danger');
  }
}

export async function loadAudit() {
  const list = document.querySelector('#activityLog');
  if (!store.apiOnline) {
    list.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>API 未启动，暂无审计日志。</p></article>';
    return;
  }
  try {
    const result = await apiFetch('/audit?limit=12');
    list.innerHTML = result.logs.map(log => `
      <article class="log-card">
        <h3>${escapeHtml(log.action)}</h3>
        <p>${new Date(log.created_at).toLocaleString('zh-CN', { hour12: false })} · ${escapeHtml(JSON.stringify(log.payload))}</p>
      </article>
    `).join('');
  } catch (error) {
    flashAssist('审计日志加载失败', error.message, 'danger');
  }
}

export async function saveGoal() {
  if (!store.apiOnline) return flashAssist('写作目标', 'API 未启动，无法保存目标。', 'warning');
  try {
    // F087：deadline/note 开放录入，留空回落服务端既有默认
    await apiFetch('/goals', {
      method: 'POST',
      body: JSON.stringify({
        dailyWords: Number(document.querySelector('#dailyGoalInput').value || 0),
        deadline: document.querySelector('#goalDeadlineInput')?.value || '',
        note: document.querySelector('#goalNoteInput')?.value.trim() || ''
      })
    });
    flashAssist('写作目标已保存', '每日目标已更新。');
    refreshDashboard();
  } catch (error) {
    flashAssist('写作目标失败', error.message, 'danger');
  }
}

export async function addProgress() {
  if (!store.apiOnline) return flashAssist('写作进度', 'API 未启动，无法记录进度。', 'warning');
  try {
    await apiFetch('/progress', { method: 'POST', body: JSON.stringify({ words: Number(document.querySelector('#progressWordsInput').value || 0), note: '手动记录写作进度。' }) });
    flashAssist('写作进度已记录', '今日字数已更新到仪表盘。');
    refreshDashboard();
  } catch (error) {
    flashAssist('写作进度失败', error.message, 'danger');
  }
}

/** F084 验收：仪表盘逾期提醒（服务端已判定 overdue，这里只过滤展示） */
export function renderForeshadowAlerts(foreshadows) {
  const container = document.querySelector('#foreshadowAlerts');
  if (!container) return;
  const overdue = (foreshadows || []).filter(row => row.overdue);
  container.innerHTML = overdue.length
    ? overdue.map(row => `
      <article class="foreshadow-alert">
        <strong>逾期伏笔</strong>
        <span>《${escapeHtml(row.title)}》预期第 ${row.expected_chapter} 章回收（埋设于《${escapeHtml(row.chapter_title || '')}》），当前仍未回收。</span>
      </article>
    `).join('')
    : '';
}
