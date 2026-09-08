// 全局可变应用状态（F089 模块化）。
//
// 原 novel-ai.js 的顶层 let 变量（state / activeChapter / apiOnline /
// activeGraphType / currentProjectId）在 ES module 之间无法跨文件赋值
// （export let 是只读绑定），统一收敛到这个可变对象上，各模块经 store.* 读写。
import { fallbackState } from './fallback-data.js';

export const store = {
  /** 服务端数据（/bootstrap 返回值）；离线时回落到 fallbackState */
  state: fallbackState,
  /** 当前编辑中的章节 */
  activeChapter: fallbackState.chapters[2],
  /** API 是否在线 */
  apiOnline: false,
  /** 当前图谱类型（综合图/知识图/人物图/时间线/世界观） */
  activeGraphType: 'all',
  // F079：当前项目上下文。null = 尚未从服务端获知（首次载入/离线兜底），apiFetch 不注入
  currentProjectId: null,
};
