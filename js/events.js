// 事件路由：全局点击委托（[data-*] 分发）、项目切换器、编辑器输入、
// beforeunload 守卫与快捷键。事件委托结构保持原样（一个 document 级 click 监听）。
import { store } from './store.js';
import { editor, projectSwitcher, modalMask } from './dom.js';
import { renderAssist, openDrawer, closeDrawers } from './ui.js';
import { showModal, closeModal } from './modal.js';
import { isDirty, isSaveAborted, setSaveState, scheduleAutoSave } from './autosave.js';
import { saveDraft } from './draft.js';
import { updateWordCount } from './editor.js';
import { endWritingSession } from './session.js';
import { createProject, newProjectWizard, importProjectFile, exportProjectFile, exportChapterFile } from './projects.js';
import { openExportMenu } from './export-menu.js';
import { setOutlineView, refreshOutline } from './outline.js';
import { addPlotLine } from './plot-grid.js';
import { createChapter, archiveActiveChapter, switchChapter, switchProject } from './chapters.js';
import { addAnnotation, loadAnnotations, addTodo, loadTodos, addGlossary, loadGlossary, sensitiveCheck, toggleTodoStatus } from './editorial.js';
import { refreshGraph, showNodeDetail } from './graph.js';
import { refreshPublish, handlePublishAction, savePlatform, schedulePublish } from './publish.js';
import { refreshForeshadows, loadForeshadowHints, handleForeshadowAction, addForeshadowFromForm, registerForeshadowFromSelection } from './foreshadow.js';
import { loadChapterMentions, addNegativeAlias } from './mentions.js';
import { rollbackVersion, loadVersions, createMilestoneSnapshot } from './versions.js';
import { runAi, sendAiFeedback } from './ai.js';
import { deleteKnowledgeEntry, searchKnowledge, importKnowledge, bulkKnowledge } from './knowledge.js';
import { refreshDashboard, loadHistory, loadAudit, saveGoal, addProgress } from './dashboard.js';
import { saveAiSettings, clearApiKey, exportMasterKey, savePrompt, loadPrompts } from './ai-settings.js';
import { addCharacter, loadCharacters, addTimeline, loadTimeline, addScene, loadScenes, addWorld, loadWorld } from './story-bible.js';
import { openLogDrawer, compressLogs, clearLogs, renderLogPanel } from './log.js';
import { toggleFocusMode, exitFocusMode, changeFontSize, cycleLineWidth } from './focus-mode.js';

document.addEventListener('click', event => {
  const graphTypeButton = event.target.closest('[data-graph-type]');
  if (graphTypeButton) {
    store.activeGraphType = graphTypeButton.dataset.graphType;
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

  // F083：大纲区三视图切换（列表 / 卡片 Corkboard / 情节网格）
  const outlineViewButton = event.target.closest('[data-outline-view]');
  if (outlineViewButton) return setOutlineView(outlineViewButton.dataset.outlineView);

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
    // F084：伏笔面板打开时拉取列表与线索提示
    if (openButton.dataset.openPanel === 'foreshadow') {
      refreshForeshadows();
      loadForeshadowHints();
    }
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

  // F084：伏笔状态流转按钮（放在 data-action 之前，避免被通用分支吞掉）
  const foreshadowButton = event.target.closest('[data-foreshadow-id]');
  if (foreshadowButton) return handleForeshadowAction(Number(foreshadowButton.dataset.foreshadowId), foreshadowButton.dataset.foreshadowAction);

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
  if (action === 'create-milestone') return createMilestoneSnapshot();
  if (action === 'search-knowledge') return searchKnowledge();
  if (action === 'refresh-graph') return refreshGraph();
  if (action === 'create-project') return createProject();
  if (action === 'create-chapter') return createChapter();
  if (action === 'import-knowledge') return importKnowledge();
  if (action === 'load-versions') return loadVersions();
  if (action === 'save-platform') return savePlatform();
  if (action === 'schedule-publish') return schedulePublish();
  if (action === 'add-foreshadow') return addForeshadowFromForm();
  if (action === 'refresh-foreshadows') return refreshForeshadows();
  if (action === 'scan-foreshadow-hints') return loadForeshadowHints();
  if (action === 'register-foreshadow') return registerForeshadowFromSelection();
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
  if (action === 'export-multi') return openExportMenu();
  if (action === 'import-project') return importProjectFile();
  if (action === 'refresh-outline') return refreshOutline();
  if (action === 'add-plotline') return addPlotLine();
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
  // F090：专注模式（按钮双入口之一，Esc 是另一入口）与编辑区字号/行宽
  if (action === 'focus-toggle') return toggleFocusMode();
  if (action === 'font-dec') return changeFontSize(-1);
  if (action === 'font-inc') return changeFontSize(1);
  if (action === 'width-cycle') return cycleLineWidth();
});

document.getElementById('logLevelFilter')?.addEventListener('change', () => {
  renderLogPanel();
});

// F079：项目切换。change 事件在模块级挂一次 —— #projectSwitcher 是静态 DOM，
// renderProjectSwitcher 只重绘 option，不会重挂监听。
if (projectSwitcher) {
  projectSwitcher.addEventListener('change', event => {
    switchProject(Number(event.target.value));
  });
}

/* ── F076 输入监听：触发 dirty 状态与 3s 防抖自动保存 ── */
editor.addEventListener('input', () => {
  updateWordCount();
  if (!store.apiOnline || !store.activeChapter || isSaveAborted()) return;
  setSaveState('unsaved');
  scheduleAutoSave();
});

/* ── F076 离开页面守卫：有未保存内容时阻止关闭/刷新 ── */
window.addEventListener('beforeunload', event => {
  // F086：关页面前用 keepalive 尽力把会话落库（服务端还会兜底关闭孤儿会话）
  endWritingSession({ keepalive: true });
  if (!isDirty()) return;
  event.preventDefault();
  // 现代浏览器需要 returnValue 非空才会真正弹确认框
  event.returnValue = '';
  return '';
});

/* ── F076/F090 快捷键：Cmd/Ctrl+S 手动存稿 + Esc 关弹窗/退专注模式 ── */
window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    // 不 preventDefault 的话浏览器会弹出「保存网页」对话框
    event.preventDefault();
    saveDraft();
    return;
  }
  if (event.key === 'Escape') {
    // 优先级：确认弹窗 > 专注模式。普通模式下 Esc 无副作用
    if (modalMask && !modalMask.hidden) closeModal('cancel');
    else exitFocusMode();
  }
});
