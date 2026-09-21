/**
 * server/novel-recall.js —— 按需召回打分（F081 / T014）
 *
 * 纯函数，无依赖无 SQL。设计依据 design 文档 §2.5：
 *   score = 0.40×提及 + 0.25×关键词 + 0.20×TF-IDF + 0.15×邻近
 *
 * 与设计的两处偏差（均为零依赖下的务实取舍，已在架构文档记录）：
 *   1. keywordScore 用 bigram 包含度实现（与 search_fts 同源 token），
 *      不走 FTS5 BM25 —— 章节全文 3000+ token 的 MATCH 表达式开销大且收益有限；
 *   2. TF-IDF 的 IDF 在「候选实体集合」内统计（N=候选数），不做全章节语料预计算 ——
 *      候选量级几十条，语料统计开销不成比例。
 *
 * 提及分（0.40）权重最高：正文真的写到了该实体是最强信号（T013 的提及表是数据源）。
 */

/** 实体类型中文名（引用清单与召回理由共用） */
export const RECALL_TYPE_LABELS = {
  character: '角色',
  knowledge: '知识',
  scene: '场景',
  world: '世界观',
  timeline: '时间线',
  glossary: '术语'
};

/** bigram token 集合（与 novel-db.js 的 bigram() 同一切分规则） */
export function bigramTokenSet(text) {
  const chars = Array.from(String(text || ''));
  const tokens = new Set();
  if (chars.length < 2) {
    if (chars.length) tokens.add(chars[0]);
    return tokens;
  }
  for (let i = 0; i < chars.length - 1; i += 1) tokens.add(chars[i] + chars[i + 1]);
  return tokens;
}

/** bigram token 计数（TF 向量） */
function bigramTermFrequency(text) {
  const chars = Array.from(String(text || ''));
  const tf = new Map();
  for (let i = 0; i < chars.length - 1; i += 1) {
    const token = chars[i] + chars[i + 1];
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

/**
 * 对候选实体打分排序。
 *
 * @param {Array<{entityType:string, entityId:number, title:string, text:string}>} candidates
 * @param {{chapterText:string, mentionCounts:Record<string,number>, chapterIndex:number,
 *          lastMentionIndex?:Record<string,number>, window?:number, topK?:number}} opts
 *   mentionCounts / lastMentionIndex 的键为 `${entityType}:${entityId}`
 * @returns {Array<{entityType:string, entityId:number, title:string, score:number, reason:string}>}
 */
export function scoreRecallCandidates(candidates, opts = {}) {
  const {
    chapterText = '',
    mentionCounts = {},
    chapterIndex = 0,
    lastMentionIndex = {},
    window = 10,
    topK = 8,
    noiseFloor = 0.05
  } = opts;

  const count = candidates.length;
  if (!count) return [];

  // IDF 在候选集合内统计（偏差说明见文件头）
  const candidateTokens = candidates.map(candidate => bigramTokenSet(candidate.text));
  const df = new Map();
  for (const tokens of candidateTokens) {
    for (const token of tokens) df.set(token, (df.get(token) || 0) + 1);
  }
  const idf = token => Math.log(1 + count / (1 + (df.get(token) || 0)));

  // 章节向量：TF × IDF
  const chapterTf = bigramTermFrequency(chapterText);
  const chapterVec = new Map();
  for (const [token, tf] of chapterTf) chapterVec.set(token, tf * idf(token));
  const chapterSet = bigramTokenSet(chapterText);
  const chapterNorm = Math.sqrt([...chapterVec.values()].reduce((sum, weight) => sum + weight * weight, 0));

  const scored = [];
  candidates.forEach((candidate, index) => {
    const tokens = candidateTokens[index];

    // ① 提及分：本章真的写到了（min(count/5, 1)，5 次封顶防止单实体霸榜）
    const mentionCount = mentionCounts[`${candidate.entityType}:${candidate.entityId}`] || 0;
    const mentionScore = Math.min(mentionCount / 5, 1);

    // ② 关键词分：候选文本的 bigram 有多少出现在本章（包含度）
    let overlap = 0;
    for (const token of tokens) if (chapterSet.has(token)) overlap += 1;
    const keywordScore = tokens.size ? overlap / tokens.size : 0;

    // ③ TF-IDF 余弦：捕捉同义/相关表达，弥补精确匹配的召回不足
    const candidateVec = new Map();
    let candidateNorm = 0;
    for (const [token, tf] of bigramTermFrequency(candidate.text)) {
      const weight = tf * idf(token);
      candidateVec.set(token, weight);
      candidateNorm += weight * weight;
    }
    candidateNorm = Math.sqrt(candidateNorm);
    let dot = 0;
    for (const [token, weight] of candidateVec) {
      const other = chapterVec.get(token);
      if (other) dot += other * weight;
    }
    const tfidfScore = chapterNorm && candidateNorm ? dot / (chapterNorm * candidateNorm) : 0;

    // ④ 邻近分：最近一次提及距本章多少章（近 10 章内线性衰减；从未提及为 0）
    const lastIdx = lastMentionIndex[`${candidate.entityType}:${candidate.entityId}`];
    const proximityScore = lastIdx == null
      ? 0
      : Math.max(0, 1 - Math.abs(chapterIndex - lastIdx) / window);

    const score = 0.40 * mentionScore + 0.25 * keywordScore + 0.20 * tfidfScore + 0.15 * proximityScore;
    if (score <= noiseFloor) return;

    // 理由取最强的两个信号，让作者看懂「为什么召回了它」
    const reasons = [];
    if (mentionCount > 0) reasons.push(`本章提及 ${mentionCount} 次`);
    if (keywordScore >= 0.3) reasons.push(`关键词重叠 ${Math.round(keywordScore * 100)}%`);
    if (proximityScore > 0) reasons.push(`近 ${Math.abs(chapterIndex - lastIdx)} 章内出现`);
    if (!reasons.length) reasons.push('与本章文本相关');

    scored.push({
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      title: candidate.title,
      score: Number(score.toFixed(2)),
      reason: reasons.join(' · ')
    });
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
