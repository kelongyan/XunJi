/**
 * 万卷星图 · 共享布局（2D / 3D 渲染层共用）
 *
 * 确定性构图：以本朝锚点为心做螺旋星群初始化，再做 O(n²) 力导向松弛（预热后冻结）。
 * 纯数据模块（无 three 依赖）——3D 场景与 2D 降级画布共用同一空间结构，
 * 保证窄屏降级时星辰相对位置与桌面端一致（空间记忆不丢失）。
 */
import { graphData, dynastyAnchorPosition, TYPE_META, type GraphNode } from './graph'

export interface LayoutNode {
  node: GraphNode
  x: number
  y: number
  z: number
  /** 世界单位半径（渲染层自行换算屏幕像素） */
  size: number
  /** 形状：0=圆(人物) 1=方(帝王) 2=菱(事件) 3=六边(典籍/制度) */
  shape: number
  colorDay: string
  colorNight: string
  /** 索引邻接（高亮/寻路用） */
  neighbors: Set<number>
  /** 仅朝代锚点：本朝词条索引集合（锚点聚焦时高亮本朝） */
  members?: Set<number>
}

export interface GraphLayout {
  nodes: LayoutNode[]
  indexOfId: Map<string, number>
}

/** 确定性 hash（同一词条永远同一扰动，布局可复现） */
function hash01(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

let cached: GraphLayout | null = null

/** 布局构建（模块级缓存一次；数据为静态，构图结果永久稳定） */
export function getGraphLayout(): GraphLayout {
  if (cached) return cached

  const nodes: LayoutNode[] = graphData.nodes.map(n => {
    const meta = TYPE_META[n.type] ?? TYPE_META.figure
    // 朝代锚点用本朝主题色（一朝一色的"定盘星"）
    const anchorColor: [string, string] | null =
      n.kind === 'dynasty' && n.theme ? [n.theme.accent, n.theme.accentNight] : null
    const anchor = n.kind === 'dynasty' ? dynastyAnchorPosition(n.dynastyId) : null
    return {
      node: n,
      x: anchor ? anchor[0] : 0,
      y: anchor ? anchor[1] : 0,
      z: anchor ? anchor[2] : 0,
      size: 0,
      shape: n.kind === 'dynasty' ? 0 : meta.shape,
      colorDay: anchorColor ? anchorColor[0] : meta.day,
      colorNight: anchorColor ? anchorColor[1] : meta.night,
      neighbors: new Set<number>()
    }
  })
  const indexOfId = new Map(nodes.map((p, i) => [p.node.id, i]))

  // 度数（出入向计数，尺寸映射）
  const degree = new Map<string, number>()
  for (const e of graphData.edges) {
    if (e.kind !== 'relation') continue
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  const maxDeg = Math.max(1, ...nodes.map(n => (n.node.kind === 'entry' ? (degree.get(n.node.id) ?? 0) : 0)))
  for (const p of nodes) {
    if (p.node.kind === 'dynasty') {
      p.size = 3.2
    } else {
      const t = Math.sqrt((degree.get(p.node.id) ?? 0) / maxDeg)
      p.size = 0.6 + t * 1.4
    }
  }

  // 邻接（仅词条关系边）
  for (const e of graphData.edges) {
    if (e.kind !== 'relation') continue
    const a = indexOfId.get(e.source)
    const b = indexOfId.get(e.target)
    if (a === undefined || b === undefined) continue
    nodes[a].neighbors.add(b)
    nodes[b].neighbors.add(a)
  }
  // 朝代锚点：成员集合 + 与成员的归属邻接（点击锚点高亮本朝全部词条）
  nodes.forEach((p, i) => {
    if (p.node.kind !== 'dynasty') return
    const members = new Set<number>()
    nodes.forEach((q, j) => {
      if (q.node.kind === 'entry' && q.node.dynastyId === p.node.dynastyId) {
        members.add(j)
        q.neighbors.add(i)
        p.neighbors.add(j)
      }
    })
    p.members = members
  })

  // ── 初始化：词条以本朝锚点为心做螺旋星群（确定性） ──
  const byDyn = new Map<string, number[]>()
  nodes.forEach((p, i) => {
    if (p.node.kind !== 'entry') return
    const arr = byDyn.get(p.node.dynastyId) ?? []
    arr.push(i)
    byDyn.set(p.node.dynastyId, arr)
  })
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (const [dyn, idxs] of byDyn) {
    const anchor = dynastyAnchorPosition(dyn)
    idxs.sort((a, b) => nodes[b].node.degree - nodes[a].node.degree)
    idxs.forEach((i, k) => {
      const r = 1.6 + Math.sqrt(k) * 0.82
      const a = k * golden + hash01(nodes[i].node.id) * 0.6
      const p = nodes[i]
      p.x = anchor[0] + Math.cos(a) * r
      p.y = anchor[1] + (hash01(p.node.id, 7) - 0.5) * 4.6 + Math.sin(k * 0.7) * 0.6
      p.z = anchor[2] + Math.sin(a) * r
    })
  }

  // ── 力导向松弛（确定性，预热后冻结） ──
  const ITER = 150
  const REPULSION = 24
  const SPRING = 0.05
  const SPRING_LEN = 5.2
  // 锚点吸附强于弹簧拉扯：词条紧贴本朝锚点，五团星群沿编年弧排开（编年骨架）
  const ANCHOR_PULL = 0.12
  const CENTER_PULL = 0.0004
  const DAMP = 0.82

  // 弹簧边对（仅词条关系边；无向去重，与邻接集合的锚点归属互不干扰）
  const seenPair = new Set<number>()
  const edgePairs: Array<[number, number]> = []
  for (const e of graphData.edges) {
    if (e.kind !== 'relation') continue
    const a = indexOfId.get(e.source)
    const b = indexOfId.get(e.target)
    if (a === undefined || b === undefined) continue
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const key = lo * nodes.length + hi
    if (seenPair.has(key)) continue
    seenPair.add(key)
    edgePairs.push([lo, hi])
  }

  const vel = nodes.map(() => ({ x: 0, y: 0, z: 0 }))
  const CELL_SIZE = 12
  const cellKey = (x: number, y: number, z: number) => `${x}|${y}|${z}`
  for (let tick = 0; tick < ITER; tick++) {
    // 斥力：空间网格只比较 12 单位作用半径内的邻格，避免全量 O(n²)。
    const grid = new Map<string, number[]>()
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i]
      const key = cellKey(Math.floor(p.x / CELL_SIZE), Math.floor(p.y / CELL_SIZE), Math.floor(p.z / CELL_SIZE))
      const bucket = grid.get(key) ?? []
      bucket.push(i)
      grid.set(key, bucket)
    }
    for (let i = 0; i < nodes.length; i++) {
      const pi = nodes[i]
      const cx = Math.floor(pi.x / CELL_SIZE)
      const cy = Math.floor(pi.y / CELL_SIZE)
      const cz = Math.floor(pi.z / CELL_SIZE)
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        const nearby = grid.get(cellKey(cx + ox, cy + oy, cz + oz)) ?? []
        for (const j of nearby) {
          if (j <= i) continue
          const pj = nodes[j]
        let dx = pi.x - pj.x
        let dy = pi.y - pj.y
        let dz = pi.z - pj.z
        let d2 = dx * dx + dy * dy + dz * dz
        if (d2 < 0.04) {
          const jitter = hash01(pi.node.id + '|' + pj.node.id)
          dx = (jitter - 0.5) * 0.2
          dy = (hash01(pj.node.id, 3) - 0.5) * 0.2
          dz = (hash01(pi.node.id, 9) - 0.5) * 0.2
          d2 = 0.04
        }
        const d = Math.sqrt(d2)
        // 斥力作用半径：远处节点不产生斥力（跨团推挤是星团漂散的根源）
        if (d > 12) continue
        // 力上限钳制：防止近距离处力发散
        const f = Math.min(REPULSION / (d2 * d), 11)
        const fx = dx * f
        const fy = dy * f
        const fz = dz * f
        vel[i].x += fx; vel[i].y += fy; vel[i].z += fz
        vel[j].x -= fx; vel[j].y -= fy; vel[j].z -= fz
        }
      }
    }
    // 弹簧（关系边）
    for (const [i, j] of edgePairs) {
      const p = nodes[i]
      const q = nodes[j]
      const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01
      const f = (d - SPRING_LEN) * SPRING
      const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f
      vel[i].x += fx; vel[i].y += fy; vel[i].z += fz
      vel[j].x -= fx; vel[j].y -= fy; vel[j].z -= fz
    }
    // 锚点吸附 + 向心 + 阻尼 + 速度上限 + 积分
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i]
      // 朝代锚点为固定骨架：不参与位移（斥力把它们推飞是布局漂移的根源）
      if (p.node.kind === 'dynasty') {
        const anchor = dynastyAnchorPosition(p.node.dynastyId)
        p.x = anchor[0]; p.y = anchor[1]; p.z = anchor[2]
        vel[i].x = 0; vel[i].y = 0; vel[i].z = 0
        continue
      }
      const v = vel[i]
      if (p.node.kind === 'entry') {
        const anchor = dynastyAnchorPosition(p.node.dynastyId)
        v.x += (anchor[0] - p.x) * ANCHOR_PULL
        v.y += (anchor[1] - p.y) * ANCHOR_PULL
        v.z += (anchor[2] - p.z) * ANCHOR_PULL
      }
      v.x += -p.x * CENTER_PULL
      v.y += (2 - p.y) * CENTER_PULL * 0.5
      v.z += -p.z * CENTER_PULL
      v.x *= DAMP; v.y *= DAMP; v.z *= DAMP
      const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
      if (!Number.isFinite(speed)) {
        v.x = 0; v.y = 0; v.z = 0
      } else if (speed > 6) {
        const s = 6 / speed
        v.x *= s; v.y *= s; v.z *= s
      }
      p.x += v.x; p.y += v.y; p.z += v.z
    }
  }
  // NaN 兜底（理论不可达，防御性保留）
  for (const p of nodes) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      const anchor = dynastyAnchorPosition(p.node.dynastyId)
      p.x = anchor[0]; p.y = anchor[1]; p.z = anchor[2]
    }
  }

  cached = { nodes, indexOfId }
  return cached
}
