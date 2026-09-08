/**
 * server/novel-date.js —— 本地日期工具（F086 连续打卡）
 *
 * 为什么单独抽一个文件：连续打卡 / 日历热力图统计的是「作者感知的一天」，
 * 而 `new Date().toISOString().slice(0, 10)` 取的是 **UTC 日期**，两者最多差一天：
 *   - 东八区清晨 07:00 写作 → UTC 是前一天 23:00 → 被算到「昨天」，今天漏打卡
 *   - 西五区晚间 20:00 写作 → UTC 是次日 01:00 → 被算到「明天」，今天同样漏打卡
 * 结果是「我天天在写，连续天数却老是断」。因此凡是「写作日」一律用本地日期。
 *
 * 跨天推进（shiftDate/diffDays）刻意锚定在 **UTC 正午** 再换算，而不是直接
 * 给本地时间戳加减 24h：夏令时切换日只有 23 或 25 小时，直接加减会跳日或原地踏步。
 *
 * 零依赖：只用 Date 的原生能力。
 */

/** 一天的毫秒数（仅用于「按天平移」，不用于跨时区换算） */
const MS_PER_DAY = 86400000;

/** 'YYYY-MM-DD' 严格匹配：拒绝 '2026-9-8'、'2026-09-08T10:00' 等非日期串 */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 补零到两位 */
function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * 取本地时区的日期串 'YYYY-MM-DD'。
 * @param {Date|string|number} [input=new Date()] 时间；字符串按 Date 规则解析（ISO 串按 UTC 解析后转本地）
 * @returns {string} 'YYYY-MM-DD'；无法解析时返回空串
 */
export function localDate(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 把 'YYYY-MM-DD' 解析成 UTC 正午的 Date。
 * 正午是刻意的：距离任一时区的日界都有 12 小时余量，夏令时 ±1h 不会跨日。
 * @returns {Date|null} 非法输入返回 null
 */
function parseDateAsUtcNoon(value) {
  const match = DATE_PATTERN.exec(String(value ?? ''));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

/**
 * 日期平移。days 为负表示往前推。
 * @param {string} value 'YYYY-MM-DD'
 * @param {number} [days=0]
 * @returns {string} 'YYYY-MM-DD'；非法输入返回空串
 */
export function shiftDate(value, days = 0) {
  const base = parseDateAsUtcNoon(value);
  if (!base) return '';
  return new Date(base.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * 两个日期相差的天数（to - from）。
 * @param {string} from 'YYYY-MM-DD'
 * @param {string} to 'YYYY-MM-DD'
 * @returns {number} 整数天数；任一非法返回 0
 */
export function diffDays(from, to) {
  const start = parseDateAsUtcNoon(from);
  const end = parseDateAsUtcNoon(to);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}
