/* ==========================================================================
 * F075 密钥配置 UI + AI/Prompt 设置（saveAiSettings / savePrompt / loadPrompts）
 * ========================================================================== */
import { apiFetch } from './api.js';
import { store } from './store.js';
import { fallbackState } from './fallback-data.js';
import { escapeHtml, downloadFile } from './utils.js';
import { flashAssist } from './ui.js';
import { showModal } from './modal.js';
import { renderProject, renderChapters } from './render-core.js';
import { renderEditor } from './editor.js';

const CLEAR_API_KEY = '__CLEAR__';

/** 回填「密钥状态 / 主密钥路径 / 指纹」提示区 */
export function renderAiKeyStatus() {
  const status = document.querySelector('#aiKeyStatus');
  const input = document.querySelector('#aiApiKeyInput');
  if (status) setKeyStatus(status, 'warn', '密钥状态：读取中…');
  if (input) input.value = '';
  loadMasterKeyMeta();

  if (!status) return;
  if (!store.apiOnline || !store.state.project) {
    setKeyStatus(status, 'warn', 'API 未启动，无法读取密钥状态。');
    return;
  }
  if (!store.state.project.hasApiKey) {
    setKeyStatus(status, 'warn', '未配置密钥 · 当前为本地演示模式（mock），AI 建议为内置示例数据，非真实模型输出。');
    if (input) input.placeholder = 'API Key（留空表示不修改）';
    return;
  }

  const masked = store.state.project.apiKeyMasked || '已配置';
  if (store.state.project.decryptable === false) {
    setKeyStatus(status, 'danger', `已保存密钥（${masked}）但无法解密 · 主密钥可能已被更换，请恢复备份或重新填写密钥。`);
    if (input) input.placeholder = '密钥无法解密，请重新填写';
    return;
  }
  setKeyStatus(status, 'ok', `已配置密钥（${masked}）· 输入框留空表示不修改`);
  if (input) input.placeholder = `已配置：${masked}，留空表示不修改`;
}

function setKeyStatus(element, level, text) {
  element.textContent = text;
  element.dataset.level = level;
}

/**
 * 拉取主密钥元信息用于备份引导。
 * 失败时静默 —— 提示区不构成主流程，不该因为读不到路径就报错打断写作。
 */
async function loadMasterKeyMeta() {
  const pathEl = document.querySelector('#masterKeyPath');
  const fpEl = document.querySelector('#masterKeyFingerprint');
  if (!store.apiOnline) {
    if (pathEl) pathEl.textContent = '~/.novel-ai/master.key';
    return;
  }
  try {
    const meta = await apiFetch('/settings/ai/master-key');
    if (pathEl) pathEl.textContent = meta.path;
    if (fpEl) fpEl.textContent = meta.fingerprint ? ` · 指纹 ${meta.fingerprint}` : '';
  } catch (error) {
    if (pathEl) pathEl.textContent = '~/.novel-ai/master.key';
  }
}

/** 导出主密钥备份文件 */
export async function exportMasterKey() {
  if (!store.apiOnline) return flashAssist('主密钥备份', 'API 未启动，无法读取主密钥。', 'warning');
  try {
    const meta = await apiFetch('/settings/ai/master-key');
    const bytes = Uint8Array.from(atob(meta.content), char => char.charCodeAt(0));
    downloadFile('novel-ai-master.key', new Blob([bytes], { type: 'application/octet-stream' }), 'application/octet-stream');
    flashAssist('主密钥已导出', `已下载 novel-ai-master.key（来源：${meta.path}）。请将它存放到安全位置：此文件丢失将导致已保存的密钥无法恢复。`);
  } catch (error) {
    flashAssist('主密钥导出失败', error.message, 'danger');
  }
}

/** 清除项目已保存的密钥（需二次确认） */
export async function clearApiKey() {
  if (!store.apiOnline) return flashAssist('清除密钥', 'API 未启动，无法修改密钥。', 'warning');
  const choice = await showModal({
    title: '清除已保存的密钥',
    bodyHtml: '<p>清除后该项目将回落到环境变量 NOVEL_AI_API_KEY，若环境变量也未配置则进入本地演示模式（mock）。此操作不可撤销。</p>',
    actions: [
      { label: '确认清除', value: 'confirm' },
      { label: '取消', value: 'cancel', variant: 'primary-btn' }
    ]
  });
  if (choice !== 'confirm') return;
  try {
    await apiFetch('/settings/ai', {
      method: 'POST',
      body: JSON.stringify({
        baseUrl: document.querySelector('#aiBaseUrlInput')?.value.trim() || '',
        model: document.querySelector('#aiModelInput')?.value.trim() || 'mock-novel-copilot',
        apiKey: CLEAR_API_KEY
      })
    });
    const input = document.querySelector('#aiApiKeyInput');
    if (input) input.value = '';
    flashAssist('密钥已清除', '项目库中的加密密钥已删除。');
    await refreshBootstrapProject();
  } catch (error) {
    flashAssist('清除密钥失败', error.message, 'danger');
  }
}

/** 重新拉取 bootstrap，刷新项目（含 hasApiKey / apiKeyMasked）与章节列表 */
export async function refreshBootstrapProject() {
  try {
    const fresh = await apiFetch('/bootstrap');
    const previousChapterId = store.activeChapter ? store.activeChapter.id : null;
    store.state = fresh;
    store.apiOnline = true;
    const same = store.state.chapters.find(chapter => chapter.id === previousChapterId);
    store.activeChapter = same || store.state.chapters[store.state.chapters.length - 1] || fallbackState.chapters[0];
    renderProject();
    renderChapters();
    renderEditor();
    renderAiKeyStatus();
  } catch (error) {
    flashAssist('状态刷新失败', error.message, 'danger');
  }
}

export async function saveAiSettings() {
  if (!store.apiOnline) return flashAssist('AI 配置', 'API 未启动，无法保存 AI 配置。', 'warning');
  const input = document.querySelector('#aiApiKeyInput');
  // 三态语义与服务端一致：非空覆盖、留空不修改、'__CLEAR__' 清除
  const apiKey = input ? input.value.trim() : '';
  try {
    const result = await apiFetch('/settings/ai', {
      method: 'POST',
      body: JSON.stringify({
        baseUrl: document.querySelector('#aiBaseUrlInput').value.trim(),
        model: document.querySelector('#aiModelInput').value.trim() || 'mock-novel-copilot',
        apiKey
      })
    });
    if (input) input.value = '';
    if (store.state.project) {
      store.state.project.ai_base_url = result.settings.ai_base_url;
      store.state.project.ai_model = result.settings.ai_model;
      store.state.project.hasApiKey = Boolean(result.key?.hasApiKey);
      store.state.project.apiKeyMasked = result.key?.apiKeyMasked || '';
      store.state.project.decryptable = result.key?.decryptable !== false;
    }
    renderAiKeyStatus();
    flashAssist('AI 配置已保存', `当前模型：${result.settings.ai_model}${apiKey ? ' · 密钥已加密写入项目库' : ' · 密钥保持不变'}`);
  } catch (error) {
    flashAssist('AI 配置失败', error.message, 'danger');
  }
}

export async function savePrompt() {
  if (!store.apiOnline) return flashAssist('Prompt 模板', 'API 未启动，无法保存 Prompt。', 'warning');
  try {
    const result = await apiFetch('/prompts', {
      method: 'POST',
      body: JSON.stringify({
        taskType: document.querySelector('#promptTaskInput').value.trim() || 'sync',
        title: document.querySelector('#promptTitleInput').value.trim() || '自定义 Prompt',
        template: document.querySelector('#promptTemplateInput').value.trim()
      })
    });
    flashAssist('Prompt 已保存', `${result.prompt.title} 将注入对应 AI 任务上下文。`);
  } catch (error) {
    flashAssist('Prompt 保存失败', error.message, 'danger');
  }
}

export async function loadPrompts() {
  const log = document.querySelector('#configLog');
  if (!store.apiOnline) {
    log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>API 未启动，暂无 Prompt 模板。</p></article>';
    return;
  }
  try {
    const result = await apiFetch('/prompts');
    log.innerHTML = result.prompts.map(prompt => `
      <article class="log-card">
        <h3>${escapeHtml(prompt.task_type)} · ${escapeHtml(prompt.title)}</h3>
        <p>${escapeHtml(prompt.template)}</p>
      </article>
    `).join('');
  } catch (error) {
    flashAssist('Prompt 加载失败', error.message, 'danger');
  }
}
