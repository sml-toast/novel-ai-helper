/**
 * 连接检测与模型枚举（F093 设置面板「测试连接」）—— 只探测，不落库、不发正文。
 *
 * 为什么独立成模块：探测是「读模型列表 + 计时 + 归一化结果」，与「端点判定/报错文案」
 * 关注点不同，且会随支持的推理后端增加而变长；拆开后两端都留在 300 行以内。
 *
 * 设计约束：
 *   - 枚举失败**不影响保存**（PRD 要求）—— 拿不到列表就返回空，模型名允许手填；
 *   - 只探测本地/用户自填的地址，绝不把稿件内容发出去。
 *
 * @module server/novel-ai-probe.js
 */

import { buildAuthHeaders, describeEndpointError, isLocalEndpoint, describeTarget } from './novel-local-model.js';

/** 去重并保持顺序 */
function dedupe(list) {
  return [...new Set(list)];
}

/**
 * 最小 JSON GET：统一超时与错误归一化，调用方只需判断 ok。
 *
 * @param {string} url 完整地址
 * @param {{apiKey?:string, timeoutMs?:number}} params
 * @returns {Promise<{ok:boolean, data?:object, error?:Error}>}
 */
async function requestJson(url, { apiKey = '', timeoutMs = 5000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: buildAuthHeaders(apiKey), signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      return { ok: false, error: Object.assign(new Error(`HTTP ${response.status}`), { status: response.status }) };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    clearTimeout(timer);
    return { ok: false, error };
  }
}

/**
 * 拉取模型列表：先试 OpenAI 兼容的 GET /models，失败再试 Ollama 原生的 GET /api/tags。
 *
 * @param {{baseUrl:string, apiKey?:string, timeoutMs?:number}} params
 * @returns {Promise<{models: string[], source: string|null, error: string|null}>}
 *   source: 'openai' | 'ollama' | null（null 表示两种都没枚举到）
 */
export async function listModels({ baseUrl, apiKey = '', timeoutMs = 5000 }) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  const openai = await requestJson(`${root}/models`, { apiKey, timeoutMs });
  if (openai.ok) {
    const models = (Array.isArray(openai.data?.data) ? openai.data.data : [])
      .map(item => String(item?.id || '')).filter(Boolean);
    return { models: dedupe(models), source: 'openai', error: null };
  }
  // Ollama 原生接口挂在服务根路径（/api/tags），与 OpenAI 兼容层（/v1）不同
  const origin = root.replace(/\/v1$/, '');
  const ollama = await requestJson(`${origin}/api/tags`, { apiKey: '', timeoutMs });
  if (ollama.ok) {
    const models = (Array.isArray(ollama.data?.models) ? ollama.data.models : [])
      .map(item => String(item?.name || item?.model || '')).filter(Boolean);
    return { models: dedupe(models), source: 'ollama', error: null };
  }
  return { models: [], source: null, error: describeEndpointError(openai.error, baseUrl).message };
}

/**
 * 连接检测。
 *
 * @param {{baseUrl:string, model?:string, apiKey?:string, timeoutMs?:number}} params
 * @returns {Promise<{ok:boolean, kind:string, endpoint:string, message:string,
 *                    models:string[], modelExists:boolean|null, latencyMs:number}>}
 *   modelExists 为 null 表示「无法判断」（列表别名 / 未填模型名），UI 只提示不拦保存
 */
export async function testConnection({ baseUrl, model = '', apiKey = '', timeoutMs = 8000 }) {
  const started = Date.now();
  const endpoint = describeTarget(baseUrl);

  if (!String(baseUrl || '').trim()) {
    return { ok: false, kind: 'mock', endpoint: '(未填写)', message: '未填写 baseURL：当前为本地演示模式（mock），AI 建议为内置示例数据。', models: [], modelExists: null, latencyMs: 0 };
  }
  if (model === 'mock-novel-copilot') {
    return { ok: true, kind: 'mock', endpoint, message: '已选择 mock 演示模型，不会发起任何网络请求。', models: [], modelExists: true, latencyMs: 0 };
  }

  const kind = isLocalEndpoint(baseUrl) ? 'local' : 'cloud';
  const listed = await listModels({ baseUrl, apiKey, timeoutMs });
  if (!listed.source) {
    return {
      ok: false,
      kind,
      endpoint,
      message: `${listed.error || '连接失败'}（未读到模型列表）`,
      models: [],
      modelExists: null,
      latencyMs: Date.now() - started
    };
  }

  const models = listed.models;
  const modelExists = model ? models.includes(model) : null;
  const tail = models.length ? `，可用模型 ${models.length} 个` : '，但未读到模型列表（模型名可手填）';
  const warning = modelExists === false ? `；未找到模型「${model}」，请从列表中选择或手填正确名称` : '';
  return {
    ok: true,
    kind,
    endpoint,
    message: `已连上 ${endpoint}（${listed.source === 'ollama' ? 'Ollama 原生接口' : 'OpenAI 兼容接口'}${tail}）${warning}`,
    models,
    modelExists,
    latencyMs: Date.now() - started
  };
}
