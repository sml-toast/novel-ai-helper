const chapters = [
  {
    id: 10,
    title: "第 10 章 · 黑潮钟声",
    status: "今晚 21:30 定时推送",
    content: "钟声第一次响起时，雾港的煤气灯同时熄灭。林祈站在档案馆门口，听见海潮从城市地下反向涌来。"
  },
  {
    id: 11,
    title: "第 11 章 · 秘仪学院",
    status: "已存稿 · 待校验",
    content: "学院的穹顶像一只合拢的铁鸟，所有导师都避开了伊莱娜的名字。"
  },
  {
    id: 12,
    title: "第 12 章 · 钟楼下的背叛",
    status: "写作中 · AI 同步辅助",
    content: "雨水沿着钟楼的铜管往下淌，像一行行被擦掉的证词。\n\n林祈把那枚裂开的星火徽章按在掌心，终于意识到罗文从一开始就没有站在调查局这边。可真正让他停下脚步的，不是背叛本身，而是罗文留下的那句暗语：黑潮不是灾难，是归乡。\n\n伊莱娜站在阴影里，斗篷边缘沾着银色粉尘。她没有解释，只把一张旧船票递过来。船票背面写着七年前失踪名单中的最后一个名字——林祈。"
  }
];

const assistContent = {
  ideas: [
    ["章节 AI 构思", "建议把“罗文背叛”设计成保护型背叛：他隐瞒真相是为了阻止林祈提前恢复记忆。"],
    ["伏笔提示", "第 3 章出现过的银色粉尘可在本章解释为秘仪学院追踪术，建议用一句动作描写回扣。"],
    ["前后文故事", "上一章导师回避伊莱娜，本章她主动交出船票，可形成‘被误解的守护者’反转。"]
  ],
  checks: [
    ["情节校验冲突", "林祈在第 8 章说自己从未去过码头，但本章船票可能暗示童年登船经历；建议标注为失忆前经历。", "warning"],
    ["人物动机", "罗文背叛后的行动目标还不够明确，可补一句他需要把林祈引到钟楼地下。"],
    ["节奏检查", "本章已有背叛、旧船票、失踪名单三个信息点，建议结尾只保留一个强钩子。"]
  ],
  risks: [
    ["版权警示辅助", "当前段落未发现高相似表达；‘黑潮不是灾难，是归乡’建议保留为原创核心句并记录来源。"],
    ["平台规则检查", "模拟平台提示：章节标题无敏感词，正文未触发暴力/低俗风险。"],
    ["相似表达提醒", "若引用网络文献中的蒸汽城设定，请在知识库记录来源并改写为项目专属设定。", "danger"]
  ]
};

const knowledge = {
  global: [
    ["网文黄金三章", "开局目标、冲突、金手指、悬念钩子需要在前三章建立。"],
    ["角色弧光模板", "欲望、恐惧、错误信念、关键选择、代价与成长。"],
    ["分镜式剧本", "场景目标、镜头节奏、人物调度、台词潜台词。"]
  ],
  project: [
    ["黑潮", "来自雾港地下的周期性能量潮，被学院包装成灾难。"],
    ["星火徽章", "调查局旧制信物，可唤醒林祈失去的航海记忆。"],
    ["秘仪学院", "表面培养术士，实际维护城市记忆封印。"]
  ]
};

const relations = [
  ["林祈 ↔ 伊莱娜", "信任恢复中", "她知道林祈失忆真相，但不能直接说出封印关键词。"],
  ["林祈 ↔ 罗文", "保护型背叛", "罗文用背叛制造追踪路径，引导林祈进入钟楼地下。"],
  ["伊莱娜 ↔ 学院导师", "师徒决裂", "导师希望继续封印黑潮历史，伊莱娜选择公开真相。"]
];

const publishTasks = [
  ["第 10 章 · 黑潮钟声", "模拟平台 A", "2026-07-10 21:30", "等待推送"],
  ["第 11 章 · 秘仪学院", "模拟平台 B", "2026-07-11 20:00", "版权校验中"],
  ["第 12 章 · 钟楼下的背叛", "草稿箱", "未设定", "章节存稿" ]
];

const nodes = [
  ["小说项目", "core", 42, 98],
  ["黑潮", "", 218, 46],
  ["星火徽章", "", 426, 92],
  ["秘仪学院", "", 142, 226],
  ["失忆名单", "", 370, 242],
  ["钟楼", "", 560, 174]
];

const editor = document.querySelector("#chapterEditor");
const chapterTitle = document.querySelector("#chapterTitle");
const wordCount = document.querySelector("#wordCount");
const assistFeed = document.querySelector("#assistFeed");

let activeChapter = chapters[2];

function renderChapters() {
  document.querySelector("#chapterList").innerHTML = chapters.map(chapter => `
    <button class="chapter-item ${chapter.id === activeChapter.id ? "active" : ""}" type="button" data-chapter-id="${chapter.id}">
      <strong>${chapter.title}</strong>
      <span>${chapter.status}</span>
    </button>
  `).join("");
}

function renderEditor() {
  chapterTitle.textContent = activeChapter.title;
  editor.value = activeChapter.content;
  updateWordCount();
}

function updateWordCount() {
  wordCount.textContent = editor.value.replace(/\s/g, "").length.toString();
}

function renderAssist(tab = "ideas") {
  assistFeed.innerHTML = assistContent[tab].map(([title, body, tone]) => `
    <article class="assist-card ${tone || ""}">
      <h3>${title}</h3>
      <p>${body}</p>
    </article>
  `).join("");
}

function renderKnowledge() {
  document.querySelector("#globalKnowledge").innerHTML = knowledge.global.map(renderKnowledgeCard).join("");
  document.querySelector("#projectKnowledge").innerHTML = knowledge.project.map(renderKnowledgeCard).join("");
}

function renderKnowledgeCard([title, body]) {
  return `<article class="knowledge-card"><h3>${title}</h3><p>${body}</p></article>`;
}

function renderRelations() {
  document.querySelector("#relationList").innerHTML = relations.map(([title, tag, body]) => `
    <article class="relation-item">
      <span class="tag">${tag}</span>
      <h3>${title}</h3>
      <p>${body}</p>
    </article>
  `).join("");
}

function renderPublishBoard() {
  document.querySelector("#publishBoard").innerHTML = publishTasks.map(([title, platform, time, status]) => `
    <article class="publish-card">
      <span class="tag">${status}</span>
      <h3>${title}</h3>
      <p>${platform} · ${time}</p>
    </article>
  `).join("");
}

function renderNodeMap() {
  document.querySelector("#nodeMap").innerHTML = nodes.map(([label, type, x, y]) => `
    <div class="node ${type}" style="left:${x}px;top:${y}px">${label}</div>
  `).join("");
}

function openDrawer(name) {
  const drawer = document.querySelector(`#${name}Drawer`);
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}

function closeDrawers() {
  document.querySelectorAll(".drawer").forEach(drawer => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  });
}

function flashAssist(title, body, tone = "") {
  assistFeed.insertAdjacentHTML("afterbegin", `<article class="assist-card ${tone}"><h3>${title}</h3><p>${body}</p></article>`);
}

document.addEventListener("click", event => {
  const chapterButton = event.target.closest("[data-chapter-id]");
  if (chapterButton) {
    activeChapter = chapters.find(chapter => chapter.id === Number(chapterButton.dataset.chapterId));
    renderChapters();
    renderEditor();
    return;
  }

  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) {
    document.querySelectorAll("[data-tab]").forEach(button => button.classList.remove("active"));
    tabButton.classList.add("active");
    renderAssist(tabButton.dataset.tab);
    return;
  }

  const openButton = event.target.closest("[data-open-panel]");
  if (openButton) {
    openDrawer(openButton.dataset.openPanel);
    return;
  }

  if (event.target.closest("[data-close-panel]")) {
    closeDrawers();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const actions = {
    "run-sync-ai": ["AI 同步辅助完成", "已结合前后文、伏笔、人物关系和知识库生成 3 条新建议。"],
    "save-draft": ["章节已存稿", "草稿版本写入本地模拟队列，后端实现时会落库并生成版本记录。"],
    "outline": ["章节构思", "建议采用：背叛揭露 → 旧船票证据 → 伊莱娜选择 → 钟楼地下钩子。"],
    "polish": ["拟人化润色", "可把‘雨水往下流’改成‘雨水替钟楼擦去一层又一层伪证’。"],
    "screenplay": ["分镜剧本", "镜头 1：低角度钟楼；镜头 2：徽章特写；镜头 3：伊莱娜递出船票；镜头 4：名单显影。"],
    "search-knowledge": ["历史与文献搜索", "已模拟召回 6 条资料：黑潮设定、星火徽章、角色弧光、平台规则、蒸汽城市资料、旧章节片段。"],
    "refresh-graph": ["节点图已刷新", "知识库节点按项目核心概念重新聚合，保留 Karpathy 风格概念连接视图。"],
    "new-project": ["新建项目入口", "全栈实现时将进入项目创建向导：题材、平台、风格、AI 模型与知识库范围。"]
  };

  const [title, body] = actions[actionButton.dataset.action] || ["操作已触发", "该能力将在后端 API 接入后执行真实任务。"];
  flashAssist(title, body);
});

editor.addEventListener("input", updateWordCount);

renderChapters();
renderEditor();
renderAssist();
renderKnowledge();
renderRelations();
renderPublishBoard();
renderNodeMap();
