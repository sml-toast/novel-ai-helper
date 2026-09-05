import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { addAiFeedback, addAnnotation, addCharacterProfile, addGlossaryTerm, addKnowledge, addRelation, addSceneLocation, addTimelineEvent, addTodo, addWorldSetting, addWritingProgress, archiveChapter, buildGraph, bulkAddKnowledge, checkSensitiveText, countChapters, createChapter, createProject, deleteKnowledge, exportChapter, exportProject, get, getAiContextData, getBootstrapData, getDashboardStats, getCurrentProjectId, getProjectKeyMeta, importProject, listAiTasks, listAnnotations, listAuditLogs, listChapterVersions, listCharacters, listGlossary, listPlatformConfigs, listPromptTemplates, listPublishTasks, listScenes, listTimeline, listTodos, listWorldSettings, listWritingProgress, loadProjectSecret, projectExists, recordAiTask, rollbackChapter, saveChapter, saveDraft, searchAll, toggleTodo, updateAiSettings, upsertPlatformConfig, upsertPromptTemplate, upsertWritingGoal } from './novel-db.js';
import { resolveProjectId } from './novel-project.js';
import { runAiTask } from './novel-ai-provider.js';
import { ALLOWED_ORIGINS, MAX_BODY_BYTES, authMiddleware } from './novel-auth.js';
import { getMasterKeyPath, loadOrCreateMasterKey, masterKeyFingerprint } from './novel-secret.js';
import { createPublishTask, retryPublish, scanDuePublishTasks, simulatePublish } from './novel-publish.js';

const port = Number(process.env.NOVEL_API_PORT || 8787);

/**
 * F074：不再无脑返回 `access-control-allow-origin: *`。
 * 仅当请求 Origin 在白名单内才回显该 Origin（配合 Vary: Origin）。
 * corsOrigin 由 handle() 在鉴权通过后写入 res.locals。
 */
function send(res, status, payload) {
  const corsOrigin = res.locals?.corsOrigin || null;
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  };
  if (corsOrigin) {
    headers['access-control-allow-origin'] = corsOrigin;
    headers['vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

/**
 * X5：原实现无上限累积 body，实测 50MB 请求被完整读入、堆占用 109MB。
 * 超过 2MB 立即中断连接并抛 PAYLOAD_TOO_LARGE（由 handle() 转为 413）。
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        // 只暂停读取（停止继续吃内存），不在这里 destroy ——
        // 否则 413 响应发不出去，客户端只能看到连接被重置。
        // 响应与断连统一由 handle() 的 catch 处理。
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.pause();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  // F074 鉴权：非白名单 Origin 一律拒绝
  res.locals = { corsOrigin: null };

  // OPTIONS 预检：非法 Origin 直接 403，不再无脑 204
  if (req.method === 'OPTIONS') {
    const preflightOrigin = req.headers.origin;
    if (preflightOrigin && !ALLOWED_ORIGINS.has(preflightOrigin)) {
      return send(res, 403, { error: 'origin not allowed' });
    }
    res.locals.corsOrigin = preflightOrigin || null;
    return send(res, 204, {});
  }

  const auth = authMiddleware(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });
  res.locals.corsOrigin = auth.corsOrigin;

  const url = new URL(req.url, `http://${req.headers.host}`);
  // 性能：bootstrap（全部章节正文 + 图谱构建）绝不在每个请求上无条件执行。
  // 绝大多数分支只需要 projectId；/bootstrap、/chapters(POST)、/ai 各自按需取数。
  // 实测（200 章 × 3KB）：此前每个轻量请求固定多付 ~5ms，且随章节数线性增长。
  //
  // F079 多项目上下文：?projectId= → X-Project-Id 头 → 默认项目（id 最小，旧请求零破坏）。
  // 项目不存在必须显式 404 —— 静默回落会让用户在错误的项目里继续写稿。
  const projectId = resolveProjectId(url, req, getCurrentProjectId());
  if (!projectExists(projectId)) {
    return send(res, 404, { error: 'project not found' });
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/novel/bootstrap') {
      return send(res, 200, getBootstrapData(projectId));
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

    // F075：apiKey 三态 —— 非空则加密覆盖；空/不传则保持原值；'__CLEAR__' 则清空
    if (req.method === 'POST' && url.pathname === '/api/novel/settings/ai') {
      const body = await readJson(req);
      const settings = updateAiSettings({
        projectId,
        baseUrl: body.baseUrl || '',
        model: body.model || 'mock-novel-copilot',
        apiKey: typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
      });
      return send(res, 200, { settings, key: getProjectKeyMeta(projectId) });
    }

    /**
     * F075 A4：主密钥备份引导。
     * 返回主密钥文件本身供用户另存 —— 这是「已保存密钥可迁移」的唯一手段：
     * 实测主密钥丢失后重建，旧密文永久无法解密。
     * 仅在白名单 Origin / 无 Origin 下可达（authMiddleware 已拦截非法来源）。
     * 安全边界说明：该端点会把主密钥原文发给调用方。它依赖 F074 的 Origin
     * 白名单（仅本机静态页面可达）+ 127.0.0.1 绑定，等价于「用户在本机自己
     * cat 这个文件」。若将来放开 NOVEL_ALLOWED_ORIGINS，必须先摘掉这个端点。
     */
    if (req.method === 'GET' && url.pathname === '/api/novel/settings/ai/master-key') {
      loadOrCreateMasterKey(); // 不存在则先落盘，保证下面的指纹与内容一致
      return send(res, 200, {
        path: getMasterKeyPath(),
        exists: true,
        fingerprint: masterKeyFingerprint(),
        content: readFileSync(getMasterKeyPath()).toString('base64')
      });
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
        title: body.title || `第 ${countChapters(projectId) + 1} 章 · 未命名章节`,
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

    // F076 草稿通道：防抖自动保存走这里，**不生成版本**。
    // 与 /save 的区别：/save = 手动存稿（进版本表，kind='manual'）；/draft = 自动保存（只更新正文）。
    if (req.method === 'POST' && url.pathname.match(/^\/api\/novel\/chapters\/\d+\/draft$/)) {
      const chapterId = Number(url.pathname.split('/')[4]);
      const body = await readJson(req);
      const chapter = saveDraft(chapterId, body.content || '');
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
      // F075 优先级链：项目库已存密钥 → 环境变量 NOVEL_AI_API_KEY → mock。
      // loadProjectSecret 不抛异常，解密失败会以 error 字段返回，交给 provider 转成可读提示，
      // 避免「主密钥丢了」被包装成一个无信息的 500。
      const secret = loadProjectSecret(projectId);
      const aiContext = getAiContextData(projectId);
      const result = await runAiTask({
        taskType: body.taskType || 'sync',
        project: aiContext.project,
        chapter,
        apiKey: secret.apiKey,
        apiKeyError: secret.error,
        context: {
          relations: aiContext.relations,
          knowledge: aiContext.knowledge,
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
      // F078 起支持 ?projectId=；F079 后由统一的 resolveProjectId 处理（含 X-Project-Id 头）。
      const data = exportProject(projectId);
      return data ? send(res, 200, data) : send(res, 404, { error: 'project not found' });
    }

    // F078 / T008：导入回灌。载荷即 exportProject 的 JSON（前端原样回传并附加 mode）。
    //   new（默认）—— 重映射 ID 导入为新项目，绝不触碰现有数据；
    //   replace    —— 覆盖指定（默认当前）项目，导入前自动 VACUUM INTO 整库备份。
    // 载荷非法走 ImportPayloadError → 400；备份失败或回灌异常 → 500（事务已回滚，库无半截状态）。
    if (req.method === 'POST' && url.pathname === '/api/novel/import') {
      const body = await readJson(req);
      const result = importProject(body, {
        mode: body.mode === 'replace' ? 'replace' : 'new',
        targetProjectId: Number(body.projectId) || null
      });
      return send(res, 201, result);
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
    if (error.message === 'PAYLOAD_TOO_LARGE') {
      send(res, 413, { error: `request body exceeds ${MAX_BODY_BYTES} bytes` });
      req.destroy(); // 响应已发出，丢弃剩余请求体并断开
      return;
    }
    // F078：导入载荷问题属调用方错误，映射为 400 而非 500 ——
    // 否则用户会把「文件不对」误读成「服务器坏了」。
    if (error.name === 'ImportPayloadError') {
      return send(res, 400, { error: error.message });
    }
    return send(res, 500, { error: error.message });
  }
}

// X1 修复：不传 host 时 Node 会绑定 ::（所有网卡），局域网可直接访问，
// 而日志却打印 127.0.0.1，极具误导性。默认显式绑定本机回环。
// 确需局域网/其他设备访问时：NOVEL_API_HOST=0.0.0.0（请自行评估风险）。
const host = process.env.NOVEL_API_HOST || '127.0.0.1';

createServer(handle).listen(port, host, () => {
  console.log(`Novel AI API listening on http://${host}:${port}`);
  console.log(`[auth] 允许的跨域来源：${[...ALLOWED_ORIGINS].join(', ')}`);
});
