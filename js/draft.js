// 草稿安全流：本地降级草稿合并、离开拦截确认、手动存稿（生成版本）。
// 与 autosave.js 拆开的原因：合并/确认流程依赖弹窗与渲染，自动保存状态机保持纯净。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { editor } from './dom.js';
import { escapeHtml, formatDateTime } from './utils.js';
import { showModal } from './modal.js';
import { flashAssist } from './ui.js';
import { isDirty, getSaveState, setSaveState, autoSaveNow, writeLocalDraft, readLocalDraft, markSynced, resetRetryCount, clearLocalDraft, scheduleAutoSave } from './autosave.js';
import { renderChapters } from './render-core.js';
import { updateWordCount } from './editor.js';

/**
 * 载入章节后检查是否存在未同步的本地草稿。
 *
 * 只在「本地草稿比服务端内容新」时提示合并：本地更旧说明服务端的版本已经
 * 覆盖了它，继续弹窗只会把作者拦在已经放弃的旧稿上。
 */
export async function checkLocalDraft() {
  if (!store.apiOnline || !store.activeChapter) return;
  const draft = readLocalDraft(store.activeChapter.id);
  if (!draft) return;
  if (draft.content === store.activeChapter.content) {
    clearLocalDraft(store.activeChapter.id);
    return;
  }

  const localAt = Date.parse(draft.at || '');
  const serverAt = Date.parse(store.activeChapter.updated_at || '');
  const localNewer = Number.isFinite(localAt) && (!Number.isFinite(serverAt) || localAt > serverAt);
  if (!localNewer) {
    clearLocalDraft(store.activeChapter.id);
    return;
  }

  const choice = await confirmMergeDraft(draft.content, store.activeChapter.content, draft.at);
  if (choice === 'local') {
    editor.value = draft.content;
    setSaveState('unsaved');
    await autoSaveNow(); // 合并即落库，成功后由 autoSave 清掉 localStorage
    flashAssist('本地草稿已合并', '已采用浏览器本地保存的内容并写回服务器。');
    if (!isDirty() === false && isDirty()) {
      flashAssist('本地草稿尚未同步', '合并内容写入失败，稍后可在编辑器继续修改后重试保存。', 'warning');
    }
  } else if (choice === 'server') {
    clearLocalDraft(store.activeChapter.id);
    setSaveState('saved');
    flashAssist('已采用服务端内容', '本地草稿已丢弃。');
  }
  // 'later'：保留 localStorage，下次载入该章节时再问
}

/**
 * 本地草稿合并三选一：采用本地 / 采用服务端 / 并排查看。
 * @param {string} local 本地草稿内容
 * @param {string} server 服务端内容
 * @param {string} localAt 本地草稿时间戳
 * @returns {Promise<'local'|'server'|'later'>}
 */
export async function confirmMergeDraft(local, server, localAt) {
  let showCompare = false;
  for (;;) {
    const bodyHtml = showCompare
      ? `<p>并排对照后，请选择保留哪一份。本地草稿保存于 ${escapeHtml(formatDateTime(localAt))}。</p>
         <div class="merge-columns">
           <div><h4>浏览器本地草稿（${local.length} 字）</h4><textarea readonly>${escapeHtml(local)}</textarea></div>
           <div><h4>服务端内容（${server.length} 字）</h4><textarea readonly>${escapeHtml(server)}</textarea></div>
         </div>`
      : `<p>发现未同步的本地修改（保存于 ${escapeHtml(formatDateTime(localAt))}，${local.length} 字），
          与服务端内容（${server.length} 字）不一致。请选择保留哪一份。</p>`;

    const choice = await showModal({
      title: '发现未同步的本地修改，是否合并',
      bodyHtml,
      actions: [
        { label: '采用本地', value: 'local', variant: 'primary-btn' },
        { label: '采用服务端', value: 'server' },
        { label: showCompare ? '收起对照' : '并排查看', value: showCompare ? 'collapse' : 'compare' },
        { label: '稍后处理', value: 'later' }
      ]
    });

    if (choice === 'compare') {
      showCompare = true;
      continue;
    }
    if (choice === 'collapse') {
      showCompare = false;
      continue;
    }
    return choice;
  }
}

/**
 * 离开当前编辑上下文（切章 / 切项目共用，F079）的 dirty 拦截。
 * @param {string} what 去向描述，如「切换章节」「切换项目」
 * @returns {Promise<boolean>} true = 修改已处理（保存成功或用户放弃），可以离开
 */
export async function confirmDirtyLeave(what) {
  if (!isDirty()) return true;
  const choice = await showModal({
    title: '当前章节有未保存的修改',
    bodyHtml: `<p>《${escapeHtml(store.activeChapter.title)}》还有改动没有写入服务器，${escapeHtml(what)}前请选择处理方式。</p>`,
    actions: [
      { label: '保存并离开', value: 'save', variant: 'primary-btn' },
      { label: '放弃修改', value: 'discard' },
      { label: '取消', value: 'cancel' }
    ]
  });
  // 弹窗期间用户可能继续输入，取消时编辑器内容原样保留
  if (choice === 'cancel') return false;
  if (choice === 'save') {
    await autoSaveNow();
    if (isDirty()) {
      // 保存失败时不能默默丢稿，再确认一次
      const forced = await showModal({
        title: '自动保存失败',
        bodyHtml: `<p>改动未能写入服务器。${escapeHtml(what)}会丢失这些修改，是否继续？</p>`,
        actions: [
          { label: '放弃修改并继续', value: 'discard' },
          { label: '留在当前章节', value: 'cancel', variant: 'primary-btn' }
        ]
      });
      return forced === 'discard';
    }
  }
  return true;
}

export async function saveDraft() {
  store.activeChapter.content = editor.value;
  if (!store.apiOnline) {
    writeLocalDraft();
    setSaveState('local', 'API 未启动，已存浏览器本地');
    flashAssist('章节已存本地', 'API 未启动，内容已保存在浏览器 localStorage，恢复连接后可合并。', 'warning');
    renderChapters();
    return;
  }
  setSaveState('saving');
  try {
    const result = await apiFetch(`/chapters/${store.activeChapter.id}/save`, { method: 'POST', body: JSON.stringify({ content: editor.value }) });
    store.activeChapter = result.chapter;
    store.state.chapters = store.state.chapters.map(chapter => chapter.id === store.activeChapter.id ? store.activeChapter : chapter);
    // 只把「服务端确认收到的内容」设为基线：请求期间的新输入仍然算 dirty
    markSynced(result.chapter.content);
    resetRetryCount();
    clearLocalDraft(store.activeChapter.id);
    setSaveState('saved');
    if (editor.value !== result.chapter.content) {
      setSaveState('unsaved');
      scheduleAutoSave();
    }
    flashAssist('章节已存稿', `已写入 SQLite，并生成版本 ${store.activeChapter.version}。`);
    renderChapters();
  } catch (error) {
    setSaveState('failed', error.message);
    flashAssist('存稿失败', error.message, 'danger');
  }
}
