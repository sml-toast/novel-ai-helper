// Plot Grid 情节线 × 章节矩阵（F083）。单元格点击循环节拍：无 → progress → planned → 清除；
// 情节线增删走批量端点。渲染层刻意无状态：全部数据来自 outline 缓存，变更后整表重绘。
// 横向滚动（线索/章节多时）由容器 CSS（.plotgrid-wrap overflow-x）承担。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';
import { refreshOutline } from './outline.js';

/** 节拍符号（与 PRD 7.1 图例一致） */
const MARK_GLYPHS = { progress: '●', planned: '▸' };

/** 节拍循环次序：null（无节拍）→ progress（有进展）→ planned（计划中）→ 清除 */
const MARK_CYCLE = [null, 'progress', 'planned', null];

/** beats 按「线索:章节」建索引（key 见 beatsKey） */
function beatsIndex(beats) {
  const index = new Map();
  for (const beat of beats) index.set(beatsKey(beat.plot_line_id, beat.chapter_id), beat);
  return index;
}

/** @returns {string} 「线索id:章节id」复合键 */
function beatsKey(plotLineId, chapterId) {
  return `${plotLineId}:${chapterId}`;
}

/**
 * 整表渲染（outlineBody 容器）。
 * @param {HTMLElement} container
 * @param {{chapters:Array, plotLines:Array, beats:Array}} data
 */
export function renderPlotGrid(container, data) {
  const { chapters, plotLines, beats } = data;
  const index = beatsIndex(beats);

  if (!plotLines.length) {
    container.innerHTML = `
      <div class="plotgrid-wrap">
        <div class="plotgrid-toolbar">
          <input id="plotLineTitleInput" type="text" placeholder="新情节线名称（如：黑潮真相）" />
          <button class="ghost-btn" type="button" data-action="add-plotline">+ 新情节线</button>
        </div>
        <p class="outline-empty">还没有情节线。新建 ≥ 1 条后即可在矩阵里标记各章节拍（● 有进展 / ▸ 计划中）。</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="plotgrid-wrap">
      <div class="plotgrid-toolbar">
        <input id="plotLineTitleInput" type="text" placeholder="新情节线名称" />
        <button class="ghost-btn" type="button" data-action="add-plotline">+ 新情节线</button>
        <span class="outline-meta">图例：● 有进展 · ▸ 计划中 · 空 未涉及（点击单元格循环）</span>
      </div>
      <table class="plotgrid">
        <thead>
          <tr>
            <th class="plotgrid-corner">情节线 \\ 章节</th>
            ${chapters.map(chapter => `<th title="${escapeHtml(chapter.title)}">${chapter.ordinal}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${plotLines.map(line => `
            <tr>
              <th class="plotgrid-line">
                <span class="plotline-color" style="background:${escapeHtml(line.color)}"></span>
                ${escapeHtml(line.title)}
                <button class="plotline-delete" type="button" data-plotline-id="${line.id}" title="删除该情节线及其节拍">×</button>
              </th>
              ${chapters.map(chapter => {
                const beat = index.get(beatsKey(line.id, chapter.id));
                return `<td>
                  <button class="beat-cell${beat ? ` mark-${beat.mark}` : ''}" type="button"
                    data-beat-line="${line.id}" data-beat-chapter="${chapter.id}"
                    title="${beat ? (beat.mark === 'progress' ? '有进展' : '计划中') : '未涉及'}（点击切换）">
                    ${beat ? MARK_GLYPHS[beat.mark] || '●' : ''}
                  </button>
                </td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/** 新建情节线（读取工具栏输入框） */
export async function addPlotLine() {
  const input = document.querySelector('#plotLineTitleInput');
  const title = input?.value.trim();
  if (!store.apiOnline) return flashAssist('情节线', 'API 未启动，无法写入。', 'warning');
  if (!title) return flashAssist('情节线', '请先填写情节线名称。', 'warning');
  try {
    await apiFetch('/plotlines', { method: 'POST', body: JSON.stringify({ title }) });
    if (input) input.value = '';
    await refreshOutline();
    flashAssist('情节线已创建', title);
  } catch (error) {
    flashAssist('情节线创建失败', error.message, 'danger');
  }
}

/** 单元格点击：循环节拍。直接以服务端返回的全量 beats 替换缓存并重绘。 */
async function cycleBeat(plotLineId, chapterId) {
  const current = document.querySelector(`[data-beat-line="${plotLineId}"][data-beat-chapter="${chapterId}"]`);
  const hasMark = current?.classList.contains('mark-progress') ? 'progress'
    : current?.classList.contains('mark-planned') ? 'planned' : null;
  const next = MARK_CYCLE[MARK_CYCLE.indexOf(hasMark) + 1] ?? null;
  try {
    const result = await apiFetch('/plotbeats', {
      method: 'POST',
      body: JSON.stringify({ plotLineId, chapterId, mark: next })
    });
    const outlineModule = await import('./outline.js');
    outlineModule.outlineState.data.beats = result.beats;
    renderPlotGrid(document.querySelector('#outlineBody'), outlineModule.outlineState.data);
  } catch (error) {
    flashAssist('节拍更新失败', error.message, 'danger');
  }
}

async function removePlotLine(plotLineId) {
  try {
    await apiFetch('/plotlines/delete', { method: 'POST', body: JSON.stringify({ id: plotLineId }) });
    await refreshOutline();
    flashAssist('情节线已删除', `ID ${plotLineId} 及其全部节拍。`);
  } catch (error) {
    flashAssist('情节线删除失败', error.message, 'danger');
  }
}

/* ── 事件委托：节拍单元格 / 删除情节线（add-plotline 走 events.js 通用分发） ── */

document.addEventListener('click', event => {
  const beatCell = event.target.closest?.('[data-beat-line]');
  if (beatCell) {
    return cycleBeat(Number(beatCell.dataset.beatLine), Number(beatCell.dataset.beatChapter));
  }
  const deleteButton = event.target.closest?.('[data-plotline-id]');
  if (deleteButton) return removePlotLine(Number(deleteButton.dataset.plotlineId));
});
