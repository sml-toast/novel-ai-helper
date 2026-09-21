/* ==========================================================================
 * F076 防丢稿：dirty 状态机 + 3s 防抖草稿自动保存
 *
 * 为什么自动保存不生成版本（与 F086 的强耦合规则）：
 *   实测 120 分钟写作 × 3s 防抖 = 单章 360 个版本 / 3.18MB，折算 100 章 318MB，
 *   且版本列表接口单次要返回 108 万字。草稿态只 UPDATE chapters.content、
 *   不 INSERT chapter_versions，压缩比约 45 倍。
 *   只有「手动存稿（/save）」「里程碑快照」「回滚」才写版本表。
 * ========================================================================== */
import { apiFetch } from './api.js';
import { store } from './store.js';
import { editor, saveIndicator, autoSaveHint } from './dom.js';
import { flashAssist } from './ui.js';

export const AUTOSAVE_DELAY = 3000;
export const MAX_RETRY = 3;              // 连续失败 3 次后降级到 localStorage

const SAVE_LABELS = {
  saved: '已保存',
  unsaved: '未保存',
  saving: '保存中…',
  failed: '保存失败',
  local: '已存本地'
};

/** @type {'saved'|'unsaved'|'saving'|'failed'|'local'} */
let saveState = 'saved';
let lastSavedContent = '';
let saveTimer = null;
let retryCount = 0;
let autoSaving = false;   // 防并发：请求飞行期间不再发第二个 draft 请求
let saveAborted = false;  // 章节不存在（404）时置位，停止无意义的重试

/** 本地降级草稿的 storage key */
export function draftKey(chapterId) {
  return `novel-draft:${chapterId}`;
}

/** 编辑器内容是否已偏离最后一次成功落库的内容 */
export function isDirty() {
  if (!store.activeChapter) return false;
  return editor.value !== lastSavedContent;
}

/**
 * 切换保存状态并刷新指示器。
 * @param {'saved'|'unsaved'|'saving'|'failed'|'local'} next 目标状态
 * @param {string} message 附加说明（如重试倒计时）
 */
export function setSaveState(next, message = '') {
  saveState = next;
  if (saveIndicator) {
    saveIndicator.textContent = SAVE_LABELS[next] + (message ? ` · ${message}` : '');
    saveIndicator.dataset.state = next;
  }
  if (autoSaveHint) {
    autoSaveHint.textContent = `保存状态：${SAVE_LABELS[next]}${message ? ` · ${message}` : ''}`;
  }
}

export function updateAutoSaveHint(text) {
  if (autoSaveHint) autoSaveHint.textContent = text;
}

/** 排一次自动保存（防抖：连续输入只保留最后一次定时） */
export function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autoSave, AUTOSAVE_DELAY);
}

function cancelAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
}

/** 立即执行一次自动保存（切章、合并、手动触发时用） */
export async function autoSaveNow() {
  cancelAutoSave();
  await autoSave();
}

/**
 * 自动保存：走 /draft，**只更新正文，不生成版本**。
 *
 * 关键细节：请求发出前先取 editor.value 快照。请求飞行期间用户很可能又输入了内容，
 * 若直接用 editor.value 回写 lastSavedContent，这部分新输入会被误判为「已保存」，
 * 之后的覆盖/离开就不再拦截 —— 正是丢稿的经典成因。
 */
export async function autoSave() {
  if (!store.apiOnline || !store.activeChapter || saveAborted) return;
  if (!isDirty()) {
    setSaveState('saved');
    return;
  }
  // 已有请求在飞：不要并发写，排到下一轮即可，本轮输入不会丢
  if (autoSaving) {
    scheduleAutoSave();
    return;
  }

  autoSaving = true;
  setSaveState('saving');
  const snapshot = editor.value;
  const chapterId = store.activeChapter.id;

  try {
    const result = await apiFetch(`/chapters/${chapterId}/draft`, {
      method: 'POST',
      body: JSON.stringify({ content: snapshot })
    });
    store.activeChapter = result.chapter;
    store.state.chapters = store.state.chapters.map(chapter => (chapter.id === store.activeChapter.id ? store.activeChapter : chapter));
    retryCount = 0;

    if (editor.value === snapshot) {
      // 期间没有新输入 → 完全同步
      lastSavedContent = snapshot;
      setSaveState('saved');
      localStorage.removeItem(draftKey(chapterId));
      updateAutoSaveHint(`已保存草稿 · ${new Date().toLocaleTimeString('zh-CN')}（草稿不生成版本）`);
    } else {
      // 快照已入库，剩余差异留给下一轮
      lastSavedContent = snapshot;
      setSaveState('unsaved');
      scheduleAutoSave();
    }
  } catch (error) {
    // 章节不存在：继续重试毫无意义，明确停止并提示
    if (error.status === 404) {
      saveAborted = true;
      cancelAutoSave();
      setSaveState('failed', '章节不存在，已停止重试');
      flashAssist('自动保存停止', `章节 #${chapterId} 不存在（404），已停止重试，请刷新页面。`);
      return;
    }

    retryCount += 1;
    if (retryCount <= MAX_RETRY) {
      const delay = 3 ** retryCount; // 3s / 9s / 27s 指数退避
      setSaveState('failed', `${delay}s 后重试`);
      cancelAutoSave();
      saveTimer = setTimeout(autoSave, delay * 1000);
    } else {
      // 连续失败：降级到 localStorage，绝不阻塞输入
      writeLocalDraft();
      setSaveState('local', '已存浏览器本地，恢复后可合并');
    }
  } finally {
    autoSaving = false;
  }
}

/** 把当前编辑器内容写入 localStorage 作为兜底 */
export function writeLocalDraft() {
  if (!store.activeChapter) return;
  try {
    localStorage.setItem(draftKey(store.activeChapter.id), JSON.stringify({
      content: editor.value,
      at: new Date().toISOString()
    }));
  } catch (error) {
    setSaveState('failed', `本地存储写入失败：${error.message}`);
  }
}

export function readLocalDraft(chapterId) {
  const raw = localStorage.getItem(draftKey(chapterId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.content === 'string' ? parsed : null;
  } catch {
    localStorage.removeItem(draftKey(chapterId));
    return null;
  }
}

/** 删除某章节的本地降级草稿（手动存稿成功后清理） */
export function clearLocalDraft(chapterId) {
  localStorage.removeItem(draftKey(chapterId));
}

/**
 * 把内容登记为「已同步基线」并复位 404 停机位。
 * 原单文件中 renderEditor / saveDraft / 里程碑快照直接给 lastSavedContent 赋值，
 * 模块化后基线变量收归本模块，改经此函数写入。
 */
export function markSynced(content) {
  lastSavedContent = content;
  saveAborted = false;
}

/** 手动存稿成功后重置重试计数 */
export function resetRetryCount() {
  retryCount = 0;
}

/** 读取当前保存状态（draft.js 合并流程需判断「合并落库是否成功」） */
export function getSaveState() {
  return saveState;
}

/** 编辑器 input 监听用：404 停机位是否已置位（置位后不再触发自动保存） */
export function isSaveAborted() {
  return saveAborted;
}

/** 载入新章节前的保存状态机复位（原 adoptChapter 内联三行，收拢为一个入口） */
export function resetAutoSave() {
  cancelAutoSave();
  retryCount = 0;
  saveAborted = false;
}
