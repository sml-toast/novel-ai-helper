// F090 专注 / 打字机 / 沉浸模式 + 编辑区字号与行宽设置。
//
// 职责边界（与 autosave.js / draft.js 互不干扰）：
// - 本模块只做视觉与滚动行为，不碰任何保存状态；编辑器的 input 事件两边各自
//   独立监听，autosave 的 dirty 判定与防抖逻辑不受影响。
// - Cmd/Ctrl+S 手动存稿仍归 events.js，本模块不重复绑定。
// - 持久化只有「字号 / 行宽」两个偏好（localStorage）；专注模式本身不持久化：
//   进页面默认完整工作台，避免「上次开了专注，这次找不到界面」的困惑。
// - 打字机滚动与段落高亮只在专注模式生效，普通模式视觉零变化（降低回归风险）。
import { editor } from './dom.js';
import { escapeHtml } from './utils.js';

// ── 字号 / 行宽档位 ──
const FONT_SIZES = [15, 16, 18, 20, 22, 24];
const DEFAULT_FONT_INDEX = 2;
const LINE_WIDTHS = [
  { key: 'full', label: '全宽', value: '100%' },
  { key: 'wide', label: '较宽', value: '860px' },
  { key: 'medium', label: '适中', value: '720px' },
  { key: 'narrow', label: '窄幅', value: '600px' }
];
const LS_FONT = 'novelai.editor.fontSize';
const LS_WIDTH = 'novelai.editor.lineWidth';

// 打字机死区：光标行落在视口 40%~60% 区间内不滚动，杜绝逐键强制滚动造成的抖动
const BAND_TOP = 0.4;
const BAND_BOTTOM = 0.6;

let focusOn = false;
let fontIndex = DEFAULT_FONT_INDEX;
let widthIndex = 0;
let paragraphLayer = null;
let rafPending = false;

/* ── 字号 / 行宽设置（普通模式同样生效，持久化到 localStorage） ── */

function applyEditorPrefs() {
  const panel = editor.closest('.editor-panel');
  // 用 CSS 变量下发：编辑器与段落高亮镜像层共享同一套排版参数，两层才能始终对齐
  if (panel) {
    panel.style.setProperty('--editor-font-size', `${FONT_SIZES[fontIndex]}px`);
    panel.style.setProperty('--editor-max-width', LINE_WIDTHS[widthIndex].value);
  }
  try {
    localStorage.setItem(LS_FONT, String(FONT_SIZES[fontIndex]));
    localStorage.setItem(LS_WIDTH, LINE_WIDTHS[widthIndex].key);
  } catch {
    // 隐私模式等 localStorage 不可用时静默降级：偏好仅本次会话生效
  }
}

/** 增/减编辑区字号（+1/-1 档），到边界后停住 */
export function changeFontSize(delta) {
  fontIndex = Math.min(FONT_SIZES.length - 1, Math.max(0, fontIndex + delta));
  applyEditorPrefs();
}

/** 循环切换最大行宽：全宽 → 较宽 → 适中 → 窄幅 → 全宽 */
export function cycleLineWidth() {
  widthIndex = (widthIndex + 1) % LINE_WIDTHS.length;
  applyEditorPrefs();
}

function restorePrefs() {
  try {
    const fontHit = FONT_SIZES.indexOf(Number(localStorage.getItem(LS_FONT)));
    if (fontHit >= 0) fontIndex = fontHit;
    const widthHit = LINE_WIDTHS.findIndex(item => item.key === localStorage.getItem(LS_WIDTH));
    if (widthHit >= 0) widthIndex = widthHit;
  } catch {
    // 读不到就用默认档位
  }
  applyEditorPrefs();
}

/* ── 当前段落高亮层：铺在 textarea 正下方的同排版镜像层 ──
   textarea 无法对内部子串做视觉样式，所以在其下方放一个字号/行距/内边距完全
   一致的镜像层（统一走 --editor-* CSS 变量），用 <mark> 包住光标所在段落；
   专注模式下 textarea 背景转透明，高亮从下层透出。镜像文字本身全透明。 */

function ensureParagraphLayer() {
  if (paragraphLayer || !editor.parentElement) return;
  paragraphLayer = document.createElement('div');
  paragraphLayer.className = 'editor-paragraph-layer';
  paragraphLayer.setAttribute('aria-hidden', 'true');
  editor.insertAdjacentElement('beforebegin', paragraphLayer);
  syncLayerBox();
  editor.addEventListener('scroll', () => {
    // 编辑器滚动时镜像层同步滚动，两层内容才不会错位
    if (paragraphLayer) paragraphLayer.scrollTop = editor.scrollTop;
  });
}

function syncLayerBox() {
  if (!paragraphLayer) return;
  // offsetLeft/Top 相对定位祖先（.editor-panel 在 CSS 里设为 relative），
  // 镜像层的 offsetParent 与 textarea 相同，两套坐标可直接对齐
  paragraphLayer.style.left = `${editor.offsetLeft}px`;
  paragraphLayer.style.top = `${editor.offsetTop}px`;
  paragraphLayer.style.width = `${editor.offsetWidth}px`;
  paragraphLayer.style.height = `${editor.offsetHeight}px`;
}

/**
 * 重建镜像层内容：全文转义后按段落边界（空行）切开，
 * 光标所在段落包进 <mark>，并在光标处埋一个零宽锚点用于测距。
 */
function updateParagraphHighlight() {
  if (!paragraphLayer) return;
  const value = editor.value;
  const caret = editor.selectionStart ?? 0;
  // 段落边界：光标前后最近的空行（连续两个换行）；没有空行则整章为一段
  const start = value.lastIndexOf('\n\n', Math.max(0, caret - 1)) + 1;
  const nextBreak = value.indexOf('\n\n', caret);
  const end = nextBreak === -1 ? value.length : nextBreak;
  // 零宽空格（&#8203;）撑起行盒，空段落时锚点也有可测量的几何位置
  paragraphLayer.innerHTML = `${escapeHtml(value.slice(0, start))}<mark class="active-paragraph">${escapeHtml(value.slice(start, caret))}<span class="caret-anchor">&#8203;</span>${escapeHtml(value.slice(caret, end))}</mark>${escapeHtml(value.slice(end))}`;
  paragraphLayer.scrollTop = editor.scrollTop;
}

function caretViewportTop() {
  const anchor = paragraphLayer?.querySelector('.caret-anchor');
  return anchor ? anchor.getBoundingClientRect().top : null;
}

/* ── 打字机滚动：rAF 节流 + 死区判断，只做小幅瞬时修正，不做平滑动画 ── */

function scheduleTypewriter() {
  if (rafPending || !focusOn) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (!focusOn) return;
    updateParagraphHighlight();
    const caretTop = caretViewportTop();
    if (caretTop == null) return;
    const rect = editor.getBoundingClientRect();
    if (caretTop >= rect.top + rect.height * BAND_TOP && caretTop <= rect.top + rect.height * BAND_BOTTOM) return;
    // 一次性把光标行带回视口中部：delta 通常只有一两行高，视觉上是「轻推」不是跳变
    editor.scrollTop += caretTop - (rect.top + rect.height / 2);
  });
}

/* ── 专注模式开关（body.focus-mode 驱动 CSS 隐藏侧栏/面板/顶栏） ── */

export function isFocusMode() {
  return focusOn;
}

export function toggleFocusMode() {
  focusOn = !focusOn;
  document.body.classList.toggle('focus-mode', focusOn);
  document.querySelectorAll('[data-action="focus-toggle"]').forEach(button => {
    button.textContent = focusOn ? '退出专注' : '专注模式';
  });
  if (focusOn) {
    syncLayerBox();
    editor.focus();
    scheduleTypewriter();
  } else {
    paragraphLayer.innerHTML = '';
  }
}

/** Esc 退出专注模式；未开启时是安全的空操作（events.js 直接调用） */
export function exitFocusMode() {
  if (focusOn) toggleFocusMode();
}

/* ── 模块初始化：恢复排版偏好 + 挂输入/光标监听（与 autosave 的 input 监听互不影响） ── */
restorePrefs();
ensureParagraphLayer();
editor.addEventListener('input', scheduleTypewriter);
// 纯移动光标（不改内容）也要重新居中：input 事件不覆盖方向键/点击定位
editor.addEventListener('keyup', event => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) scheduleTypewriter();
});
editor.addEventListener('click', scheduleTypewriter);
window.addEventListener('resize', syncLayerBox);
