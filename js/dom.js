// 静态 DOM 引用集中管理：所有模块共享的元素引用在此查询一次。
// module script 天然 defer，执行到这里时 DOM 已就绪，与原单文件行为一致。

export const editor = document.querySelector('#chapterEditor');
export const chapterTitle = document.querySelector('#chapterTitle');
export const wordCount = document.querySelector('#wordCount');
export const assistFeed = document.querySelector('#assistFeed');
export const apiStatus = document.querySelector('#apiStatus');
export const saveIndicator = document.querySelector('#saveIndicator');
export const autoSaveHint = document.querySelector('#autoSaveHint');
export const sessionMeter = document.querySelector('#sessionMeter');
export const sessionDurationEl = document.querySelector('#sessionDuration');
export const sessionDeltaEl = document.querySelector('#sessionDelta');
export const modalMask = document.querySelector('#modalMask');
export const modalTitle = document.querySelector('#modalTitle');
export const modalBody = document.querySelector('#modalBody');
export const modalActions = document.querySelector('#modalActions');
export const projectSwitcher = document.querySelector('#projectSwitcher');
