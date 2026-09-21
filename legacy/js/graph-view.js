// F091 图谱视图层：力导向坐标 → DOM 绘制 + 拖拽固定/平移/缩放交互。
// 选型（SVG vs Canvas）：节点是带 data-node-id 的真实 <button>，events.js 的
// 全局点击委托依赖它（既有契约）；标签换行与无障碍由 DOM 免费获得，Canvas 需
// 自实现命中检测，故保留「DOM 节点 + SVG 边」混合方案。
// 性能预算（200+ 节点）：首屏同步收敛（settle）；交互驱动的精修动画里，大图
//（>100 节点）每帧多 tick 少绘制、边端点隔帧更新、冻结低速节点、跳过未变写入。
import { escapeHtml } from './utils.js';
import { ForceSimulation } from './graph-layout.js';

/** 跨渲染的布局缓存：id → {x, y, fx, fy}，刷新/切类型时节点位置不洗牌 */
const layoutCache = new Map();

export class GraphView {
  constructor() {
    this.container = null;
    this.sim = null;
    this.viewport = null;
    this.nodeEls = new Map();
    this.lineEls = [];
    /** 视图变换：世界坐标 → 屏幕 = 平移(pan) 后缩放(scale)，origin 固定左上角 */
    this.view = { panX: 0, panY: 0, scale: 1 };
    this.rafId = 0;
    this.drag = null;
    this.suppressClick = false;
    this.animatedTicks = 0;
    this.frameNo = 0;
    /** 用户是否手动交互过：收敛后的自动适配视口只对「未交互」生效 */
    this.userMoved = false;
    this.settleMs = null;
    this.settleTicks = 0;
    /** 已绑定交互的容器集合：#nodeMap 是静态 DOM，只绑一次 */
    this.bound = new WeakSet();
  }

  /** 渲染节点图：nodes/edges 为过滤后数据，0 节点渲染占位提示；
   *  每次刷新/切类型都会进来，旧 rAF 循环取消，坐标经 layoutCache 延续。 */
  mount(container, nodes, edges) {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.container = container;
    if (!nodes.length) {
      container.innerHTML = '<p class="graph-empty">当前图谱暂无节点——先在项目中添加角色、知识、时间线或世界观设定。</p>';
      this.sim = null;
      this.viewport = null;
      this.nodeEls.clear();
      this.lineEls = [];
      return;
    }
    // 同步全量收敛再渲染（耗时挂 window.__graphPerf 供冒烟脚本读取）。
    // 为什么不等动画慢慢收敛：收敛期节点持续移动会让「点节点看详情」产生竞态；
    // 238 节点 ~85ms 一次性成本换来确定性渲染。拖拽/解固定仍走 rAF 精修动画。
    const startedAt = performance.now();
    this.sim = new ForceSimulation(nodes, edges, layoutCache);
    this.settleTicks = this.sim.settle(600);
    this.settleMs = performance.now() - startedAt;

    container.innerHTML = `
      <div class="graph-viewport">
        <svg class="graph-edges" aria-hidden="true">
          ${this.sim.edges.map(() => '<line />').join('')}
        </svg>
        ${nodes.map(node => `<button class="node ${node.type === 'core' ? 'core' : ''} node-${escapeHtml(node.group)}${this.sim.isPinned(node.id) ? ' pinned' : ''}" style="transform:translate(-9999px,-9999px)" type="button" data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.label)}</button>`).join('')}
      </div>
      <div class="graph-hint" aria-hidden="true">拖拽节点固定 · 双击解除固定 · 滚轮缩放 · 拖动空白平移</div>`;
    this.viewport = container.querySelector('.graph-viewport');
    this.nodeEls.clear();
    container.querySelectorAll('[data-node-id]').forEach(el => this.nodeEls.set(el.dataset.nodeId, el));
    this.lineEls = [...container.querySelectorAll('.graph-edges line')];
    this.userMoved = false;
    this.frameNo = 0;
    this.animatedTicks = 0;
    this.painted = new Map();
    this.lastLines = [];
    this.fitView();
    this.bind(container);
    this.paint();
    this.reportPerf();
    this.scheduleLoop();
  }

  /** 等比缩放+居中把整图适配进容器（留 7% 边距）。挂载时与收敛完成时各调
   *  一次；用户一旦手动交互（userMoved）即不再自动适配。 */
  fitView() {
    if (!this.sim || !this.container) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.sim.positions.values()) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const cw = this.container.clientWidth || 600;
    const ch = this.container.clientHeight || 400;
    const scale = Math.min(1.35, Math.max(0.1, Math.min((cw * 0.86) / width, (ch * 0.86) / height)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    this.view.scale = scale;
    this.view.panX = cw / 2 - centerX * scale;
    this.view.panY = ch / 2 - centerY * scale;
  }

  /** 重绘一帧：视口变换 + 节点 transform + 边端点，不重建 DOM。
   *  updateLines=false 跳过边端点（大图隔帧更新，SVG 属性写减半）。 */
  paint(updateLines = true) {
    if (!this.viewport || !this.sim) return;
    const { panX, panY, scale } = this.view;
    this.viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    for (const [id, el] of this.nodeEls) {
      const p = this.sim.positions.get(id);
      if (!p) continue;
      // 坐标没变就跳过样式写入：大图收敛后期大量节点已被冻结，帧开销趋近于零
      const prev = this.painted.get(id);
      if (prev && prev[0] === p.x && prev[1] === p.y) continue;
      this.painted.set(id, [p.x, p.y]);
      // 节点中心对准坐标点，直径随 label 自适应（CSS min/max-width）
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    if (!updateLines) return;
    const positions = this.sim.positions;
    for (let i = 0; i < this.lineEls.length; i++) {
      const edge = this.sim.edges[i];
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      const line = this.lineEls[i];
      const prev = this.lastLines[i];
      // 边端点同样做「未变跳过」：与节点缓存同理由
      if (prev && prev[0] === a.x && prev[1] === a.y && prev[2] === b.x && prev[3] === b.y) continue;
      this.lastLines[i] = [a.x, a.y, b.x, b.y];
      line.setAttribute('x1', a.x);
      line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x);
      line.setAttribute('y2', b.y);
    }
    // 每帧回写缓存（开销可忽略），刷新/切类型后位置与固定点可延续
    this.sim.exportTo(layoutCache);
  }

  /** rAF 渲染循环：收敛后自停；交互通过 wake + scheduleLoop 重启 */
  scheduleLoop() {
    if (this.rafId || !this.sim || this.sim.isDone()) return;
    const step = () => {
      this.rafId = 0;
      this.frameNo++;
      const bigGraph = this.sim.positions.size > 100;
      this.sim.tick();
      // 大图每帧 3 个力学 tick 只绘制一次：动画期缩短约 2/3，绘制写入同步减少
      if (bigGraph) {
        this.sim.tick();
        this.sim.tick();
      }
      this.animatedTicks++;
      // 大图边端点隔帧更新：节点实时、边滞后一帧，视觉无感
      this.paint(!bigGraph || this.frameNo % 2 === 0);
      if (this.sim.isDone()) {
        // 收敛后整图再适配一次视口（用户交互过则尊重用户的平移/缩放）
        if (!this.userMoved) this.fitView();
        this.paint();
        this.reportPerf();
      } else {
        this.rafId = requestAnimationFrame(step);
      }
    };
    this.rafId = requestAnimationFrame(step);
  }

  /** 性能数据挂到 window.__graphPerf，冒烟脚本可读取自证（无其他消费方） */
  reportPerf() {
    window.__graphPerf = {
      nodes: this.sim ? this.sim.positions.size : 0,
      edges: this.sim ? this.sim.edges.length : 0,
      settleMs: this.settleMs,
      settleTicks: this.settleTicks,
      animatedTicks: this.animatedTicks,
      done: this.sim ? this.sim.isDone() : false
    };
  }

  /** 屏幕（容器内）坐标 → 世界坐标：先减平移再除缩放，与 paint 互逆 */
  toWorld(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.view.panX) / this.view.scale,
      y: (clientY - rect.top - this.view.panY) / this.view.scale
    };
  }

  /** 以鼠标位置为锚点缩放：锚点的世界坐标在缩放前后保持不动 */
  zoomAt(clientX, clientY, factor) {
    const rect = this.container.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const next = Math.min(2.6, Math.max(0.35, this.view.scale * factor));
    const ratio = next / this.view.scale;
    this.view.panX = cx - (cx - this.view.panX) * ratio;
    this.view.panY = cy - (cy - this.view.panY) * ratio;
    this.view.scale = next;
    this.userMoved = true;
    this.paint();
  }

  /** 交互绑定（每容器一次）：拖拽=固定、双击=解除、空白拖动=平移、滚轮=缩放 */
  bind(container) {
    if (this.bound.has(container)) return;
    this.bound.add(container);
    container.addEventListener('pointerdown', event => this.onPointerDown(event));
    container.addEventListener('pointermove', event => this.onPointerMove(event));
    container.addEventListener('pointerup', () => this.onPointerUp());
    container.addEventListener('pointercancel', () => this.onPointerUp());
    // 拖拽结束后吞掉紧随的 click（捕获拦截），避免「拖完」被当成「点开详情」；
    // setTimeout 兜底复位，防个别浏览器不派发 click 时标志位卡死
    container.addEventListener('click', event => {
      if (!this.suppressClick) return;
      event.stopPropagation();
      event.preventDefault();
      this.suppressClick = false;
    }, true);
    container.addEventListener('dblclick', event => {
      if (!this.sim) return;
      const nodeEl = event.target.closest('[data-node-id]');
      // 双击 = 解除光标下固定的节点；重叠命中上层未固定节点时，就近解 60px 内最近者
      let targetId = null;
      if (nodeEl && this.sim.isPinned(nodeEl.dataset.nodeId)) {
        targetId = nodeEl.dataset.nodeId;
      } else {
        const world = this.toWorld(event.clientX, event.clientY);
        let best = Infinity;
        for (const [id, p] of this.sim.positions) {
          if (!this.sim.isPinned(id)) continue;
          const d = Math.hypot(p.x - world.x, p.y - world.y);
          if (d < best) {
            best = d;
            targetId = id;
          }
        }
        if (best > 60) targetId = null;
      }
      if (!targetId) return;
      this.sim.unpin(targetId);
      this.nodeEls.get(targetId)?.classList.remove('pinned');
      this.sim.wake(0.35);
      this.scheduleLoop();
    });
    // passive: false 才能阻止浏览器缩放手势接管滚轮
    container.addEventListener('wheel', event => {
      event.preventDefault();
      this.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
  }

  onPointerDown(event) {
    if (!this.sim) return;
    const nodeEl = event.target.closest('[data-node-id]');
    if (nodeEl) {
      this.drag = { type: 'node', id: nodeEl.dataset.nodeId, el: nodeEl, moved: false, startX: event.clientX, startY: event.clientY };
      nodeEl.setPointerCapture(event.pointerId);
      return;
    }
    // 空白处：平移画布
    this.drag = { type: 'pan', lastX: event.clientX, lastY: event.clientY };
    this.container.setPointerCapture(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.drag || !this.sim) return;
    if (this.drag.type === 'node') {
      if (Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 4) this.drag.moved = true;
      const world = this.toWorld(event.clientX, event.clientY);
      // 拖动即固定（PRD 语义）；立即 paint 保证跟手，wake 让邻居跟着挪
      this.sim.setPosition(this.drag.id, world.x, world.y, true);
      this.drag.el.classList.add('pinned');
      this.userMoved = true;
      this.sim.wake(0.3);
      this.scheduleLoop();
      this.paint();
      return;
    }
    this.view.panX += event.clientX - this.drag.lastX;
    this.view.panY += event.clientY - this.drag.lastY;
    this.drag.lastX = event.clientX;
    this.drag.lastY = event.clientY;
    this.userMoved = true;
    this.paint();
  }

  onPointerUp() {
    if (!this.drag) return;
    const { type, moved } = this.drag;
    this.drag = null;
    // 移动超过 4px 视为拖拽而非点击：拦截随后派发的 click（同一任务内先于 timeout 触发）
    if (type === 'node' && moved) {
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 0);
    }
  }
}
