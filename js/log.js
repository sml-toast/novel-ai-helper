// ── Logging System ──
import { escapeHtml } from './utils.js';
import { openDrawer } from './ui.js';
import { store } from './store.js';

// F093 死代码清理：原 logLevel（读 localStorage 后从未被使用，过滤走 getLogs 入参）已删除。
// LOG_LEVELS 与 getLogs 只在模块内被 renderLogPanel 使用，故收敛为私有，只导出真正有外部消费方的。
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
let logEntries = [];
const MAX_LOG_ENTRIES = 500;

export function log(level, category, message) {
  // Enforce size limit to prevent localStorage quota exceeded errors
  const serialized = JSON.stringify(logEntries);
  if (serialized.length > 4 * 1024 * 1024) compressLogs();

  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    level: level,
    category: category,
    message: message,
    activeChapter: store.activeChapter ? store.activeChapter.title : 'none'
  };
  logEntries.push(entry);
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries = logEntries.slice(-MAX_LOG_ENTRIES);
  }
  try { localStorage.setItem('novel_logs', JSON.stringify(logEntries)); } catch {}
  console.log(`[${level}] [${category}] ${message}`);
}

function getLogs(levelFilter) {
  let entries = JSON.parse(localStorage.getItem('novel_logs') || '[]');
  if (levelFilter !== undefined) {
    entries = entries.filter(e => LOG_LEVELS[e.level] >= LOG_LEVELS[levelFilter]);
  }
  return entries;
}

export function clearLogs() {
  logEntries = [];
  localStorage.removeItem('novel_logs');
  renderLogPanel();
}

export function compressLogs() {
  const entries = JSON.parse(localStorage.getItem('novel_logs') || '[]');
  if (entries.length <= 10) return;
  const recent = entries.slice(-100);
  const oldEntries = entries.slice(0, -100);
  if (oldEntries.length > 0) {
    const summary = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'SYSTEM',
      message: `日志压缩：${oldEntries.length} 条旧日志已归档`,
      activeChapter: 'system'
    };
    recent.unshift(summary);
  }
  localStorage.setItem('novel_logs', JSON.stringify(recent));
  logEntries = recent;
  renderLogPanel();
}

export function openLogDrawer() {
  openDrawer('log');
  renderLogPanel();
}

export function renderLogPanel() {
  const container = document.getElementById('logList');
  if (!container) return;

  const levelFilter = document.getElementById('logLevelFilter')?.value || 'DEBUG';
  const entries = getLogs(levelFilter);

  const levelColors = {
    DEBUG: '#6c757d',
    INFO: '#0d6efd',
    WARN: '#ffc107',
    ERROR: '#dc3545'
  };

  container.innerHTML = entries.map(entry => {
    const color = levelColors[entry.level] || '#6c757d';
    return `
      <div class="log-entry" style="border-left: 3px solid ${color}; padding: 8px; margin-bottom: 4px; background: var(--surface); border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: bold; color: ${color};">${escapeHtml(entry.level)}</span>
          <small style="color: var(--text-secondary);">${new Date(entry.timestamp).toLocaleString()}</small>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 2px;">[${escapeHtml(entry.category)}]</div>
        <div style="font-size: 13px;">${escapeHtml(entry.message)}</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">章节: ${escapeHtml(entry.activeChapter)}</div>
      </div>
    `;
  }).join('');

  const countEl = document.getElementById('logCount');
  if (countEl) countEl.textContent = `${entries.length} 条`;
}

try {
  logEntries = JSON.parse(localStorage.getItem('novel_logs') || '[]');
} catch (e) {
  logEntries = [];
}
