// 故事圣经：角色档案、时间线、场景库、世界观设定的增录入与列表渲染。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';

export async function addCharacter() {
  if (!store.apiOnline) return flashAssist('角色档案', 'API 未启动，无法保存角色。', 'warning');
  try {
    const result = await apiFetch('/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: document.querySelector('#characterNameInput').value.trim(),
        role: document.querySelector('#characterRoleInput').value.trim(),
        // F087：动机/成长弧开放录入，留空回落服务端默认（待补充/待设计）
        motivation: document.querySelector('#characterMotivationInput')?.value.trim() || '',
        arc: document.querySelector('#characterArcInput')?.value.trim() || ''
      })
    });
    flashAssist('角色已新增', result.character.name);
    loadCharacters();
  } catch (error) {
    flashAssist('角色新增失败', error.message, 'danger');
  }
}

export async function loadCharacters() {
  const log = document.querySelector('#storyBibleLog');
  if (!store.apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无角色。</p></article>';
  try {
    const result = await apiFetch('/characters');
    log.innerHTML = result.characters.map(item => `<article class="log-card"><h3>${escapeHtml(item.name)} · ${escapeHtml(item.role)}</h3><p>${escapeHtml(item.motivation)} / ${escapeHtml(item.arc)}</p></article>`).join('');
  } catch (error) {
    flashAssist('角色加载失败', error.message, 'danger');
  }
}

export async function addTimeline() {
  if (!store.apiOnline) return flashAssist('时间线', 'API 未启动，无法保存时间线。', 'warning');
  try {
    const result = await apiFetch('/timeline', {
      method: 'POST',
      body: JSON.stringify({
        eventTime: document.querySelector('#timelineTimeInput').value.trim(),
        title: document.querySelector('#timelineTitleInput').value.trim(),
        // F087：事件说明开放录入，留空回落服务端默认
        description: document.querySelector('#timelineDescInput')?.value.trim() || ''
      })
    });
    flashAssist('时间线已新增', result.event.title);
    loadTimeline();
  } catch (error) {
    flashAssist('时间线新增失败', error.message, 'danger');
  }
}

export async function loadTimeline() {
  const log = document.querySelector('#storyBibleLog');
  if (!store.apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无时间线。</p></article>';
  try {
    const result = await apiFetch('/timeline');
    log.innerHTML = result.events.map(item => `<article class="log-card"><h3>${escapeHtml(item.event_time)} · ${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`).join('');
  } catch (error) {
    flashAssist('时间线加载失败', error.message, 'danger');
  }
}

export async function addScene() {
  if (!store.apiOnline) return flashAssist('场景库', 'API 未启动，无法保存场景。', 'warning');
  try {
    // F087：场景说明开放录入，留空回落服务端默认
    const result = await apiFetch('/scenes', {
      method: 'POST',
      body: JSON.stringify({
        name: document.querySelector('#sceneNameInput').value.trim(),
        mood: document.querySelector('#sceneMoodInput').value.trim(),
        description: document.querySelector('#sceneDescInput')?.value.trim() || ''
      })
    });
    flashAssist('场景已新增', result.scene.name);
    loadScenes();
  } catch (error) {
    flashAssist('场景新增失败', error.message, 'danger');
  }
}

export async function loadScenes() {
  const log = document.querySelector('#worldBuilderLog');
  if (!store.apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无场景。</p></article>';
  try {
    const result = await apiFetch('/scenes');
    log.innerHTML = result.scenes.map(item => `<article class="log-card"><h3>${escapeHtml(item.name)} · ${escapeHtml(item.mood)}</h3><p>${escapeHtml(item.description)}</p></article>`).join('');
  } catch (error) {
    flashAssist('场景加载失败', error.message, 'danger');
  }
}

export async function addWorld() {
  if (!store.apiOnline) return flashAssist('世界观设定', 'API 未启动，无法保存设定。', 'warning');
  try {
    // F087：设定内容开放录入，留空回落服务端默认
    const result = await apiFetch('/world', {
      method: 'POST',
      body: JSON.stringify({
        category: document.querySelector('#worldCategoryInput').value.trim(),
        title: document.querySelector('#worldTitleInput').value.trim(),
        content: document.querySelector('#worldContentInput')?.value.trim() || ''
      })
    });
    flashAssist('世界观设定已新增', result.setting.title);
    loadWorld();
  } catch (error) {
    flashAssist('世界观设定失败', error.message, 'danger');
  }
}

export async function loadWorld() {
  const log = document.querySelector('#worldBuilderLog');
  if (!store.apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无设定。</p></article>';
  try {
    const result = await apiFetch('/world');
    log.innerHTML = result.settings.map(item => `<article class="log-card"><h3>${escapeHtml(item.category)} · ${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p></article>`).join('');
  } catch (error) {
    flashAssist('世界观加载失败', error.message, 'danger');
  }
}
