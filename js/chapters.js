// 章节/项目切换：dirty 拦截 + 会话分段 + 章节采纳；新建/归档章节。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { flashAssist } from './ui.js';
import { confirmDirtyLeave, checkLocalDraft } from './draft.js';
import { resetAutoSave } from './autosave.js';
import { renderChapters, renderProjectSwitcher } from './render-core.js';
import { renderEditor } from './editor.js';
import { endWritingSession, startWritingSession } from './session.js';
import { loadChapterMentions } from './mentions.js';
import { loadBootstrap } from './app.js';
import { refreshDashboard } from './dashboard.js';

/** 切换章节（带 dirty 拦截） */
export async function switchChapter(chapterId) {
  const next = store.state.chapters.find(chapter => chapter.id === chapterId);
  if (!next) return;
  if (store.activeChapter && next.id === store.activeChapter.id) return;

  if (!(await confirmDirtyLeave('切换章节'))) return;
  // F086：会话按章节分段 —— 切章即 end 旧行、start 新行，字数增量不跨章混算
  await endWritingSession();
  adoptChapter(next);
  await startWritingSession(next.id);
}

/**
 * 切换项目（F079）：与切章相同的 dirty 拦截策略，切换后整体重载该项目数据。
 * 取消时调用 renderProjectSwitcher() 把 <select> 的显示值拉回当前项目 ——
 * 用户的 change 已经改变了 DOM 选中项，不做回显就会出现「下拉显示 B、实际在 A」的错位。
 */
export async function switchProject(nextProjectId) {
  if (!store.apiOnline || nextProjectId === store.currentProjectId) return;
  if (!(await confirmDirtyLeave('切换项目'))) {
    renderProjectSwitcher();
    return;
  }
  // F086：切项目结束当前会话；新会话由 loadBootstrap 成功后统一开启
  await endWritingSession();
  store.currentProjectId = nextProjectId;
  await loadBootstrap();
}

/** 载入新章节并重置保存状态机 */
export function adoptChapter(chapter) {
  store.activeChapter = chapter;
  resetAutoSave();
  renderChapters();
  renderEditor();
  // 异步检查本地降级草稿，失败不冒泡成未捕获异常
  checkLocalDraft().catch(error => {
    flashAssist('本地草稿检查失败', error.message, 'warning');
  });
  // F080：知识库面板开着时，切章后「本章提及」要跟随当前章节（面板关着就不发请求）
  const knowledgeDrawer = document.querySelector('#knowledgeDrawer');
  if (knowledgeDrawer && knowledgeDrawer.classList.contains('open')) loadChapterMentions();
}

export async function createChapter() {
  const title = document.querySelector('#chapterTitleInput').value.trim();
  if (!store.apiOnline) return flashAssist('新建章节', 'API 未启动，无法写入 SQLite。', 'warning');
  try {
    const result = await apiFetch('/chapters', { method: 'POST', body: JSON.stringify({ title, content: '新章节正文待补充。' }) });
    store.state.chapters = [...store.state.chapters, result.chapter];
    store.activeChapter = result.chapter;
    renderChapters();
    renderEditor();
    flashAssist('新建章节完成', `已创建《${result.chapter.title}》。`);
    refreshDashboard();
  } catch (error) {
    flashAssist('新建章节失败', error.message, 'danger');
  }
}

export async function archiveActiveChapter() {
  if (!store.apiOnline) return flashAssist('章节归档', 'API 未启动，无法归档章节。', 'warning');
  try {
    const result = await apiFetch(`/chapters/${store.activeChapter.id}/archive`, { method: 'POST' });
    store.activeChapter = result.chapter;
    store.state.chapters = store.state.chapters.map(chapter => chapter.id === store.activeChapter.id ? store.activeChapter : chapter);
    renderChapters();
    flashAssist('章节已归档', store.activeChapter.title);
  } catch (error) {
    flashAssist('章节归档失败', error.message, 'danger');
  }
}
