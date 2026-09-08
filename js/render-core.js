// 核心面板渲染：API 状态、项目卡片、章节列表、项目切换器、人物关系。
import { store } from './store.js';
import { apiStatus } from './dom.js';
import { escapeHtml } from './utils.js';

export function renderApiStatus() {
  if (!apiStatus) return;
  apiStatus.textContent = store.apiOnline ? 'API 在线' : '本地演示';
  apiStatus.classList.toggle('offline', !store.apiOnline);
}

export function renderProject() {
  const card = document.querySelector('.project-card');
  if (!card || !store.state.project) return;
  card.querySelector('.project-badge').textContent = store.state.project.genre || '小说';
  card.querySelector('h2').textContent = store.state.project.title || '未命名项目';
  card.querySelector('p').textContent = `${store.state.project.target_platform || '模拟平台'} · ${store.state.project.writing_style || '默认风格'}`;
}

export function renderChapters() {
  document.querySelector('#chapterList').innerHTML = store.state.chapters.map(chapter => `
    <button class="chapter-item ${chapter.id === store.activeChapter.id ? 'active' : ''}" type="button" data-chapter-id="${escapeHtml(String(chapter.id))}">
      <strong>${escapeHtml(chapter.title)}</strong>
      <span>${escapeHtml(chapter.status || '')}</span>
    </button>
  `).join('');
}

/**
 * 渲染项目切换器（F079）。只有一个项目时隐藏 —— 单项目用户不该看到一个
 * 只有自己、永远切不动的下拉框。
 */
export function renderProjectSwitcher() {
  const select = document.querySelector('#projectSwitcher');
  if (!select) return;
  const projects = store.state.projects || [];
  select.hidden = projects.length < 2;
  select.innerHTML = projects.map(project =>
    `<option value="${escapeHtml(String(project.id))}"${project.id === store.currentProjectId ? ' selected' : ''}>${escapeHtml(project.title)}（${project.chapter_count} 章）</option>`
  ).join('');
}

export function renderRelations() {
  document.querySelector('#relationList').innerHTML = store.state.relations.map(row => `
    <article class="relation-item">
      <span class="tag">${escapeHtml(row.relation_type)}</span>
      <h3>${escapeHtml(row.source_name)} ↔ ${escapeHtml(row.target_name)}</h3>
      <p>${escapeHtml(row.description)}</p>
    </article>
  `).join('');
}
