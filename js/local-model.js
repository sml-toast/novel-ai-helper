/* ==========================================================================
 * F093 本地模型接入（Ollama / LM Studio / llama.cpp / vLLM）
 *
 * 定位：本地模型与云模型走**同一条** OpenAI 兼容协议，差别只有两点 ——
 *   1. 本地通常没有 API Key（留空即可，服务端已放行）；
 *   2. 本地服务没起时需要「可行动」的提示（连不上 127.0.0.1:11434，请先启动 Ollama）。
 * 因此本模块只做「降低配置成本」：预设一键填入 + 连接检测 + 模型名补全。
 * ========================================================================== */
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';

/** 预设缓存：加载失败后允许重试，成功后不再重复请求 */
let presetCache = [];

/**
 * 是否本机 / 局域网地址（仅用于文案提示，判定以服务端 isLocalEndpoint 为准）。
 * 前端拿不到「服务端最终会用哪个地址」（环境变量可覆盖），所以这里只决定措辞，
 * 不参与任何行为分支 —— 避免前后端判定不一致导致功能差异。
 */
export function isLocalBaseUrl(baseUrl) {
  try {
    const host = new URL(String(baseUrl || '')).hostname.toLowerCase();
    return host === 'localhost' || host === '::1'
      || /^127\./.test(host) || /^10\./.test(host)
      || /^192\.168\./.test(host) || /\.local$/.test(host);
  } catch {
    return false;
  }
}

/** 写入连接检测结果区（与密钥状态区同款 data-level 三色语义） */
function setConnStatus(text, level) {
  const el = document.querySelector('#aiConnectionStatus');
  if (!el) return;
  el.textContent = text;
  el.dataset.level = level;
}

/**
 * 渲染「本地模型」预设按钮。
 * 预设由服务端下发（与报错提示共用一份定义，避免前后端漂移）；
 * API 离线时给出说明而不是静默留空 —— 空面板会让人以为功能没做。
 */
export async function renderLocalPresets() {
  const bar = document.querySelector('#localPresetBar');
  if (!bar) return;
  if (!store.apiOnline) {
    bar.innerHTML = '<span class="secret-tip">API 未启动，暂无法读取本地模型预设。</span>';
    return;
  }
  if (bar.dataset.loaded === '1') return;
  try {
    const { presets } = await apiFetch('/settings/ai/presets');
    presetCache = presets || [];
    bar.innerHTML = presetCache.map(preset => `
      <button type="button" class="ghost-btn" data-preset="${escapeHtml(preset.id)}"
              title="${escapeHtml(preset.hint)}">${escapeHtml(preset.label)}</button>
    `).join('');
    bar.dataset.loaded = '1';
    // 事件委托挂在容器上：innerHTML 重绘不会丢监听，也不必逐个按钮绑定
    if (bar.dataset.bound !== '1') {
      bar.addEventListener('click', event => {
        const id = event.target?.closest?.('[data-preset]')?.dataset.preset;
        if (id) applyLocalPreset(id);
      });
      bar.dataset.bound = '1';
    }
  } catch (error) {
    bar.innerHTML = `<span class="secret-tip">本地模型预设加载失败：${escapeHtml(error.message)}</span>`;
  }
}

/**
 * 一键填入预设：baseURL + 模型名，并提示该服务怎么启动。
 * 只改输入框、不落库 —— 用户还要走「保存 AI 配置」，避免误操作覆盖线上配置。
 */
export function applyLocalPreset(id) {
  const preset = presetCache.find(item => item.id === id);
  if (!preset) return;
  const baseUrlInput = document.querySelector('#aiBaseUrlInput');
  const modelInput = document.querySelector('#aiModelInput');
  if (baseUrlInput) baseUrlInput.value = preset.baseUrl;
  if (modelInput) modelInput.value = preset.model;
  setConnStatus(`已填入 ${preset.label} 预设：${preset.hint}。本地模型通常无需 API Key（留空即可），填好后点「测试连接」。`, 'warn');
  flashAssist(`${preset.label} 预设已填入`, `${preset.baseUrl} · ${preset.hint}`);
}

/** 把枚举到的模型名灌进 datalist：拿不到列表时模型名仍可手填，不阻塞 */
function fillModelOptions(models) {
  const datalist = document.querySelector('#aiModelOptions');
  if (!datalist || !Array.isArray(models)) return;
  datalist.innerHTML = models.slice(0, 50).map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}

/**
 * 连接检测：POST /settings/ai/test。
 *
 * 服务端统一返回 200（ok:false 表示连不上），因为「连不上」是**预期内的配置状态**，
 * 不是服务端异常 —— 用 4xx/5xx 会让前端把它当成故障，反而丢失可行动的 message。
 */
export async function testAiConnection() {
  if (!store.apiOnline) return flashAssist('连接检测', 'API 未启动，无法检测连接。', 'warning');
  const baseUrlInput = document.querySelector('#aiBaseUrlInput');
  const modelInput = document.querySelector('#aiModelInput');
  const keyInput = document.querySelector('#aiApiKeyInput');
  setConnStatus('正在检测连接…', 'warn');
  try {
    const { result } = await apiFetch('/settings/ai/test', {
      method: 'POST',
      body: JSON.stringify({
        baseUrl: baseUrlInput ? baseUrlInput.value.trim() : '',
        model: modelInput ? modelInput.value.trim() : '',
        apiKey: keyInput ? keyInput.value.trim() : ''
      })
    });
    fillModelOptions(result.models);
    setConnStatus(result.message, result.ok ? (result.modelExists === false ? 'warn' : 'ok') : 'danger');
    flashAssist(
      result.ok ? '连接成功' : '连接失败',
      result.message + (result.ok && result.latencyMs ? `（${result.latencyMs}ms）` : ''),
      result.ok ? '' : 'danger'
    );
  } catch (error) {
    setConnStatus(`连接检测失败：${error.message}`, 'danger');
    flashAssist('连接检测失败', error.message, 'danger');
  }
}
