// 编辑辅助面板：章节批注、创作待办、术语表、敏感词检查。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';

export async function addAnnotation() {
  if (!store.apiOnline) return flashAssist('章节批注', 'API 未启动，无法保存批注。', 'warning');
  try {
    const result = await apiFetch(`/chapters/${store.activeChapter.id}/annotations`, {
      method: 'POST',
      body: JSON.stringify({
        quote: document.querySelector('#annotationQuoteInput').value.trim(),
        note: document.querySelector('#annotationNoteInput').value.trim(),
        // F087：严重度改为表单选择（服务端白名单校验）
        severity: document.querySelector('#annotationSeverityInput')?.value || 'info'
      })
    });
    flashAssist('章节批注已保存', result.annotation.note);
    loadAnnotations();
  } catch (error) {
    flashAssist('章节批注失败', error.message, 'danger');
  }
}

export async function loadAnnotations() {
  const log = document.querySelector('#editorialLog');
  if (!store.apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无批注。</p></article>';
  try {
    const result = await apiFetch(`/chapters/${store.activeChapter.id}/annotations`);
    log.innerHTML = result.annotations.map(item => `<article class="log-card"><h3>${escapeHtml(item.severity)} · ${escapeHtml(item.quote)}</h3><p>${escapeHtml(item.note)}</p></article>`).join('');
  } catch (error) {
    flashAssist('批注加载失败', error.message, 'danger');
  }
}

export async function addTodo() {
  if (!store.apiOnline) return flashAssist('创作待办', 'API 未启动，无法保存待办。', 'warning');
  try {
    // F087：截止日开放录入；留空传 null = 无截止（不再写死 2026-07-20）
    const result = await apiFetch('/todos', {
      method: 'POST',
      body: JSON.stringify({ title: document.querySelector('#todoTitleInput').value.trim(), dueAt: document.querySelector('#todoDueInput')?.value || null })
    });
    flashAssist('创作待办已新增', result.todo.title);
    loadTodos();
  } catch (error) {
    flashAssist('创作待办失败', error.message, 'danger');
  }
}

export async function loadTodos() {
  const log = document.querySelector('#editorialLog');
  if (!store.apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无待办。</p></article>';
  try {
    const result = await apiFetch('/todos');
    log.innerHTML = result.todos.map(todo => `<article class="log-card"><h3>${escapeHtml(todo.status)} · ${escapeHtml(todo.title)}</h3><p>${escapeHtml(todo.due_at || '无截止日期')}</p><button type="button" data-todo-id="${escapeHtml(String(todo.id))}">切换状态</button></article>`).join('');
  } catch (error) {
    flashAssist('待办加载失败', error.message, 'danger');
  }
}

export async function toggleTodoStatus(id) {
  try {
    await apiFetch(`/todos/${id}/toggle`, { method: 'POST' });
    flashAssist('待办状态已更新', `任务 ${id} 状态已切换。`);
    loadTodos();
  } catch (error) {
    flashAssist('待办状态失败', error.message, 'danger');
  }
}

export async function addGlossary() {
  if (!store.apiOnline) return flashAssist('术语表', 'API 未启动，无法保存术语。', 'warning');
  try {
    const term = document.querySelector('#glossaryTermInput').value.trim();
    // F087：释义开放录入，留空回落服务端默认
    const definition = document.querySelector('#glossaryDefinitionInput')?.value.trim() || '';
    const result = await apiFetch('/glossary', { method: 'POST', body: JSON.stringify({ term, definition, category: '设定' }) });
    flashAssist('术语已新增', result.term.term);
    loadGlossary();
  } catch (error) {
    flashAssist('术语新增失败', error.message, 'danger');
  }
}

export async function loadGlossary() {
  const log = document.querySelector('#riskLog');
  if (!store.apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无术语。</p></article>';
  try {
    const result = await apiFetch('/glossary');
    log.innerHTML = result.terms.map(term => `<article class="log-card"><h3>${escapeHtml(term.category)} · ${escapeHtml(term.term)}</h3><p>${escapeHtml(term.definition)}</p></article>`).join('');
  } catch (error) {
    flashAssist('术语加载失败', error.message, 'danger');
  }
}

export async function sensitiveCheck() {
  const log = document.querySelector('#riskLog');
  if (!store.apiOnline) return flashAssist('敏感词检查', 'API 未启动，无法检查。', 'warning');
  try {
    const result = await apiFetch('/sensitive/check', { method: 'POST', body: JSON.stringify({ text: document.querySelector('#sensitiveTextInput').value }) });
    log.innerHTML = result.matches.length
      ? result.matches.map(match => `<article class="log-card danger"><h3>${escapeHtml(match.severity)} · ${escapeHtml(match.term)}</h3><p>${escapeHtml(match.suggestion)}</p></article>`).join('')
      : '<article class="log-card"><h3>检查通过</h3><p>未命中敏感词规则。</p></article>';
    flashAssist('敏感词检查完成', `命中 ${result.matches.length} 条规则。`);
  } catch (error) {
    flashAssist('敏感词检查失败', error.message, 'danger');
  }
}
