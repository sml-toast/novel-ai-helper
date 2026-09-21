// @ts-check
// API 离线兜底数据：后端未启动时页面仍可完整展示（本地演示模式）。

export const fallbackState = {
  project: {
    id: 1,
    title: '雾港星火',
    genre: '蒸汽玄幻',
    world_view: '雾港由秘仪学院维持记忆封印，黑潮周期性唤醒城市真史。',
    target_platform: '模拟平台 A',
    writing_style: '悬疑、克制、意象化'
  },
  chapters: [
    { id: 10, title: '第 10 章 · 黑潮钟声', status: '今晚 21:30 定时推送', content: '钟声第一次响起时，雾港的煤气灯同时熄灭。林祈站在档案馆门口，听见海潮从城市地下反向涌来。' },
    { id: 11, title: '第 11 章 · 秘仪学院', status: '已存稿 · 待校验', content: '学院的穹顶像一只合拢的铁鸟，所有导师都避开了伊莱娜的名字。' },
    { id: 12, title: '第 12 章 · 钟楼下的背叛', status: '写作中 · AI 同步辅助', content: '雨水沿着钟楼的铜管往下淌，像一行行被擦掉的证词。\n\n林祈把那枚裂开的星火徽章按在掌心，终于意识到罗文从一开始就没有站在调查局这边。可真正让他停下脚步的，不是背叛本身，而是罗文留下的那句暗语：黑潮不是灾难，是归乡。\n\n伊莱娜站在阴影里，斗篷边缘沾着银色粉尘。她没有解释，只把一张旧船票递过来。船票背面写着七年前失踪名单中的最后一个名字——林祈。' }
  ],
  knowledge: {
    global: [
      { title: '网文黄金三章', body: '开局目标、冲突、金手指、悬念钩子需要在前三章建立。', source: '写作知识库' },
      { title: '角色弧光模板', body: '欲望、恐惧、错误信念、关键选择、代价与成长。', source: '写作知识库' },
      { title: '分镜式剧本', body: '场景目标、镜头节奏、人物调度、台词潜台词。', source: '写作知识库' }
    ],
    project: [
      { title: '黑潮', body: '来自雾港地下的周期性能量潮，被学院包装成灾难。', source: '项目设定' },
      { title: '星火徽章', body: '调查局旧制信物，可唤醒林祈失去的航海记忆。', source: '项目设定' },
      { title: '秘仪学院', body: '表面培养术士，实际维护城市记忆封印。', source: '项目设定' }
    ]
  },
  relations: [
    { source_name: '林祈', target_name: '伊莱娜', relation_type: '信任恢复中', description: '她知道林祈失忆真相，但不能直接说出封印关键词。' },
    { source_name: '林祈', target_name: '罗文', relation_type: '保护型背叛', description: '罗文用背叛制造追踪路径，引导林祈进入钟楼地下。' },
    { source_name: '伊莱娜', target_name: '学院导师', relation_type: '师徒决裂', description: '导师希望继续封印黑潮历史，伊莱娜选择公开真相。' }
  ],
  publishTasks: [
    { id: 1, chapter_title: '第 10 章 · 黑潮钟声', platform: '模拟平台 A', scheduled_at: '2026-07-10T21:30:00+08:00', status: 'waiting' },
    { id: 2, chapter_title: '第 11 章 · 秘仪学院', platform: '模拟平台 B', scheduled_at: '2026-07-11T20:00:00+08:00', status: 'checking' }
  ],
  graph: {
    nodes: [
      { id: 'project', label: '雾港星火', type: 'core' },
      { id: 'kb-黑潮', label: '黑潮', type: 'project' },
      { id: 'kb-星火徽章', label: '星火徽章', type: 'project' },
      { id: 'kb-秘仪学院', label: '秘仪学院', type: 'project' },
      { id: 'kb-角色弧光模板', label: '角色弧光', type: 'global' },
      { id: 'char-林祈', label: '林祈', type: 'character' }
    ],
    edges: []
  }
};

export const fallbackAssist = {
  ideas: [
    { title: '章节 AI 构思', body: '建议把“罗文背叛”设计成保护型背叛：他隐瞒真相是为了阻止林祈提前恢复记忆。' },
    { title: '伏笔提示', body: '第 3 章出现过的银色粉尘可在本章解释为秘仪学院追踪术，建议用一句动作描写回扣。' },
    { title: '前后文故事', body: '上一章导师回避伊莱娜，本章她主动交出船票，可形成“被误解的守护者”反转。' }
  ],
  checks: [
    { title: '情节校验冲突', body: '林祈在第 8 章说自己从未去过码头，但本章船票可能暗示童年登船经历；建议标注为失忆前经历。', tone: 'warning' },
    { title: '人物动机', body: '罗文背叛后的行动目标还不够明确，可补一句他需要把林祈引到钟楼地下。' },
    { title: '节奏检查', body: '本章已有背叛、旧船票、失踪名单三个信息点，建议结尾只保留一个强钩子。' }
  ],
  risks: [
    { title: '版权警示辅助', body: '当前段落未发现高相似表达；“黑潮不是灾难，是归乡”建议保留为原创核心句并记录来源。' },
    { title: '平台规则检查', body: '模拟平台提示：章节标题无敏感词，正文未触发暴力/低俗风险。' },
    { title: '相似表达提醒', body: '若引用网络文献中的蒸汽城设定，请在知识库记录来源并改写为项目专属设定。', tone: 'danger' }
  ]
};
