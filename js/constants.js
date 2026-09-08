// 共享常量：跨模块使用的标签表与图谱布局参数。

// AI 任务类型 → 中文标签（runAi 流式卡标题、AI 历史/审计列表共用）
export const taskLabels = {
  sync: 'AI 同步辅助',
  outline: '章节构思',
  polish: '拟人化润色',
  screenplay: '分镜剧本',
  framework: '小说框架提炼',
  'plot-extract': '小说情节提炼',
  mindmap: '小说思维图',
  relationship: '人物关系 AI 设计',
  conflict: '情节校验冲突',
  copyright: '版权警示辅助',
  continue: '续写建议',
  'hook-boost': '爆点强化',
  foreshadow: '伏笔回收建议',
  'platform-rewrite': '平台改写建议',
  title: '标题生成',
  synopsis: '简介生成',
  tags: '平台标签生成',
  dialogue: '角色对白检查',
  annotation: '编辑批注建议',
  summary: '章节摘要',
  'term-extract': '设定词条抽取',
  'sensitive-rewrite': '敏感表达替换',
  'character-bio': '角色小传',
  timeline: '时间线整理',
  scene: '场景描写',
  world: '世界观设定扩展'
};

// 旧固定布局坐标（F089 前使用）。F091 起图谱改为力导向布局，此表仅为兼容保留
export const nodePositions = [[42, 98], [218, 46], [426, 92], [142, 226], [370, 242], [560, 174], [520, 286], [260, 150]];

export const graphTypeLabels = { all: '综合图', knowledge: '知识图', character: '人物图', timeline: '时间线', world: '世界观' };
