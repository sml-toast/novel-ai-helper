// 首屏装配：/bootstrap 载入 + 全量渲染编排（renderAll）。
// F089：loadBootstrap 同时被 importProjectFile / switchProject 复用（切项目即整体重载）。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { fallbackState } from './fallback-data.js';
import { renderApiStatus, renderProject, renderProjectSwitcher, renderChapters, renderRelations } from './render-core.js';
import { renderEditor } from './editor.js';
import { renderAssist } from './ui.js';
import { renderKnowledge } from './knowledge.js';
import { renderPublishBoard } from './publish.js';
import { renderNodeMap } from './graph.js';
import { refreshDashboard } from './dashboard.js';
import { renderAiKeyStatus } from './ai-settings.js';
import { startWritingSession } from './session.js';

export async function loadBootstrap() {
  try {
    store.state = await apiFetch('/bootstrap');
    store.apiOnline = true;
    // F079：以服务端返回为准（首次载入定位默认项目；切换时此处已是目标项目）
    store.currentProjectId = store.state.project.id;
    store.activeChapter = store.state.chapters[store.state.chapters.length - 1] || fallbackState.chapters[0];
  } catch (error) {
    store.apiOnline = false;
    store.state = fallbackState;
    store.activeChapter = fallbackState.chapters[2];
  }
  renderAll();
  // F075：密钥状态提示（含主密钥备份引导）
  renderAiKeyStatus();
  // F086：项目数据就绪后开启写作会话（失败静默，见 startWritingSession）
  startWritingSession();
}

export function renderAll() {
  renderApiStatus();
  renderProject();
  renderProjectSwitcher();
  renderChapters();
  renderEditor();
  renderAssist('ideas');
  renderKnowledge(store.state.knowledge);
  renderRelations();
  renderPublishBoard();
  renderNodeMap(store.state.graph);
  refreshDashboard();
}
