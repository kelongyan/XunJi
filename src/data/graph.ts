/**
 * 关系图谱数据构建层（「万卷星图」唯一数据源）
 *
 * 由全站静态词条派生图谱的三类要素：
 * - 词条节点：339 个（类型/朝代/度数，供形状、大小、色彩编码）
 * - 朝代锚点：5 个（固定坐标骨架，沿编年序排开）
 * - 边：词条关系（940 条，经 relationTaxonomy 归一化为 10 族）
 *       + 朝代归属（339 条）——构图骨架，渲染时可降噪
 *
 * 布局约束（供力导向使用）：词条轻微吸附本朝锚点 + 显式关系强弹簧，
 * 从而既有编年骨架感、又有有机星群感（方案 §3.2）。
 */
import { allHistoryEntries } from './index'
import { dynastyThemes, type DynastyTheme } from './dynastyThemes'
import { classifyRelation, type RelationFamily } from './relationTaxonomy'
import type { HistoryEntry } from '../types/history'

export interface GraphNode {
  id: string
  name: string
  /** 'entry' 词条 | 'dynasty' 朝代锚点 */
  kind: 'entry' | 'dynasty'
  type: HistoryEntry['type'] | 'dynasty'
  dynasty: string
  dynastyId: string
  /** 度数（节点尺寸映射） */
  degree: number
  entry?: HistoryEntry
  theme?: DynastyTheme
}

export interface GraphEdge {
  source: string
  target: string
  /** 归一化关系族（视觉编码） */
  family: RelationFamily
  /** 原始关系类型（hover 展示） */
  rawType: string
  /** 'relation' 词条关系 | 'dynasty' 朝代归属 */
  kind: 'relation' | 'dynasty'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** 度数统计（尺寸映射标尺） */
  degreeStats: { min: number; p50: number; p90: number; max: number }
}

/** 朝代锚点固定坐标（编年巨弧：汉最远 → 清最近，微错落避免共线） */
const DYNASTY_ANCHOR_POS: Record<string, [number, number, number]> = {
  han: [-19, 2, -11],
  tang: [-9.5, 4, -3],
  song: [0, 5, 3],
  ming: [9.5, 4, -3],
  qing: [19, 2, -11]
}

export function dynastyAnchorPosition(dynastyId: string): [number, number, number] {
  return DYNASTY_ANCHOR_POS[dynastyId] ?? [0, 4, 0]
}

/** 图谱内置构造（模块级构建一次，图形为静态数据） */
function build(): GraphData {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const byId = new Map<string, HistoryEntry>(allHistoryEntries.map(e => [e.id, e]))

  // ── 度数先行（并入向与出向） ──
  const degree = new Map<string, number>()
  for (const e of allHistoryEntries) {
    for (const r of e.relations ?? []) {
      degree.set(e.id, (degree.get(e.id) ?? 0) + 1)
      degree.set(r.targetId, (degree.get(r.targetId) ?? 0) + 1)
    }
  }

  // ── 词条节点 ──
  for (const e of allHistoryEntries) {
    nodes.push({
      id: e.id,
      name: e.name,
      kind: 'entry',
      type: e.type,
      dynasty: e.dynasty,
      dynastyId: dynastyIdOf(e.dynasty),
      degree: degree.get(e.id) ?? 0,
      entry: e
    })
  }

  // ── 朝代锚点 ──
  for (const theme of dynastyThemes) {
    nodes.push({
      id: `dynasty:${theme.id}`,
      name: theme.hanzi,
      kind: 'dynasty',
      type: 'dynasty',
      dynasty: theme.hanzi,
      dynastyId: theme.id,
      degree: allHistoryEntries.filter(e => dynastyIdOf(e.dynasty) === theme.id).length,
      theme
    })
  }

  // ── 词条关系边（归一化）+ 朝代归属边 ──
  for (const e of allHistoryEntries) {
    const srcDyn = dynastyIdOf(e.dynasty)
    for (const r of e.relations ?? []) {
      const target = byId.get(r.targetId)
      if (!target) continue // 防坏链（audit-relations 保证 0，此处再兜底）
      edges.push({
        source: e.id,
        target: r.targetId,
        family: classifyRelation(r.type),
        rawType: r.type,
        kind: 'relation'
      })
    }
    if (srcDyn) {
      edges.push({
        source: e.id,
        target: `dynasty:${srcDyn}`,
        family: 'connect',
        rawType: '朝代归属',
        kind: 'dynasty'
      })
    }
  }

  // ── 度数标尺 ──
  const degs = nodes.filter(n => n.kind === 'entry').map(n => n.degree).sort((a, b) => a - b)
  const at = (p: number) => degs[Math.min(degs.length - 1, Math.floor(degs.length * p))] ?? 0
  const degreeStats = { min: degs[0] ?? 0, p50: at(0.5), p90: at(0.9), max: degs[degs.length - 1] ?? 1 }

  return { nodes, edges, degreeStats }
}

/** 朝代字段（'明' / '明朝' 等）→ 主题 id（与 dynastyThemes 同规则，避免循环依赖此处内联） */
function dynastyIdOf(hanzi: string | undefined): string {
  if (!hanzi) return 'ming'
  if (hanzi.startsWith('汉')) return 'han'
  if (hanzi.startsWith('唐')) return 'tang'
  if (hanzi.startsWith('宋')) return 'song'
  if (hanzi.startsWith('明')) return 'ming'
  if (hanzi.startsWith('清')) return 'qing'
  return 'ming'
}

export const graphData: GraphData = build()

/** 视图预设（Kumu「视图=规则集合」范式：预设只决定哪些关系族活跃） */
export type GraphView = 'all' | 'political' | 'cultural' | 'military'

export const GRAPH_VIEWS: Array<{ id: GraphView; label: string; note: string }> = [
  { id: 'all', label: '万象', note: '全量关系' },
  { id: 'political', label: '朝局', note: '君臣 · 对立 · 亲缘' },
  { id: 'cultural', label: '文脉', note: '典籍 · 师友 · 类比' },
  { id: 'military', label: '兵戈', note: '军事 · 对立' }
]

/* ── 寻脉：任意两词条间的最短关系链（无向 BFS）── */

export interface PathStep {
  fromId: string
  toId: string
  fromName: string
  toName: string
  family: RelationFamily
  rawType: string
}

/** 无向邻接表（词条关系边，模块级懒构建一次） */
let adjacency: Map<string, Array<{ to: string; family: RelationFamily; rawType: string }> | null> | null = null

function ensureAdjacency() {
  if (adjacency) return
  adjacency = new Map(graphData.nodes.map(n => [n.id, n.kind === 'entry' ? [] : null]))
  for (const e of graphData.edges) {
    if (e.kind !== 'relation') continue
    adjacency.get(e.source)?.push({ to: e.target, family: e.family, rawType: e.rawType })
    adjacency.get(e.target)?.push({ to: e.source, family: e.family, rawType: e.rawType })
  }
}

/**
 * BFS 最短关系链。起点或终点不存在 / 不连通 / 相同时返回 null。
 * 路径长度上限 6 步（「六度分隔」语义）。
 */
export function findPath(fromId: string, toId: string): PathStep[] | null {
  if (!fromId || !toId || fromId === toId) return null
  ensureAdjacency()
  const adj = adjacency!
  if (!adj.get(fromId) || !adj.get(toId)) return null

  const prev = new Map<string, { node: string; family: RelationFamily; rawType: string }>()
  prev.set(fromId, { node: '', family: 'connect', rawType: '' })
  const queue: string[] = [fromId]
  const MAX_DEPTH = 6

  let found = false
  while (queue.length && !found) {
    const cur = queue.shift()!
    const depth = pathDepth(prev, cur)
    if (depth >= MAX_DEPTH) continue
    for (const nb of adj.get(cur) ?? []) {
      if (prev.has(nb.to)) continue
      prev.set(nb.to, { node: cur, family: nb.family, rawType: nb.rawType })
      if (nb.to === toId) {
        found = true
        break
      }
      queue.push(nb.to)
    }
  }
  if (!found) return null

  // 回溯
  const steps: PathStep[] = []
  let cur = toId
  while (cur !== fromId) {
    const p = prev.get(cur)!
    steps.unshift({
      fromId: p.node,
      toId: cur,
      fromName: graphData.nodes.find(n => n.id === p.node)?.name ?? p.node,
      toName: graphData.nodes.find(n => n.id === cur)?.name ?? cur,
      family: p.family,
      rawType: p.rawType
    })
    cur = p.node
  }
  return steps
}

function pathDepth(prev: Map<string, unknown>, id: string): number {
  // 沿 prev 链上溯计深度（BFS 树深度 ≤ 6，代价可忽略）
  let d = 0
  let cur: string | undefined = id
  while (cur) {
    const p = (prev.get(cur) as { node: string } | undefined)
    if (!p || !p.node) break
    d++
    cur = p.node
  }
  return d
}

/** 预置寻脉演示对（演示视频 / 快捷按钮素材，均已实测连通） */
export const PATH_DEMOS: Array<{ from: string; to: string; label: string }> = [
  { from: 'qi-jiguang', to: 'yuefei', label: '戚继光 → 岳飞' },
  { from: 'zhang-juzheng', to: 'wanganshi', label: '张居正 → 王安石' },
  { from: 'libai', to: 'tang-yin', label: '李白 → 唐寅' },
  { from: 'lin-zexu', to: 'zhengchenggong-shoufu-taiwan', label: '林则徐 → 郑成功' }
]
