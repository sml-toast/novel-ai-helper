/**
 * server/novel-mentions.js —— 中文实体识别扫描器（F080 / T013）
 *
 * 纯函数，无依赖、无 SQL：输入词典行，输出扫描函数。
 * 算法与实测依据见 design 文档 E 节：
 *   1. 朴素 O(n×m) 在 500 条词典时退化到 324ms/10 万字 —— 必须建首字符 Map 索引
 *      （实测 2.5ms/10 万字，与词典规模基本无关）；
 *   2. 负例（polarity=-1）优先且长词优先：命中「黑潮生」时整体跳过，
 *      防止其内部的「黑潮」被误报 —— 这是设计文档 E.3 对抗样本的解法；
 *   3. CJK 邻居边界校验被实测否定（中文无词边界，会把正确命中一起误杀），
 *      剩余误报（如「他黑潮化了」）交给提及管理 UI 的人工负例兜底。
 *
 * @param {Array<{entity_type:string, entity_id:number, alias:string, polarity:number}>} rows
 * @returns {(text:string) => Array<{entityType:string, entityId:number, surface:string, position:number}>}
 */

const ENTITY_TYPES = new Set(['character', 'knowledge', 'scene', 'world', 'timeline', 'glossary']);

export function buildMentionScanner(rows) {
  const byFirst = new Map();
  // 负例排在前、同组内长词优先：最长匹配在单个位置上先试遮蔽、再试正例
  const ordered = [
    ...rows.filter(row => row.polarity === -1),
    ...rows.filter(row => row.polarity !== -1)
  ];
  for (const row of ordered) {
    const alias = String(row.alias || '');
    if (!alias || !ENTITY_TYPES.has(row.entity_type)) continue;
    const key = alias[0];
    if (!byFirst.has(key)) byFirst.set(key, []);
    byFirst.get(key).push({
      alias,
      polarity: row.polarity,
      entityType: row.entity_type,
      entityId: Number(row.entity_id)
    });
  }
  for (const list of byFirst.values()) {
    list.sort((a, b) => b.alias.length - a.alias.length); // 长者优先
  }

  return function scan(text) {
    const input = String(text || '');
    const hits = [];
    let i = 0;
    while (i < input.length) {
      const candidates = byFirst.get(input[i]);
      let matched = null;
      if (candidates) {
        for (const candidate of candidates) {
          if (input.startsWith(candidate.alias, i)) { matched = candidate; break; }
        }
      }
      if (matched) {
        // 负例命中 = 遮蔽：跳过整段，不产出提及
        if (matched.polarity !== -1) {
          hits.push({
            entityType: matched.entityType,
            entityId: matched.entityId,
            surface: matched.alias,
            position: i
          });
        }
        i += matched.alias.length;
      } else {
        i += 1;
      }
    }
    return hits;
  };
}
