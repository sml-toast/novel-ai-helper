// @ts-check
// 通用纯函数工具：HTML 转义、日期格式化、文件下载。

// ── HTML sanitization ──
export function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

export function formatDate(value) {
  if (!value) return '未设定';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

/** 本地草稿时间戳展示：非法值回退到原始字符串，不要显示 Invalid Date */
export function formatDateTime(value) {
  if (!value) return '未知时间';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
}

export function downloadFile(filename, content, type) {
  downloadBlob(filename, new Blob([content], { type }));
}

/**
 * Blob 版下载（F092）：DOCX/EPUB 是二进制，不能走字符串拼装。
 * downloadFile 现在委托到这里，两条入口共享同一段 DOM 下载逻辑。
 */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
