/* ==========================================================================
 * F086 写作会话：会话计时与字数增量
 *
 * 为什么不每敲一个字都写库：3s 防抖的草稿保存已经高频 UPDATE 主表了，
 * 会话再逐键落库只会把 SQLite 打成瓶颈。策略是**前端累计、结束才落库**：
 *   开始（页面载入/切章）→ POST /sessions/start
 *   结束（切章/切项目/滚动 5 分钟/关页面）→ POST /sessions/end
 * 滚动开启 = end 后立即 start，字数基线随之重置，单行会话时长不会失真。
 * 浏览器崩溃留下的未关闭会话由服务端在下次 start 时兜底关闭（novel-db.js）。
 * ========================================================================== */
import { apiFetch } from './api.js';
import { store } from './store.js';
import { sessionMeter, sessionDurationEl, sessionDeltaEl, editor } from './dom.js';
import { log } from './log.js';

const SESSION_FLUSH_MS = 5 * 60 * 1000; // 每 5 分钟滚动一次会话

/** @type {{id:number|null, startedAt:number, startWords:number, startedAtMs:number}} */
const writingSession = { id: null, startedAt: 0, startWords: 0, startedAtMs: 0 };

/** 当前编辑器正文字数（与 updateWordCount 同口径：去空白） */
export function currentWordTotal() {
  return editor.value.replace(/\s/g, '').length;
}

function renderSessionMeter() {
  if (!sessionMeter || writingSession.id == null) return;
  const elapsedMs = Math.max(0, Date.now() - writingSession.startedAtMs);
  const minutes = Math.floor(elapsedMs / 60000);
  const seconds = Math.floor((elapsedMs % 60000) / 1000);
  const delta = Math.max(0, currentWordTotal() - writingSession.startWords);
  sessionDurationEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  sessionDeltaEl.textContent = `+${delta} 字`;
}

/** 开启会话（幂等：已有进行中会话时不重复开）。失败静默 —— 统计不构成主流程。 */
export async function startWritingSession(chapterId = store.activeChapter ? store.activeChapter.id : null) {
  if (!store.apiOnline || writingSession.id != null) return;
  try {
    const result = await apiFetch('/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ chapterId, startWords: currentWordTotal() })
    });
    writingSession.id = result.session.id;
    writingSession.startWords = Number(result.session.start_words || 0);
    writingSession.startedAtMs = Date.now();
    if (sessionMeter) sessionMeter.hidden = false;
    renderSessionMeter();
  } catch (error) {
    log('WARN', 'SESSION', `会话开启失败：${error.message}`);
  }
}

/**
 * 结束会话并落库。keepalive=true 用于 beforeunload：
 * 页面卸载后 fetch 仍会完成，是「关页面也记上一笔」的唯一零依赖手段。
 */
export async function endWritingSession({ keepalive = false } = {}) {
  if (writingSession.id == null) return;
  const sessionId = writingSession.id;
  writingSession.id = null;
  const request = apiFetch('/sessions/end', {
    method: 'POST',
    keepalive,
    body: JSON.stringify({ sessionId, endWords: currentWordTotal() })
  });
  if (keepalive) return; // 页面正在卸载，不等待也不报告
  try {
    await request;
  } catch (error) {
    log('WARN', 'SESSION', `会话落库失败：${error.message}`);
  } finally {
    if (sessionMeter) sessionMeter.hidden = true;
  }
}

/** 滚动会话：end 当前 → 立即 start 新会话（字数基线重置，时长不失真） */
async function rolloverWritingSession() {
  await endWritingSession();
  await startWritingSession();
}

setInterval(() => {
  if (writingSession.id != null) renderSessionMeter();
}, 1000);
setInterval(() => {
  if (store.apiOnline && writingSession.id != null) rolloverWritingSession();
}, SESSION_FLUSH_MS);
