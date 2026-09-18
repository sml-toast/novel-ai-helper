// @ts-check
// F091 力导向布局：零依赖 Fruchterman-Reingold 简化版（纯数学，不碰 DOM）。
//
// 为什么不引入库：项目「零运行时依赖」是硬约束；知识图谱节点量级在数百以内，
// 简化版 FR（斥力 + 弹簧引力 + 向心力）完全够用。斥力 O(n²)，200 节点约 2 万对
// 浮点运算/tick，实测单 tick 亚毫秒级，无需 Barnes-Hut 网格优化。
//
// 为什么迭代与渲染分离：本模块只维护坐标，DOM 绘制由 graph-view.js 的 rAF 循环
// 驱动。解耦后可以在大图（>100 节点）时降低绘制频率而不影响力学收敛，
// 也便于同步预迭代（settle）做首屏快速收敛与性能测量。

// ── 力学参数（世界坐标 px）──
const REPULSION = 110;        // 斥力强度 k：决定节点间的理想间距
const SPRING_LENGTH = 170;    // 连边的自然长度（弹簧 rest length）
const SPRING_STRENGTH = 0.015;
const GRAVITY_MIN = 0.012;    // 向心引力下限（单节点/极少节点也向原点聚拢）
const GRAVITY_MAX = 30;       // 向心引力上限：防止大图参数过猛导致震荡
const MIN_DISTANCE = 24;      // 斥力分母下限，防止重叠节点产生无穷大斥力
const ALPHA_DECAY = 0.988;    // 温度衰减率：约 380 tick 收敛到停止阈值
const ALPHA_MIN = 0.02;       // 温度低于该值视为收敛，停止迭代
const MAX_STEP = 26;          // 单 tick 最大位移（温度封顶），避免初期弹跳
const FREEZE_ALPHA = 0.25;    // 大图时温度低于该值开始冻结低速节点（性能预算）
const FREEZE_SPEED = 0.5;     // 单 tick 位移小于该值视为已稳定，可冻结

/**
 * 力导向模拟器。
 * 坐标系以世界原点 (0,0) 为图中心，屏幕定位（平移/缩放）由视图层负责。
 *
 * 向心引力按节点数自适应（关键）：斥力总量随 n 线性增长，g 若是常数，
 * 均衡半径 d ≈ k·√(n/g) 会随 n 失控膨胀（实测 n=46 时膨胀到 ±7000px，
 * 节点全部飞出视口）。令 d_eq 收敛到初始落位半径 R=70+11√n，
 * 反解 g = (n-1)·k²/R²，可将整图尺度钉在视口量级。
 */
export class ForceSimulation {
  /**
   * @param {Array<{id: string, label: string}>} nodes 节点列表（0 个则模拟直接收敛）
   * @param {Array<{source: string, target: string}>} edges 边列表
   * @param {Map<string, {x: number, y: number, fx: ?number, fy: ?number}>} [cache]
   *        上一轮布局缓存：同 id 节点沿用旧坐标与固定点，类型切换/刷新不洗牌
   */
  constructor(nodes, edges, cache = new Map()) {
    this.positions = new Map();
    const total = Math.max(nodes.length, 1);
    // 初始落位半径按 √n 增长：面积正比于节点数，节点再多也不会挤成一团；
    // 它同时是力学均衡半径的目标尺度（见 gravity 推导）。基数取 160：
    // 保证小图下均衡间距 > 核心节点半径 64 + 叶子半径 46，节点不与核心圆重叠
    //（实测基数 70 时 2 节点均衡距仅 ~107px，知识节点压住核心节点导致误点击）。
    const radius = 160 + 18 * Math.sqrt(total);
    nodes.forEach((node, index) => {
      const cached = cache.get(node.id);
      if (cached) {
        this.positions.set(node.id, { x: cached.x, y: cached.y, fx: cached.fx ?? null, fy: cached.fy ?? null });
        return;
      }
      // 新节点按黄金角 (2.399963 rad) 螺旋散开，避免与已有节点完全重叠
      const angle = index * 2.399963;
      const r = radius * Math.sqrt((index + 1) / total);
      this.positions.set(node.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r, fx: null, fy: null });
    });
    // 只保留两端都存在的边：类型过滤后的边可能引用被过滤掉的节点
    this.edges = edges.filter(edge => this.positions.has(edge.source) && this.positions.has(edge.target));
    this.alpha = nodes.length ? 1 : 0;
    this.gravity = nodes.length > 1
      ? Math.min(GRAVITY_MAX, ((nodes.length - 1) * REPULSION * REPULSION) / (radius * radius))
      : GRAVITY_MIN;
    /** 已冻结节点集合：大图收敛后期跳过低速节点的积分（受力仍参与） */
    this.frozen = new Set();
  }

  /** 推进一个力学 tick；alpha 归零后调用是安全的（空操作） */
  tick() {
    if (this.alpha <= 0) return;
    const positions = this.positions;
    const ids = [...positions.keys()];
    const alpha = this.alpha;
    const freezeEnabled = ids.length > 100 && alpha < FREEZE_ALPHA;
    const disp = new Map();
    for (const id of ids) disp.set(id, { x: 0, y: 0 });

    // 1) 斥力：所有节点两两排斥（FR 核心），有连线也不例外——连线靠弹簧平衡
    for (let i = 0; i < ids.length; i++) {
      const a = positions.get(ids[i]);
      for (let j = i + 1; j < ids.length; j++) {
        const b = positions.get(ids[j]);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          // 完全重叠：给一个确定性的小抖动，避免除零后原地卡死
          dx = (i % 2 ? 1 : -1) * 0.7;
          dy = (j % 2 ? -1 : 1) * 0.7;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const force = (REPULSION * REPULSION) / Math.max(d, MIN_DISTANCE);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        const da = disp.get(ids[i]);
        const db = disp.get(ids[j]);
        da.x += fx;
        da.y += fy;
        db.x -= fx;
        db.y -= fy;
      }
    }

    // 2) 弹簧引力：连边节点相互吸引到自然长度
    for (const edge of this.edges) {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (d - SPRING_LENGTH) * SPRING_STRENGTH;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      const da = disp.get(edge.source);
      const db = disp.get(edge.target);
      da.x += fx;
      da.y += fy;
      db.x -= fx;
      db.y -= fy;
    }

    // 3) 向心引力（g 随 n 自适应，见类注释）：孤立节点也由此获得合理位置
    for (const id of ids) {
      const p = positions.get(id);
      const d = disp.get(id);
      d.x -= p.x * this.gravity;
      d.y -= p.y * this.gravity;
    }

    // 4) 积分：温度封顶限幅 + 大图低速冻结
    for (const id of ids) {
      const p = positions.get(id);
      // 被拖拽/固定的节点钉在原地，不参与积分（但它的斥力/弹簧仍作用于别人）
      if (p.fx !== null) {
        p.x = p.fx;
        p.y = p.fy;
        continue;
      }
      const d = disp.get(id);
      const speed = Math.hypot(d.x, d.y);
      if (freezeEnabled && speed < FREEZE_SPEED) this.frozen.add(id);
      if (this.frozen.has(id)) continue;
      const scale = Math.min(speed, MAX_STEP * alpha) / (speed || 1);
      p.x += d.x * scale;
      p.y += d.y * scale;
    }

    this.alpha *= ALPHA_DECAY;
    if (this.alpha < ALPHA_MIN) this.alpha = 0;
  }

  /** 是否已收敛（alpha 归零） */
  isDone() {
    return this.alpha <= 0;
  }

  /**
   * 同步预迭代：首屏先快速收敛一大段，再交给 rAF 循环做剩余动画，
   * 避免用户盯着节点从初始螺旋慢慢飞到位，也便于测量布局耗时。
   * @returns {number} 实际执行的 tick 数
   */
  settle(maxTicks = 130) {
    let count = 0;
    while (count < maxTicks && this.alpha > 0) {
      this.tick();
      count++;
    }
    return count;
  }

  /**
   * 设定节点坐标；pin=true 时钉住该节点（fx/fy 生效后不再参与力学迭代）
   */
  setPosition(id, x, y, pin = true) {
    const p = this.positions.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    if (pin) {
      p.fx = x;
      p.fy = y;
    }
  }

  /** 解除固定（双击节点）：恢复参与力学迭代 */
  unpin(id) {
    const p = this.positions.get(id);
    if (!p) return;
    p.fx = null;
    p.fy = null;
  }

  isPinned(id) {
    const p = this.positions.get(id);
    return !!p && p.fx !== null;
  }

  /**
   * 交互后唤醒模拟：清空冻结集、把温度抬到不低于 minAlpha，
   * 让拖拽邻居、解除固定等操作能重新引发局部重排。
   */
  wake(minAlpha = 0.3) {
    this.frozen.clear();
    this.alpha = Math.max(this.alpha, minAlpha);
  }

  /** 把当前坐标（含固定点）回写缓存，供下一次渲染沿用 */
  exportTo(cache) {
    for (const [id, p] of this.positions) cache.set(id, { x: p.x, y: p.y, fx: p.fx, fy: p.fy });
  }
}
