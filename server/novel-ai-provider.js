/**
 * AI 调用层 · JSON 通道（云模型 + F093 本地模型共用一条 OpenAI 兼容路径）。
 *
 * 模块拆分（F093 顺带完成，原因是 provider 长期超过 300 行上限）：
 *   novel-ai-mock.js   —— 26 个任务的示例数据与降级输出
 *   novel-ai-prompt.js —— 分层 prompt、token 估算、模型输出解析
 *   novel-ai-stream.js —— SSE 流式通道（本文件的孪生通道）
 *   novel-local-model.js —— 本地端点判定 / 可行动报错
 *   novel-ai-probe.js  —— 连接检测与模型枚举（设置面板用）
 *
 * F093 本地模型（Ollama / LM Studio / llama.cpp）的两个关键改动：
 *   1. 协议相同，**不另起一套调用路径**；唯一差别是「本地通常没有 API Key」，
 *      故短路判定从 `!baseUrl || !apiKey` 改为 `!baseUrl || (!apiKey && !local)`。
 *   2. 连不上本地服务时**不降级 mock**：mock 卡片长得像 AI 输出，会把
 *      「服务没起」伪装成「AI 给了建议」。云模型保留既有降级行为。
 *
 * @module server/novel-ai-provider.js
 */

import { buildPrompt, estimateTokens, parseModelContent, toRefs } from './novel-ai-prompt.js';
import { buildMockItems } from './novel-ai-mock.js';
import { buildAuthHeaders, describeEndpointError, describeHttpError, isLocalEndpoint } from './novel-local-model.js';

/** 真实调用超时（毫秒）：本地 7B 模型首 token 慢，60s 是实测可用的下界 */
const REQUEST_TIMEOUT_MS = 60000;

/** 系统提示词（流式通道复用同一份，保证两条通道行为一致） */
const SYSTEM_PROMPT = '你是专业小说创作辅助系统，输出 JSON 数组，每项包含 title/body/tone。';

/**
 * 解析出本次调用要用的端点与模型（环境变量优先，便于临时切到本地服务实测）。
 *
 * @param {object} project 已脱敏的项目行（含 ai_base_url / ai_model）
 * @returns {{baseUrl: string, model: string, local: boolean}}
 */
function resolveEndpoint(project) {
  const baseUrl = process.env.NOVEL_AI_BASE_URL || project?.ai_base_url || '';
  const model = process.env.NOVEL_AI_MODEL || project?.ai_model || '';
  return { baseUrl, model, local: isLocalEndpoint(baseUrl) };
}

/**
 * 是否具备真实调用条件（F093 核心判定）。
 *
 * 旧写法 `if (!baseUrl || !apiKey)` 会把「配了 Ollama 但没填 Key」误判为「没配置」，
 * 直接静默降级成 mock —— 用户会以为本地模型在跑，看到的却是内置示例。
 * 正确语义：地址必填；有 Key 一定可调；没 Key 时**仅本地端点**放行。
 *
 * @param {{baseUrl:string, model:string, apiKey:string, local:boolean}} params
 * @returns {boolean}
 */
function canCallReal({ baseUrl, model, apiKey, local }) {
  if (!baseUrl) return false;
  if (model === 'mock-novel-copilot') return false; // 显式选 mock：绝不发请求
  return Boolean(apiKey) || local === true;
}

/**
 * 调用 OpenAI 兼容接口（云模型与本地模型共用）。
 *
 * apiKey 由调用方按优先级链解析后传入（F075）：
 *   1. 项目库中已保存并成功解密的密钥
 *   2. 环境变量 NOVEL_AI_API_KEY（向后兼容，保留）
 *   3. 都没有 → 云模型返回 null 走 mock 降级；**本地端点仍会调用**（F093）
 *
 * @param {{project:object, taskType:string, prompt:string, apiKey:string}} params
 * @returns {Promise<{provider:string, items:Array}|null>} null 表示无可用配置，应降级
 */
async function callOpenAICompatible({ project, taskType, prompt, apiKey }) {
  const endpoint = resolveEndpoint(project);
  if (!canCallReal({ ...endpoint, apiKey })) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${endpoint.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: buildAuthHeaders(apiKey), // 本地无 Key 时不发 Authorization
      body: JSON.stringify({
        model: endpoint.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) throw describeHttpError(response.status, endpoint.baseUrl, { hasKey: Boolean(apiKey) });
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return { provider: 'openai-compatible', items: parseModelContent(content) };
  } catch (error) {
    clearTimeout(timeout);
    // HTTP 错误已经是「可行动文案」，只补一次网络层翻译（fetch failed → 连不上 127.0.0.1:11434）
    if (error.status) throw error;
    throw describeEndpointError(error, endpoint.baseUrl);
  }
}

/**
 * 本地端点失败时的终态：显式报错卡片。
 *
 * 与 F075 的 secret-error 同思路 —— 「可修复的配置故障」必须被看见，
 * 不能降级成 mock，否则作者会拿着示例数据当 AI 建议继续改稿。
 *
 * @param {string} message 可行动提示
 * @returns {{provider:string, items:Array}}
 */
function connectionErrorResult(message) {
  return {
    provider: 'connection-error',
    items: [{
      title: '无法连接本地模型服务',
      body: `${message}确认服务启动后重试；在此之前不会用 mock 冒充模型输出。`,
      tone: 'danger'
    }]
  };
}

/**
 * 执行一个 AI 任务（JSON 通道，F082 后与流式通道并存）。
 *
 * @param {{taskType:string, project:object, chapter:object|null, context:object,
 *          apiKey?:string, apiKeyError?:string|null, recall?:Array, memory?:object|null}} params
 *   apiKey      项目库解密所得密钥（空串表示项目未配置，回落到环境变量）
 *   apiKeyError 项目库密钥解密失败的原因；非空时**直接返回可读错误**，
 *               绝不静默降级成 mock —— 否则用户会以为 AI 正常工作。
 * @returns {Promise<{provider:string, prompt:string, items:Array, refs:Array, truncated:object|null, tokenEstimate:number}>}
 */
async function runAiTask({ taskType, project, chapter, context, apiKey = '', apiKeyError = null, recall = [], memory = null, foreshadows = [] }) {
  const { prompt, truncated } = buildPrompt({ taskType, project, chapter, context, recall, memory, foreshadows });
  const tokenEstimate = estimateTokens(prompt);
  const refs = toRefs(recall);

  // 解密失败优先于一切：这是可修复的配置故障，必须让用户看见
  if (apiKeyError) {
    return { provider: 'secret-error', prompt, items: buildMockItems(taskType, apiKeyError), refs, truncated, tokenEstimate };
  }

  const resolvedKey = apiKey || process.env.NOVEL_AI_API_KEY || '';
  const providerResult = await callOpenAICompatible({ project, taskType, prompt, apiKey: resolvedKey }).catch(error => {
    // 本地端点：不降级 mock（理由见 connectionErrorResult 注释）
    if (error.kind === 'local') return connectionErrorResult(error.message);
    // 云模型：保留既有降级行为 —— 断网时作者至少还能看到结构示例，不至于彻底空屏
    return {
      provider: 'mock-fallback',
      items: [[`AI 接口降级`, `真实模型调用失败，已切换 mock：${error.message}`, 'warning']]
    };
  });

  if (providerResult) {
    return {
      provider: providerResult.provider,
      prompt,
      items: providerResult.items.map(item => Array.isArray(item) ? { title: item[0], body: item[1], tone: item[2] || '' } : item),
      refs, truncated, tokenEstimate
    };
  }

  return { provider: 'mock', prompt, items: buildMockItems(taskType, null), refs, truncated, tokenEstimate };
}

export { canCallReal, resolveEndpoint, runAiTask, SYSTEM_PROMPT };
