const taskTemplates = {
  sync: [
    ['AI 同步辅助完成', '已结合前后文、伏笔、人物关系和知识库生成新的同步建议。'],
    ['伏笔提示', '“黑潮钟声”和“旧船票”可以在章尾形成双钩子，但建议只把一个作为显性反转。'],
    ['上下文故事', '上一章学院导师回避伊莱娜，本章她主动交出船票，可形成被误解守护者的反转。']
  ],
  outline: [
    ['章节构思', '建议采用：背叛揭露 → 旧船票证据 → 伊莱娜选择 → 钟楼地下钩子。'],
    ['爽点设计', '让主角不是被告知真相，而是通过徽章和船票自己推理出来。']
  ],
  polish: [
    ['拟人化润色', '可把“雨水往下流”改成“雨水替钟楼擦去一层又一层伪证”。'],
    ['语气建议', '保持克制悬疑，不要让 AI 润色破坏当前冷峻叙事声线。']
  ],
  screenplay: [
    ['分镜剧本', '镜头 1：低角度钟楼；镜头 2：徽章特写；镜头 3：伊莱娜递出船票；镜头 4：名单显影。'],
    ['对白潜台词', '罗文的台词应避免解释动机，只留下可被二刷理解的暗示。']
  ],
  conflict: [
    ['情节校验冲突', '林祈在第 8 章说自己从未去过码头，本章船票需标注为失忆前经历。'],
    ['人物动机', '罗文背叛后的行动目标还不够明确，可补一句他需要把林祈引到钟楼地下。']
  ],
  copyright: [
    ['版权警示辅助', '当前段落未发现高相似表达；建议把核心原创句记录进项目知识库。'],
    ['平台规则检查', '模拟平台提示：章节标题无敏感词，正文未触发暴力/低俗风险。']
  ],
  framework: [
    ['小说框架提炼', '当前项目可整理为：失忆调查员追查黑潮 → 学院封印真史 → 主角恢复航海身份 → 选择公开城市记忆。'],
    ['结构建议', '主线采用三幕式：雾港异象、学院追捕、黑潮归乡；每幕末尾回收一个道具伏笔。']
  ],
  'plot-extract': [
    ['小说情节提炼', '本章核心情节是”背叛揭露 + 船票证据 + 失踪名单钩子”，建议作为后续摘要缓存。'],
    ['情节节奏', '信息密度偏高，适合以一个动作细节承接下一章，而非继续追加解释。']
  ],
  mindmap: [
    ['小说思维图', '中心节点：黑潮真相；一级节点：调查局、秘仪学院、失踪名单、星火徽章、旧船票。'],
    ['节点图建议', '把”银色粉尘”连接到”秘仪追踪术”，把”旧船票”连接到”失忆名单”。']
  ],
  relationship: [
    ['人物关系 AI 设计', '建议新增”罗文 ↔ 学院导师：被迫交易”，解释他为何必须背叛林祈。'],
    ['关系强度', '林祈与伊莱娜信任值可从 55 提升到 72，但保留关键秘密形成后续张力。']
  ],
  'conflict-v2': [
    ['情节校验冲突', '船票暗示林祈七年前登船，与第 8 章”从未去过码头”冲突；可解释为失忆前经历。'],
    ['设定一致性', '黑潮既是灾难又是归乡，建议明确”灾难”是学院叙事，”归乡”是真实含义。']
  ],
  continue: [
    ['续写建议', '下一段可让林祈不立刻质问伊莱娜，而是先注意船票上的盐渍与钟楼地下海风呼应。'],
    ['动作钩子', '用“钟声停了，但船票自己渗出水”作为段末推进。']
  ],
  'hook-boost': [
    ['爆点强化', '把“林祈”出现在失踪名单最后一位前置为视觉冲击：名字先显影，伊莱娜再沉默。'],
    ['章末钩子', '建议章末只保留一句：“名单上没有死人，只有归航者。”']
  ],
  foreshadow: [
    ['伏笔回收建议', '银色粉尘、旧船票、星火徽章三条线可分别对应追踪、身份、记忆。'],
    ['伏笔新增', '可新增“钟楼没有影子”的视觉异常，后续解释为地下黑潮折光。']
  ],
  'platform-rewrite': [
    ['平台改写建议', '移动端连载平台建议缩短长句，把每 300 字设置一次悬念推进。'],
    ['互动尾句', '章末可追加作者提问：“罗文是真背叛，还是在替谁拖延时间？”']
  ],
  title: [
    ['标题生成', '备选标题：《钟楼下的旧船票》《名单上的归航者》《黑潮不是灾难》。'],
    ['标题策略', '平台标题建议保留强名词“钟楼/船票/黑潮”，避免抽象表达。']
  ],
  synopsis: [
    ['简介生成', '失忆调查员林祈在雾港追查黑潮异象，却发现城市灾难背后隐藏着被封印的归航真相。'],
    ['卖点提炼', '蒸汽都市、记忆封印、保护型背叛、旧船票身份反转。']
  ],
  tags: [
    ['平台标签生成', '建议标签：蒸汽玄幻、悬疑反转、失忆主角、学院秘仪、群像关系。'],
    ['受众定位', '适合偏剧情流、设定悬疑、角色反转的读者。']
  ],
  dialogue: [
    ['角色对白检查', '罗文台词应更短、更回避；伊莱娜台词可保留克制与负罪感，避免解释过多。'],
    ['声线建议', '林祈偏追问和推理，伊莱娜偏暗示，罗文偏截断话题。']
  ],
  annotation: [
    ['编辑批注建议', '当前段落信息密度较高，建议标注“身份反转”和“船票证据”两处，方便二次修订。'],
    ['修改优先级', '优先检查林祈的反应是否过于平静，再检查伊莱娜递船票的动机是否明确。']
  ],
  summary: [
    ['章节摘要', '本章揭露罗文的保护型背叛，伊莱娜递出旧船票，林祈在失踪名单中发现自己的名字。'],
    ['摘要用途', '可作为后续上下文压缩，供下一章续写和冲突校验使用。']
  ],
  'term-extract': [
    ['设定词条抽取', '建议抽取词条：黑潮、星火徽章、旧船票、秘仪学院、失踪名单。'],
    ['词条分类', '黑潮=世界观；星火徽章/旧船票=道具；秘仪学院=组织；失踪名单=线索。']
  ],
  'sensitive-rewrite': [
    ['敏感表达替换', '如出现直接血腥表达，可改为环境反应、人物回避和结果暗示。'],
    ['平台安全改写', '保留紧张感，减少直白描写，用“灯光摇晃、沉默、气味”承接风险场景。']
  ],
  'character-bio': [
    ['角色小传', '林祈：失忆调查员，表面冷静，核心恐惧是发现自己并非受害者而是归航计划的一部分。'],
    ['角色钩子', '他的每次推理都接近真相，也更接近自我否定。']
  ],
  timeline: [
    ['时间线整理', '七年前登船 → 记忆封印 → 黑潮钟声复现 → 旧船票显影 → 失踪名单揭露。'],
    ['时间线风险', '“从未去过码头”和“旧船票”需要明确区分失忆前后。']
  ],
  scene: [
    ['场景描写', '雾港钟楼应突出铜锈、水痕、低频钟声和地下海风，形成“城市像船舱”的意象。'],
    ['调度建议', '让角色站位形成三角：林祈在光下、伊莱娜在阴影、罗文留下的线索在二者之间。']
  ],
  world: [
    ['世界观设定扩展', '黑潮不是自然灾害，而是城市集体记忆周期性回流；学院负责把回流解释成灾难。'],
    ['规则约束', '每次黑潮只能唤醒与“归航者”直接相关的记忆碎片，避免设定万能化。']
  ]
};

function buildPrompt({ taskType, project, chapter, context }) {
  const template = context?.promptTemplate?.template || '';
  return [
    `你是小说 AI 助手，任务类型：${taskType}`,
    template ? `任务模板：${template}` : '',
    `项目：${project.title}，题材：${project.genre}，风格：${project.writing_style}`,
    `世界观：${project.world_view}`,
    `当前章节：${chapter?.title || '未选择章节'}`,
    `正文：${chapter?.content || ''}`,
    `上下文：${JSON.stringify(context || {})}`,
    '请输出结构化建议，避免替作者直接写完整章节。'
  ].filter(Boolean).join('\n');
}

async function callOpenAICompatible({ project, taskType, prompt }) {
  const baseUrl = process.env.NOVEL_AI_BASE_URL || project.ai_base_url;
  const apiKey = process.env.NOVEL_AI_API_KEY;
  const model = process.env.NOVEL_AI_MODEL || project.ai_model;
  if (!baseUrl || !apiKey || model === 'mock-novel-copilot') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是专业小说创作辅助系统，输出 JSON 数组，每项包含 title/body/tone。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`AI provider failed: ${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    try {
      return { provider: 'openai-compatible', items: JSON.parse(content) };
    } catch {
      return { provider: 'openai-compatible', items: [{ title: 'AI 返回结果', body: content, tone: '' }] };
    }
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function runAiTask({ taskType, project, chapter, context }) {
  const prompt = buildPrompt({ taskType, project, chapter, context });
  const providerResult = await callOpenAICompatible({ project, taskType, prompt }).catch(error => ({
    provider: 'mock-fallback',
    items: [[`AI 接口降级`, `真实模型调用失败，已切换 mock：${error.message}`, 'warning']]
  }));

  if (providerResult) {
    return {
      provider: providerResult.provider,
      prompt,
      items: providerResult.items.map(item => Array.isArray(item) ? { title: item[0], body: item[1], tone: item[2] || '' } : item)
    };
  }

  return {
    provider: 'mock',
    prompt,
    items: (taskTemplates[taskType] || taskTemplates.sync).map(([title, body, tone]) => ({ title, body, tone: tone || '' }))
  };
}

export { runAiTask };
