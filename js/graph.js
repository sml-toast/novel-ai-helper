// 节点图：静态布局渲染、统计、节点详情与刷新（按 activeGraphType 拉取）。
import { apiFetch } from './api.js';
import { store } from './store.js';
import { fallbackState } from './fallback-data.js';
import { nodePositions, graphTypeLabels } from './constants.js';
import { escapeHtml } from './utils.js';
import { flashAssist } from './ui.js';

export function renderNodeMap(graph = store.state.graph) {
  const nodes = graph?.nodes || [];
  const positioned = nodes.slice(0, 16).map((node, index) => ({ ...node, x: (nodePositions[index] || [80 + (index % 4) * 150, 70 + Math.floor(index / 4) * 105])[0], y: (nodePositions[index] || [80 + (index % 4) * 150, 70 + Math.floor(index / 4) * 105])[1] }));
  const lookup = new Map(positioned.map(node => [node.id, node]));
  const edges = (graph?.edges || []).filter(edge => lookup.has(edge.source) && lookup.has(edge.target));
  document.querySelector('#nodeMap').innerHTML = `
    <svg class="graph-edges" viewBox="0 0 720 360" preserveAspectRatio="none" aria-hidden="true">
      ${edges.map(edge => {
        const source = lookup.get(edge.source);
        const target = lookup.get(edge.target);
        return `<line x1="${source.x + 46}" y1="${source.y + 46}" x2="${target.x + 46}" y2="${target.y + 46}" />`;
      }).join('')}
    </svg>
    ${positioned.map(node => `<button class="node ${node.type === 'core' ? 'core' : ''} node-${node.group}" style="left:${node.x}px;top:${node.y}px" type="button" data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.label)}</button>`).join('')}
  `;
  document.querySelector('#graphStats').innerHTML = renderGraphStats(graph);
  document.querySelector('#graphDetail').textContent = `${graphTypeLabels[graph?.type || store.activeGraphType] || '图谱'} · ${graph?.stats?.nodeCount || positioned.length} 节点 / ${graph?.stats?.edgeCount || edges.length} 连接`;
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
