// 知识库：渲染、手动/批量导入、删除、FTS 搜索召回。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';
import { refreshDashboard } from './dashboard.js';

export function renderKnowledge(knowledge) {
  document.querySelector('#globalKnowledge').innerHTML = (knowledge.global || []).map(renderKnowledgeCard).join('');
  document.querySelector('#projectKnowledge').innerHTML = (knowledge.project || []).map(renderKnowledgeCard).join('');
}

function renderKnowledgeCard(entry) {
  return `<article class="knowledge-card"><span class="tag">${escapeHtml(entry.source || entry.scope || '知识库')}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.body)}</p><button type="button" data-knowledge-id="${escapeHtml(String(entry.id || ''))}">删除</button></article>`;
}

export async function importKnowledge() {
  const title = document.querySelector('#knowledgeTitleInput').value.trim();
  const body = document.querySelector('#knowledgeBodyInput').value.trim();
  if (!store.apiOnline) return flashAssist('知识导入', 'API 未启动，无法写入知识库。', 'warning');
  try {
    const result = await apiFetch('/knowledge', {
      method: 'POST',
      body: JSON.stringify({ scope: 'project', title, body, source: '手动导入', tags: ['手动', '项目'] })
    });
    store.state.knowledge.project = [...store.state.knowledge.project, result.entry];
    renderKnowledge(store.state.knowledge);
    flashAssist('知识导入完成', `《${result.entry.title}》已写入单项目知识库，并进入搜索召回范围。`);
  } catch (error) {
    flashAssist('知识导入失败', error.message, 'danger');
  }
}

export async function bulkKnowledge() {
  if (!store.apiOnline) return flashAssist('批量知识导入', 'API 未启动，无法写入知识库。', 'warning');
  try {
    const result = await apiFetch('/knowledge/bulk', {
      method: 'POST',
      body: JSON.stringify({ scope: 'project', text: document.querySelector('#bulkKnowledgeInput').value })
    });
    store.state.knowledge.project = [...store.state.knowledge.project, ...result.entries];
    renderKnowledge(store.state.knowledge);
    flashAssist('批量知识导入完成', `已导入 ${result.entries.length} 条项目知识。`);
    refreshDashboard();
  } catch (error) {
    flashAssist('批量知识导入失败', error.message, 'danger');
  }
}

export async function deleteKnowledgeEntry(id) {
  if (!id || !store.apiOnline) return flashAssist('知识删除', 'API 未启动或知识条目不可删除。', 'warning');
  try {
    const result = await apiFetch(`/knowledge/${id}/delete`, { method: 'POST' });
    store.state.knowledge.global = store.state.knowledge.global.filter(item => item.id !== result.entry.id);
    store.state.knowledge.project = store.state.knowledge.project.filter(item => item.id !== result.entry.id);
    renderKnowledge(store.state.knowledge);
    flashAssist('知识已删除', result.entry.title);
    refreshDashboard();
  } catch (error) {
    flashAssist('知识删除失败', error.message, 'danger');
  }
}

export async function searchKnowledge() {
  const query = document.querySelector('#knowledgeSearch').value.trim();
  if (!store.apiOnline) {
    flashAssist('知识库搜索', 'API 未启动，已模拟召回：黑潮设定、星火徽章、角色弧光、平台规则。');
    return;
  }
  try {
    // F088：FTS5 bigram 粗筛 + 字面后过滤，覆盖知识/章节/角色/时间线/场景/世界观/术语
    const result = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
    renderKnowledge({ global: result.knowledge.filter(item => item.scope === 'global'), project: result.knowledge.filter(item => item.scope === 'project') });
    // 只列出命中的实体类型，空类型不出现在提示里
    const counts = [
      `知识 ${result.knowledge.length}`,
      `章节 ${result.chapters.length}`,
      `角色 ${result.characters.length}`,
      `时间线 ${result.timeline.length}`,
      `场景 ${result.scenes.length}`,
      `世界观 ${result.world.length}`,
      `术语 ${result.glossary.length}`
    ].filter(text => !text.endsWith(' 0'));
    flashAssist('知识库搜索', counts.length ? `命中：${counts.join('、')}` : '没有命中任何内容，换个关键词试试。');
  } catch (error) {
    flashAssist('搜索失败', error.message, 'danger');
  }
}
