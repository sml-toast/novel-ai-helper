// @ts-check
// 节点图：数据拉取、统计与节点详情。布局与交互（力导向/拖拽/缩放）在
// graph-view.js / graph-layout.js —— 本模块保持对外契约不变：
// renderNodeMap(graph) 渲染入口、showNodeDetail(nodeId) 供 events.js 点击委托调用。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { fallbackState } from './fallback-data.js';
import { graphTypeLabels } from './constants.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';
import { GraphView } from './graph-view.js';

// F091：图谱视图单例。坐标缓存与固定状态由 GraphView/layoutCache 会话内延续，
// 类型过滤只影响传入的 nodes/edges（服务端 /graph?type= 已过滤，前端不再截断）。
const graphView = new GraphView();

export function renderNodeMap(graph = store.state.graph) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  const container = document.querySelector('#nodeMap');
  graphView.mount(container, nodes, edges);
  document.querySelector('#graphStats').innerHTML = renderGraphStats(graph);
  document.querySelector('#graphDetail').textContent = `${graphTypeLabels[graph?.type || store.activeGraphType] || '图谱'} · ${graph?.stats?.nodeCount || nodes.length} 节点 / ${graph?.stats?.edgeCount || edges.length} 连接`;
}

function renderGraphStats(graph = {}) {
  const stats = graph.stats || { nodeCount: graph.nodes?.length || 0, edgeCount: graph.edges?.length || 0, groups: {} };
  return [
    ['节点', stats.nodeCount],
    ['连接', stats.edgeCount],
    ['知识', stats.groups?.knowledge || 0],
    ['人物', stats.groups?.character || 0],
    ['世界', stats.groups?.world || 0]
  ].map(([label, value]) => `<span>${label}<strong>${value}</strong></span>`).join('');
}

export function showNodeDetail(nodeId) {
  const node = (store.state.graph?.nodes || []).find(item => item.id === nodeId);
  if (!node) return;
  document.querySelector('#graphDetail').innerHTML = `<strong>${escapeHtml(node.label)}</strong><span>${escapeHtml(node.type)} · ${escapeHtml(node.group)}</span><p>${escapeHtml(node.detail || '暂无详情')}</p>`;
}

export async function refreshGraph() {
  if (!store.apiOnline) {
    renderNodeMap(fallbackState.graph);
    flashAssist('节点图已刷新', '当前为本地演示图谱。');
    return;
  }
  try {
    const graph = await apiFetch(`/graph?type=${encodeURIComponent(store.activeGraphType)}`);
    store.state.graph = graph;
    renderNodeMap(graph);
    flashAssist('节点图已刷新', `已加载 ${graph.nodes.length} 个节点、${graph.edges.length} 条连接。`);
  } catch (error) {
    flashAssist('节点图刷新失败', error.message, 'danger');
  }
}
