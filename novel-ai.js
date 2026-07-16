const apiBase = `${location.protocol}//${location.hostname}:${window.NOVEL_API_PORT || 8787}/api/novel`;

// ── Logging System ──
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
let logLevel = parseInt(localStorage.getItem('novel_log_level') || '0', 10);
let logEntries = [];
const MAX_LOG_ENTRIES = 500;

function log(level, category, message) {
  // Enforce size limit to prevent localStorage quota exceeded errors
  const serialized = JSON.stringify(logEntries);
  if (serialized.length > 4 * 1024 * 1024) compressLogs();

  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    level: level,
    category: category,
    message: message,
    activeChapter: typeof activeChapter !== 'undefined' && activeChapter ? activeChapter.title : 'none'
  };
  logEntries.push(entry);
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries = logEntries.slice(-MAX_LOG_ENTRIES);
  }
  try { localStorage.setItem('novel_logs', JSON.stringify(logEntries)); } catch {}
  console.log(`[${level}] [${category}] ${message}`);
}

function getLogs(levelFilter) {
  let entries = JSON.parse(localStorage.getItem('novel_logs') || '[]');
  if (levelFilter !== undefined) {
    entries = entries.filter(e => LOG_LEVELS[e.level] >= LOG_LEVELS[levelFilter]);
  }
  return entries;
}

function clearLogs() {
  logEntries = [];
  localStorage.removeItem('novel_logs');
  renderLogPanel();
}

function compressLogs() {
  const entries = JSON.parse(localStorage.getItem('novel_logs') || '[]');
  if (entries.length <= 10) return;
  const recent = entries.slice(-100);
  const oldEntries = entries.slice(0, -100);
  if (oldEntries.length > 0) {
    const summary = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'SYSTEM',
      message: `日志压缩：${oldEntries.length} 条旧日志已归档`,
      activeChapter: 'system'
    };
    recent.unshift(summary);
  }
  localStorage.setItem('novel_logs', JSON.stringify(recent));
  logEntries = recent;
  renderLogPanel();
}

function openLogDrawer() {
  openDrawer('log');
  renderLogPanel();
}

function renderLogPanel() {
  const container = document.getElementById('logList');
  if (!container) return;

  const levelFilter = document.getElementById('logLevelFilter')?.value || 'DEBUG';
  const entries = getLogs(levelFilter);

  const levelColors = {
    DEBUG: '#6c757d',
    INFO: '#0d6efd',
    WARN: '#ffc107',
    ERROR: '#dc3545'
  };

  container.innerHTML = entries.map(entry => {
    const color = levelColors[entry.level] || '#6c757d';
    return `
      <div class="log-entry" style="border-left: 3px solid ${color}; padding: 8px; margin-bottom: 4px; background: var(--surface); border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: bold; color: ${color};">${entry.level}</span>
          <small style="color: var(--text-secondary);">${new Date(entry.timestamp).toLocaleString()}</small>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 2px;">[${entry.category}]</div>
        <div style="font-size: 13px;">${entry.message}</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">章节: ${entry.activeChapter}</div>
      </div>
    `;
  }).join('');

  const countEl = document.getElementById('logCount');
  if (countEl) countEl.textContent = `${entries.length} 条`;
}

try {
  logEntries = JSON.parse(localStorage.getItem('novel_logs') || '[]');
} catch (e) {
  logEntries = [];
}

const fallbackState = {
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

const fallbackAssist = {
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

const taskLabels = {
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

const nodePositions = [[42, 98], [218, 46], [426, 92], [142, 226], [370, 242], [560, 174], [520, 286], [260, 150]];
const graphTypeLabels = { all: '综合图', knowledge: '知识图', character: '人物图', timeline: '时间线', world: '世界观' };
const editor = document.querySelector('#chapterEditor');
const chapterTitle = document.querySelector('#chapterTitle');
const wordCount = document.querySelector('#wordCount');
const assistFeed = document.querySelector('#assistFeed');
const apiStatus = document.querySelector('#apiStatus');

let state = fallbackState;
let activeChapter = fallbackState.chapters[2];
let apiOnline = false;
let activeGraphType = 'all';

async function apiFetch(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

async function loadBootstrap() {
  try {
    state = await apiFetch('/bootstrap');
    apiOnline = true;
    activeChapter = state.chapters[state.chapters.length - 1] || fallbackState.chapters[0];
  } catch (error) {
    apiOnline = false;
    state = fallbackState;
    activeChapter = fallbackState.chapters[2];
  }
  renderAll();
}

function renderAll() {
  renderApiStatus();
  renderProject();
  renderChapters();
  renderEditor();
  renderAssist('ideas');
  renderKnowledge(state.knowledge);
  renderRelations();
  renderPublishBoard();
  renderNodeMap(state.graph);
  refreshDashboard();
}

function renderApiStatus() {
  if (!apiStatus) return;
  apiStatus.textContent = apiOnline ? 'API 在线' : '本地演示';
  apiStatus.classList.toggle('offline', !apiOnline);
}

function renderProject() {
  const card = document.querySelector('.project-card');
  if (!card || !state.project) return;
  card.querySelector('.project-badge').textContent = state.project.genre || '小说';
  card.querySelector('h2').textContent = state.project.title || '未命名项目';
  card.querySelector('p').textContent = `${state.project.target_platform || '模拟平台'} · ${state.project.writing_style || '默认风格'}`;
}

function renderChapters() {
  document.querySelector('#chapterList').innerHTML = state.chapters.map(chapter => `
    <button class="chapter-item ${chapter.id === activeChapter.id ? 'active' : ''}" type="button" data-chapter-id="${chapter.id}">
      <strong>${chapter.title}</strong>
      <span>${chapter.status}</span>
    </button>
  `).join('');
}

function renderEditor() {
  chapterTitle.textContent = activeChapter.title;
  editor.value = activeChapter.content;
  updateWordCount();
}

function updateWordCount() {
  wordCount.textContent = editor.value.replace(/\s/g, '').length.toString();
}

function renderAssist(tab = 'ideas') {
  const items = fallbackAssist[tab] || fallbackAssist.ideas;
  assistFeed.innerHTML = items.map(renderAssistCard).join('');
}

function renderAssistCard(item) {
  return `<article class="assist-card ${item.tone || ''}"><h3>${item.title}</h3><p>${item.body}</p></article>`;
}

function renderKnowledge(knowledge) {
  document.querySelector('#globalKnowledge').innerHTML = (knowledge.global || []).map(renderKnowledgeCard).join('');
  document.querySelector('#projectKnowledge').innerHTML = (knowledge.project || []).map(renderKnowledgeCard).join('');
}

function renderKnowledgeCard(entry) {
  return `<article class="knowledge-card"><span class="tag">${entry.source || entry.scope || '知识库'}</span><h3>${entry.title}</h3><p>${entry.body}</p><button type="button" data-knowledge-id="${entry.id || ''}">删除</button></article>`;
}

function renderRelations() {
  document.querySelector('#relationList').innerHTML = state.relations.map(row => `
    <article class="relation-item">
      <span class="tag">${row.relation_type}</span>
      <h3>${row.source_name} ↔ ${row.target_name}</h3>
      <p>${row.description}</p>
    </article>
  `).join('');
}

function renderPublishBoard(tasks = state.publishTasks) {
  document.querySelector('#publishBoard').innerHTML = tasks.map(task => `
    <article class="publish-card">
      <span class="tag status-${task.status}">${formatPublishStatus(task.status)}</span>
      <h3>${task.chapter_title || task.title || '未命名章节'}</h3>
      <p>${task.platform} · ${formatDate(task.scheduled_at)}</p>
      <div class="card-actions">
        <button type="button" data-publish-id="${task.id}" data-publish-action="simulate">模拟推送</button>
        <button type="button" data-publish-id="${task.id}" data-publish-action="retry">重试</button>
      </div>
    </article>
  `).join('');
}

function renderNodeMap(graph = state.graph) {
  const nodes = graph?.nodes || [];
  const positioned = nodes.slice(0, 16).map((node, index) => ({ ...node, x: (nodePositions[index] || [80 + (index % 4) * 150, 70 + Math.floor(index / 4) * 105])[0], y: (nodePositions[index] || [80 + (index % 4) * 150, 70 + Math.floor(index / 4) * 105])[1] }));
  const lookup = new Map(positioned.map(node => [node.id, node]));
  const edges = (graph?.edges || []).filter(edge => lookup.has(edge.source) && lookup.has(edge.target));
  document.querySelector('#nodeMap').innerHTML = `
    <svg class="graph-edges" viewBox="0 0 720 360" preserveAspectRatio="none" aria-hidden="true">
      ${edges.map(edge => {
        const source = lookup.get(edge.source);
        const target = lookup.get(edge.target);
        return `<line x1="${source.x + 46}" y1="${source.y + 46}" x2="${target.x + 46}" y2="${target.y + 46}" />`;
      }).join('')}
    </svg>
    ${positioned.map(node => `<button class="node ${node.type === 'core' ? 'core' : ''} node-${node.group}" style="left:${node.x}px;top:${node.y}px" type="button" data-node-id="${node.id}">${node.label}</button>`).join('')}
  `;
  document.querySelector('#graphStats').innerHTML = renderGraphStats(graph);
  document.querySelector('#graphDetail').textContent = `${graphTypeLabels[graph?.type || activeGraphType] || '图谱'} · ${graph?.stats?.nodeCount || positioned.length} 节点 / ${graph?.stats?.edgeCount || edges.length} 连接`;
}

function renderGraphStats(graph = {}) {
  const stats = graph.stats || { nodeCount: graph.nodes?.length || 0, edgeCount: graph.edges?.length || 0, groups: {} };
  return [
    ['节点', stats.nodeCount],
    ['连接', stats.edgeCount],
    ['知识', stats.groups?.knowledge || 0],
    ['人物', stats.groups?.character || 0],
    ['世界', stats.groups?.world || 0]
  ].map(([label, value]) => `<span>${label}<strong>${value}</strong></span>`).join('');
}

function showNodeDetail(nodeId) {
  const node = (state.graph?.nodes || []).find(item => item.id === nodeId);
  if (!node) return;
  document.querySelector('#graphDetail').innerHTML = `<strong>${node.label}</strong><span>${node.type} · ${node.group}</span><p>${node.detail || '暂无详情'}</p>`;
}

function formatPublishStatus(status) {
  return ({ waiting: '等待推送', checking: '版权校验中', published: '已推送', failed: '推送失败' })[status] || status || '章节存稿';
}

function formatDate(value) {
  if (!value) return '未设定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function openDrawer(name) {
  const drawer = document.querySelector(`#${name}Drawer`);
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}

function closeDrawers() {
  document.querySelectorAll('.drawer').forEach(drawer => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  });
}

function flashAssist(title, body, tone = '') {
  assistFeed.insertAdjacentHTML('afterbegin', renderAssistCard({ title, body, tone }));
}

async function runAi(taskType) {
  if (!apiOnline) {
    flashAssist(taskLabels[taskType] || '本地演示', 'API 未启动，当前为本地演示模式。');
    return;
  }
  try {
    const result = await apiFetch('/ai', {
      method: 'POST',
      body: JSON.stringify({ taskType, chapterId: activeChapter.id, selectedText: editor.value.slice(0, 1200) })
    });
    result.items.reverse().forEach(item => flashAssist(item.title, item.body, item.tone));
  } catch (error) {
    flashAssist('AI 接口错误', error.message, 'danger');
  }
}

async function createProject() {
  const title = document.querySelector('#projectTitleInput').value.trim();
  const genre = document.querySelector('#projectGenreInput').value.trim();
  if (!apiOnline) return flashAssist('项目创建', 'API 未启动，无法写入 SQLite。', 'warning');
  try {
    const result = await apiFetch('/projects', {
      method: 'POST',
      body: JSON.stringify({
        title,
        genre,
        worldView: '新项目世界观待 AI 辅助扩展。',
        targetPlatform: '模拟平台 A',
        writingStyle: '强钩子、快节奏、画面感'
      })
    });
    flashAssist('项目创建完成', `已创建《${result.project.title}》，可作为后续项目切换能力的数据基础。`);
  } catch (error) {
    flashAssist('项目创建失败', error.message, 'danger');
  }
}

async function createChapter() {
  const title = document.querySelector('#chapterTitleInput').value.trim();
  if (!apiOnline) return flashAssist('新建章节', 'API 未启动，无法写入 SQLite。', 'warning');
  try {
    const result = await apiFetch('/chapters', { method: 'POST', body: JSON.stringify({ title, content: '新章节正文待补充。' }) });
    state.chapters = [...state.chapters, result.chapter];
    activeChapter = result.chapter;
    renderChapters();
    renderEditor();
    flashAssist('新建章节完成', `已创建《${result.chapter.title}》。`);
    refreshDashboard();
  } catch (error) {
    flashAssist('新建章节失败', error.message, 'danger');
  }
}

async function importKnowledge() {
  const title = document.querySelector('#knowledgeTitleInput').value.trim();
  const body = document.querySelector('#knowledgeBodyInput').value.trim();
  if (!apiOnline) return flashAssist('知识导入', 'API 未启动，无法写入知识库。', 'warning');
  try {
    const result = await apiFetch('/knowledge', {
      method: 'POST',
      body: JSON.stringify({ scope: 'project', title, body, source: '手动导入', tags: ['手动', '项目'] })
    });
    state.knowledge.project = [...state.knowledge.project, result.entry];
    renderKnowledge(state.knowledge);
    flashAssist('知识导入完成', `《${result.entry.title}》已写入单项目知识库，并进入搜索召回范围。`);
  } catch (error) {
    flashAssist('知识导入失败', error.message, 'danger');
  }
}

async function loadVersions() {
  const list = document.querySelector('#versionList');
  if (!apiOnline) {
    list.innerHTML = '<article class="version-card"><h3>本地演示</h3><p>API 未启动，暂无 SQLite 版本历史。</p></article>';
    return;
  }
  try {
    const result = await apiFetch(`/chapters/${activeChapter.id}/versions`);
    list.innerHTML = result.versions.map(version => `
      <article class="version-card">
        <h3>版本 ${version.version}</h3>
        <p>${version.content.slice(0, 90)}${version.content.length > 90 ? '...' : ''}</p>
        <button type="button" data-version="${version.version}">回滚到此版本</button>
      </article>
    `).join('');
  } catch (error) {
    flashAssist('版本加载失败', error.message, 'danger');
  }
}

async function rollbackVersion(version) {
  try {
    const result = await apiFetch(`/chapters/${activeChapter.id}/rollback`, { method: 'POST', body: JSON.stringify({ version }) });
    activeChapter = result.chapter;
    state.chapters = state.chapters.map(chapter => chapter.id === activeChapter.id ? activeChapter : chapter);
    renderChapters();
    renderEditor();
    await loadVersions();
    flashAssist('章节已回滚', `已生成新版本 ${activeChapter.version}，原目标版本 ${version} 保留在历史中。`);
  } catch (error) {
    flashAssist('版本回滚失败', error.message, 'danger');
  }
}

async function handlePublishAction(taskId, action) {
  if (!apiOnline) return flashAssist('发布模拟', 'API 未启动，当前无法更新发布任务。', 'warning');
  try {
    await apiFetch(`/publish/${taskId}/${action}`, { method: 'POST' });
    const result = await apiFetch('/publish');
    renderPublishBoard(result.tasks);
    flashAssist(action === 'retry' ? '发布任务已重试' : '发布模拟完成', `任务 ${taskId} 状态已更新。`);
  } catch (error) {
    flashAssist('发布操作失败', error.message, 'danger');
  }
}

async function savePlatform() {
  const platform = document.querySelector('#platformNameInput').value.trim();
  if (!apiOnline) return flashAssist('平台配置', 'API 未启动，无法保存平台配置。', 'warning');
  try {
    const result = await apiFetch('/platforms', {
      method: 'POST',
      body: JSON.stringify({
        platform,
        accountName: '本地作者号',
        rules: '每日 21:30 推送，章节末尾保留互动问题，移动端优先短句。'
      })
    });
    flashAssist('平台配置已保存', `${result.platform.platform} · ${result.platform.account_name}`);
    refreshDashboard();
  } catch (error) {
    flashAssist('平台配置失败', error.message, 'danger');
  }
}

async function schedulePublish() {
  const platform = document.querySelector('#platformNameInput').value.trim();
  if (!apiOnline) return flashAssist('定时发布', 'API 未启动，无法创建发布任务。', 'warning');
  try {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await apiFetch('/publish', { method: 'POST', body: JSON.stringify({ chapterId: activeChapter.id, platform, scheduledAt }) });
    const result = await apiFetch('/publish');
    state.publishTasks = result.tasks;
    renderPublishBoard(result.tasks);
    flashAssist('定时发布已创建', `${activeChapter.title} 将推送到 ${platform}。`);
    refreshDashboard();
  } catch (error) {
    flashAssist('定时发布失败', error.message, 'danger');
  }
}

async function refreshDashboard() {
  const container = document.querySelector('#dashboardStats');
  if (!container) return;
  if (!apiOnline) {
    container.innerHTML = renderStatCards({ chapterCount: state.chapters.length, knowledgeCount: 6, aiTaskCount: 0, publishWaiting: state.publishTasks.length, relationCount: state.relations.length });
    renderProgress([], { goal: { daily_words: 3000, note: '本地演示目标' }, todayWords: 0 });
    return;
  }
  try {
    const result = await apiFetch('/dashboard');
    container.innerHTML = renderStatCards(result.stats);
    renderProgress(result.progress, result.stats);
  } catch {
    container.innerHTML = '<div class="stat-card"><strong>--</strong><span>统计加载失败</span></div>';
  }
}

function renderProgress(progress = [], stats = {}) {
  const list = document.querySelector('#progressList');
  if (!list) return;
  const goal = stats.goal?.daily_words || 0;
  const today = stats.todayWords || 0;
  const percent = goal ? Math.min(100, Math.round((today / goal) * 100)) : 0;
  list.innerHTML = `
    <article class="progress-card">
      <h3>今日进度 ${today}/${goal} 字</h3>
      <div class="progress-bar"><span style="width:${percent}%"></span></div>
      <p>${stats.goal?.note || '暂无目标说明'}</p>
    </article>
    ${progress.map(item => `<article class="progress-card"><h3>${item.progress_date} · ${item.words} 字</h3><p>${item.note || '无备注'}</p></article>`).join('')}
  `;
}

function renderStatCards(stats) {
  return [
    ['章节', stats.chapterCount],
    ['知识', stats.knowledgeCount],
    ['AI任务', stats.aiTaskCount],
    ['待推送', stats.publishWaiting],
    ['关系', stats.relationCount]
  ].map(([label, value]) => `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`).join('');
}

async function loadHistory() {
  const list = document.querySelector('#activityLog');
  if (!apiOnline) {
    list.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>API 未启动，暂无 AI 历史。</p></article>';
    return;
  }
  try {
    const result = await apiFetch('/ai/history?limit=12');
    list.innerHTML = result.tasks.map(task => `
      <article class="log-card">
        <h3>${taskLabels[task.task_type] || task.task_type} · ${task.provider}</h3>
        <p>${(task.output?.[0]?.body || '').slice(0, 110)}</p>
        <button type="button" data-ai-task-id="${task.id}">有用</button>
      </article>
    `).join('');
  } catch (error) {
    flashAssist('AI 历史加载失败', error.message, 'danger');
  }
}

async function loadAudit() {
  const list = document.querySelector('#activityLog');
  if (!apiOnline) {
    list.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>API 未启动，暂无审计日志。</p></article>';
    return;
  }
  try {
    const result = await apiFetch('/audit?limit=12');
    list.innerHTML = result.logs.map(log => `
      <article class="log-card">
        <h3>${log.action}</h3>
        <p>${new Date(log.created_at).toLocaleString('zh-CN', { hour12: false })} · ${JSON.stringify(log.payload)}</p>
      </article>
    `).join('');
  } catch (error) {
    flashAssist('审计日志加载失败', error.message, 'danger');
  }
}

async function saveGoal() {
  if (!apiOnline) return flashAssist('写作目标', 'API 未启动，无法保存目标。', 'warning');
  try {
    await apiFetch('/goals', { method: 'POST', body: JSON.stringify({ dailyWords: Number(document.querySelector('#dailyGoalInput').value || 0), deadline: '2026-08-31', note: '保持稳定日更节奏。' }) });
    flashAssist('写作目标已保存', '每日目标已更新。');
    refreshDashboard();
  } catch (error) {
    flashAssist('写作目标失败', error.message, 'danger');
  }
}

async function addProgress() {
  if (!apiOnline) return flashAssist('写作进度', 'API 未启动，无法记录进度。', 'warning');
  try {
    await apiFetch('/progress', { method: 'POST', body: JSON.stringify({ words: Number(document.querySelector('#progressWordsInput').value || 0), note: '手动记录写作进度。' }) });
    flashAssist('写作进度已记录', '今日字数已更新到仪表盘。');
    refreshDashboard();
  } catch (error) {
    flashAssist('写作进度失败', error.message, 'danger');
  }
}

async function archiveActiveChapter() {
  if (!apiOnline) return flashAssist('章节归档', 'API 未启动，无法归档章节。', 'warning');
  try {
    const result = await apiFetch(`/chapters/${activeChapter.id}/archive`, { method: 'POST' });
    activeChapter = result.chapter;
    state.chapters = state.chapters.map(chapter => chapter.id === activeChapter.id ? activeChapter : chapter);
    renderChapters();
    flashAssist('章节已归档', activeChapter.title);
  } catch (error) {
    flashAssist('章节归档失败', error.message, 'danger');
  }
}

async function deleteKnowledgeEntry(id) {
  if (!id || !apiOnline) return flashAssist('知识删除', 'API 未启动或知识条目不可删除。', 'warning');
  try {
    const result = await apiFetch(`/knowledge/${id}/delete`, { method: 'POST' });
    state.knowledge.global = state.knowledge.global.filter(item => item.id !== result.entry.id);
    state.knowledge.project = state.knowledge.project.filter(item => item.id !== result.entry.id);
    renderKnowledge(state.knowledge);
    flashAssist('知识已删除', result.entry.title);
    refreshDashboard();
  } catch (error) {
    flashAssist('知识删除失败', error.message, 'danger');
  }
}

async function sendAiFeedback(taskId) {
  if (!apiOnline) return flashAssist('AI 反馈', 'API 未启动，无法提交反馈。', 'warning');
  try {
    await apiFetch(`/ai/tasks/${taskId}/feedback`, { method: 'POST', body: JSON.stringify({ rating: 5, note: '前端标记有用' }) });
    flashAssist('AI 反馈已提交', `任务 ${taskId} 已标记为有用。`);
  } catch (error) {
    flashAssist('AI 反馈失败', error.message, 'danger');
  }
}

async function addAnnotation() {
  if (!apiOnline) return flashAssist('章节批注', 'API 未启动，无法保存批注。', 'warning');
  try {
    const result = await apiFetch(`/chapters/${activeChapter.id}/annotations`, {
      method: 'POST',
      body: JSON.stringify({
        quote: document.querySelector('#annotationQuoteInput').value.trim(),
        note: document.querySelector('#annotationNoteInput').value.trim(),
        severity: 'info'
      })
    });
    flashAssist('章节批注已保存', result.annotation.note);
    loadAnnotations();
  } catch (error) {
    flashAssist('章节批注失败', error.message, 'danger');
  }
}

async function loadAnnotations() {
  const log = document.querySelector('#editorialLog');
  if (!apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无批注。</p></article>';
  try {
    const result = await apiFetch(`/chapters/${activeChapter.id}/annotations`);
    log.innerHTML = result.annotations.map(item => `<article class="log-card"><h3>${item.severity} · ${item.quote}</h3><p>${item.note}</p></article>`).join('');
  } catch (error) {
    flashAssist('批注加载失败', error.message, 'danger');
  }
}

async function addTodo() {
  if (!apiOnline) return flashAssist('创作待办', 'API 未启动，无法保存待办。', 'warning');
  try {
    const result = await apiFetch('/todos', { method: 'POST', body: JSON.stringify({ title: document.querySelector('#todoTitleInput').value.trim(), dueAt: '2026-07-20' }) });
    flashAssist('创作待办已新增', result.todo.title);
    loadTodos();
  } catch (error) {
    flashAssist('创作待办失败', error.message, 'danger');
  }
}

async function loadTodos() {
  const log = document.querySelector('#editorialLog');
  if (!apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无待办。</p></article>';
  try {
    const result = await apiFetch('/todos');
    log.innerHTML = result.todos.map(todo => `<article class="log-card"><h3>${todo.status} · ${todo.title}</h3><p>${todo.due_at || '无截止日期'}</p><button type="button" data-todo-id="${todo.id}">切换状态</button></article>`).join('');
  } catch (error) {
    flashAssist('待办加载失败', error.message, 'danger');
  }
}

async function toggleTodoStatus(id) {
  try {
    await apiFetch(`/todos/${id}/toggle`, { method: 'POST' });
    flashAssist('待办状态已更新', `任务 ${id} 状态已切换。`);
    loadTodos();
  } catch (error) {
    flashAssist('待办状态失败', error.message, 'danger');
  }
}

async function addGlossary() {
  if (!apiOnline) return flashAssist('术语表', 'API 未启动，无法保存术语。', 'warning');
  try {
    const term = document.querySelector('#glossaryTermInput').value.trim();
    const result = await apiFetch('/glossary', { method: 'POST', body: JSON.stringify({ term, definition: '由作者手动记录的项目设定词条。', category: '设定' }) });
    flashAssist('术语已新增', result.term.term);
    loadGlossary();
  } catch (error) {
    flashAssist('术语新增失败', error.message, 'danger');
  }
}

async function loadGlossary() {
  const log = document.querySelector('#riskLog');
  if (!apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无术语。</p></article>';
  try {
    const result = await apiFetch('/glossary');
    log.innerHTML = result.terms.map(term => `<article class="log-card"><h3>${term.category} · ${term.term}</h3><p>${term.definition}</p></article>`).join('');
  } catch (error) {
    flashAssist('术语加载失败', error.message, 'danger');
  }
}

async function sensitiveCheck() {
  const log = document.querySelector('#riskLog');
  if (!apiOnline) return flashAssist('敏感词检查', 'API 未启动，无法检查。', 'warning');
  try {
    const result = await apiFetch('/sensitive/check', { method: 'POST', body: JSON.stringify({ text: document.querySelector('#sensitiveTextInput').value }) });
    log.innerHTML = result.matches.length
      ? result.matches.map(match => `<article class="log-card danger"><h3>${match.severity} · ${match.term}</h3><p>${match.suggestion}</p></article>`).join('')
      : '<article class="log-card"><h3>检查通过</h3><p>未命中敏感词规则。</p></article>';
    flashAssist('敏感词检查完成', `命中 ${result.matches.length} 条规则。`);
  } catch (error) {
    flashAssist('敏感词检查失败', error.message, 'danger');
  }
}

async function addCharacter() {
  if (!apiOnline) return flashAssist('角色档案', 'API 未启动，无法保存角色。', 'warning');
  try {
    const result = await apiFetch('/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: document.querySelector('#characterNameInput').value.trim(),
        role: document.querySelector('#characterRoleInput').value.trim(),
        motivation: '追查黑潮真实来源。',
        arc: '从旁观研究者转为关键见证者。'
      })
    });
    flashAssist('角色已新增', result.character.name);
    loadCharacters();
  } catch (error) {
    flashAssist('角色新增失败', error.message, 'danger');
  }
}

async function loadCharacters() {
  const log = document.querySelector('#storyBibleLog');
  if (!apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无角色。</p></article>';
  try {
    const result = await apiFetch('/characters');
    log.innerHTML = result.characters.map(item => `<article class="log-card"><h3>${item.name} · ${item.role}</h3><p>${item.motivation} / ${item.arc}</p></article>`).join('');
  } catch (error) {
    flashAssist('角色加载失败', error.message, 'danger');
  }
}

async function addTimeline() {
  if (!apiOnline) return flashAssist('时间线', 'API 未启动，无法保存时间线。', 'warning');
  try {
    const result = await apiFetch('/timeline', {
      method: 'POST',
      body: JSON.stringify({ eventTime: document.querySelector('#timelineTimeInput').value.trim(), title: document.querySelector('#timelineTitleInput').value.trim(), description: '由作者手动记录的关键事件。' })
    });
    flashAssist('时间线已新增', result.event.title);
    loadTimeline();
  } catch (error) {
    flashAssist('时间线新增失败', error.message, 'danger');
  }
}

async function loadTimeline() {
  const log = document.querySelector('#storyBibleLog');
  if (!apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无时间线。</p></article>';
  try {
    const result = await apiFetch('/timeline');
    log.innerHTML = result.events.map(item => `<article class="log-card"><h3>${item.event_time} · ${item.title}</h3><p>${item.description}</p></article>`).join('');
  } catch (error) {
    flashAssist('时间线加载失败', error.message, 'danger');
  }
}

async function addScene() {
  if (!apiOnline) return flashAssist('场景库', 'API 未启动，无法保存场景。', 'warning');
  try {
    const result = await apiFetch('/scenes', { method: 'POST', body: JSON.stringify({ name: document.querySelector('#sceneNameInput').value.trim(), mood: document.querySelector('#sceneMoodInput').value.trim(), description: '场景细节待后续扩写。' }) });
    flashAssist('场景已新增', result.scene.name);
    loadScenes();
  } catch (error) {
    flashAssist('场景新增失败', error.message, 'danger');
  }
}

async function loadScenes() {
  const log = document.querySelector('#worldBuilderLog');
  if (!apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无场景。</p></article>';
  try {
    const result = await apiFetch('/scenes');
    log.innerHTML = result.scenes.map(item => `<article class="log-card"><h3>${item.name} · ${item.mood}</h3><p>${item.description}</p></article>`).join('');
  } catch (error) {
    flashAssist('场景加载失败', error.message, 'danger');
  }
}

async function addWorld() {
  if (!apiOnline) return flashAssist('世界观设定', 'API 未启动，无法保存设定。', 'warning');
  try {
    const result = await apiFetch('/world', { method: 'POST', body: JSON.stringify({ category: document.querySelector('#worldCategoryInput').value.trim(), title: document.querySelector('#worldTitleInput').value.trim(), content: '该设定用于约束后续剧情与角色行为。' }) });
    flashAssist('世界观设定已新增', result.setting.title);
    loadWorld();
  } catch (error) {
    flashAssist('世界观设定失败', error.message, 'danger');
  }
}

async function loadWorld() {
  const log = document.querySelector('#worldBuilderLog');
  if (!apiOnline) return log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>暂无设定。</p></article>';
  try {
    const result = await apiFetch('/world');
    log.innerHTML = result.settings.map(item => `<article class="log-card"><h3>${item.category} · ${item.title}</h3><p>${item.content}</p></article>`).join('');
  } catch (error) {
    flashAssist('世界观加载失败', error.message, 'danger');
  }
}

async function saveAiSettings() {
  if (!apiOnline) return flashAssist('AI 配置', 'API 未启动，无法保存 AI 配置。', 'warning');
  try {
    const result = await apiFetch('/settings/ai', {
      method: 'POST',
      body: JSON.stringify({
        baseUrl: document.querySelector('#aiBaseUrlInput').value.trim(),
        model: document.querySelector('#aiModelInput').value.trim() || 'mock-novel-copilot'
      })
    });
    flashAssist('AI 配置已保存', `当前模型：${result.settings.ai_model}`);
  } catch (error) {
    flashAssist('AI 配置失败', error.message, 'danger');
  }
}

async function savePrompt() {
  if (!apiOnline) return flashAssist('Prompt 模板', 'API 未启动，无法保存 Prompt。', 'warning');
  try {
    const result = await apiFetch('/prompts', {
      method: 'POST',
      body: JSON.stringify({
        taskType: document.querySelector('#promptTaskInput').value.trim() || 'sync',
        title: document.querySelector('#promptTitleInput').value.trim() || '自定义 Prompt',
        template: document.querySelector('#promptTemplateInput').value.trim()
      })
    });
    flashAssist('Prompt 已保存', `${result.prompt.title} 将注入对应 AI 任务上下文。`);
  } catch (error) {
    flashAssist('Prompt 保存失败', error.message, 'danger');
  }
}

async function loadPrompts() {
  const log = document.querySelector('#configLog');
  if (!apiOnline) {
    log.innerHTML = '<article class="log-card"><h3>本地演示</h3><p>API 未启动，暂无 Prompt 模板。</p></article>';
    return;
  }
  try {
    const result = await apiFetch('/prompts');
    log.innerHTML = result.prompts.map(prompt => `
      <article class="log-card">
        <h3>${prompt.task_type} · ${prompt.title}</h3>
        <p>${prompt.template}</p>
      </article>
    `).join('');
  } catch (error) {
    flashAssist('Prompt 加载失败', error.message, 'danger');
  }
}

async function bulkKnowledge() {
  if (!apiOnline) return flashAssist('批量知识导入', 'API 未启动，无法写入知识库。', 'warning');
  try {
    const result = await apiFetch('/knowledge/bulk', {
      method: 'POST',
      body: JSON.stringify({ scope: 'project', text: document.querySelector('#bulkKnowledgeInput').value })
    });
    state.knowledge.project = [...state.knowledge.project, ...result.entries];
    renderKnowledge(state.knowledge);
    flashAssist('批量知识导入完成', `已导入 ${result.entries.length} 条项目知识。`);
    refreshDashboard();
  } catch (error) {
    flashAssist('批量知识导入失败', error.message, 'danger');
  }
}

async function exportProjectFile() {
  if (!apiOnline) return flashAssist('项目导出', 'API 未启动，无法导出项目。', 'warning');
  try {
    const data = await apiFetch('/export/project');
    downloadFile(`novel-project-${Date.now()}.json`, JSON.stringify(data, null, 2), 'application/json');
    flashAssist('项目导出完成', `已导出《${data.project.title}》项目快照。`);
  } catch (error) {
    flashAssist('项目导出失败', error.message, 'danger');
  }
}

async function exportChapterFile() {
  if (!apiOnline) return flashAssist('章节导出', 'API 未启动，无法导出章节。', 'warning');
  try {
    const data = await apiFetch(`/export/chapters/${activeChapter.id}`);
    downloadFile(`${data.title}.txt`, `${data.title}\n\n${data.content}`, 'text/plain;charset=utf-8');
    flashAssist('章节导出完成', `已导出 ${data.title}。`);
  } catch (error) {
    flashAssist('章节导出失败', error.message, 'danger');
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function saveDraft() {
  activeChapter.content = editor.value;
  if (!apiOnline) {
    flashAssist('章节已存稿', 'API 未启动，已保存在当前浏览器演示状态。');
    renderChapters();
    return;
  }
  try {
    const result = await apiFetch(`/chapters/${activeChapter.id}/save`, { method: 'POST', body: JSON.stringify({ content: editor.value }) });
    activeChapter = result.chapter;
    state.chapters = state.chapters.map(chapter => chapter.id === activeChapter.id ? activeChapter : chapter);
    flashAssist('章节已存稿', `已写入 SQLite，并生成版本 ${activeChapter.version}。`);
    renderChapters();
  } catch (error) {
    flashAssist('存稿失败', error.message, 'danger');
  }
}

async function searchKnowledge() {
  const query = document.querySelector('#knowledgeSearch').value.trim();
  if (!apiOnline) {
    flashAssist('历史与文献搜索', 'API 未启动，已模拟召回：黑潮设定、星火徽章、角色弧光、平台规则。');
    return;
  }
  try {
    const result = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
    renderKnowledge({ global: result.knowledge.filter(item => item.scope === 'global'), project: result.knowledge.filter(item => item.scope === 'project') });
    flashAssist('历史与文献搜索', `召回知识 ${result.knowledge.length} 条、历史章节 ${result.chapters.length} 条、网络文献 ${result.network.length} 条。`);
  } catch (error) {
    flashAssist('搜索失败', error.message, 'danger');
  }
}

async function refreshPublish() {
  if (!apiOnline) return renderPublishBoard();
  try {
    const result = await apiFetch('/publish');
    renderPublishBoard(result.tasks);
  } catch (error) {
    flashAssist('发布计划刷新失败', error.message, 'danger');
  }
}

async function refreshGraph() {
  if (!apiOnline) {
    renderNodeMap(fallbackState.graph);
    flashAssist('节点图已刷新', '当前为本地演示图谱。');
    return;
  }
  try {
    const graph = await apiFetch(`/graph?type=${encodeURIComponent(activeGraphType)}`);
    state.graph = graph;
    renderNodeMap(graph);
    flashAssist('节点图已刷新', `已加载 ${graph.nodes.length} 个节点、${graph.edges.length} 条连接。`);
  } catch (error) {
    flashAssist('节点图刷新失败', error.message, 'danger');
  }
}

document.addEventListener('click', event => {
  const graphTypeButton = event.target.closest('[data-graph-type]');
  if (graphTypeButton) {
    activeGraphType = graphTypeButton.dataset.graphType;
    document.querySelectorAll('[data-graph-type]').forEach(button => button.classList.toggle('active', button === graphTypeButton));
    return refreshGraph();
  }

  const graphNodeButton = event.target.closest('[data-node-id]');
  if (graphNodeButton) return showNodeDetail(graphNodeButton.dataset.nodeId);

  const chapterButton = event.target.closest('[data-chapter-id]');
  if (chapterButton) {
    activeChapter = state.chapters.find(chapter => chapter.id === Number(chapterButton.dataset.chapterId));
    renderChapters();
    renderEditor();
    return;
  }

  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    document.querySelectorAll('[data-tab]').forEach(button => button.classList.remove('active'));
    tabButton.classList.add('active');
    renderAssist(tabButton.dataset.tab);
    return;
  }

  const openButton = event.target.closest('[data-open-panel]');
  if (openButton) {
    openDrawer(openButton.dataset.openPanel);
    if (openButton.dataset.openPanel === 'publish') refreshPublish();
    return;
  }

  if (event.target.closest('[data-close-panel]')) {
    closeDrawers();
    return;
  }

  const publishButton = event.target.closest('[data-publish-id]');
  if (publishButton) return handlePublishAction(publishButton.dataset.publishId, publishButton.dataset.publishAction);

  const versionButton = event.target.closest('[data-version]');
  if (versionButton) return rollbackVersion(Number(versionButton.dataset.version));

  const knowledgeButton = event.target.closest('[data-knowledge-id]');
  if (knowledgeButton) return deleteKnowledgeEntry(Number(knowledgeButton.dataset.knowledgeId));

  const feedbackButton = event.target.closest('[data-ai-task-id]');
  if (feedbackButton) return sendAiFeedback(Number(feedbackButton.dataset.aiTaskId));

  const todoButton = event.target.closest('[data-todo-id]');
  if (todoButton) return toggleTodoStatus(Number(todoButton.dataset.todoId));

  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;

  const action = actionButton.dataset.action;
  const taskMap = {
    'run-sync-ai': 'sync',
    outline: 'outline',
    polish: 'polish',
    screenplay: 'screenplay',
    framework: 'framework',
    'plot-extract': 'plot-extract',
    mindmap: 'mindmap',
    'relationship-ai': 'relationship',
    'conflict-check': 'conflict',
    'copyright-check': 'copyright',
    'continue-writing': 'continue',
    'hook-boost': 'hook-boost',
    foreshadow: 'foreshadow',
    'platform-rewrite': 'platform-rewrite',
    'title-ai': 'title',
    'synopsis-ai': 'synopsis',
    'tags-ai': 'tags',
    'dialogue-check': 'dialogue',
    'annotation-ai': 'annotation',
    'summary-ai': 'summary',
    'term-extract': 'term-extract',
    'sensitive-rewrite': 'sensitive-rewrite',
    'character-bio': 'character-bio',
    'timeline-ai': 'timeline',
    'scene-ai': 'scene',
    'world-ai': 'world'
  };

  if (taskMap[action]) return runAi(taskMap[action]);
  if (action === 'save-draft') return saveDraft();
  if (action === 'search-knowledge') return searchKnowledge();
  if (action === 'refresh-graph') return refreshGraph();
  if (action === 'create-project') return createProject();
  if (action === 'create-chapter') return createChapter();
  if (action === 'import-knowledge') return importKnowledge();
  if (action === 'load-versions') return loadVersions();
  if (action === 'save-platform') return savePlatform();
  if (action === 'schedule-publish') return schedulePublish();
  if (action === 'refresh-dashboard') return refreshDashboard();
  if (action === 'load-history') return loadHistory();
  if (action === 'load-audit') return loadAudit();
  if (action === 'save-ai-settings') return saveAiSettings();
  if (action === 'save-prompt') return savePrompt();
  if (action === 'load-prompts') return loadPrompts();
  if (action === 'bulk-knowledge') return bulkKnowledge();
  if (action === 'export-project') return exportProjectFile();
  if (action === 'export-chapter') return exportChapterFile();
  if (action === 'save-goal') return saveGoal();
  if (action === 'add-progress') return addProgress();
  if (action === 'archive-chapter') return archiveActiveChapter();
  if (action === 'add-annotation') return addAnnotation();
  if (action === 'load-annotations') return loadAnnotations();
  if (action === 'add-todo') return addTodo();
  if (action === 'load-todos') return loadTodos();
  if (action === 'add-glossary') return addGlossary();
  if (action === 'load-glossary') return loadGlossary();
  if (action === 'sensitive-check') return sensitiveCheck();
  if (action === 'add-character') return addCharacter();
  if (action === 'load-characters') return loadCharacters();
  if (action === 'add-timeline') return addTimeline();
  if (action === 'load-timeline') return loadTimeline();
  if (action === 'add-scene') return addScene();
  if (action === 'load-scenes') return loadScenes();
  if (action === 'add-world') return addWorld();
  if (action === 'load-world') return loadWorld();
  if (action === 'new-project') return flashAssist('新建项目入口', '全栈实现时将进入项目创建向导：题材、平台、风格、AI 模型与知识库范围。');
  if (action === 'open-log') return openLogDrawer();
  if (action === 'compress-logs') return compressLogs();
  if (action === 'clear-logs') return clearLogs();
  if (action === 'refresh-logs') return renderLogPanel();
});

document.getElementById('logLevelFilter')?.addEventListener('change', () => {
  renderLogPanel();
});

editor.addEventListener('input', updateWordCount);
loadBootstrap();
