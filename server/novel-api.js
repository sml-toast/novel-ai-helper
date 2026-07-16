import { createServer } from 'node:http';
import { URL } from 'node:url';
import { addAiFeedback, addAnnotation, addCharacterProfile, addGlossaryTerm, addKnowledge, addRelation, addSceneLocation, addTimelineEvent, addTodo, addWorldSetting, addWritingProgress, archiveChapter, buildGraph, bulkAddKnowledge, checkSensitiveText, createChapter, createProject, deleteKnowledge, exportChapter, exportProject, get, getBootstrapData, getDashboardStats, listAiTasks, listAnnotations, listAuditLogs, listChapterVersions, listCharacters, listGlossary, listPlatformConfigs, listPromptTemplates, listPublishTasks, listScenes, listTimeline, listTodos, listWorldSettings, listWritingProgress, recordAiTask, rollbackChapter, saveChapter, searchAll, toggleTodo, updateAiSettings, upsertPlatformConfig, upsertPromptTemplate, upsertWritingGoal } from './novel-db.js';
import { runAiTask } from './novel-ai-provider.js';
import { createPublishTask, retryPublish, scanDuePublishTasks, simulatePublish } from './novel-publish.js';

const port = Number(process.env.NOVEL_API_PORT || 8787);

function send(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const url = new URL(req.url, `http://${req.headers.host}`);
  const bootstrap = getBootstrapData();
  const projectId = bootstrap.project.id;

  try {
    if (req.method === 'GET' && url.pathname === '/api/novel/bootstrap') {
      return send(res, 200, bootstrap);
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/dashboard') {
      return send(res, 200, { stats: getDashboardStats(projectId), platforms: listPlatformConfigs(projectId), progress: listWritingProgress(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/goals') {
      const body = await readJson(req);
      return send(res, 200, { goal: upsertWritingGoal({ projectId, dailyWords: Number(body.dailyWords || 3000), deadline: body.deadline || '2026-08-31', note: body.note || '' }) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/progress') {
      const body = await readJson(req);
      return send(res, 201, { progress: addWritingProgress({ projectId, words: Number(body.words || 0), note: body.note || '' }) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/settings/ai') {
      const body = await readJson(req);
      return send(res, 200, { settings: updateAiSettings({ projectId, baseUrl: body.baseUrl || '', model: body.model || 'mock-novel-copilot' }) });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/prompts') {
      return send(res, 200, { prompts: listPromptTemplates(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/prompts') {
      const body = await readJson(req);
      return send(res, 200, { prompt: upsertPromptTemplate({ projectId, taskType: body.taskType || 'sync', title: body.title || '自定义 Prompt', template: body.template || '' }) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/projects') {
      const body = await readJson(req);
      const project = createProject({
        title: body.title || '未命名小说',
        genre: body.genre || '类型待定',
        worldView: body.worldView || '待补充世界观。',
        targetPlatform: body.targetPlatform || '模拟平台 A',
        writingStyle: body.writingStyle || '清晰、克制、强钩子'
      });
      return send(res, 201, { project });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/chapters') {
      const body = await readJson(req);
      const chapter = createChapter({
        projectId,
        title: body.title || `第 ${bootstrap.chapters.length + 1} 章 · 未命名章节`,
        content: body.content || '在这里继续写作。'
      });
      return send(res, 201, { chapter });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/chapters\/\d+\/save$/)) {
      const chapterId = Number(url.pathname.split('/')[4]);
      const body = await readJson(req);
      const chapter = saveChapter(chapterId, body.content || '');
      return chapter ? send(res, 200, { chapter }) : send(res, 404, { error: 'chapter not found' });
    }

    if (req.method === 'GET' && url.pathname.match(/^\/api\/novel\/chapters\/\d+\/versions$/)) {
      const chapterId = Number(url.pathname.split('/')[4]);
      return send(res, 200, { versions: listChapterVersions(chapterId) });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/chapters\/\d+\/rollback$/)) {
      const chapterId = Number(url.pathname.split('/')[4]);
      const body = await readJson(req);
      const chapter = rollbackChapter(chapterId, Number(body.version));
      return chapter ? send(res, 200, { chapter }) : send(res, 404, { error: 'version not found' });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/chapters\/\d+\/archive$/)) {
      const chapterId = Number(url.pathname.split('/')[4]);
      const chapter = archiveChapter(chapterId);
      return chapter ? send(res, 200, { chapter }) : send(res, 404, { error: 'chapter not found' });
    }

    if (req.method === 'GET' && url.pathname.match(/^\/api\/novel\/chapters\/\d+\/annotations$/)) {
      const chapterId = Number(url.pathname.split('/')[4]);
      return send(res, 200, { annotations: listAnnotations(chapterId) });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/chapters\/\d+\/annotations$/)) {
      const chapterId = Number(url.pathname.split('/')[4]);
      const body = await readJson(req);
      return send(res, 201, { annotation: addAnnotation({ chapterId, quote: body.quote || '', note: body.note || '', severity: body.severity || 'info' }) });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/todos') {
      return send(res, 200, { todos: listTodos(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/todos') {
      const body = await readJson(req);
      return send(res, 201, { todo: addTodo({ projectId, title: body.title || '未命名待办', dueAt: body.dueAt || null }) });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/todos\/\d+\/toggle$/)) {
      const id = Number(url.pathname.split('/')[4]);
      const todo = toggleTodo(id);
      return todo ? send(res, 200, { todo }) : send(res, 404, { error: 'todo not found' });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/glossary') {
      return send(res, 200, { terms: listGlossary(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/glossary') {
      const body = await readJson(req);
      return send(res, 201, { term: addGlossaryTerm({ projectId, term: body.term || '未命名词条', definition: body.definition || '', category: body.category || '设定' }) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/sensitive/check') {
      const body = await readJson(req);
      return send(res, 200, checkSensitiveText(projectId, body.text || ''));
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/knowledge') {
      const body = await readJson(req);
      const entry = addKnowledge({
        projectId,
        scope: body.scope === 'global' ? 'global' : 'project',
        title: body.title || '未命名知识',
        body: body.body || '',
        source: body.source || '手动导入',
        tags: body.tags || []
      });
      return send(res, 201, { entry });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/knowledge/bulk') {
      const body = await readJson(req);
      const entries = bulkAddKnowledge({ projectId, scope: body.scope === 'global' ? 'global' : 'project', text: body.text || '' });
      return send(res, 201, { entries });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/knowledge\/\d+\/delete$/)) {
      const id = Number(url.pathname.split('/')[4]);
      const entry = deleteKnowledge(id);
      return entry ? send(res, 200, { entry }) : send(res, 404, { error: 'knowledge not found' });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/relations') {
      const body = await readJson(req);
      const relation = addRelation({
        projectId,
        sourceName: body.sourceName || '角色 A',
        targetName: body.targetName || '角色 B',
        relationType: body.relationType || '待设计',
        description: body.description || '关系说明待补充。',
        strength: Number(body.strength || 50)
      });
      return send(res, 201, { relation });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/characters') {
      return send(res, 200, { characters: listCharacters(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/characters') {
      const body = await readJson(req);
      return send(res, 201, { character: addCharacterProfile({ projectId, name: body.name || '新角色', role: body.role || '待定', motivation: body.motivation || '待补充', arc: body.arc || '待设计' }) });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/timeline') {
      return send(res, 200, { events: listTimeline(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/timeline') {
      const body = await readJson(req);
      return send(res, 201, { event: addTimelineEvent({ projectId, eventTime: body.eventTime || '未知时间', title: body.title || '未命名事件', description: body.description || '' }) });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/scenes') {
      return send(res, 200, { scenes: listScenes(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/scenes') {
      const body = await readJson(req);
      return send(res, 201, { scene: addSceneLocation({ projectId, name: body.name || '未命名场景', mood: body.mood || '待定', description: body.description || '' }) });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/world') {
      return send(res, 200, { settings: listWorldSettings(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/world') {
      const body = await readJson(req);
      return send(res, 201, { setting: addWorldSetting({ projectId, category: body.category || '设定', title: body.title || '未命名设定', content: body.content || '' }) });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/ai/history') {
      return send(res, 200, { tasks: listAiTasks(projectId, Number(url.searchParams.get('limit') || 20)) });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/ai\/tasks\/\d+\/feedback$/)) {
      const taskId = Number(url.pathname.split('/')[5]);
      const body = await readJson(req);
      return send(res, 201, { feedback: addAiFeedback({ taskId, rating: Number(body.rating || 5), note: body.note || '' }) });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/audit') {
      return send(res, 200, { logs: listAuditLogs(Number(url.searchParams.get('limit') || 30)) });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/platforms') {
      return send(res, 200, { platforms: listPlatformConfigs(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/platforms') {
      const body = await readJson(req);
      const platform = upsertPlatformConfig({
        projectId,
        platform: body.platform || '模拟平台 A',
        accountName: body.accountName || '本地作者号',
        rules: body.rules || '默认平台规则。'
      });
      return send(res, 200, { platform });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/ai') {
      const body = await readJson(req);
      const chapter = body.chapterId ? get('SELECT * FROM chapters WHERE id = ?', [Number(body.chapterId)]) : null;
      const result = await runAiTask({
        taskType: body.taskType || 'sync',
        project: bootstrap.project,
        chapter,
        context: {
          relations: bootstrap.relations,
          knowledge: bootstrap.knowledge,
          promptTemplate: listPromptTemplates(projectId).find(prompt => prompt.task_type === (body.taskType || 'sync')),
          selectedText: body.selectedText || ''
        }
      });
      const taskId = recordAiTask({
        projectId,
        chapterId: chapter?.id || null,
        taskType: body.taskType || 'sync',
        input: { body, prompt: result.prompt },
        output: result.items,
        provider: result.provider
      });
      return send(res, 200, { taskId, ...result });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/search') {
      return send(res, 200, searchAll(projectId, url.searchParams.get('q') || ''));
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/graph') {
      return send(res, 200, buildGraph(projectId, url.searchParams.get('type') || 'all'));
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/export/project') {
      return send(res, 200, exportProject(projectId));
    }

    if (req.method === 'GET' && url.pathname.match(/^\/api\/novel\/export\/chapters\/\d+$/)) {
      const chapterId = Number(url.pathname.split('/')[5]);
      const data = exportChapter(chapterId);
      return data ? send(res, 200, data) : send(res, 404, { error: 'chapter not found' });
    }

    if (req.method === 'GET' && url.pathname === '/api/novel/publish') {
      scanDuePublishTasks(projectId);
      return send(res, 200, { tasks: listPublishTasks(projectId) });
    }

    if (req.method === 'POST' && url.pathname === '/api/novel/publish') {
      const body = await readJson(req);
      return send(res, 201, { task: createPublishTask({ projectId, chapterId: body.chapterId, platform: body.platform, scheduledAt: body.scheduledAt }) });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/publish\/\d+\/simulate$/)) {
      const taskId = Number(url.pathname.split('/')[4]);
      return send(res, 200, { task: simulatePublish(taskId) });
    }

    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/publish\/\d+\/retry$/)) {
      const taskId = Number(url.pathname.split('/')[4]);
      return send(res, 200, { task: retryPublish(taskId) });
    }

    return send(res, 404, { error: 'not found' });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}

createServer(handle).listen(port, () => {
  console.log(`Novel AI API listening on http://127.0.0.1:${port}`);
});
