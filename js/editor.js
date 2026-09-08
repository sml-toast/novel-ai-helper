// 编辑器渲染与选区：字数统计、章节编辑器渲染、textarea 真实选区捕获。
import { store } from './store.js';
import { editor, chapterTitle, wordCount } from './dom.js';
import { markSynced, setSaveState } from './autosave.js';
import { currentWordTotal } from './session.js';

export function updateWordCount() {
  // F086：与会话统计共用同一口径（currentWordTotal），避免两处字数对不上
  wordCount.textContent = currentWordTotal().toString();
}

export function renderEditor() {
  chapterTitle.textContent = store.activeChapter.title;
  editor.value = store.activeChapter.content;
  // F076：刚载入的内容就是「已同步基线」，dirty 判定从这里开始
  markSynced(store.activeChapter.content);
  updateWordCount();
  setSaveState('saved');
}

/**
 * F087 修复：捕获编辑器里的**真实选区**。
 *
 * 为什么不直接用 window.getSelection()：编辑器是 <textarea>，其内部选区
 * 不属于文档级选区 —— window.getSelection().toString() 对 textarea 恒为空串，
 * 必须从 selectionStart/selectionEnd 取。页面级选区只在「锚点确实落在编辑器
 * 元素内」时才采信（将来换成 contenteditable 的兜底）——否则点过 AI 按钮后
 * 残留的旧文档选区会被误判为定向（实测踩过：清掉 textarea 选区后 targeted 仍为 true）。
 *
 * 无选区时回退到既有策略（正文前 1200 字），保证未定向的任务行为不变。
 * @returns {{text: string, targeted: boolean}} targeted=true 表示作者真的划选了内容
 */
export function getEditorSelection() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  if (Number.isInteger(start) && Number.isInteger(end) && end > start) {
    const text = editor.value.slice(start, end);
    if (text.trim()) return { text, targeted: true };
  }
  if (typeof window.getSelection === 'function') {
    const selection = window.getSelection();
    // 只认「锚点在编辑器内」的文档选区，避免把页面其他区域的选中内容当成正文选区
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) {
      const text = String(selection);
      if (text.trim()) return { text, targeted: true };
    }
  }
  return { text: editor.value.slice(0, 1200), targeted: false };
}
