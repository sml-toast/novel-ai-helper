// @ts-check
// 静态 DOM 引用集中管理：所有模块共享的元素引用在此查询一次。
// module script 天然 defer，执行到这里时 DOM 已就绪，与原单文件行为一致。
//
// 类型说明：`document.querySelector()` 的静态返回类型是 `Element | null`，
// 直接取 `.value` / `.hidden` / `.checked` 会触发 TS2339。这里用 JSDoc 类型断言
// 把静态引用收窄到具体元素类型。**运行时行为完全不变**（仍是同一个 querySelector）。

export const /** @type {HTMLTextAreaElement} */ editor = /** @type {HTMLTextAreaElement} */ (
  document.querySelector('#chapterEditor')
);
export const chapterTitle = /** @type {HTMLElement} */ (document.querySelector('#chapterTitle'));
export const wordCount = /** @type {HTMLElement} */ (document.querySelector('#wordCount'));
export const assistFeed = /** @type {HTMLElement} */ (document.querySelector('#assistFeed'));
export const apiStatus = /** @type {HTMLElement} */ (document.querySelector('#apiStatus'));
export const saveIndicator = /** @type {HTMLElement} */ (
  document.querySelector('#saveIndicator')
);
export const autoSaveHint = /** @type {HTMLElement} */ (document.querySelector('#autoSaveHint'));
export const sessionMeter = /** @type {HTMLElement} */ (document.querySelector('#sessionMeter'));
export const sessionDurationEl = /** @type {HTMLElement} */ (
  document.querySelector('#sessionDuration')
);
export const sessionDeltaEl = /** @type {HTMLElement} */ (
  document.querySelector('#sessionDelta')
);
export const modalMask = /** @type {HTMLElement} */ (document.querySelector('#modalMask'));
export const modalTitle = /** @type {HTMLElement} */ (document.querySelector('#modalTitle'));
export const modalBody = /** @type {HTMLElement} */ (document.querySelector('#modalBody'));
export const modalActions = /** @type {HTMLElement} */ (document.querySelector('#modalActions'));
export const projectSwitcher = /** @type {HTMLSelectElement} */ (
  document.querySelector('#projectSwitcher')
);

// ---------------------------------------------------------------------------
// 类型化查询 helper（TS 增量接入用）
//
// 目的：把散落各模块的 `document.querySelector('#x').value` 这类写法收窄到具体元素类型，
// 消除「Element 上不存在 value」这一类类型错误。
// 约定：断言由调用方保证（选择器与元素类型匹配）；查不到时与原先直接 `.value` 一样是运行时报错，
// 因此替换是**行为等价**的纯类型层改动。
// ---------------------------------------------------------------------------

/**
 * 查询单个输入框。
 * @param {string} sel CSS 选择器
 * @returns {HTMLInputElement}
 */
export function $input(sel) {
  return /** @type {HTMLInputElement} */ (document.querySelector(sel));
}

/**
 * 查询单个多行文本框。
 * @param {string} sel CSS 选择器
 * @returns {HTMLTextAreaElement}
 */
export function $textarea(sel) {
  return /** @type {HTMLTextAreaElement} */ (document.querySelector(sel));
}

/**
 * 查询单个下拉框。
 * @param {string} sel CSS 选择器
 * @returns {HTMLSelectElement}
 */
export function $select(sel) {
  return /** @type {HTMLSelectElement} */ (document.querySelector(sel));
}

/**
 * 查询单个表单。
 * @param {string} sel CSS 选择器
 * @returns {HTMLFormElement}
 */
export function $form(sel) {
  return /** @type {HTMLFormElement} */ (document.querySelector(sel));
}

/**
 * 查询单个 HTMLElement（div/span/button 等通用容器）。
 * @param {string} sel CSS 选择器
 * @returns {HTMLElement}
 */
export function $el(sel) {
  return /** @type {HTMLElement} */ (document.querySelector(sel));
}

/**
 * 查询一组元素（返回真数组，便于直接 forEach/map）。
 * @param {string} sel CSS 选择器
 * @param {ParentNode} [root] 查询根，默认 document
 * @returns {HTMLElement[]}
 */
export function $all(sel, root) {
  return /** @type {HTMLElement[]} */ (
    Array.prototype.slice.call((root || document).querySelectorAll(sel))
  );
}

/**
 * 把事件目标收窄为 Element（`event.target` 的静态类型是 EventTarget）。
 * @param {Event} e
 * @returns {Element|null}
 */
export function eventTarget(e) {
  return /** @type {Element|null} */ (e.target);
}
