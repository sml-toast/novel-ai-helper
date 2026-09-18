// @ts-check
// AI 调用：SSE 流式任务（F082/T015，可中断 + JSON 通道降级）与 AI 反馈。
import { apiBase, apiFetch } from './api.js';
import { store } from './store.js';
import { taskLabels } from './constants.js';
import { flashAssist } from './ui.js';
import { assistFeed } from './dom.js';
import { getEditorSelection } from './editor.js';

/** 组装 AI 请求体：selectedText 传真实选区，targeted 标记「是否定向」供后端感知 */
function buildAiPayload(taskType) {
  const selection = getEditorSelection();
  return {
    taskType,
    chapterId: store.activeChapter ? store.activeChapter.id : null,
    selectedText: selection.text,
    targeted: selection.targeted
  };
}

/**
 * AI 任务统一走流式通道（F082/T015）：实时卡 + 可中断。
 * SSE 帧：meta（引用/截断信息，用于「引用来源」卡）→ delta（增量）→ done（终态多卡）/ error。
 * 断流自动降级：/stream 不可达时回落 JSON 通道 /ai（双通道并存，design C）。
 */
export async function runAi(taskType) {
  if (!store.apiOnline) {
    flashAssist(taskLabels[taskType] || '本地演示', 'API 未启动，当前为本地演示模式。');
    return;
  }

  const controller = new AbortController();
  // 流式卡：增量实时写入；done 后整卡替换为结构化结果
  const card = document.createElement('article');
  card.className = 'assist-card streaming';
  const titleEl = document.createElement('h3');
  titleEl.textContent = `${taskLabels[taskType] || taskType}（生成中…）`;
  const bodyEl = document.createElement('p');
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'ghost-btn';
  stopBtn.textContent = '停止';
  titleEl.appendChild(stopBtn);
  card.append(titleEl, bodyEl);
  assistFeed.prepend(card);
  stopBtn.addEventListener('click', () => controller.abort());

  const showRefsCard = (meta) => {
    if (!meta || !meta.refs || !meta.refs.length) return;
    const refsText = meta.refs.map(ref => `${ref.title}（${ref.score}·${ref.reason}）`).join('；');
    const cut = meta.truncated ? `｜正文已从 ${meta.truncated.original} 字截断至 ${meta.truncated.kept} 字` : '';
    flashAssist('引用来源（AI 看到了什么）', `${refsText}｜本次 prompt 约 ${meta.tokenEstimate} tokens${cut}`);
  };

  try {
    const response = await fetch(`${apiBase}/ai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // F087：selectedText 是编辑器真实选区（无选区回退正文前 1200 字），targeted 标记定向
      body: JSON.stringify(buildAiPayload(taskType)),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`API ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let donePayload = null;
    // SSE 以空行分帧；逐帧解析 event/data（design C.2 客户端骨架）
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator;
      while ((separator = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        let event = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;
        const payload = JSON.parse(data);
        if (event === 'meta') showRefsCard(payload);
        else if (event === 'delta') {
          accumulated += payload.text;
          bodyEl.textContent = accumulated;
        } else if (event === 'done') donePayload = payload;
        else if (event === 'error') throw new Error(payload.message);
      }
    }

    if (donePayload) {
      card.remove();
      // 终态：结构化多卡 + 可信标识（provider 三态随 done 徽章落到每张卡前的提示）
      const providerBadge = { 'openai-compatible': '真实模型', mock: '本地演示', 'mock-fallback': '降级演示', 'secret-error': '配置错误' }[donePayload.provider] || donePayload.provider;
      flashAssist('生成完成', `来源：${providerBadge}${donePayload.tokenEstimate ? `｜约 ${donePayload.tokenEstimate} tokens` : ''}`);
      (donePayload.items || []).slice().reverse().forEach(item => flashAssist(item.title, item.body, item.tone));
    } else {
      card.remove();
    }
  } catch (error) {
    card.remove();
    if (error.name === 'AbortError') {
      flashAssist('已停止生成', '本次生成已中断，不会写入 AI 历史。');
      return;
    }
    // 流不可达（老服务/代理剥离 SSE）→ 回落 JSON 通道，功能不因升级而中断
    try {
      const result = await apiFetch('/ai', {
        method: 'POST',
        body: JSON.stringify(buildAiPayload(taskType))
      });
      showRefsCard(result);
      result.items.slice().reverse().forEach(item => flashAssist(item.title, item.body, item.tone));
    } catch (fallbackError) {
      flashAssist('AI 接口错误', fallbackError.message, 'danger');
    }
  }
}

export async function sendAiFeedback(taskId) {
  if (!store.apiOnline) return flashAssist('AI 反馈', 'API 未启动，无法提交反馈。', 'warning');
  try {
    await apiFetch(`/ai/tasks/${taskId}/feedback`, { method: 'POST', body: JSON.stringify({ rating: 5, note: '前端标记有用' }) });
    flashAssist('AI 反馈已提交', `任务 ${taskId} 已标记为有用。`);
  } catch (error) {
    flashAssist('AI 反馈失败', error.message, 'danger');
  }
}
