// @ts-check
// 通用 UI 基元：抽屉开关、AI 建议流（assist feed）渲染与提示卡片注入。
import { fallbackAssist } from './fallback-data.js';
import { assistFeed } from './dom.js';
import { escapeHtml } from './utils.js';

export function renderAssist(tab = 'ideas') {
  const items = fallbackAssist[tab] || fallbackAssist.ideas;
  assistFeed.innerHTML = items.map(renderAssistCard).join('');
}

export function renderAssistCard(item) {
  return `<article class="assist-card ${item.tone || ''}"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`;
}

export function openDrawer(name) {
  const drawer = document.querySelector(`#${name}Drawer`);
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}

export function closeDrawers() {
  document.querySelectorAll('.drawer').forEach(drawer => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  });
}

export function flashAssist(title, body, tone = '') {
  assistFeed.insertAdjacentHTML('afterbegin', renderAssistCard({ title, body, tone }));
}
