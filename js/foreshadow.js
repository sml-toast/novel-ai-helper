/* ══ F084 伏笔与线索生命周期（前端只展示；状态/逾期判定均在服务端） ══ */
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';
import { getEditorSelection } from './editor.js';
import { refreshDashboard } from './dashboard.js';

const foreshadowStatusLabels = { planted: '已埋设', resolved: '已回收', abandoned: '已废弃' };

/** 拉取伏笔列表并按状态分组渲染（逾期行标红由 CSS 类控制） */
export async function refreshForeshadows() {
  if (!store.apiOnline) {
    document.querySelector('#foreshadowPanel').innerHTML = '<p class="hint-line">API 未启动，暂无法读取伏笔数据。</p>';
    return;
  }
  try {
    const result = await apiFetch('/foreshadows');
    store.state.foreshadows = result.foreshadows || [];
    renderForeshadowPanel(store.state.foreshadows);
  } catch (error) {
    flashAssist('伏笔列表加载失败', error.message, 'danger');
  }
}

function renderForeshadowPanel(foreshadows) {
  const container = document.querySelector('#foreshadowPanel');
  if (!container) return;
  const groups = [
    ['planted', '已埋设'],
    ['resolved', '已回收'],
    ['abandoned', '已废弃']
  ];
  container.innerHTML = groups.map(([status, label]) => {
    const rows = foreshadows.filter(row => row.status === status);
    const items = rows.map(row => `
      <article class="foreshadow-item ${row.overdue ? 'overdue' : ''}">
        <div class="foreshadow-main">
          <h3>${escapeHtml(row.title)}${row.overdue ? ' · 已逾期' : ''}</h3>
          <p>${escapeHtml(row.content || '无摘要')}</p>
          <small>埋设于《${escapeHtml(row.chapter_title || '未知章节')}》（第 ${row.chapter_ordinal ?? '?'} 章）${row.expected_chapter ? ` · 预期第 ${row.expected_chapter} 章回收` : ''}${row.resolved_chapter ? ` · 实际第 ${row.resolved_chapter} 章回收` : ''}</small>
        </div>
        ${status === 'planted' ? `
        <div class="card-actions">
          <button type="button" data-foreshadow-id="${escapeHtml(String(row.id))}" data-foreshadow-action="resolve">标记回收</button>
          <button type="button" data-foreshadow-id="${escapeHtml(String(row.id))}" data-foreshadow-action="abandon">标记废弃</button>
        </div>` : ''}
      </article>
    `).join('');
    return `<div class="foreshadow-group"><h3>${label}（${rows.length}）</h3>${items || '<p class="hint-line">暂无</p>'}</div>`;
  }).join('');
}

/** 表单登记：埋设章节 = 当前激活章节（预期章号可留空） */
export async function addForeshadowFromForm() {
  const title = document.querySelector('#foreshadowTitleInput').value.trim();
  if (!store.apiOnline) return flashAssist('伏笔登记', 'API 未启动，无法登记伏笔。', 'warning');
  if (!title) return flashAssist('伏笔登记', '请先填写伏笔名称。', 'warning');
  if (!store.activeChapter) return flashAssist('伏笔登记', '请先选择一个章节作为埋设章节。', 'warning');
  try {
    await apiFetch('/foreshadows', {
      method: 'POST',
      body: JSON.stringify({
        chapterId: store.activeChapter.id,
        title,
        content: document.querySelector('#foreshadowContentInput').value.trim(),
        expectedChapter: document.querySelector('#foreshadowExpectedInput').value || null
      })
    });
    document.querySelector('#foreshadowTitleInput').value = '';
    document.querySelector('#foreshadowContentInput').value = '';
    document.querySelector('#foreshadowExpectedInput').value = '';
    flashAssist('伏笔已登记', `${title} · 埋设于《${store.activeChapter.title}》。`);
    refreshForeshadows();
    refreshDashboard();
  } catch (error) {
    flashAssist('伏笔登记失败', error.message, 'danger');
  }
}

/** F084 验收入口：编辑器选中文字一键登记为伏笔（人工登记为主，不做自动识别） */
export async function registerForeshadowFromSelection() {
  if (!store.apiOnline) return flashAssist('伏笔登记', 'API 未启动，无法登记伏笔。', 'warning');
  if (!store.activeChapter) return flashAssist('伏笔登记', '请先选择一个章节。', 'warning');
  const selection = getEditorSelection();
  if (!selection.targeted) {
    return flashAssist('伏笔登记', '请先在编辑器中选中要登记为伏笔的文字。', 'warning');
  }
  const text = selection.text.trim();
  try {
    await apiFetch('/foreshadows', {
      method: 'POST',
      body: JSON.stringify({
        chapterId: store.activeChapter.id,
        title: text.slice(0, 30),
        content: text
      })
    });
    flashAssist('伏笔已登记', `「${text.slice(0, 20)}${text.length > 20 ? '…' : ''}」· 埋设于《${store.activeChapter.title}》。`);
    refreshDashboard();
  } catch (error) {
    flashAssist('伏笔登记失败', error.message, 'danger');
  }
}

/** 状态流转（resolve/abandon）。状态机校验在服务端，失败时展示后端原因。 */
export async function handleForeshadowAction(foreshadowId, action) {
  if (!store.apiOnline) return flashAssist('伏笔操作', 'API 未启动，无法更新伏笔状态。', 'warning');
  try {
    const result = await apiFetch(`/foreshadows/${foreshadowId}/${action}`, { method: 'POST' });
    flashAssist(
      action === 'resolve' ? '伏笔已回收' : '伏笔已废弃',
      `${result.foreshadow.title} · ${foreshadowStatusLabels[result.foreshadow.status]}。`
    );
    refreshForeshadows();
    refreshDashboard();
  } catch (error) {
    flashAssist('伏笔操作失败', error.message, 'danger');
  }
}

/** F080 联动：词面匹配线索提示（服务端扫描，前端只展示） */
export async function loadForeshadowHints() {
  const container = document.querySelector('#foreshadowHints');
  if (!container) return;
  if (!store.apiOnline) {
    container.innerHTML = '<p class="hint-line">API 未启动，暂无法扫描线索。</p>';
    return;
  }
  try {
    const result = await apiFetch('/foreshadows/hints');
    const hints = result.hints || [];
    container.innerHTML = hints.length
      ? `<h3>线索提示（${hints.length}，仅供参考，不会自动建库）</h3>` + hints.map(hint => `
        <article class="foreshadow-hint kind-${hint.kind}"><p>${escapeHtml(hint.message)}</p></article>
      `).join('')
      : '<h3>线索提示</h3><p class="hint-line">暂无线索提示。可在术语表中把线索词分类为「线索」以启用漏登检测。</p>';
  } catch (error) {
    container.innerHTML = `<p class="hint-line">线索扫描失败：${escapeHtml(error.message)}</p>`;
  }
}
