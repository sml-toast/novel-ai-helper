/**
 * server/novel-project.js —— 多项目上下文解析（T011 / 需求 F079）
 *
 * 纯函数，不碰数据库：项目存在性校验在 novel-db.js 的 projectExists，
 * 这样解析规则可以独立单测/审查。
 *
 * 解析优先级（与增量设计文档 §2.3.2 方案 B+C 一致）：
 *   1. ?projectId= 查询参数（主通道：GET/POST 统一、浏览器可缓存、curl 可调试）
 *   2. X-Project-Id 请求头（补充通道：URL 干净）
 *   3. fallbackId（调用方传入的默认项目，向后兼容旧请求 —— 零破坏）
 *
 * 格式约定：非正整数格式（如 abc / -1 / 1.5）视为「未提供」而回落 fallback，
 * 不报错 —— 与「不存在的项目」区分开（后者必须显式 404，见 novel-api.js），
 * 静默回落只允许发生在「调用方没表达意图」时，不允许发生在「意图指向虚空」时。
 */

const NUMERIC = /^\d+$/;

export function resolveProjectId(url, req, fallbackId = null) {
  const fromQuery = url.searchParams.get('projectId');
  if (fromQuery && NUMERIC.test(fromQuery)) return Number(fromQuery);

  const fromHeader = req.headers['x-project-id'];
  if (fromHeader && NUMERIC.test(String(fromHeader))) return Number(fromHeader);

  return fallbackId;
}
