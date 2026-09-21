// 项目级操作：新建项目（表单 + 向导）、创建并切换、导入导出（F078/F079）。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { escapeHtml, downloadFile } from './utils.js';
import { flashAssist } from './ui.js';
import { showModal } from './modal.js';
import { switchProject } from './chapters.js';
import { loadBootstrap } from './app.js';

export async function createProject() {
  const title = document.querySelector('#projectTitleInput').value.trim();
  const genre = document.querySelector('#projectGenreInput').value.trim();
  if (!store.apiOnline) return flashAssist('项目创建', 'API 未启动，无法写入 SQLite。', 'warning');
  await createProjectAndSwitch({ title, genre });
}

/**
 * 新建项目向导（F079）：侧栏「新建」按钮的入口。
 * 弹窗收集标题/题材 → 创建 → 自动切换。模态框关闭后 innerHTML 仍在，
 * 因此在 confirmDirtyLeave（可能开第二个弹窗）之前先把输入值读出来。
 * F087：worldView / targetPlatform / writingStyle 开放录入，不再写死假数据。
 */
export async function newProjectWizard() {
  if (!store.apiOnline) return flashAssist('新建项目', 'API 未启动，无法写入 SQLite。', 'warning');
  const choice = await showModal({
    title: '新建项目',
    bodyHtml: `<div class="form-grid">
        <input id="newProjectTitleInput" type="text" placeholder="项目标题（默认：未命名小说）" />
        <input id="newProjectGenreInput" type="text" placeholder="题材（默认：类型待定）" />
        <input id="newProjectWorldViewInput" type="text" placeholder="世界观（可留空，默认「待补充世界观。」）" />
        <input id="newProjectPlatformInput" type="text" placeholder="目标平台（默认：模拟平台 A）" />
        <input id="newProjectStyleInput" type="text" placeholder="写作风格（默认：强钩子、快节奏、画面感）" />
      </div>`,
    actions: [
      { label: '创建', value: 'create', variant: 'primary-btn' },
      { label: '取消', value: 'cancel' }
    ]
  });
  if (choice !== 'create') return;
  const title = document.querySelector('#newProjectTitleInput')?.value.trim() || '';
  const genre = document.querySelector('#newProjectGenreInput')?.value.trim() || '';
  const worldView = document.querySelector('#newProjectWorldViewInput')?.value.trim() || '';
  const targetPlatform = document.querySelector('#newProjectPlatformInput')?.value.trim() || '';
  const writingStyle = document.querySelector('#newProjectStyleInput')?.value.trim() || '';
  await createProjectAndSwitch({ title, genre, worldView, targetPlatform, writingStyle });
}

/** 创建并切换（F079）。settings 表单与侧栏向导共用；F087 后各字段留空即回落服务端默认。 */
export async function createProjectAndSwitch({ title, genre, worldView = '', targetPlatform = '', writingStyle = '' }) {
  try {
    const result = await apiFetch('/projects', {
      method: 'POST',
      body: JSON.stringify({ title, genre, worldView, targetPlatform, writingStyle })
    });
    // 创建后直接切换到新项目（复用 dirty 拦截；若用户在拦截里取消，
    // 项目已创建但不切换，消息按实际结果区分）
    await switchProject(result.project.id);
    const switched = store.currentProjectId === result.project.id;
    flashAssist('项目创建完成', switched
      ? `已创建《${result.project.title}》并切换到新项目，可继续新建章节开始写作。`
      : `已创建《${result.project.title}》，可用左上角切换器进入。`);
  } catch (error) {
    flashAssist('项目创建失败', error.message, 'danger');
  }
}

export async function exportProjectFile() {
  if (!store.apiOnline) return flashAssist('项目导出', 'API 未启动，无法导出项目。', 'warning');
  try {
    const data = await apiFetch('/export/project');
    downloadFile(`novel-project-${Date.now()}.json`, JSON.stringify(data, null, 2), 'application/json');
    flashAssist('项目导出完成', `已导出《${data.project.title}》项目快照。`);
  } catch (error) {
    flashAssist('项目导出失败', error.message, 'danger');
  }
}

export async function exportChapterFile() {
  if (!store.apiOnline) return flashAssist('章节导出', 'API 未启动，无法导出章节。', 'warning');
  try {
    const data = await apiFetch(`/export/chapters/${store.activeChapter.id}`);
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
export async function importProjectFile() {
  if (!store.apiOnline) return flashAssist('项目导入', 'API 未启动，无法导入项目。', 'warning');
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
        body: JSON.stringify({ ...payload, mode: choice, projectId: store.state.project ? store.state.project.id : null })
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
        const switched = store.currentProjectId === result.projectId;
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
