/* ==========================================================================
 * 通用确认弹窗（切章拦截 / 草稿合并 / 密钥清除 共用）
 * ========================================================================== */
import { modalMask, modalTitle, modalBody, modalActions } from './dom.js';

let modalResolve = null;

/**
 * 打开确认弹窗。
 * @param {{title:string, bodyHtml:string, actions:Array<{label:string, value:string, variant?:string}>}} options
 * @returns {Promise<string>} 被点击按钮的 value；点遮罩或按 ESC 返回 'cancel'
 */
export function showModal({ title, bodyHtml, actions }) {
  if (!modalMask) return Promise.resolve('cancel');
  closeModal('cancel'); // 同时只允许一个弹窗，先结算上一个
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalActions.innerHTML = '';
  actions.forEach(action => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    if (action.variant) button.className = action.variant;
    button.addEventListener('click', () => closeModal(action.value));
    modalActions.appendChild(button);
  });
  modalMask.hidden = false;
  return new Promise(resolve => {
    modalResolve = resolve;
  });
}

export function closeModal(value) {
  const resolve = modalResolve;
  modalResolve = null;
  if (modalMask) modalMask.hidden = true;
  if (resolve) resolve(value);
}

if (modalMask) {
  modalMask.addEventListener('click', event => {
    if (event.target === modalMask) closeModal('cancel');
  });
}
