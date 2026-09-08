// API 访问层：地址解析 + 统一 fetch 封装（含 F079 项目上下文注入）。

// F074 后 API 默认只监听 127.0.0.1（IPv4 回环）。
// 若继续用 location.hostname 拼接，页面从 localhost 打开时该名称可能被解析为 IPv6 ::1，
// 而 API 并未监听 ::1，会直接连不上。因此固定回连 127.0.0.1。
// 确需指向其他地址时，在页面注入 window.NOVEL_API_HOST 覆盖。
const apiHost = window.NOVEL_API_HOST || '127.0.0.1';
export const apiBase = `${location.protocol}//${apiHost}:${window.NOVEL_API_PORT || 8787}/api/novel`;

import { store } from './store.js';

export async function apiFetch(path, options = {}) {
  // F079：所有请求携带当前项目上下文（?projectId=）。离线兜底时不注入，
  // 让服务端按默认项目回落。注意注入要放在 fetch 之前拼好 URL。
  const scopedPath = store.currentProjectId == null
    ? path
    : `${path}${path.includes('?') ? '&' : '?'}projectId=${store.currentProjectId}`;
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
