// 多格式导出（F092）：格式选择 + 导出选项弹窗 → 拉取附件 → 触发浏览器下载。
// 勾选项不持久化（PRD 口径：默认全选）；文件名由服务端生成（<项目名>-<格式>-<日期>）。
import { apiBase } from './api.js';
import { store } from './store.js';
import { flashAssist } from './ui.js';
import { showModal } from './modal.js';
import { downloadBlob } from './utils.js';

/** 服务端支持的三种格式（与 novel-api.js 的导出路由一致） */
const FORMATS = [
  { value: 'markdown', label: 'Markdown（.md）' },
  { value: 'docx', label: 'Word 文档（.docx）' },
  { value: 'epub', label: 'EPUB 电子书（.epub）' }
];

/** 四个可勾选附录（默认全选，与服务端缺省一致） */
const OPTION_FIELDS = [
  { name: 'annotations', label: '批注' },
  { name: 'glossary', label: '术语表' },
  { name: 'timeline', label: '时间线' },
  { name: 'foreshadows', label: '伏笔清单' }
];

/**
 * 从 Content-Disposition 提取 RFC 5987 filename*（服务端用 UTF-8 编码中文名）。
 * @param {Response} response
 * @returns {string|null}
 */
function filenameFromHeader(response) {
  const header = response.headers.get('content-disposition') || '';
  const match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 打开多格式导出弹窗并执行导出。
 * data-action="export-multi" 的入口；单章勾选只对当前章节生效。
 */
export async function openExportMenu() {
  if (!store.apiOnline) return flashAssist('多格式导出', 'API 未启动，无法导出。', 'warning');
  const choice = await showModal({
    title: '多格式导出',
    bodyHtml: `<div class="form-grid">
        ${FORMATS.map((format, index) => `
          <label class="export-option">
            <input type="radio" name="exportFormat" value="${format.value}"${index === 0 ? ' checked' : ''} />
            ${format.label}
          </label>`).join('')}
        ${OPTION_FIELDS.map(field => `
          <label class="export-option">
            <input type="checkbox" name="exportOption" value="${field.name}" checked />
            含${field.label}
          </label>`).join('')}
        <label class="export-option">
          <input type="checkbox" name="exportSingleChapter" />
          仅导出当前章节（否则导出全书）
        </label>
      </div>`,
    actions: [
      { label: '导出', value: 'export', variant: 'primary-btn' },
      { label: '取消', value: 'cancel' }
    ]
  });
  if (choice !== 'export') return;

  const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'markdown';
  const options = [...document.querySelectorAll('input[name="exportOption"]:checked')].map(input => input.value);
  const single = document.querySelector('input[name="exportSingleChapter"]')?.checked;

  // 服务端缺省 = 全选；取消勾选的选项显式传 0
  const params = new URLSearchParams({ projectId: String(store.currentProjectId || '') });
  for (const field of OPTION_FIELDS) params.set(field.name, options.includes(field.name) ? '1' : '0');
  if (single && store.activeChapter) params.set('chapterId', String(store.activeChapter.id));

  flashAssist('开始导出', `正在生成 ${format.toUpperCase()} 文件……`);
  try {
    const response = await fetch(`${apiBase}/export/${format}?${params.toString()}`);
    if (!response.ok) throw new Error(`API ${response.status}`);
    const filename = filenameFromHeader(response) || `novel-export-${Date.now()}.${format}`;
    downloadBlob(filename, await response.blob());
    flashAssist('导出完成', `已下载 ${filename}。`);
  } catch (error) {
    flashAssist('导出失败', error.message, 'danger');
  }
}
