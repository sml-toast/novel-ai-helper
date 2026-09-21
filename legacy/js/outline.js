// 大纲树 / 场景卡片（Corkboard）视图与拖拽排序（F083）。
// 数据懒加载（/outline 只在首次展开或刷新时拉取）；情节网格渲染在 plot-grid.js。
// 拖拽用原生 HTML5 Drag and Drop（零依赖），持久化走批量端点（服务端全量校验）。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';
import { renderChapters } from './render-core.js';
import { switchChapter } from './chapters.js';
import { renderPlotGrid } from './plot-grid.js';

const outlineState = {
  loaded: false,
  loading: null,
  view: 'list',
  data: { chapters: [], scenes: [], foreshadows: [], plotLines: [], beats: [] }
};

const VIEW_LABELS = { list: '列表', corkboard: '卡片', grid: '情节网格' };

/** 拉取大纲数据（幂等：并发调用共享同一个 Promise） */
export async function refreshOutline() {
  if (!store.apiOnline) {
    outlineState.data = { chapters: [], scenes: [], foreshadows: [], plotLines: [], beats: [] };
    renderOutline();
    return;
  }
  if (!outlineState.loading) {
    outlineState.loading = apiFetch('/outline')
      .then(data => { outlineState.data = data; outlineState.loaded = true; })
      .catch(error => flashAssist('大纲加载失败', error.message, 'danger'))
      .finally(() => { outlineState.loading = null; });
  }
  await outlineState.loading;
  renderOutline();
}

/** 视图切换（data-outline-view 入口）；首次进入卡片/网格时按需拉数据 */
export async function setOutlineView(view) {
  if (!VIEW_LABELS[view]) return;
  outlineState.view = view;
  document.querySelectorAll('[data-outline-view]').forEach(button => {
    const active = button.dataset.outlineView === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (!outlineState.loaded) await refreshOutline();
  else renderOutline();
}

function renderOutline() {
  const body = document.querySelector('#outlineBody');
  if (!body) return;
  if (outlineState.view === 'grid') return renderPlotGrid(body, outlineState.data);
  if (outlineState.view === 'corkboard') return renderCorkboard(body);
  return renderTree(body);
}

/* ── 渲染原子：字数、状态、伏笔 chips ── */

function formatChars(count) {
  return `${Number(count || 0).toLocaleString('zh-CN')} 字`;
}

/** 该章的伏笔 chips（⚑ 埋设/回收 · 逾期红色，PRD 7.1 设计稿要求） */
function foreshadowChips(chapterId) {
  const rows = outlineState.data.foreshadows.filter(row => row.chapter_id === chapterId);
  if (!rows.length) return '';
  return `<div class="outline-foreshadows">${rows.map(row => `
    <span class="foreshadow-chip${row.overdue ? ' overdue' : ''}">
      ${row.overdue ? '⚠' : '⚑'} ${escapeHtml(row.title)}（${{ planted: '已埋设', resolved: '已回收', abandoned: '已废弃' }[row.status] || row.status}${row.expected_chapter ? ` · 预期第 ${row.expected_chapter} 章` : ''}）
    </span>`).join('')}</div>`;
}

function sceneCard(scene, extraClass = '') {
  return `<article class="scene-card${extraClass ? ` ${extraClass}` : ''}" draggable="true"
    data-drag-scene="${scene.id}" data-drop-scene="${scene.id}" data-scene-chapter="${scene.chapter_id ?? ''}">
    <strong>${escapeHtml(scene.name)}</strong>
    ${scene.pov ? `<span class="scene-pov">POV: ${escapeHtml(scene.pov)}</span>` : ''}
    <p>${escapeHtml(scene.description || '（无摘要）')}</p>
    <span class="scene-mood">${escapeHtml(scene.mood || '')}</span>
  </article>`;
}

/* ── 视图一：大纲树（章 → 场景，拖拽排序，点击定位） ── */

function renderTree(container) {
  const { chapters, scenes } = outlineState.data;
  const unassigned = scenes.filter(scene => scene.chapter_id == null);
  container.innerHTML = chapters.map(chapter => `
    <div class="outline-branch">
      <div class="outline-chapter" draggable="true" data-drag-chapter="${chapter.id}" data-drop-chapter="${chapter.id}">
        <button class="outline-chapter-title" type="button" data-outline-chapter="${chapter.id}">
          ${chapter.ordinal}. ${escapeHtml(chapter.title)}
        </button>
        <span class="outline-meta">${formatChars(chapter.char_count)} · ${chapter.scene_count} 场景</span>
      </div>
      <div class="outline-scenes" data-drop-chapter="${chapter.id}">
        ${scenes.filter(scene => scene.chapter_id === chapter.id).map(scene => sceneCard(scene, 'in-tree')).join('') || '<span class="outline-empty-scene">尚无场景，可从「未分配」拖入</span>'}
      </div>
      ${foreshadowChips(chapter.id)}
    </div>`).join('')
    + (unassigned.length ? `
    <div class="outline-branch unassigned">
      <div class="outline-chapter muted"><span class="outline-chapter-title">未分配场景</span></div>
      <div class="outline-scenes" data-drop-unassigned="1">
        ${unassigned.map(scene => sceneCard(scene, 'in-tree')).join('')}
      </div>
    </div>` : '');
}

/* ── 视图二：Corkboard 卡片（章卡片 + 场景卡片网格 + 伏笔行） ── */

function renderCorkboard(container) {
  const { chapters, scenes } = outlineState.data;
  const unassigned = scenes.filter(scene => scene.chapter_id == null);
  container.innerHTML = `<div class="corkboard">`
    + chapters.map(chapter => `
      <section class="chapter-card" data-drop-chapter="${chapter.id}" data-outline-chapter="${chapter.id}">
        <header class="chapter-card-head" draggable="true" data-drag-chapter="${chapter.id}" data-drop-chapter="${chapter.id}">
          <strong>${chapter.ordinal}. ${escapeHtml(chapter.title)}</strong>
          <span class="outline-meta">${escapeHtml(chapter.status || '')} · ${formatChars(chapter.char_count)}</span>
        </header>
        <div class="scene-grid" data-drop-chapter="${chapter.id}">
          ${scenes.filter(scene => scene.chapter_id === chapter.id).map(scene => sceneCard(scene)).join('') || '<span class="outline-empty-scene">尚无场景</span>'}
        </div>
        ${foreshadowChips(chapter.id)}
      </section>`).join('')
    + (unassigned.length ? `
      <section class="chapter-card muted" data-drop-unassigned="1">
        <header class="chapter-card-head"><strong>未分配场景</strong><span class="outline-meta">拖到章节卡上归类</span></header>
        <div class="scene-grid">${unassigned.map(scene => sceneCard(scene)).join('')}</div>
      </section>` : '')
    + `</div>`;
}

/* ── 拖拽持久化：批量端点 + 本地缓存同步 ── */

async function persistChapterOrder(orderedIds) {
  try {
    const result = await apiFetch('/chapters/reorder', { method: 'POST', body: JSON.stringify({ items: orderedIds.map(id => ({ id })) }) });
    // 服务端返回无正文的权威顺序；store.state.chapters 保持原对象（含 content），只重排引用
    const orderOf = new Map(result.chapters.map(row => [row.id, row.sort_order]));
    store.state.chapters = [...store.state.chapters].sort((a, b) => (orderOf.get(a.id) || 0) - (orderOf.get(b.id) || 0));
    renderChapters();
    await refreshOutline();
    flashAssist('章节顺序已保存', `已按新顺序重排 ${orderedIds.length} 章。`);
  } catch (error) {
    flashAssist('排序保存失败', error.message, 'danger');
  }
}

async function persistSceneAssignment(items) {
  try {
    const result = await apiFetch('/scenes/reorder', { method: 'POST', body: JSON.stringify({ items }) });
    outlineState.data.scenes = result.scenes;
    await refreshOutline();
    flashAssist('场景归类已保存', `已更新 ${items.length} 个场景。`);
  } catch (error) {
    flashAssist('场景保存失败', error.message, 'danger');
  }
}

/** 把源章节移到目标章节之前（同列表内换位） */
function moveChapterBefore(sourceId, targetId) {
  const ids = outlineState.data.chapters.map(row => row.id);
  const from = ids.indexOf(sourceId);
  if (from < 0 || sourceId === targetId) return;
  ids.splice(from, 1);
  ids.splice(ids.indexOf(targetId), 0, sourceId);
  return persistChapterOrder(ids);
}

/** 场景落到某章（追加到该章场景末尾）；chapterId=null 表示移入「未分配」 */
function dropSceneToChapter(sceneId, chapterId) {
  const scenes = outlineState.data.scenes;
  const others = scenes.filter(scene => scene.id !== sceneId);
  const inChapter = others.filter(scene => (scene.chapter_id ?? null) === chapterId);
  inChapter.push({ id: sceneId });
  const items = [
    ...others.filter(scene => (scene.chapter_id ?? null) !== chapterId)
      .map(scene => ({ id: scene.id, chapterId: scene.chapter_id ?? null })),
    ...inChapter.map(scene => ({ id: scene.id, chapterId: chapterId }))
  ];
  return persistSceneAssignment(items);
}

/** 场景插到目标场景之前（可跨章：跟随目标场景所在章） */
function dropSceneBefore(sceneId, targetSceneId) {
  if (sceneId === targetSceneId) return;
  const scenes = outlineState.data.scenes;
  const target = scenes.find(scene => scene.id === targetSceneId);
  if (!target) return;
  const chapterId = target.chapter_id ?? null;
  const ordered = scenes.filter(scene => scene.chapter_id === chapterId && scene.id !== sceneId);
  const index = ordered.findIndex(scene => scene.id === targetSceneId);
  ordered.splice(index, 0, { id: sceneId });
  const items = [
    ...scenes.filter(scene => (scene.chapter_id ?? null) !== chapterId && scene.id !== sceneId)
      .map(scene => ({ id: scene.id, chapterId: scene.chapter_id ?? null })),
    ...ordered.map(scene => ({ id: scene.id, chapterId }))
  ];
  return persistSceneAssignment(items);
}

/* ── 原生 DnD 事件（document 级，模块内挂一次） ── */

document.addEventListener('dragstart', event => {
  const chapter = event.target.closest?.('[data-drag-chapter]');
  const scene = event.target.closest?.('[data-drag-scene]');
  if (chapter) {
    event.dataTransfer.setData('text/plain', `chapter:${chapter.dataset.dragChapter}`);
    chapter.classList.add('dragging');
  } else if (scene) {
    event.dataTransfer.setData('text/plain', `scene:${scene.dataset.dragScene}`);
    scene.classList.add('dragging');
  }
});

document.addEventListener('dragend', event => {
  document.querySelectorAll('.dragging').forEach(node => node.classList.remove('dragging'));
});

document.addEventListener('dragover', event => {
  const target = event.target.closest?.('[data-drop-chapter],[data-drop-unassigned],[data-drop-scene]');
  if (target) {
    event.preventDefault(); // 允许 drop
    target.classList.add('drop-hover');
  }
});

document.addEventListener('dragleave', event => {
  const target = event.target.closest?.('[data-drop-chapter],[data-drop-unassigned],[data-drop-scene]');
  if (target) target.classList.remove('drop-hover');
});

document.addEventListener('drop', event => {
  const target = event.target.closest?.('[data-drop-chapter],[data-drop-unassigned],[data-drop-scene]');
  if (!target) return;
  event.preventDefault();
  target.classList.remove('drop-hover');
  const payload = String(event.dataTransfer.getData('text/plain') || '');
  const [kind, rawId] = payload.split(':');
  const id = Number(rawId);
  if (!id) return;
  if (kind === 'chapter') {
    const targetChapter = Number(target.dataset.dropChapter);
    if (targetChapter) return void moveChapterBefore(id, targetChapter);
  }
  if (kind === 'scene') {
    if (target.dataset.dropUnassigned) return void dropSceneToChapter(id, null);
    const targetChapter = Number(target.dataset.dropChapter);
    if (targetChapter) return void dropSceneToChapter(id, targetChapter);
    const targetScene = Number(target.dataset.dropScene);
    if (targetScene) return void dropSceneBefore(id, targetScene);
  }
});

/* ── 点击定位：章节标题/卡片 → 切章（复用 dirty 拦截）；节拍/情节线在 plot-grid.js ── */

document.addEventListener('click', event => {
  const chapterButton = event.target.closest?.('[data-outline-chapter]');
  if (chapterButton) {
    const chapterId = Number(chapterButton.dataset.outlineChapter);
    if (chapterId) switchChapter(chapterId);
    return;
  }
  // 场景卡片点击定位到所属章节（树/卡片两视图通用；拖拽把手点击除外）
  const sceneCard = event.target.closest?.('[data-scene-chapter]');
  if (sceneCard && !event.target.closest('[data-drag-scene]')) {
    const chapterId = Number(sceneCard.dataset.sceneChapter);
    if (chapterId) switchChapter(chapterId);
  }
});

export { outlineState };
