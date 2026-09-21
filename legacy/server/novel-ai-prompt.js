// @ts-check
/**
 * 分层 Prompt 构建（F081 / T014）—— 从 novel-ai-provider.js 拆出，独立成模块。
 *
 * 拆分原因：provider 单文件已超过 300 行硬上限（F089 模块化约定），
 * 而 prompt 拼装与「怎么调模型」是两件事 —— 前者纯字符串处理，可独立测试。
 *
 * 旧实现把「全文正文 + JSON.stringify(整个上下文)」一次性灌进去：
 * prompt 随知识库与正文长度线性膨胀，绝大部分是噪声。
 * 新结构：L1 项目设定 → L2 前情记忆 → L3 召回 Top-K → L3.5 伏笔 → L4 截断正文 → L5 任务。
 * 零 token 预估依赖：中文按 1.5 字符/token、其余按 4 字符/token 估算。
 *
 * @module server/novel-ai-prompt.js
 */

/** 正文三段截断的上限（字符数）：章首 / 中段 / 章尾 / 总量 */
const BODY_LIMIT = { head: 800, middle: 600, tail: 400, total: 1800 };

/** 召回类型 → 中文标签（让作者读懂 AI 看到了什么） */
const RECALL_TYPE_LABELS = {
  character: '角色',
  knowledge: '知识',
  scene: '场景',
  world: '世界观',
  timeline: '时间线',
  glossary: '术语'
};

/**
 * 正文三段截断：章首保持开篇语境，中段优先取作者选区附近（光标位置的
 * 最佳代理，F087 修复后 selectedText 是真实选区），章尾保持最新进展。
 * 截断信息随响应回传（truncated），UI 必须让作者知道「AI 没看到全文」。
 *
 * @param {string} content 章节正文
 * @param {string} [selectedText] 作者划选内容（无则取正文前段）
 * @returns {{text: string, truncated: object|null}} truncated 为截断元数据 {original,kept,strategy}
 */
function truncateBody(content, selectedText) {
  const text = String(content || '');
  if (text.length <= BODY_LIMIT.total) return { text, truncated: null };

  const head = text.slice(0, BODY_LIMIT.head);
  const tail = text.slice(-BODY_LIMIT.tail);
  let middle;
  const selectedIdx = selectedText ? text.indexOf(selectedText) : -1;
  if (selectedIdx >= 0) {
    const start = Math.max(BODY_LIMIT.head, Math.min(selectedIdx - 200, text.length - BODY_LIMIT.tail - BODY_LIMIT.middle));
    middle = text.slice(start, start + BODY_LIMIT.middle);
  } else {
    middle = text.slice(BODY_LIMIT.head, BODY_LIMIT.head + BODY_LIMIT.middle);
  }
  return {
    text: `[章首] ${head}\n……（中段有截断）……\n${middle}\n……（中段有截断）……\n[章尾] ${tail}`,
    truncated: {
      original: text.length,
      kept: head.length + middle.length + tail.length,
      strategy: `head-${BODY_LIMIT.head} + middle-${BODY_LIMIT.middle} + tail-${BODY_LIMIT.tail}`
    }
  };
}

/**
 * 零依赖 token 估算：中文 ≈1.5 字符/token，其余 ≈4 字符/token。
 * 只用于「上下文预算」提示，不参与计费，无需精确。
 *
 * @param {string} text 输入文本
 * @returns {number} 估算 token 数
 */
function estimateTokens(text) {
  const input = String(text || '');
  const cjk = (input.match(/[\u4e00-\u9fff]/g) || []).length;
  return Math.ceil(cjk / 1.5 + (input.length - cjk) / 4);
}

/**
 * 构建分层 prompt。
 *
 * @param {{taskType:string, project:object, chapter:object|null, context:object,
 *          recall?:Array, memory?:object|null, foreshadows?:Array}} params
 * @returns {{prompt: string, truncated: object|null}}
 */
function buildPrompt({ taskType, project, chapter, context, recall = [], memory = null, foreshadows = [] }) {
  const template = context?.promptTemplate?.template || '';
  // 注意解构：truncated 是「截断元数据」{original,kept,strategy}；
  // truncateBody 返回的 {text, truncated} 里 text 进 prompt，truncated 才回传给响应
  const { text: bodyText, truncated } = truncateBody(chapter?.content, context?.selectedText);

  const lines = [
    // L1 项目设定层（常驻，很短）
    `【项目】${project.title}｜${project.genre}｜风格：${project.writing_style}`,
    `【世界观】${project.world_view}`,
    template ? `【任务模板】${template}` : ''
  ];

  // L2 记忆层：上一章尾部摘录（章节摘要落库前的过渡方案，F086 后可升级为摘要）
  if (memory) {
    lines.push(`【前情】上一章《${memory.title}》末尾：${memory.tail}`);
  }

  // L3 召回层：按相关度排序的实体/设定（让 AI 保持一致性，也让作者可审计）
  if (recall.length) {
    lines.push('【召回的相关实体与设定】（按相关度排序）');
    for (const item of recall) {
      lines.push(`- [${RECALL_TYPE_LABELS[item.entityType] || item.entityType}] ${item.title}：${item.reason}`);
    }
  }

  // L3.5 伏笔层（F084/F032）：未回收伏笔清单。目前仅 conflict（情节校验）注入 ——
  // 冲突校验必须核对「本章是否该回收/是否与未回收伏笔矛盾」；其余任务注入只增 token。
  // 数据由 novel-api 从 novel-foreshadow.listOpenForeshadows 取得，本层只负责拼装。
  if (foreshadows.length) {
    lines.push('【未回收伏笔清单】（校验时逐条核对本章是否回收、是否与伏笔冲突）');
    for (const item of foreshadows) {
      const expected = item.expected_chapter ? `，预期第 ${item.expected_chapter} 章前后回收` : '';
      const summary = String(item.content || '').slice(0, 80);
      lines.push(`- 《${item.title}》埋设于《${item.chapter_title || '未知章节'}》${expected}${summary ? `：${summary}` : ''}`);
    }
  }

  // L4 正文层（截断已标注）+ 作者选区
  lines.push(`【本章】${chapter?.title || '未选择章节'}`);
  lines.push(`【正文】${bodyText}`);
  if (context?.selectedText) {
    lines.push(`【作者选区】${context.selectedText}`);
    // F087：targeted=true 表示 selectedText 是作者真实划选的内容（而非正文回退），
    // 此时明确要求围绕选区输出 —— 23 个 AI 按钮中的定向类功能（润色/改写/对白检查等）才真正可用
    if (context.targetedSelection) {
      lines.push('【定向指令】作者划选了上述内容，请针对选区本身输出，不要泛化到整章。');
    }
  }

  // L5 任务层
  lines.push(`【任务】${taskType}。请输出结构化建议（JSON 数组，每项含 title/body/tone），避免替作者直接写完整章节。`);

  return { prompt: lines.filter(Boolean).join('\n'), truncated };
}

/**
 * 召回条目 → 引用清单（让作者看见 AI 看到了什么，F081 验收项）。
 * provider 的 JSON 通道与流式通道共用，故放在此处避免两处各写一份。
 *
 * @param {Array} recall 召回结果
 * @returns {Array<{type:string, title:string, score:number, reason:string}>}
 */
function toRefs(recall = []) {
  return recall.map(item => ({ type: item.entityType, title: item.title, score: item.score, reason: item.reason }));
}

/**
 * 模型返回内容 → 结构化 items（优先 JSON 数组，失败则整段作为单卡）。
 * 本地小模型经常输出带 markdown 代码围栏的 JSON，解析失败时整段兜底比丢内容好。
 *
 * @param {string} content 模型输出
 * @returns {Array<object>}
 */
function parseModelContent(content) {
  try {
    return JSON.parse(content);
  } catch {
    return [{ title: 'AI 返回结果', body: content, tone: '' }];
  }
}

export { buildPrompt, estimateTokens, parseModelContent, toRefs, truncateBody };
