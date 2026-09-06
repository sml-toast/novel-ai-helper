// F074 后 API 默认只监听 127.0.0.1（IPv4 回环）。
// 若继续用 location.hostname 拼接，页面从 localhost 打开时该名称可能被解析为 IPv6 ::1，
// 而 API 并未监听 ::1，会直接连不上。因此固定回连 127.0.0.1。
// 确需指向其他地址时，在页面注入 window.NOVEL_API_HOST 覆盖。
const apiHost = window.NOVEL_API_HOST || '127.0.0.1';
const apiBase = `${location.protocol}//${apiHost}:${window.NOVEL_API_PORT || 8787}/api/novel`;

// ── HTML sanitization ──
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

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
          <span style="font-weight: bold; color: ${color};">${escapeHtml(entry.level)}</span>
          <small style="color: var(--text-secondary);">${new Date(entry.timestamp).toLocaleString()}</small>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 2px;">[${escapeHtml(entry.category)}]</div>
        <div style="font-size: 13px;">${escapeHtml(entry.message)}</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">章节: ${escapeHtml(entry.activeChapter)}</div>
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
// F079：当前项目上下文。null = 尚未从服务端获知（首次载入/离线兜底），apiFetch 不注入
let currentProjectId = null;

async function apiFetch(path, options = {}) {
  // F079：所有请求携带当前项目上下文（?projectId=）。离线兜底时不注入，
  // 让服务端按默认项目回落。注意注入要放在 fetch 之前拼好 URL。
  const scopedPath = currentProjectId == null
    ? path
    : `${path}${path.includes('?') ? '&' : '?'}projectId=${currentProjectId}`;
  const response = await fetch(`${apiBase}${scopedPath}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) {
    // F076：带上状态码，自动保存需要区分「可重试的网络错误」与「章节不存在（404）」，
    // 否则 404 会被无限重试，页面角落一直闪「保存失败」。
    const error = new Error(`API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function loadBootstrap() {
  try {
    state = await apiFetch('/bootstrap');
    apiOnline = true;
    // F079：以服务端返回为准（首次载入定位默认项目；切换时此处已是目标项目）
    currentProjectId = state.project.id;
    activeChapter = state.chapters[state.chapters.length - 1] || fallbackState.chapters[0];
  } catch (error) {
    apiOnline = false;
    state = fallbackState;
    activeChapter = fallbackState.chapters[2];
  }
  renderAll();
  // F075：密钥状态提示（含主密钥备份引导）
  renderAiKeyStatus();
}

function renderAll() {
  renderApiStatus();
  renderProject();
  renderProjectSwitcher();
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
    <button class="chapter-item ${chapter.id === activeChapter.id ? 'active' : ''}" type="button" data-chapter-id="${escapeHtml(String(chapter.id))}">
      <strong>${escapeHtml(chapter.title)}</strong>
      <span>${escapeHtml(chapter.status || '')}</span>
    </button>
  `).join('');
}

function renderEditor() {
  chapterTitle.textContent = activeChapter.title;
  editor.value = activeChapter.content;
  // F076：刚载入的内容就是「已同步基线」，dirty 判定从这里开始
  lastSavedContent = activeChapter.content;
  saveAborted = false;
  updateWordCount();
  setSaveState('saved');
}

function updateWordCount() {
  wordCount.textContent = editor.value.replace(/\s/g, '').length.toString();
}

/* ==========================================================================
 * F076 防丢稿：dirty 状态机 + 3s 防抖草稿自动保存
 *
 * 为什么自动保存不生成版本（与 F086 的强耦合规则）：
 *   实测 120 分钟写作 × 3s 防抖 = 单章 360 个版本 / 3.18MB，折算 100 章 318MB，
 *   且版本列表接口单次要返回 108 万字。草稿态只 UPDATE chapters.content、
 *   不 INSERT chapter_versions，压缩比约 45 倍。
 *   只有「手动存稿（/save）」「里程碑快照」「回滚」才写版本表。
 * ========================================================================== */

const AUTOSAVE_DELAY = 3000;
const MAX_RETRY = 3;              // 连续失败 3 次后降级到 localStorage
const CLEAR_API_KEY = '__CLEAR__';

const SAVE_LABELS = {
  saved: '已保存',
  unsaved: '未保存',
  saving: '保存中…',
  failed: '保存失败',
  local: '已存本地'
};

const saveIndicator = document.querySelector('#saveIndicator');
const autoSaveHint = document.querySelector('#autoSaveHint');

/** @type {'saved'|'unsaved'|'saving'|'failed'|'local'} */
let saveState = 'saved';
let lastSavedContent = '';
let saveTimer = null;
let retryCount = 0;
let autoSaving = false;   // 防并发：请求飞行期间不再发第二个 draft 请求
let saveAborted = false;  // 章节不存在（404）时置位，停止无意义的重试

/** 本地降级草稿的 storage key */
function draftKey(chapterId) {
  return `novel-draft:${chapterId}`;
}

/** 编辑器内容是否已偏离最后一次成功落库的内容 */
function isDirty() {
  if (!activeChapter) return false;
  return editor.value !== lastSavedContent;
}

/**
 * 切换保存状态并刷新指示器。
 * @param {'saved'|'unsaved'|'saving'|'failed'|'local'} next 目标状态
 * @param {string} message 附加说明（如重试倒计时）
 */
function setSaveState(next, message = '') {
  saveState = next;
  if (saveIndicator) {
    saveIndicator.textContent = SAVE_LABELS[next] + (message ? ` · ${message}` : '');
    saveIndicator.dataset.state = next;
  }
  if (autoSaveHint) {
    autoSaveHint.textContent = `保存状态：${SAVE_LABELS[next]}${message ? ` · ${message}` : ''}`;
  }
}

function updateAutoSaveHint(text) {
  if (autoSaveHint) autoSaveHint.textContent = text;
}

/** 排一次自动保存（防抖：连续输入只保留最后一次定时） */
function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autoSave, AUTOSAVE_DELAY);
}

function cancelAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
}

/** 立即执行一次自动保存（切章、合并、手动触发时用） */
async function autoSaveNow() {
  cancelAutoSave();
  await autoSave();
}

/**
 * 自动保存：走 /draft，**只更新正文，不生成版本**。
 *
 * 关键细节：请求发出前先取 editor.value 快照。请求飞行期间用户很可能又输入了内容，
 * 若直接用 editor.value 回写 lastSavedContent，这部分新输入会被误判为「已保存」，
 * 之后的覆盖/离开就不再拦截 —— 正是丢稿的经典成因。
 */
async function autoSave() {
  if (!apiOnline || !activeChapter || saveAborted) return;
  if (!isDirty()) {
    setSaveState('saved');
    return;
  }
  // 已有请求在飞：不要并发写，排到下一轮即可，本轮输入不会丢
  if (autoSaving) {
    scheduleAutoSave();
    return;
  }

  autoSaving = true;
  setSaveState('saving');
  const snapshot = editor.value;
  const chapterId = activeChapter.id;

  try {
    const result = await apiFetch(`/chapters/${chapterId}/draft`, {
      method: 'POST',
      body: JSON.stringify({ content: snapshot })
    });
    activeChapter = result.chapter;
    state.chapters = state.chapters.map(chapter => (chapter.id === activeChapter.id ? activeChapter : chapter));
    retryCount = 0;

    if (editor.value === snapshot) {
      // 期间没有新输入 → 完全同步
      lastSavedContent = snapshot;
      setSaveState('saved');
      localStorage.removeItem(draftKey(chapterId));
      updateAutoSaveHint(`已保存草稿 · ${new Date().toLocaleTimeString('zh-CN')}（草稿不生成版本）`);
    } else {
      // 快照已入库，剩余差异留给下一轮
      lastSavedContent = snapshot;
      setSaveState('unsaved');
      scheduleAutoSave();
    }
  } catch (error) {
    // 章节不存在：继续重试毫无意义，明确停止并提示
    if (error.status === 404) {
      saveAborted = true;
      cancelAutoSave();
      setSaveState('failed', '章节不存在，已停止重试');
      flashAssist('自动保存停止', `章节 #${chapterId} 不存在（404），已停止重试，请刷新页面。`);
      return;
    }

    retryCount += 1;
    if (retryCount <= MAX_RETRY) {
      const delay = 3 ** retryCount; // 3s / 9s / 27s 指数退避
      setSaveState('failed', `${delay}s 后重试`);
      cancelAutoSave();
      saveTimer = setTimeout(autoSave, delay * 1000);
    } else {
      // 连续失败：降级到 localStorage，绝不阻塞输入
      writeLocalDraft();
      setSaveState('local', '已存浏览器本地，恢复后可合并');
    }
  } finally {
    autoSaving = false;
  }
}

/** 把当前编辑器内容写入 localStorage 作为兜底 */
function writeLocalDraft() {
  if (!activeChapter) return;
  try {
    localStorage.setItem(draftKey(activeChapter.id), JSON.stringify({
      content: editor.value,
      at: new Date().toISOString()
    }));
  } catch (error) {
    setSaveState('failed', `本地存储写入失败：${error.message}`);
  }
}

function readLocalDraft(chapterId) {
  const raw = localStorage.getItem(draftKey(chapterId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.content === 'string' ? parsed : null;
  } catch {
    localStorage.removeItem(draftKey(chapterId));
    return null;
  }
}

/**
 * 载入章节后检查是否存在未同步的本地草稿。
 *
 * 只在「本地草稿比服务端内容新」时提示合并：本地更旧说明服务端的版本已经
 * 覆盖了它，继续弹窗只会把作者拦在已经放弃的旧稿上。
 */
async function checkLocalDraft() {
  if (!apiOnline || !activeChapter) return;
  const draft = readLocalDraft(activeChapter.id);
  if (!draft) return;
  if (draft.content === activeChapter.content) {
    localStorage.removeItem(draftKey(activeChapter.id));
    return;
  }

  const localAt = Date.parse(draft.at || '');
  const serverAt = Date.parse(activeChapter.updated_at || '');
  const localNewer = Number.isFinite(localAt) && (!Number.isFinite(serverAt) || localAt > serverAt);
  if (!localNewer) {
    localStorage.removeItem(draftKey(activeChapter.id));
    return;
  }

  const choice = await confirmMergeDraft(draft.content, activeChapter.content, draft.at);
  if (choice === 'local') {
    editor.value = draft.content;
    updateWordCount();
    setSaveState('unsaved');
    await autoSaveNow(); // 合并即落库，成功后由 autoSave 清掉 localStorage
    flashAssist('本地草稿已合并', '已采用浏览器本地保存的内容并写回服务器。');
    if (saveState !== 'saved') {
      flashAssist('本地草稿尚未同步', '合并内容写入失败，稍后可在编辑器继续修改后重试保存。', 'warning');
    }
  } else if (choice === 'server') {
    localStorage.removeItem(draftKey(activeChapter.id));
    setSaveState('saved');
    flashAssist('已采用服务端内容', '本地草稿已丢弃。');
  }
  // 'later'：保留 localStorage，下次载入该章节时再问
}

/**
 * 离开当前编辑上下文（切章 / 切项目共用，F079）的 dirty 拦截。
 * @param {string} what 去向描述，如「切换章节」「切换项目」
 * @returns {Promise<boolean>} true = 修改已处理（保存成功或用户放弃），可以离开
 */
async function confirmDirtyLeave(what) {
  if (!isDirty()) return true;
  const choice = await showModal({
    title: '当前章节有未保存的修改',
    bodyHtml: `<p>《${escapeHtml(activeChapter.title)}》还有改动没有写入服务器，${escapeHtml(what)}前请选择处理方式。</p>`,
    actions: [
      { label: '保存并离开', value: 'save', variant: 'primary-btn' },
      { label: '放弃修改', value: 'discard' },
      { label: '取消', value: 'cancel' }
    ]
  });
  // 弹窗期间用户可能继续输入，取消时编辑器内容原样保留
  if (choice === 'cancel') return false;
  if (choice === 'save') {
    await autoSaveNow();
    if (isDirty()) {
      // 保存失败时不能默默丢稿，再确认一次
      const forced = await showModal({
        title: '自动保存失败',
        bodyHtml: `<p>改动未能写入服务器。${escapeHtml(what)}会丢失这些修改，是否继续？</p>`,
        actions: [
          { label: '放弃修改并继续', value: 'discard' },
          { label: '留在当前章节', value: 'cancel', variant: 'primary-btn' }
        ]
      });
      return forced === 'discard';
    }
  }
  return true;
}

/** 切换章节（带 dirty 拦截） */
async function switchChapter(chapterId) {
  const next = state.chapters.find(chapter => chapter.id === chapterId);
  if (!next) return;
  if (activeChapter && next.id === activeChapter.id) return;

  if (!(await confirmDirtyLeave('切换章节'))) return;
  adoptChapter(next);
}

/**
 * 切换项目（F079）：与切章相同的 dirty 拦截策略，切换后整体重载该项目数据。
 * 取消时调用 renderProjectSwitcher() 把 <select> 的显示值拉回当前项目 ——
 * 用户的 change 已经改变了 DOM 选中项，不做回显就会出现「下拉显示 B、实际在 A」的错位。
 */
async function switchProject(nextProjectId) {
  if (!apiOnline || nextProjectId === currentProjectId) return;
  if (!(await confirmDirtyLeave('切换项目'))) {
    renderProjectSwitcher();
    return;
  }
  currentProjectId = nextProjectId;
  await loadBootstrap();
}

/**
 * 渲染项目切换器（F079）。只有一个项目时隐藏 —— 单项目用户不该看到一个
 * 只有自己、永远切不动的下拉框。
 */
function renderProjectSwitcher() {
  const select = document.querySelector('#projectSwitcher');
  if (!select) return;
  const projects = state.projects || [];
  select.hidden = projects.length < 2;
  select.innerHTML = projects.map(project =>
    `<option value="${escapeHtml(String(project.id))}"${project.id === currentProjectId ? ' selected' : ''}>${escapeHtml(project.title)}（${project.chapter_count} 章）</option>`
  ).join('');
}

/** 载入新章节并重置保存状态机 */
function adoptChapter(chapter) {
  activeChapter = chapter;
  cancelAutoSave();
  retryCount = 0;
  saveAborted = false;
  renderChapters();
  renderEditor();
  // 异步检查本地降级草稿，失败不冒泡成未捕获异常
  checkLocalDraft().catch(error => {
    flashAssist('本地草稿检查失败', error.message, 'warning');
  });
  // F080：知识库面板开着时，切章后「本章提及」要跟随当前章节（面板关着就不发请求）
  const knowledgeDrawer = document.querySelector('#knowledgeDrawer');
  if (knowledgeDrawer && knowledgeDrawer.classList.contains('open')) loadChapterMentions();
}

/* ==========================================================================
 * 通用确认弹窗（切章拦截 / 草稿合并 / 密钥清除 共用）
 * ========================================================================== */

const modalMask = document.querySelector('#modalMask');
const modalTitle = document.querySelector('#modalTitle');
const modalBody = document.querySelector('#modalBody');
const modalActions = document.querySelector('#modalActions');
let modalResolve = null;

/**
 * 打开确认弹窗。
 * @param {{title:string, bodyHtml:string, actions:Array<{label:string, value:string, variant?:string}>}} options
 * @returns {Promise<string>} 被点击按钮的 value；点遮罩或按 ESC 返回 'cancel'
 */
function showModal({ title, bodyHtml, actions }) {
  if (!modalMask) return Promise.resolve('cancel');
  closeModal('cancel'); // 同时只允许一个弹窗，先结算上一个
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalActions.innerHTML = '';
  actions.forEach(action => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    if (action.variant) button.className = action.variant;
    button.addEventListener('click', () => closeModal(action.value));
    modalActions.appendChild(button);
  });
  modalMask.hidden = false;
  return new Promise(resolve => {
    modalResolve = resolve;
  });
}

function closeModal(value) {
  const resolve = modalResolve;
  modalResolve = null;
  if (modalMask) modalMask.hidden = true;
  if (resolve) resolve(value);
}

if (modalMask) {
  modalMask.addEventListener('click', event => {
    if (event.target === modalMask) closeModal('cancel');
  });
}

// F079：项目切换。change 事件在模块级挂一次 —— #projectSwitcher 是静态 DOM，
// renderProjectSwitcher 只重绘 option，不会重挂监听。
const projectSwitcher = document.querySelector('#projectSwitcher');
if (projectSwitcher) {
  projectSwitcher.addEventListener('change', event => {
    switchProject(Number(event.target.value));
  });
}

/**
 * 本地草稿合并三选一：采用本地 / 采用服务端 / 并排查看。
 * @param {string} local 本地草稿内容
 * @param {string} server 服务端内容
 * @param {string} localAt 本地草稿时间戳
 * @returns {Promise<'local'|'server'|'later'>}
 */
async function confirmMergeDraft(local, server, localAt) {
  let showCompare = false;
  for (;;) {
    const bodyHtml = showCompare
      ? `<p>并排对照后，请选择保留哪一份。本地草稿保存于 ${escapeHtml(formatDateTime(localAt))}。</p>
         <div class="merge-columns">
           <div><h4>浏览器本地草稿（${local.length} 字）</h4><textarea readonly>${escapeHtml(local)}</textarea></div>
           <div><h4>服务端内容（${server.length} 字）</h4><textarea readonly>${escapeHtml(server)}</textarea></div>
         </div>`
      : `<p>发现未同步的本地修改（保存于 ${escapeHtml(formatDateTime(localAt))}，${local.length} 字），
          与服务端内容（${server.length} 字）不一致。请选择保留哪一份。</p>`;

    const choice = await showModal({
      title: '发现未同步的本地修改，是否合并',
      bodyHtml,
      actions: [
        { label: '采用本地', value: 'local', variant: 'primary-btn' },
        { label: '采用服务端', value: 'server' },
        { label: showCompare ? '收起对照' : '并排查看', value: showCompare ? 'collapse' : 'compare' },
        { label: '稍后处理', value: 'later' }
      ]
    });

    if (choice === 'compare') {
      showCompare = true;
      continue;
    }
    if (choice === 'collapse') {
      showCompare = false;
      continue;
    }
    return choice;
  }
}

/* ==========================================================================
 * F075 密钥配置 UI
 * ========================================================================== */

/** 回填「密钥状态 / 主密钥路径 / 指纹」提示区 */
function renderAiKeyStatus() {
  const status = document.querySelector('#aiKeyStatus');
  const input = document.querySelector('#aiApiKeyInput');
  if (status) setKeyStatus(status, 'warn', '密钥状态：读取中…');
  if (input) input.value = '';
  loadMasterKeyMeta();

  if (!status) return;
  if (!apiOnline || !state.project) {
    setKeyStatus(status, 'warn', 'API 未启动，无法读取密钥状态。');
    return;
  }
  if (!state.project.hasApiKey) {
    setKeyStatus(status, 'warn', '未配置密钥 · 当前为本地演示模式（mock），AI 建议为内置示例数据，非真实模型输出。');
    if (input) input.placeholder = 'API Key（留空表示不修改）';
    return;
  }

  const masked = state.project.apiKeyMasked || '已配置';
  if (state.project.decryptable === false) {
    setKeyStatus(status, 'danger', `已保存密钥（${masked}）但无法解密 · 主密钥可能已被更换，请恢复备份或重新填写密钥。`);
    if (input) input.placeholder = '密钥无法解密，请重新填写';
    return;
  }
  setKeyStatus(status, 'ok', `已配置密钥（${masked}）· 输入框留空表示不修改`);
  if (input) input.placeholder = `已配置：${masked}，留空表示不修改`;
}

function setKeyStatus(element, level, text) {
  element.textContent = text;
  element.dataset.level = level;
}

/**
 * 拉取主密钥元信息用于备份引导。
 * 失败时静默 —— 提示区不构成主流程，不该因为读不到路径就报错打断写作。
 */
async function loadMasterKeyMeta() {
  const pathEl = document.querySelector('#masterKeyPath');
  const fpEl = document.querySelector('#masterKeyFingerprint');
  if (!apiOnline) {
    if (pathEl) pathEl.textContent = '~/.novel-ai/master.key';
    return;
  }
  try {
    const meta = await apiFetch('/settings/ai/master-key');
    if (pathEl) pathEl.textContent = meta.path;
    if (fpEl) fpEl.textContent = meta.fingerprint ? ` · 指纹 ${meta.fingerprint}` : '';
  } catch (error) {
    if (pathEl) pathEl.textContent = '~/.novel-ai/master.key';
  }
}

/** 导出主密钥备份文件 */
async function exportMasterKey() {
  if (!apiOnline) return flashAssist('主密钥备份', 'API 未启动，无法读取主密钥。', 'warning');
  try {
    const meta = await apiFetch('/settings/ai/master-key');
    const bytes = Uint8Array.from(atob(meta.content), char => char.charCodeAt(0));
    downloadFile('novel-ai-master.key', new Blob([bytes], { type: 'application/octet-stream' }), 'application/octet-stream');
    flashAssist('主密钥已导出', `已下载 novel-ai-master.key（来源：${meta.path}）。请将它存放到安全位置：此文件丢失将导致已保存的密钥无法恢复。`);
  } catch (error) {
    flashAssist('主密钥导出失败', error.message, 'danger');
  }
}

/** 清除项目已保存的密钥（需二次确认） */
async function clearApiKey() {
  if (!apiOnline) return flashAssist('清除密钥', 'API 未启动，无法修改密钥。', 'warning');
  const choice = await showModal({
    title: '清除已保存的密钥',
    bodyHtml: '<p>清除后该项目将回落到环境变量 NOVEL_AI_API_KEY，若环境变量也未配置则进入本地演示模式（mock）。此操作不可撤销。</p>',
    actions: [
      { label: '确认清除', value: 'confirm' },
      { label: '取消', value: 'cancel', variant: 'primary-btn' }
    ]
  });
  if (choice !== 'confirm') return;
  try {
    await apiFetch('/settings/ai', {
      method: 'POST',
      body: JSON.stringify({
        baseUrl: document.querySelector('#aiBaseUrlInput')?.value.trim() || '',
        model: document.querySelector('#aiModelInput')?.value.trim() || 'mock-novel-copilot',
        apiKey: CLEAR_API_KEY
      })
    });
    const input = document.querySelector('#aiApiKeyInput');
    if (input) input.value = '';
    flashAssist('密钥已清除', '项目库中的加密密钥已删除。');
    await refreshBootstrapProject();
  } catch (error) {
    flashAssist('清除密钥失败', error.message, 'danger');
  }
}

/** 重新拉取 bootstrap，刷新项目（含 hasApiKey / apiKeyMasked）与章节列表 */
async function refreshBootstrapProject() {
  try {
    const fresh = await apiFetch('/bootstrap');
    const previousChapterId = activeChapter ? activeChapter.id : null;
    state = fresh;
    apiOnline = true;
    const same = state.chapters.find(chapter => chapter.id === previousChapterId);
    activeChapter = same || state.chapters[state.chapters.length - 1] || fallbackState.chapters[0];
    renderProject();
    renderChapters();
    renderEditor();
    renderAiKeyStatus();
  } catch (error) {
    flashAssist('状态刷新失败', error.message, 'danger');
  }
}

function renderAssist(tab = 'ideas') {
  const items = fallbackAssist[tab] || fallbackAssist.ideas;
  assistFeed.innerHTML = items.map(renderAssistCard).join('');
}

function renderAssistCard(item) {
  return `<article class="assist-card ${item.tone || ''}"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`;
}

function renderKnowledge(knowledge) {
  document.querySelector('#globalKnowledge').innerHTML = (knowledge.global || []).map(renderKnowledgeCard).join('');
  document.querySelector('#projectKnowledge').innerHTML = (knowledge.project || []).map(renderKnowledgeCard).join('');
}

function renderKnowledgeCard(entry) {
  return `<article class="knowledge-card"><span class="tag">${escapeHtml(entry.source || entry.scope || '知识库')}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.body)}</p><button type="button" data-knowledge-id="${escapeHtml(String(entry.id || ''))}">删除</button></article>`;
}

function renderRelations() {
  document.querySelector('#relationList').innerHTML = state.relations.map(row => `
    <article class="relation-item">
      <span class="tag">${escapeHtml(row.relation_type)}</span>
      <h3>${escapeHtml(row.source_name)} ↔ ${escapeHtml(row.target_name)}</h3>
      <p>${escapeHtml(row.description)}</p>
    </article>
  `).join('');
}

function renderPublishBoard(tasks = state.publishTasks) {
  document.querySelector('#publishBoard').innerHTML = tasks.map(task => `
    <article class="publish-card">
      <span class="tag status-${task.status}">${escapeHtml(formatPublishStatus(task.status))}</span>
      <h3>${escapeHtml(task.chapter_title || task.title || '未命名章节')}</h3>
      <p>${escapeHtml(task.platform)} · ${escapeHtml(formatDate(task.scheduled_at))}</p>
      <div class="card-actions">
        <button type="button" data-publish-id="${escapeHtml(String(task.id))}" data-publish-action="simulate">模拟推送</button>
        <button type="button" data-publish-id="${escapeHtml(String(task.id))}" data-publish-action="retry">重试</button>
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
    ${positioned.map(node => `<button class="node ${node.type === 'core' ? 'core' : ''} node-${node.group}" style="left:${node.x}px;top:${node.y}px" type="button" data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.label)}</button>`).join('')}
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
  document.querySelector('#graphDetail').innerHTML = `<strong>${escapeHtml(node.label)}</strong><span>${escapeHtml(node.type)} · ${escapeHtml(node.group)}</span><p>${escapeHtml(node.detail || '暂无详情')}</p>`;
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

/** 本地草稿时间戳展示：非法值回退到原始字符串，不要显示 Invalid Date */
function formatDateTime(value) {
  if (!value) return '未知时间';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
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

/**
 * AI 任务统一走流式通道（F082/T015）：实时卡 + 可中断。
 * SSE 帧：meta（引用/截断信息，用于「引用来源」卡）→ delta（增量）→ done（终态多卡）/ error。
 * 断流自动降级：/stream 不可达时回落 JSON 通道 /ai（双通道并存，design C）。
 */
async function runAi(taskType) {
  if (!apiOnline) {
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
      body: JSON.stringify({ taskType, chapterId: activeChapter ? activeChapter.id : null, selectedText: editor.value.slice(0, 1200) }),
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
        body: JSON.stringify({ taskType, chapterId: activeChapter ? activeChapter.id : null, selectedText: editor.value.slice(0, 1200) })
      });
      showRefsCard(result);
      result.items.slice().reverse().forEach(item => flashAssist(item.title, item.body, item.tone));
    } catch (fallbackError) {
      flashAssist('AI 接口错误', fallbackError.message, 'danger');
    }
  }
}

async function createProject() {
  const title = document.querySelector('#projectTitleInput').value.trim();
  const genre = document.querySelector('#projectGenreInput').value.trim();
  if (!apiOnline) return flashAssist('项目创建', 'API 未启动，无法写入 SQLite。', 'warning');
  await createProjectAndSwitch({ title, genre });
}

/**
 * 新建项目向导（F079）：侧栏「新建」按钮的入口。
 * 弹窗收集标题/题材 → 创建 → 自动切换。模态框关闭后 innerHTML 仍在，
 * 因此在 confirmDirtyLeave（可能开第二个弹窗）之前先把输入值读出来。
 */
async function newProjectWizard() {
  if (!apiOnline) return flashAssist('新建项目', 'API 未启动，无法写入 SQLite。', 'warning');
  const choice = await showModal({
    title: '新建项目',
    bodyHtml: `<div class="form-grid">
        <input id="newProjectTitleInput" type="text" placeholder="项目标题（默认：未命名小说）" />
        <input id="newProjectGenreInput" type="text" placeholder="题材（默认：类型待定）" />
      </div>`,
    actions: [
      { label: '创建', value: 'create', variant: 'primary-btn' },
      { label: '取消', value: 'cancel' }
    ]
  });
  if (choice !== 'create') return;
  const title = document.querySelector('#newProjectTitleInput')?.value.trim() || '';
  const genre = document.querySelector('#newProjectGenreInput')?.value.trim() || '';
  await createProjectAndSwitch({ title, genre });
}

/** 创建并切换（F079）。settings 表单与侧栏向导共用。 */
async function createProjectAndSwitch({ title, genre }) {
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
    // 创建后直接切换到新项目（复用 dirty 拦截；若用户在拦截里取消，
    // 项目已创建但不切换，消息按实际结果区分）
    await switchProject(result.project.id);
    const switched = currentProjectId === result.project.id;
    flashAssist('项目创建完成', switched
      ? `已创建《${result.project.title}》并切换到新项目，可继续新建章节开始写作。`
      : `已创建《${result.project.title}》，可用左上角切换器进入。`);
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
        <h3>版本 ${escapeHtml(String(version.version))}</h3>
        <p>${escapeHtml(version.content.slice(0, 90))}${version.content.length > 90 ? '...' : ''}</p>
        <button type="button" data-version="${escapeHtml(String(version.version))}">回滚到此版本</button>
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
        <h3>${escapeHtml(taskLabels[task.task_type] || task.task_type)} · ${escapeHtml(task.provider)}</h3>
        <p>${escapeHtml((task.output?.[0]?.body || '').slice(0, 110))}</p>
        <button type="button" data-ai-task-id="${escapeHtml(String(task.id))}">有用</button>
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
        <h3>${escapeHtml(log.action)}</h3>
        <p>${new Date(log.created_at).toLocaleString('zh-CN', { hour12: false })} · ${escapeHtml(JSON.stringify(log.payload))}</p>
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
    log.innerHTML = result.annotations.map(item => `<article class="log-card"><h3>${escapeHtml(item.severity)} · ${escapeHtml(item.quote)}</h3><p>${escapeHtml(item.note)}</p></article>`).join('');
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
    log.innerHTML = result.todos.map(todo => `<article class="log-card"><h3>${escapeHtml(todo.status)} · ${escapeHtml(todo.title)}</h3><p>${escapeHtml(todo.due_at || '无截止日期')}</p><button type="button" data-todo-id="${escapeHtml(String(todo.id))}">切换状态</button></article>`).join('');
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
    log.innerHTML = result.terms.map(term => `<article class="log-card"><h3>${escapeHtml(term.category)} · ${escapeHtml(term.term)}</h3><p>${escapeHtml(term.definition)}</p></article>`).join('');
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
      ? result.matches.map(match => `<article class="log-card danger"><h3>${escapeHtml(match.severity)} · ${escapeHtml(match.term)}</h3><p>${escapeHtml(match.suggestion)}</p></article>`).join('')
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
    log.innerHTML = result.characters.map(item => `<article class="log-card"><h3>${escapeHtml(item.name)} · ${escapeHtml(item.role)}</h3><p>${escapeHtml(item.motivation)} / ${escapeHtml(item.arc)}</p></article>`).join('');
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
    log.innerHTML = result.events.map(item => `<article class="log-card"><h3>${escapeHtml(item.event_time)} · ${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`).join('');
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
    log.innerHTML = result.scenes.map(item => `<article class="log-card"><h3>${escapeHtml(item.name)} · ${escapeHtml(item.mood)}</h3><p>${escapeHtml(item.description)}</p></article>`).join('');
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
    log.innerHTML = result.settings.map(item => `<article class="log-card"><h3>${escapeHtml(item.category)} · ${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p></article>`).join('');
  } catch (error) {
    flashAssist('世界观加载失败', error.message, 'danger');
  }
}

async function saveAiSettings() {
  if (!apiOnline) return flashAssist('AI 配置', 'API 未启动，无法保存 AI 配置。', 'warning');
  const input = document.querySelector('#aiApiKeyInput');
  // 三态语义与服务端一致：非空覆盖、留空不修改、'__CLEAR__' 清除
  const apiKey = input ? input.value.trim() : '';
  try {
    const result = await apiFetch('/settings/ai', {
      method: 'POST',
      body: JSON.stringify({
        baseUrl: document.querySelector('#aiBaseUrlInput').value.trim(),
        model: document.querySelector('#aiModelInput').value.trim() || 'mock-novel-copilot',
        apiKey
      })
    });
    if (input) input.value = '';
    if (state.project) {
      state.project.ai_base_url = result.settings.ai_base_url;
      state.project.ai_model = result.settings.ai_model;
      state.project.hasApiKey = Boolean(result.key?.hasApiKey);
      state.project.apiKeyMasked = result.key?.apiKeyMasked || '';
      state.project.decryptable = result.key?.decryptable !== false;
    }
    renderAiKeyStatus();
    flashAssist('AI 配置已保存', `当前模型：${result.settings.ai_model}${apiKey ? ' · 密钥已加密写入项目库' : ' · 密钥保持不变'}`);
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
        <h3>${escapeHtml(prompt.task_type)} · ${escapeHtml(prompt.title)}</h3>
        <p>${escapeHtml(prompt.template)}</p>
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

/**
 * F078 导入回灌：选择导出 JSON → 预检格式 → 用户选择模式 → POST /import。
 *   replace：覆盖当前项目（服务端会先做整库 VACUUM INTO 备份，结果里带回备份路径）；
 *   new    ：导入为新项目，不影响现有数据；导入成功后直接切换过去（F079 切换器）。
 * 动态创建 file input 而不是常驻 DOM：导入是低频操作，没必要给每个页面实例挂一个隐藏控件。
 */
async function importProjectFile() {
  if (!apiOnline) return flashAssist('项目导入', 'API 未启动，无法导入项目。', 'warning');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      return flashAssist('项目导入失败', '文件不是合法的 JSON。', 'danger');
    }
    // 与服务端 assertImportPayload 同源的预检：把明显不对的文件挡在弹窗之前，
    // 避免用户在确认对话框里做了一次无意义的选择。
    if (!payload || payload.formatVersion !== 1 || typeof payload.project !== 'object' || !payload.project) {
      return flashAssist('项目导入失败', '文件不是本工具导出的项目 JSON（缺少 formatVersion=1 或 project 字段）。', 'danger');
    }
    const choice = await showModal({
      title: '导入项目',
      bodyHtml: `<p>将导入《${escapeHtml(payload.project.title || '未命名项目')}》（导出于 ${escapeHtml(payload.exportedAt || '未知时间')}）。</p>
        <p>「覆盖当前项目」会先自动备份数据库再替换数据；「导入为新项目」不影响现有项目。</p>`,
      actions: [
        { label: '覆盖当前项目', value: 'replace', variant: 'primary-btn' },
        { label: '导入为新项目', value: 'new' },
        { label: '取消', value: 'cancel' }
      ]
    });
    if (choice === 'cancel') return;
    try {
      const result = await apiFetch('/import', {
        method: 'POST',
        body: JSON.stringify({ ...payload, mode: choice, projectId: state.project ? state.project.id : null })
      });
      const counts = Object.entries(result.summary || {})
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${name} ${count}`)
        .join('、');
      if (result.mode === 'replace') {
        await loadBootstrap();
        flashAssist('项目导入完成', `已覆盖当前项目。写入：${counts || '无数据'}。备份：${result.backupPath}`);
      } else {
        // F079：新项目导入后直接切过去（有 dirty 拦截兜底）；取消时提示用切换器
        await switchProject(result.projectId);
        const switched = currentProjectId === result.projectId;
        flashAssist('项目导入完成', switched
          ? `已导入《${payload.project.title || '未命名项目'}》并切换到新项目。备份：${result.backupPath}`
          : `已导入为新项目，可用左上角切换器进入。备份：${result.backupPath}`);
      }
    } catch (error) {
      flashAssist('项目导入失败', error.message, 'danger');
    }
  });
  input.click();
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
    writeLocalDraft();
    setSaveState('local', 'API 未启动，已存浏览器本地');
    flashAssist('章节已存本地', 'API 未启动，内容已保存在浏览器 localStorage，恢复连接后可合并。', 'warning');
    renderChapters();
    return;
  }
  setSaveState('saving');
  try {
    const result = await apiFetch(`/chapters/${activeChapter.id}/save`, { method: 'POST', body: JSON.stringify({ content: editor.value }) });
    activeChapter = result.chapter;
    state.chapters = state.chapters.map(chapter => chapter.id === activeChapter.id ? activeChapter : chapter);
    // 只把「服务端确认收到的内容」设为基线：请求期间的新输入仍然算 dirty
    lastSavedContent = result.chapter.content;
    retryCount = 0;
    localStorage.removeItem(draftKey(activeChapter.id));
    setSaveState('saved');
    if (editor.value !== lastSavedContent) {
      setSaveState('unsaved');
      scheduleAutoSave();
    }
    flashAssist('章节已存稿', `已写入 SQLite，并生成版本 ${activeChapter.version}。`);
    renderChapters();
  } catch (error) {
    setSaveState('failed', error.message);
    flashAssist('存稿失败', error.message, 'danger');
  }
}

/* ══════════ F080 本章提及与负例管理 ══════════ */

const MENTION_TYPE_LABELS = {
  character: '角色', knowledge: '知识', scene: '场景',
  world: '世界观', timeline: '时间线', glossary: '术语'
};

/**
 * 拉取当前章节的实体提及并渲染 chips。
 * 在知识库面板打开时调用（打开前不拉取，避免无谓请求）。
 */
async function loadChapterMentions() {
  const container = document.querySelector('#chapterMentions');
  if (!container) return;
  if (!apiOnline || !activeChapter) {
    container.innerHTML = '<span class="mention-empty">API 未启动，提及功能不可用。</span>';
    return;
  }
  try {
    const result = await apiFetch(`/mentions?chapterId=${activeChapter.id}`);
    renderChapterMentions(result.mentions || []);
  } catch (error) {
    container.innerHTML = `<span class="mention-empty">提及加载失败：${escapeHtml(error.message)}</span>`;
  }
}

function renderChapterMentions(mentions) {
  const container = document.querySelector('#chapterMentions');
  if (!container) return;
  if (!mentions.length) {
    container.innerHTML = '<span class="mention-empty">本章暂未识别到已登记实体；在角色/知识库等面板录入后会自动出现在这里。</span>';
    return;
  }
  container.innerHTML = mentions.map(mention => `
    <span class="mention-chip">
      <strong>${escapeHtml(mention.title)}</strong>
      <em>${escapeHtml(MENTION_TYPE_LABELS[mention.entity_type] || mention.entity_type)} ×${mention.count}</em>
      <button type="button" title="这不是「${escapeHtml(mention.surface)}」？登记为负例" data-mention-negative="${escapeHtml(mention.surface)}"
        data-mention-type="${escapeHtml(mention.entity_type)}" data-mention-entity="${mention.entity_id}">✗</button>
    </span>`).join('');
}

/**
 * 一键标负例（F080）：把误报字符串登记为该实体的负例别名（polarity=-1），
 * 服务端随即全项目重扫 —— 下一次打开「本章提及」时误报消失。
 * 输入预填命中的 surface：如果误报来自更长的上下文词（如「大学院墙」误报「学院」），
 * 用户应把它扩写成完整词，遮蔽才够精确。
 */
async function addNegativeAlias(surface, entityType, entityId) {
  const choice = await showModal({
    title: '登记负例（遮蔽误报）',
    bodyHtml: `<p>把下面这个字符串登记为负例：扫描时命中它将<b>整段跳过</b>，不再生成对当前实体的提及。</p>
      <div class="form-grid"><input id="negativeAliasInput" type="text" value="${escapeHtml(surface)}" /></div>
      <p>如误报来自更长的词（如「大学院墙」误报「学院」），请把输入扩写成完整词。</p>`,
    actions: [
      { label: '登记并重扫', value: 'ok', variant: 'primary-btn' },
      { label: '取消', value: 'cancel' }
    ]
  });
  if (choice !== 'ok') return;
  const alias = document.querySelector('#negativeAliasInput')?.value.trim();
  if (!alias) return flashAssist('登记负例', '负例内容为空，未登记。', 'warning');
  try {
    const result = await apiFetch('/aliases', {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId: Number(entityId), alias, polarity: -1 })
    });
    await loadChapterMentions();
    flashAssist('负例已登记', `「${alias}」已遮蔽，全项目重扫完成（${result.rescan.chapters} 章 / ${result.rescan.mentions} 处提及）。`);
  } catch (error) {
    flashAssist('登记负例失败', error.message, 'danger');
  }
}

async function searchKnowledge() {
  const query = document.querySelector('#knowledgeSearch').value.trim();
  if (!apiOnline) {
    flashAssist('知识库搜索', 'API 未启动，已模拟召回：黑潮设定、星火徽章、角色弧光、平台规则。');
    return;
  }
  try {
    // F088：FTS5 bigram 粗筛 + 字面后过滤，覆盖知识/章节/角色/时间线/场景/世界观/术语
    const result = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
    renderKnowledge({ global: result.knowledge.filter(item => item.scope === 'global'), project: result.knowledge.filter(item => item.scope === 'project') });
    // 只列出命中的实体类型，空类型不出现在提示里
    const counts = [
      `知识 ${result.knowledge.length}`,
      `章节 ${result.chapters.length}`,
      `角色 ${result.characters.length}`,
      `时间线 ${result.timeline.length}`,
      `场景 ${result.scenes.length}`,
      `世界观 ${result.world.length}`,
      `术语 ${result.glossary.length}`
    ].filter(text => !text.endsWith(' 0'));
    flashAssist('知识库搜索', counts.length ? `命中：${counts.join('、')}` : '没有命中任何内容，换个关键词试试。');
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
    document.querySelectorAll('[data-graph-type]').forEach(button => {
      button.classList.toggle('active', button === graphTypeButton);
      button.setAttribute('aria-selected', String(button === graphTypeButton));
    });
    return refreshGraph();
  }

  const graphNodeButton = event.target.closest('[data-node-id]');
  if (graphNodeButton) return showNodeDetail(graphNodeButton.dataset.nodeId);

  const chapterButton = event.target.closest('[data-chapter-id]');
  if (chapterButton) {
    // F076：切章前必须过 dirty 拦截，否则未保存内容会被 renderEditor 直接覆盖
    switchChapter(Number(chapterButton.dataset.chapterId));
    return;
  }

  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    document.querySelectorAll('[data-tab]').forEach(button => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });
    tabButton.classList.add('active');
    tabButton.setAttribute('aria-selected', 'true');
    renderAssist(tabButton.dataset.tab);
    return;
  }

  const openButton = event.target.closest('[data-open-panel]');
  if (openButton) {
    openDrawer(openButton.dataset.openPanel);
    if (openButton.dataset.openPanel === 'publish') refreshPublish();
    if (openButton.dataset.openPanel === 'knowledge') loadChapterMentions();
    return;
  }

  // F080：提及 chip 的「✗ 标负例」。放在 data-action 之前，避免被通用分支吞掉
  const negativeButton = event.target.closest('[data-mention-negative]');
  if (negativeButton) {
    return addNegativeAlias(
      negativeButton.dataset.mentionNegative,
      negativeButton.dataset.mentionType,
      negativeButton.dataset.mentionEntity
    );
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
  if (action === 'clear-api-key') return clearApiKey();
  if (action === 'export-master-key') return exportMasterKey();
  if (action === 'save-prompt') return savePrompt();
  if (action === 'load-prompts') return loadPrompts();
  if (action === 'bulk-knowledge') return bulkKnowledge();
  if (action === 'export-project') return exportProjectFile();
  if (action === 'export-chapter') return exportChapterFile();
  if (action === 'import-project') return importProjectFile();
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
  if (action === 'new-project') return newProjectWizard();
  if (action === 'open-log') return openLogDrawer();
  if (action === 'compress-logs') return compressLogs();
  if (action === 'clear-logs') return clearLogs();
  if (action === 'refresh-logs') return renderLogPanel();
});

document.getElementById('logLevelFilter')?.addEventListener('change', () => {
  renderLogPanel();
});

/* ── F076 输入监听：触发 dirty 状态与 3s 防抖自动保存 ── */
editor.addEventListener('input', () => {
  updateWordCount();
  if (!apiOnline || !activeChapter || saveAborted) return;
  setSaveState('unsaved');
  scheduleAutoSave();
});

/* ── F076 离开页面守卫：有未保存内容时阻止关闭/刷新 ── */
window.addEventListener('beforeunload', event => {
  if (!isDirty()) return;
  event.preventDefault();
  // 现代浏览器需要 returnValue 非空才会真正弹确认框
  event.returnValue = '';
  return '';
});

/* ── F076 快捷键：Cmd/Ctrl+S 手动存稿（生成版本）+ ESC 关闭弹窗 ── */
window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    // 不 preventDefault 的话浏览器会弹出「保存网页」对话框
    event.preventDefault();
    saveDraft();
    return;
  }
  if (event.key === 'Escape' && modalMask && !modalMask.hidden) {
    closeModal('cancel');
  }
});

loadBootstrap();
