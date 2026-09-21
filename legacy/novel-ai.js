// F089 前端模块化重构：本文件由约 2400 行单文件拆分为 js/ 下的 ES module 树。
// 此处仅保留薄入口：导入即完成全部事件绑定与副作用初始化（js/events.js），
// 随后启动首屏数据加载。浏览器直接 <script type="module" src="./novel-ai.js"> 加载，
// 无构建步骤、无打包器（零依赖约束不变）。
import './js/events.js';
import { loadBootstrap } from './js/app.js';

loadBootstrap();
