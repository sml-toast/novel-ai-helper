/**
 * 流式通道（F082 / T015 + F093 本地模型）—— 从 novel-ai-provider.js 拆出。
 *
 * 可行性依据（design 文档 C 节实测）：首字节 11.2ms、AbortController 中断正常、
 * node:http 原生 SSE 零依赖。
 *
 * 事件流（SSE，event/data 帧）：
 *   meta  {provider, refs, truncated, tokenEstimate}  —— 召回/截断信息先行
 *   delta {text}                                       —— 增量正文
 *   done  {provider, items, prompt, tokenEstimate}     —— 终态（服务端据此落库）
 *   error {message}                                    —— 流中失败
 *
 * mock 流是**确定性**的：固定 40 字符分片、间隔 15ms —— Playwright 断言
 * 「最终拼接文本 == 预期串」，规避时序 flaky（design R12）。
 *
 * @module server/novel-ai-stream.js
 */

import { buildPrompt, estimateTokens, parseModelContent, toRefs } from './novel-ai-prompt.js';
import { buildMockItems } from './novel-ai-mock.js';
import { buildAuthHeaders, describeEndpointError, describeHttpError } from './novel-local-model.js';
import { canCallReal, resolveEndpoint, SYSTEM_PROMPT } from './novel-ai-provider.js';

/** 流式调用超时（毫秒）：一篇长建议可能持续产出，给到 120s */
const STREAM_TIMEOUT_MS = 120000;

/**
 * 上游 OpenAI 兼容流式转发：stream:true → 逐行解析 data: 帧 → yield 增量文本。
 * [DONE] 或上游关闭即结束；signal.aborted 时经 AbortController 中断上游连接。
 */
async function* streamFromOpenAI({ project, prompt, apiKey, signal }) {
  const endpoint = resolveEndpoint(project);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(`${endpoint.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: buildAuthHeaders(apiKey), // 本地无 Key 时不发 Authorization（F093）
      body: JSON.stringify({
        model: endpoint.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        stream: true
      }),
      signal: controller.signal
    });
    if (!response.ok) throw describeHttpError(response.status, endpoint.baseUrl, { hasKey: Boolean(apiKey) });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content || '';
          if (delta) yield delta;
        } catch {
          // 上游可能发送注释行/心跳帧，忽略非 JSON 行
        }
      }
    }
  } catch (error) {
    // 与 JSON 通道同规则：HTTP 错误已是「可行动文案」，网络异常再翻译一次
    if (error.status) throw error;
    throw describeEndpointError(error, endpoint.baseUrl);
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** mock 流的固定间隔：让「停止生成」真实可中断，也让中断测试免于竞态（design R12/C） */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** 固定长度分片（确定性，便于测试断言拼接结果） */
function chunkText(text, size = 40) {
  const chars = Array.from(String(text || ''));
  const chunks = [];
  for (let i = 0; i < chars.length; i += size) chunks.push(chars.slice(i, i + size).join(''));
  return chunks;
}

/**
 * 流式执行一个 AI 任务（async generator，事件对象逐个 yield）。
 *
 * @param {object} params 与 runAiTask 相同，另加：
 *   forceMock {boolean} body.mock=1 时强制走确定性 mock 流（测试用，design R12）
 *   signal    {{aborted:boolean}} 客户端断开标记（endpoint 在 req.close 置位）
 */
export async function* streamAiTask({
  taskType, project, chapter, context, apiKey = '', apiKeyError = null,
  recall = [], memory = null, foreshadows = [], forceMock = false, signal = null
}) {
  const { prompt, truncated } = buildPrompt({ taskType, project, chapter, context, recall, memory, foreshadows });
  const tokenEstimate = estimateTokens(prompt);
  const refs = toRefs(recall);

  if (apiKeyError) {
    // 解密失败与 JSON 通道同语义：直接返回可读错误，绝不静默降级
    yield { type: 'meta', provider: 'secret-error', refs, truncated, tokenEstimate };
    yield { type: 'done', provider: 'secret-error', items: buildMockItems(taskType, apiKeyError), prompt, tokenEstimate };
    return;
  }

  const resolvedKey = apiKey || process.env.NOVEL_AI_API_KEY || '';
  // F093：本地端点没有 Key 也要能走真实流（判定条件与 JSON 通道完全一致）
  const canStreamReal = !forceMock && canCallReal({ ...resolveEndpoint(project), apiKey: resolvedKey });

  if (canStreamReal) {
    yield { type: 'meta', provider: 'openai-compatible', refs, truncated, tokenEstimate };
    const accumulated = [];
    try {
      for await (const delta of streamFromOpenAI({ project, prompt, apiKey: resolvedKey, signal })) {
        if (signal && signal.aborted) return; // 客户端已断开，停止产出
        accumulated.push(delta);
        yield { type: 'delta', text: delta };
      }
      yield {
        type: 'done',
        provider: 'openai-compatible',
        items: parseModelContent(accumulated.join('')),
        prompt,
        tokenEstimate
      };
      return;
    } catch (error) {
      if (accumulated.length) {
        // 已经流出部分内容，无法干净重启 —— 显式报错，前端保留已收文本
        yield { type: 'error', message: `流式调用中断：${error.message}` };
        return;
      }
      // 本地端点：一个增量都没出也不降级 mock —— mock 会伪装成「AI 给了建议」
      if (error.kind === 'local') {
        yield { type: 'error', message: error.message };
        return;
      }
      // 一个增量都没出 → 降级 mock 流，保持可用（最终徽章 mock-fallback）
      yield { type: 'meta', provider: 'mock-fallback', refs, truncated, tokenEstimate };
    }
  } else {
    // 未配置密钥等：仍发 meta，保证前端徽章与 JSON 通道三态一致
    yield { type: 'meta', provider: 'mock', refs, truncated, tokenEstimate };
  }

  // mock 确定性流：notice + 模板文本按固定 40 字符分片
  const items = buildMockItems(taskType, null);
  const text = items.map(item => `【${item.title}】${item.body}`).join('\n\n');
  for (const chunk of chunkText(text)) {
    if (signal && signal.aborted) return;
    await sleep(15);
    if (signal && signal.aborted) return; // 间隔期间客户端断开：不再产出
    yield { type: 'delta', text: chunk };
  }
  yield { type: 'done', provider: 'mock', items, prompt, tokenEstimate };
}
