/* ══════════ F080 本章提及与负例管理 ══════════ */
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';
import { showModal } from './modal.js';

export const MENTION_TYPE_LABELS = {
  character: '角色', knowledge: '知识', scene: '场景',
  world: '世界观', timeline: '时间线', glossary: '术语'
};

/**
 * 拉取当前章节的实体提及并渲染 chips。
 * 在知识库面板打开时调用（打开前不拉取，避免无谓请求）。
 */
export async function loadChapterMentions() {
  const container = document.querySelector('#chapterMentions');
  if (!container) return;
  if (!store.apiOnline || !store.activeChapter) {
    container.innerHTML = '<span class="mention-empty">API 未启动，提及功能不可用。</span>';
    return;
  }
  try {
    const result = await apiFetch(`/mentions?chapterId=${store.activeChapter.id}`);
    renderChapterMentions(result.mentions || []);
  } catch (error) {
    container.innerHTML = `<span class="mention-empty">提及加载失败：${escapeHtml(error.message)}</span>`;
  }
}

function renderChapterMentions(mentions) {
  const container = document.querySelector('#chapterMentions');
  if (!container) return;
  if (!mentions.length) {
    container.innerHTML = '<span class="mention-empty">本章暂未识别到已登记实体；在角色/知识库等面板录入后会自动出现在这里。</span>';
    return;
  }
  container.innerHTML = mentions.map(mention => `
    <span class="mention-chip">
      <strong>${escapeHtml(mention.title)}</strong>
      <em>${escapeHtml(MENTION_TYPE_LABELS[mention.entity_type] || mention.entity_type)} ×${mention.count}</em>
      <button type="button" title="这不是「${escapeHtml(mention.surface)}」？登记为负例" data-mention-negative="${escapeHtml(mention.surface)}"
        data-mention-type="${escapeHtml(mention.entity_type)}" data-mention-entity="${mention.entity_id}">✗</button>
    </span>`).join('');
}

/**
 * 一键标负例（F080）：把误报字符串登记为该实体的负例别名（polarity=-1），
 * 服务端随即全项目重扫 —— 下一次打开「本章提及」时误报消失。
 * 输入预填命中的 surface：如果误报来自更长的上下文词（如「大学院墙」误报「学院」），
 * 用户应把它扩写成完整词，遮蔽才够精确。
 */
export async function addNegativeAlias(surface, entityType, entityId) {
  const choice = await showModal({
    title: '登记负例（遮蔽误报）',
    bodyHtml: `<p>把下面这个字符串登记为负例：扫描时命中它将<b>整段跳过</b>，不再生成对当前实体的提及。</p>
      <div class="form-grid"><input id="negativeAliasInput" type="text" value="${escapeHtml(surface)}" /></div>
      <p>如误报来自更长的词（如「大学院墙」误报「学院」），请把输入扩写成完整词。</p>`,
    actions: [
      { label: '登记并重扫', value: 'ok', variant: 'primary-btn' },
      { label: '取消', value: 'cancel' }
    ]
  });
  if (choice !== 'ok') return;
  const alias = document.querySelector('#negativeAliasInput')?.value.trim();
  if (!alias) return flashAssist('登记负例', '负例内容为空，未登记。', 'warning');
  try {
    const result = await apiFetch('/aliases', {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId: Number(entityId), alias, polarity: -1 })
    });
    await loadChapterMentions();
    flashAssist('负例已登记', `「${alias}」已遮蔽，全项目重扫完成（${result.rescan.chapters} 章 / ${result.rescan.mentions} 处提及）。`);
  } catch (error) {
    flashAssist('登记负例失败', error.message, 'danger');
  }
}
