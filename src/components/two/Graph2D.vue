<script setup lang="ts">
/**
 * 万卷星图 · 2D 降级画布（窄屏 / WebGL 不可用时接管）
 * 与 3D 场景共享 graphLayout 布局（星辰相对位置一致，空间记忆不丢失）。
 * Canvas 2D 绘制：边为淡线、节点为形状色点、朝代锚点带汉字。
 * 交互：拖拽平移 / 滚轮与双指缩放 / 点击拾取聚焦（emit focus 与 3D 同协议）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useUiStore } from '../../stores/ui'
import { graphData, nodeTypeLabel, type GraphNode } from '../../data/graph'
import { getGraphLayout } from '../../data/graphLayout'
import { RELATION_HUE, RELATION_HUE_NIGHT, type RelationFamily } from '../../data/relationTaxonomy'

const emit = defineEmits<{
  focus: [node: GraphNode | null]
  ready: []
}>()

const container = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const ui = useUiStore()

interface P2DNode {
  id: string
  node: GraphNode
  x: number
  y: number
  size: number
  shape: number
  colorDay: string
  colorNight: string
  neighbors: Set<number>
  /** 仅朝代锚点：本朝成员 */
  members?: Set<number>
}

let nodes: P2DNode[] = []
let indexOfId = new Map<string, number>()
let edges: Array<{ a: number; b: number; family: string }> = []
/** 视口：世界坐标 → 屏幕 的缩放与平移（世界中心为原点） */
let view = { scale: 1, ox: 0, oy: 0 }
let dragging = false
let dragMoved = 0
let lastPointer = { x: 0, y: 0 }
let focusId: string | null = null
let hoverIdx = -1
let ctx: CanvasRenderingContext2D | null = null
/** rAF 节流：拖拽/缩放/悬停统一走帧驱动 */
let raf = 0
function requestDraw() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    draw()
  })
}

/** 关系族日/夜色速查（与 3D / 图例同源） */
const hueDay = (family: string) => RELATION_HUE[family as RelationFamily] ?? RELATION_HUE.connect
const hueNight = (family: string) => RELATION_HUE_NIGHT[family as RelationFamily] ?? RELATION_HUE_NIGHT.connect

function initNodes() {
  const layout = getGraphLayout()
  nodes = layout.nodes.map(ln => ({
    id: ln.node.id,
    node: ln.node,
    x: ln.x,
    // 俯瞰平面取布局的 x/z（编年弧所在平面），y（高度）压掉
    y: ln.z,
    size: ln.size,
    shape: ln.shape,
    colorDay: ln.colorDay,
    colorNight: ln.colorNight,
    neighbors: ln.neighbors,
    members: ln.members
  }))
  indexOfId = layout.indexOfId
  edges = []
  for (const e of graphData.edges) {
    if (e.kind !== 'relation') continue
    const a = indexOfId.get(e.source)
    const b = indexOfId.get(e.target)
    if (a === undefined || b === undefined) continue
    edges.push({ a, b, family: e.family })
  }
}

/* ── 视图 fitting ── */
function fitView() {
  const el = container.value
  if (!el || !nodes.length) return
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes) {
    // 俯瞰平面：x → x，z → y（压掉高度维度）
    minX = Math.min(minX, n.x - n.size)
    maxX = Math.max(maxX, n.x + n.size)
    minY = Math.min(minY, n.y - n.size)
    maxY = Math.max(maxY, n.y + n.size)
  }
  const w = el.clientWidth
  const h = el.clientHeight
  const scale = Math.min(w / (maxX - minX + 6), h / (maxY - minY + 6)) * 0.92
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  view = { scale, ox: -cx * scale + w / 2, oy: -cy * scale + h / 2 }
}

function toScreen(x: number, z: number): [number, number] {
  return [x * view.scale + view.ox, z * view.scale + view.oy]
}

/* ── 绘制 ── */
const night = () => ui.mode === 'night'

/** 高亮集合：焦点（或悬停）邻域；无 active 时返回 null */
function activeSetOf(): { set: Set<number>; focus: boolean } | null {
  const activeId = focusId ?? (hoverIdx >= 0 ? nodes[hoverIdx].id : null)
  if (!activeId) return null
  const fi = indexOfId.get(activeId)
  if (fi === undefined) return null
  const s = new Set<number>([fi])
  // 朝代锚点：高亮本朝全部成员（与 3D 锚点行为一致）
  const scope = nodes[fi].members ?? nodes[fi].neighbors
  scope.forEach(n => s.add(n))
  return { set: s, focus: focusId !== null }
}

function draw() {
  const cv = canvasRef.value
  const el = container.value
  if (!cv || !el || !ctx) return
  const w = el.clientWidth
  const h = el.clientHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (cv.width !== Math.floor(w * dpr) || cv.height !== Math.floor(h * dpr)) {
    cv.width = Math.floor(w * dpr)
    cv.height = Math.floor(h * dpr)
    cv.style.width = w + 'px'
    cv.style.height = h + 'px'
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const isNight = night()
  const active = activeSetOf()
  const activeSet = active?.set ?? null

  // 边（族色；聚焦时非邻域隐没）
  ctx.lineWidth = 1
  for (const e of edges) {
    const na = nodes[e.a]
    const nb = nodes[e.b]
    const [x1, y1] = toScreen(na.x, na.y)
    const [x2, y2] = toScreen(nb.x, nb.y)
    let alpha = isNight ? 0.3 : 0.22
    if (activeSet) alpha = activeSet.has(e.a) && activeSet.has(e.b) ? 0.8 : active?.focus ? 0.05 : 0.1
    if (e.family === 'connect') alpha *= 0.55
    const base = isNight ? hueNight(e.family) : hueDay(e.family)
    ctx.strokeStyle = hexAlpha(base, alpha)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // 节点
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const [sx, sy] = toScreen(n.x, n.y)
    const r = Math.max(2, n.size * view.scale * 0.8)
    const color = isNight ? n.colorNight : n.colorDay
    let alpha = 1
    if (activeSet && !activeSet.has(i)) alpha = 0.16
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.beginPath()
    drawShape(ctx, sx, sy, r, n.shape)
    ctx.fill()
    // 夜读微光晕：聚焦节点加亮
    if (isNight && alpha === 1) {
      ctx.globalAlpha = activeSet?.has(i) ? 0.4 : 0.22
      ctx.beginPath()
      ctx.arc(sx, sy, r * 1.9, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // 朝代锚点汉字（先节点后字，保证所有字盖在点上）
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.node.kind !== 'dynasty') continue
    const [sx, sy] = toScreen(n.x, n.y)
    const r = Math.max(2, n.size * view.scale * 0.8)
    ctx.globalAlpha = activeSet && !activeSet.has(i) ? 0.3 : 0.95
    ctx.fillStyle = isNight ? '#F4EBDC' : '#2B2620'
    ctx.font = `700 ${Math.max(14, r * 2.2)}px "Songti SC","STSong","SimSun",serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(n.node.name, sx, sy - r - Math.max(10, r * 1.4))
    ctx.globalAlpha = 1
  }

  // 聚焦 / 悬停主题名（跟随节点，便于缩放后辨认）
  const labelIdx = focusId ? indexOfId.get(focusId) : hoverIdx >= 0 ? hoverIdx : undefined
  if (labelIdx !== undefined) {
    const n = nodes[labelIdx]
    const [sx, sy] = toScreen(n.x, n.y)
    const r = Math.max(2, n.size * view.scale * 0.8)
    const label = n.node.name + (n.node.kind === 'entry' ? ' · ' + nodeTypeLabel(n.node.type) : '')
    ctx.font = '600 12px "Source Han Serif SC","Noto Serif SC","Songti SC","SimSun",serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    const tw = ctx.measureText(label).width
    const lx = sx
    const ly = sy - r - 6
    // 纸底衬垫（保证叠在任何线上都可读）
    ctx.globalAlpha = 0.9
    ctx.fillStyle = isNight ? 'rgba(26, 22, 17, 0.85)' : 'rgba(247, 243, 232, 0.88)'
    ctx.fillRect(lx - tw / 2 - 5, ly - 15, tw + 10, 18)
    ctx.globalAlpha = 1
    ctx.fillStyle = isNight ? '#EFE9DC' : '#1F1B16'
    ctx.fillText(label, lx, ly)
  }
}

function drawShape(c: CanvasRenderingContext2D, x: number, y: number, r: number, shape: number) {
  if (shape === 0) {
    c.arc(x, y, r, 0, Math.PI * 2)
  } else if (shape === 1) {
    c.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6)
  } else if (shape === 2) {
    c.moveTo(x, y - r)
    c.lineTo(x + r, y)
    c.lineTo(x, y + r)
    c.lineTo(x - r, y)
    c.closePath()
  } else {
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k - Math.PI / 6
      const px = x + Math.cos(a) * r
      const py = y + Math.sin(a) * r
      if (k === 0) c.moveTo(px, py)
      else c.lineTo(px, py)
    }
    c.closePath()
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* ── 交互 ── */
function pick(clientX: number, clientY: number): number {
  const el = container.value
  if (!el) return -1
  const rect = el.getBoundingClientRect()
  const px = clientX - rect.left
  const py = clientY - rect.top
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < nodes.length; i++) {
    const [sx, sy] = toScreen(nodes[i].x, nodes[i].y)
    const r = Math.max(10, nodes[i].size * view.scale)
    const d = (sx - px) * (sx - px) + (sy - py) * (sy - py)
    if (d < r * r && d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** 双指捏合缩放（移动端降级版的主要缩放手段） */
const touches = new Map<number, { x: number; y: number }>()
let pinchDist = 0

function onPointerDown(e: PointerEvent) {
  dragging = true
  dragMoved = 0
  lastPointer = { x: e.clientX, y: e.clientY }
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.size === 2) {
      const [a, b] = [...touches.values()]
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    /* 忽略 */
  }
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  if (!dragging) {
    // 悬停拾取（桌面端）：变更时重绘
    if (e.pointerType !== 'touch') {
      const idx = pick(e.clientX, e.clientY)
      if (idx !== hoverIdx) {
        hoverIdx = idx
        const el = container.value
        if (el) el.style.cursor = idx >= 0 ? 'pointer' : 'grab'
        requestDraw()
      }
    }
    return
  }
  // 双指捏合
  if (e.pointerType === 'touch' && touches.size === 2) {
    const [a, b] = [...touches.values()]
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    if (pinchDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist)
    pinchDist = d
    dragMoved += 10
    requestDraw()
    return
  }
  const dx = e.clientX - lastPointer.x
  const dy = e.clientY - lastPointer.y
  dragMoved += Math.abs(dx) + Math.abs(dy)
  view.ox += dx
  view.oy += dy
  lastPointer = { x: e.clientX, y: e.clientY }
  requestDraw()
}

function onPointerUp(e: PointerEvent) {
  touches.delete(e.pointerId)
  if (touches.size < 2) pinchDist = 0
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* 忽略 */
  }
  if (!dragging) return
  dragging = false
  if (dragMoved < 8) {
    const idx = pick(e.clientX, e.clientY)
    if (idx >= 0) {
      focusId = nodes[idx].id
      emit('focus', nodes[idx].node)
    } else if (focusId) {
      focusId = null
      emit('focus', null)
    }
    requestDraw()
  }
}

/** 以屏幕点 (px, py) 为锚缩放 */
function zoomAt(px: number, py: number, factor: number) {
  const el = container.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const ax = px - rect.left
  const ay = py - rect.top
  const newScale = Math.min(4, Math.max(0.3, view.scale * factor))
  const k = newScale / view.scale
  view.ox = ax - (ax - view.ox) * k
  view.oy = ay - (ay - view.oy) * k
  view.scale = newScale
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.9 : 1.1)
  requestDraw()
}

/* 外部聚焦（导览/深链）→ 2D 同步高亮 + 通知侧栏（与 3D 同协议） */
function focusNodeById(id: string): boolean {
  if (!indexOfId.has(id)) return false
  focusId = id
  // 若节点在视野外，平移至可见
  const n = nodes[indexOfId.get(id)!]
  const el = container.value
  if (el) {
    const [sx, sy] = toScreen(n.x, n.y)
    if (sx < 0 || sy < 0 || sx > el.clientWidth || sy > el.clientHeight) {
      view.ox += el.clientWidth / 2 - sx
      view.oy += el.clientHeight / 2 - sy
    }
  }
  requestDraw()
  emit('focus', n.node)
  return true
}

function resize() {
  draw()
}

let ro: ResizeObserver | null = null

onMounted(() => {
  initNodes()
  const cv = canvasRef.value
  const el = container.value
  if (!cv || !el) return
  ctx = cv.getContext('2d')
  fitView()
  draw()
  el.style.cursor = 'grab'
  ro = new ResizeObserver(resize)
  ro.observe(el)
  emit('ready')
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  ro?.disconnect()
  ro = null
  ctx = null
  nodes = []
  indexOfId = new Map()
  edges = []
  touches.clear()
})

watch(
  () => ui.mode,
  () => draw()
)

defineExpose({
  focusNodeById,
  /** 与 3D API 对齐的空实现（2D 无相机飞行概念） */
  flyToNode: (id: string) => focusNodeById(id),
  restoreView: () => {
    fitView()
    draw()
  },
  setPath: () => {
    /* 2D 暂不支持寻脉粒子 */
  },
  setView: () => {
    /* 2D 暂不支持视图过滤 */
  },
  clearFocus: () => {
    focusId = null
    requestDraw()
  }
})
</script>

<template>
  <div ref="container" class="absolute inset-0 touch-none select-none" role="img" aria-label="万卷星图（简化二维版）">
    <canvas ref="canvasRef" class="absolute inset-0" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @wheel="onWheel" />
  </div>
</template>
