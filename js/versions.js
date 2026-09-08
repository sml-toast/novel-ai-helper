// 版本历史：加载、回滚、里程碑快照（F086）。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { editor } from './dom.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';
import { showModal } from './modal.js';
import { markSynced, setSaveState, scheduleAutoSave, isDirty } from './autosave.js';
import { renderChapters } from './render-core.js';
import { renderEditor } from './editor.js';

/** 版本 kind 的中文标签与视觉分组（F086：自动版本 / 手动存稿 / 里程碑 快照三分） */
const VERSION_KIND_META = {
  auto: { label: '自动版本', className: 'version-kind-auto' },
  manual: { label: '手动存稿', className: 'version-kind-manual' },
  milestone: { label: '里程碑快照', className: 'version-kind-milestone' }
};

export async function loadVersions() {
  const list = document.querySelector('#versionList');
  if (!store.apiOnline) {
    list.innerHTML = '<article class="version-card"><h3>本地演示</h3><p>API 未启动，暂无 SQLite 版本历史。</p></article>';
    return;
  }
  try {
    const result = await apiFetch(`/chapters/${store.activeChapter.id}/versions`);
    list.innerHTML = result.versions.map(version => {
      const kind = VERSION_KIND_META[version.kind] || VERSION_KIND_META.manual;
      // 里程碑用 ★ + 作者命名醒目标记，与顺手存一眼区分开（PRD F086 ④）
      const title = version.kind === 'milestone'
        ? `★ ${version.name || '未命名里程碑'}`
        : `版本 ${version.version}`;
      return `
      <article class="version-card ${kind.className}">
        <span class="version-kind">${escapeHtml(kind.label)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(version.content.slice(0, 90))}${version.content.length > 90 ? '...' : ''}</p>
        <button type="button" data-version="${escapeHtml(String(version.version))}">回滚到此版本</button>
      </article>`;
    }).join('');
  } catch (error) {
    flashAssist('版本加载失败', error.message, 'danger');
  }
}

export async function rollbackVersion(version) {
  try {
    const result = await apiFetch(`/chapters/${store.activeChapter.id}/rollback`, { method: 'POST', body: JSON.stringify({ version }) });
    store.activeChapter = result.chapter;
    store.state.chapters = store.state.chapters.map(chapter => chapter.id === store.activeChapter.id ? store.activeChapter : chapter);
    renderChapters();
    renderEditor();
    await loadVersions();
    flashAssist('章节已回滚', `已生成新版本 ${store.activeChapter.version}，原目标版本 ${version} 保留在历史中。`);
  } catch (error) {
    flashAssist('版本回滚失败', error.message, 'danger');
  }
}

/**
 * F086 里程碑快照：作者主动命名打点（对标 Scrivener Snapshot）。
 * 入口两处 —— 编辑器顶栏「★ 打快照」与版本面板头部，动线一致。
 * content 传编辑器当前值：大改前打快照要留住的就是屏幕上这一版。
 */
export async function createMilestoneSnapshot() {
  if (!store.apiOnline) return flashAssist('里程碑快照', 'API 未启动，无法打快照。', 'warning');
  if (!store.activeChapter) return;
  const choice = await showModal({
    title: '打里程碑快照',
    bodyHtml: `<p>给当前这一版起个名字（如「大改前」「定稿 v1」）。快照会进入版本历史，
      随时可回滚。</p>
      <div class="form-grid"><input id="milestoneNameInput" type="text" placeholder="快照名称（必填）" /></div>`,
    actions: [
      { label: '打快照', value: 'ok', variant: 'primary-btn' },
      { label: '取消', value: 'cancel' }
    ]
  });
  if (choice !== 'ok') return;
  const name = document.querySelector('#milestoneNameInput')?.value.trim();
  if (!name) return flashAssist('里程碑快照', '快照名称为空，未打点。', 'warning');
  try {
    const result = await apiFetch(`/chapters/${store.activeChapter.id}/milestone`, {
      method: 'POST',
      body: JSON.stringify({ name, content: editor.value })
    });
    store.activeChapter = result.chapter;
    store.state.chapters = store.state.chapters.map(chapter => chapter.id === store.activeChapter.id ? store.activeChapter : chapter);
    // 不走 renderEditor（会清掉打快照之后的新输入），只对齐保存基线
    markSynced(result.chapter.content);
    setSaveState(isDirty() ? 'unsaved' : 'saved');
    if (isDirty()) scheduleAutoSave();
    renderChapters();
    await loadVersions();
    flashAssist('里程碑快照已留存', `★ ${name}（版本 ${store.activeChapter.version}）已写入版本历史。`);
  } catch (error) {
    flashAssist('里程碑快照失败', error.message, 'danger');
  }
}
