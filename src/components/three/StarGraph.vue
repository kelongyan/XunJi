<script setup lang="ts">
/**
 * 万卷星图 · 3D 关系图谱场景
 *
 * 构图：五朝锚点沿编年巨弧排开，339 词条如星群环拱本朝锚点，940 条关系为星光。
 * 技术：自写确定性 3D 力导向（初始化螺旋 + O(n²) 松弛，一次性预计算）；
 *       节点 Points 单 draw call（形状 SDF + 假光晕）；边为弧形 LineSegments（顶点色）。
 * 双态：uNight uniform 与 CSS token 同步（日读墨色星图 / 夜读灯火夜空）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { useThreeScene } from '../../composables/useThreeScene'
import { useUiStore } from '../../stores/ui'
import { graphData, dynastyAnchorPosition, type GraphNode, type GraphView, type PathStep } from '../../data/graph'
import { dynastyThemes } from '../../data/dynastyThemes'

const emit = defineEmits<{
  focus: [node: GraphNode | null]
  hover: [node: GraphNode | null]
  fallback: []
  ready: []
}>()

const container = ref<HTMLElement | undefined>()
const labelLayer = ref<HTMLDivElement | undefined>()
const ui = useUiStore()
const { supported, getHandle } = useThreeScene(container, { fov: 42, near: 0.5, far: 400 })

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ── 中文标签层（P1）：焦点邻域 DOM 投影，池化 ≤48 个 ── */
let labelPool: HTMLDivElement[] = []
let activeLabelIdxs: number[] = []
const LABEL_POOL_SIZE = 48

function buildLabelPool() {
  const layer = labelLayer.value
  if (!layer) return
  layer.innerHTML = ''
  labelPool = []
  for (let i = 0; i < LABEL_POOL_SIZE; i++) {
    const el = document.createElement('div')
    el.className = 'sg-label'
    el.style.display = 'none'
    layer.appendChild(el)
    labelPool.push(el)
  }
}

/** focus/hover/path 变化时更新标签文本与显隐 */
function updateLabelContent() {
  if (!labelPool.length) return
  const idxs: number[] = []
  if (pathNodeSet) {
    idxs.push(...pathNodeSet)
  } else if (focusIdx >= 0) {
    idxs.push(focusIdx, ...packed[focusIdx].neighbors)
  } else if (hoverIdx >= 0) {
    idxs.push(hoverIdx)
  }
  activeLabelIdxs = idxs.slice(0, LABEL_POOL_SIZE)
  labelPool.forEach((el, i) => {
    const idx = activeLabelIdxs[i]
    if (idx === undefined) {
      el.style.display = 'none'
      return
    }
    el.textContent = packed[idx].node.name
    el.className = 'sg-label' + (idx === focusIdx ? ' sg-label-focus' : '')
    el.style.display = 'block'
  })
}

const _lTmp = new THREE.Vector3()
function updateLabelPositions() {
  if (!labelPool.length || !cameraRef || !container.value) return
  const w = container.value.clientWidth
  const h = container.value.clientHeight
  for (let i = 0; i < activeLabelIdxs.length; i++) {
    const el = labelPool[i]
    if (el.style.display === 'none') continue
    _lTmp.copy(packed[activeLabelIdxs[i]].pos).project(cameraRef)
    if (_lTmp.z > 1) {
      el.style.display = 'none'
      continue
    }
    const x = (_lTmp.x * 0.5 + 0.5) * w
    const y = (-_lTmp.y * 0.5 + 0.5) * h
    el.style.transform = `translate(-50%, -150%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
  }
}

/* ── 色板（与 style.css token / dynastyThemes 对应）── */
const DAY = {
  ink: new THREE.Color('#3D372F'),
  edge: new THREE.Color('#8C8378'),
  bg: new THREE.Color('#F7F3E8')
}
const NIGHT = {
  ink: new THREE.Color('#EFE9DC'),
  edge: new THREE.Color('#8B8070'),
  bg: new THREE.Color('#1A1611')
}

/** 类型基色（日读低饱和 / 夜读提亮）——形状为主编码、色彩为辅 */
const TYPE_COLORS: Record<string, [number, number]> = {
  emperor: [0x9c4a3c, 0xe8846b],
  figure: [0x4a6478, 0x8fb4d4],
  event: [0x8a7550, 0xdcc08a],
  classic: [0x5a7263, 0x9dc2ac],
  system: [0x6b6459, 0xbdb4a4]
}
/** 节点形状：0=圆 1=方 2=菱形 3=六边形 */
const TYPE_SHAPE: Record<string, number> = {
  figure: 0,
  emperor: 1,
  event: 2,
  classic: 3,
  system: 3
}

interface PackedNode {
  node: GraphNode
  pos: THREE.Vector3
  size: number
  shape: number
  colorDay: THREE.Color
  colorNight: THREE.Color
  highlight: number
  /** 邻接（高亮用） */
  neighbors: Set<number>
}

let packed: PackedNode[] = []
let indexOfId = new Map<string, number>()
let pointsMesh: THREE.Points | null = null
let pointsGeo: THREE.BufferGeometry | null = null
let edgeMesh: THREE.LineSegments | null = null
let edgeGeo: THREE.BufferGeometry | null = null
let anchorLabels: THREE.Sprite[] = []
let starDust: THREE.Points | null = null
let material: THREE.ShaderMaterial | null = null
let sceneRef: THREE.Scene | null = null
let cameraRef: THREE.PerspectiveCamera | null = null

/* 寻脉路径状态（P1） */
let pathEdgeSet: Set<number> | null = null
let pathNodeSet: Set<number> | null = null
let pathParticles: THREE.Points | null = null
let pathParticleGeo: THREE.BufferGeometry | null = null
let particleState: Array<{ edgeIdx: number; t: number; speed: number }> = []

/* 视图预设（P1） */
let viewMode: GraphView = 'all'
const VIEW_FAMILIES: Record<GraphView, Set<string> | null> = {
  all: null,
  political: new Set(['liege', 'rival', 'kindred']),
  cultural: new Set(['cultural', 'ally', 'analogy']),
  military: new Set(['martial', 'rival'])
}

/* 交互状态 */
let camState = { theta: 0.55, phi: 1.1, radius: 46, thetaT: 0.55, phiT: 1.1, radiusT: 44 }
/** 相机注视目标（自适应取景时更新为布局包围盒中心） */
const camTarget = new THREE.Vector3(0, 2, 0)
/** 注视目标的目的地（寻脉/复位时平滑飞行） */
const camTargetT = new THREE.Vector3(0, 2, 0)
/** 全景取景默认值（退出寻脉时恢复） */
const homeTarget = new THREE.Vector3(0, 2, 0)
let homeRadius = 50
let dragging = false
let dragMoved = 0
let dragStart = { x: 0, y: 0 }
let hoverIdx = -1
let focusIdx = -1

/* ── 确定性布局 ── */
function hash01(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

function computeLayout() {
  const nodes = graphData.nodes
  packed = nodes.map(n => {
    // 类型色
    const [day, night] = TYPE_COLORS[n.type] ?? TYPE_COLORS.system
    const anchor = n.kind === 'dynasty' ? dynastyAnchorPosition(n.dynastyId) : null
    return {
      node: n,
      pos: anchor ? new THREE.Vector3(...anchor) : new THREE.Vector3(0, 0, 0),
      size: 0,
      shape: n.kind === 'dynasty' ? 0 : (TYPE_SHAPE[n.type] ?? 0),
      colorDay: new THREE.Color(day),
      colorNight: new THREE.Color(night),
      highlight: 1,
      neighbors: new Set<number>()
    }
  })
  indexOfId = new Map(packed.map((p, i) => [p.node.id, i]))

  // 边表（数值索引）
  const edgeIdx: Array<[number, number, string]> = []
  const adj = packed.map(p => p.neighbors)
  for (const e of graphData.edges) {
    const a = indexOfId.get(e.source)
    const b = indexOfId.get(e.target)
    if (a === undefined || b === undefined) continue
    edgeIdx.push([a, b, e.kind])
    adj[a].add(b)
    adj[b].add(a)
  }

  // 尺寸：世界单位半径（相机距离 ~52 时约 1 单位 ≈ 10px @1100px 高）
  // 词条半径 0.6 ~ 2.0；朝代锚点 3.2
  const maxDeg = Math.max(1, graphData.degreeStats.max)
  for (const p of packed) {
    if (p.node.kind === 'dynasty') {
      p.size = 3.2
    } else {
      const t = Math.sqrt(p.node.degree / maxDeg)
      p.size = 0.6 + t * 1.4
    }
  }

  // 初始化：词条以本朝锚点为心做螺旋星群（确定性、无随机）
  const byDyn = new Map<string, number[]>()
  packed.forEach((p, i) => {
    if (p.node.kind !== 'entry') return
    const arr = byDyn.get(p.node.dynastyId) ?? []
    arr.push(i)
    byDyn.set(p.node.dynastyId, arr)
  })
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (const [dyn, idxs] of byDyn) {
    const anchor = dynastyAnchorPosition(dyn)
    // 度数大的靠内
    idxs.sort((a, b) => packed[b].node.degree - packed[a].node.degree)
    idxs.forEach((i, k) => {
      const r = 1.6 + Math.sqrt(k) * 0.82
      const a = k * golden + hash01(packed[i].node.id) * 0.6
      const p = packed[i]
      p.pos.set(
        anchor[0] + Math.cos(a) * r,
        anchor[1] + (hash01(p.node.id, 7) - 0.5) * 4.6 + Math.sin(k * 0.7) * 0.6,
        anchor[2] + Math.sin(a) * r
      )
    })
  }

  // 力导向松弛（确定性）
  const ITER = reducedMotion ? 60 : 150
  const pos = packed.map(p => p.pos)
  const vel = packed.map(() => new THREE.Vector3())
  const REPULSION = 24
  const SPRING = 0.05
  const SPRING_LEN = 5.2
  const ANCHOR_PULL = 0.014
  const CENTER_PULL = 0.0008
  const DAMP = 0.82

  for (let tick = 0; tick < ITER; tick++) {
    // 斥力（O(n²)，一次性预算）
    for (let i = 0; i < packed.length; i++) {
      const pi = pos[i]
      for (let j = i + 1; j < packed.length; j++) {
        const pj = pos[j]
        let dx = pi.x - pj.x
        let dy = pi.y - pj.y
        let dz = pi.z - pj.z
        let d2 = dx * dx + dy * dy + dz * dz
        if (d2 < 0.04) {
          // 距离过近：给一个确定性的微扰方向，避免力发散
          const jitter = hash01(packed[i].node.id + '|' + packed[j].node.id)
          dx = (jitter - 0.5) * 0.2
          dy = (hash01(packed[j].node.id, 3) - 0.5) * 0.2
          dz = (hash01(packed[i].node.id, 9) - 0.5) * 0.2
          d2 = 0.04
        }
        const d = Math.sqrt(d2)
        // 力上限钳制：防止近距离处力发散（d^3 分母）
        const f = Math.min(REPULSION / (d2 * d), 24)
        const fx = dx * f
        const fy = dy * f
        const fz = dz * f
        vel[i].x += fx; vel[i].y += fy; vel[i].z += fz
        vel[j].x -= fx; vel[j].y -= fy; vel[j].z -= fz
      }
    }
    // 弹簧（关系边）
    for (const [a, b] of edgeIdx) {
      const pa = pos[a]
      const pb = pos[b]
      const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01
      const f = (d - SPRING_LEN) * SPRING
      const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f
      vel[a].x += fx; vel[a].y += fy; vel[a].z += fz
      vel[b].x -= fx; vel[b].y -= fy; vel[b].z -= fz
    }
    // 锚点吸附 + 中心向心 + 阻尼 + 积分
    for (let i = 0; i < packed.length; i++) {
      const p = packed[i]
      const v = vel[i]
      if (p.node.kind === 'entry') {
        const anchor = dynastyAnchorPosition(p.node.dynastyId)
        v.x += (anchor[0] - pos[i].x) * ANCHOR_PULL
        v.y += (anchor[1] - pos[i].y) * ANCHOR_PULL
        v.z += (anchor[2] - pos[i].z) * ANCHOR_PULL
      }
      v.x += -pos[i].x * CENTER_PULL
      v.y += (2 - pos[i].y) * CENTER_PULL * 0.5
      v.z += -pos[i].z * CENTER_PULL
      v.multiplyScalar(DAMP)
      // 速度上限：防数值溢出（配合斥力钳制，双保险）
      const speed = v.length()
      if (!Number.isFinite(speed)) {
        v.set(0, 0, 0)
      } else if (speed > 6) {
        v.multiplyScalar(6 / speed)
      }
      pos[i].add(v)
    }
  }
  packed.forEach((p, i) => {
    const v = pos[i]
    // 兜底：任何非有限值回落锚点（防 NaN 传染到几何）
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
      const anchor = dynastyAnchorPosition(p.node.dynastyId)
      v.set(anchor[0], anchor[1], anchor[2])
    }
    p.pos.copy(v)
  })
}

/* ── 自适应取景：按布局包围盒计算注视点与相机距离（保证全图入画且不浪费画幅）── */
function frameLayout() {
  if (!packed.length) return
  const box = new THREE.Box3()
  for (const p of packed) {
    // 计入节点自身半径，避免边缘星辰被裁切
    box.expandByPoint(p.pos.clone().addScalar(p.size * 1.1))
    box.expandByPoint(p.pos.clone().addScalar(-p.size * 1.1))
  }
  box.getCenter(camTarget)
  const size = box.getSize(new THREE.Vector3())
  const fov = (42 * Math.PI) / 180
  const aspect = Math.max(0.6, (container.value?.clientWidth ?? 1200) / (container.value?.clientHeight ?? 700))
  // 环绕视角下，水平约束取 x/z 较大者
  const halfY = size.y / 2
  const halfX = Math.max(size.x, size.z) / 2
  const dV = halfY / Math.tan(fov / 2)
  const dH = halfX / (Math.tan(fov / 2) * aspect)
  const dist = Math.max(dV, dH) * 1.12
  camState.radius = dist * 1.02
  camState.radiusT = dist * 0.94
  homeTarget.copy(camTarget)
  camTargetT.copy(camTarget)
  homeRadius = camState.radiusT
}

/* ── 节点 shader（形状 SDF + 假光晕）── */
const NODE_VERT = /* glsl */ `
attribute float aSize;
attribute float aShape;
attribute float aHighlight;
attribute vec3 aColorDay;
attribute vec3 aColorNight;
uniform float uNight;
uniform float uPixelRatio;
uniform float uHeight;
varying float vShape;
varying float vHighlight;
varying vec3 vColor;
void main() {
  vShape = aShape;
  vHighlight = aHighlight;
  vColor = mix(aColorDay, aColorNight, uNight);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float worldSize = aSize * (1.0 + aHighlight * 0.3);
  gl_PointSize = worldSize * (uHeight / (2.0 * tan(0.3665))) * uPixelRatio / max(1.0, -mv.z);
}
`
const NODE_FRAG = /* glsl */ `
precision highp float;
varying float vShape;
varying float vHighlight;
varying vec3 vColor;
uniform vec3 uInkDay;
uniform vec3 uInkNight;
uniform float uNight;
uniform float uHover;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  // 形状轮廓（作为"星体边界"）：圆 / 方 / 菱形 / 六边形
  float d;
  if (vShape < 0.5) {
    d = r;
  } else if (vShape < 1.5) {
    d = max(abs(uv.x), abs(uv.y));
  } else if (vShape < 2.5) {
    d = abs(uv.x) + abs(uv.y);
  } else {
    vec2 p = abs(uv);
    d = max(p.x * 0.866 + p.y * 0.5, p.y);
  }
  // 轻盈星体：小实核 + 大幅弥散光晕
  float core = 1.0 - smoothstep(0.22, 0.42, d);
  float halo = 1.0 - smoothstep(0.1, 1.0, d);
  float alpha = core * 0.98 + halo * halo * 0.34;
  if (alpha < 0.012) discard;
  vec3 ink = mix(uInkDay, uInkNight, uNight);
  float hl = clamp(vHighlight + uHover, 0.0, 1.4);
  // 核心：类型色通透发光；暗态向墨色收敛但保底可见
  vec3 col = mix(mix(ink, vColor, 0.35), vColor, clamp(hl * 0.92, 0.0, 1.0));
  col += vColor * halo * halo * 0.55 * hl;
  col = mix(col, vec3(1.0), core * core * 0.3 * hl);
  float vis = mix(0.34, 1.0, clamp(hl, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha * vis);
}
`

/* ── 场景构建 ── */
function buildScene() {
  const handle = getHandle()
  if (!handle) return
  const { scene, camera, onFrame } = handle
  sceneRef = scene
  cameraRef = camera

  computeLayout()
  frameLayout()
  buildLabelPool()

  const n = packed.length
  const posArr = new Float32Array(n * 3)
  const sizeArr = new Float32Array(n)
  const shapeArr = new Float32Array(n)
  const hlArr = new Float32Array(n)
  const dayArr = new Float32Array(n * 3)
  const nightArr = new Float32Array(n * 3)
  packed.forEach((p, i) => {
    posArr[i * 3] = p.pos.x
    posArr[i * 3 + 1] = p.pos.y
    posArr[i * 3 + 2] = p.pos.z
    sizeArr[i] = p.size
    shapeArr[i] = p.shape
    hlArr[i] = 1
    dayArr[i * 3] = p.colorDay.r
    dayArr[i * 3 + 1] = p.colorDay.g
    dayArr[i * 3 + 2] = p.colorDay.b
    nightArr[i * 3] = p.colorNight.r
    nightArr[i * 3 + 1] = p.colorNight.g
    nightArr[i * 3 + 2] = p.colorNight.b
  })

  pointsGeo = new THREE.BufferGeometry()
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
  pointsGeo.setAttribute('aSize', new THREE.BufferAttribute(sizeArr, 1))
  pointsGeo.setAttribute('aShape', new THREE.BufferAttribute(shapeArr, 1))
  pointsGeo.setAttribute('aHighlight', new THREE.BufferAttribute(hlArr, 1))
  pointsGeo.setAttribute('aColorDay', new THREE.BufferAttribute(dayArr, 3))
  pointsGeo.setAttribute('aColorNight', new THREE.BufferAttribute(nightArr, 3))

  material = new THREE.ShaderMaterial({
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
    uniforms: {
      uNight: { value: ui.mode === 'night' ? 1 : 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.75) },
      uHeight: { value: container.value?.clientHeight ?? 600 },
      uInkDay: { value: DAY.ink.clone() },
      uInkNight: { value: NIGHT.ink.clone() },
      uHover: { value: 0 }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending
  })
  pointsMesh = new THREE.Points(pointsGeo, material)
  scene.add(pointsMesh)

  buildEdges(scene)
  buildAnchorLabels(scene)
  buildStarDust(scene)

  camera.position.set(camTarget.x, camTarget.y + 12, camTarget.z + camState.radius)
  camera.lookAt(camTarget)

  onFrame((dt, t) => update(dt, t, camera))
  emit('ready')
}

/* ── 对外 API（Graph.vue 通过 ref 调用）── */
defineExpose({
  /** 深链聚焦：按词条 id 聚焦节点 */
  focusNodeById(id: string): boolean {
    const idx = indexOfId.get(id)
    if (idx === undefined || !pointsGeo) return false
    focusIdx = idx
    hoverIdx = -1
    refreshHighlight()
    emit('focus', packed[idx].node)
    return true
  },
  /** 设置寻脉路径（graph.findPath 的结果）；null 清除 */
  setPath(steps: PathStep[] | null) {
    setPath(steps)
  },
  /** 切换视图预设 */
  setView(v: GraphView) {
    viewMode = v
    updateEdgeColors()
  },
  /** 取消聚焦 */
  clearFocus() {
    focusIdx = -1
    refreshHighlight()
    emit('focus', null)
  }
})

/* 边：每条约 6 段弧线（中点朝原点外侧拱起），顶点色表达族别与高亮 */
interface EdgeMetaItem {
  a: number
  b: number
  kind: string
  family: string
  /** 贝塞尔控制点（粒子沿边飞行用） */
  pa: THREE.Vector3
  ctrl: THREE.Vector3
  pb: THREE.Vector3
}
let edgeMeta: EdgeMetaItem[] = []
const SEG = 6

function buildEdges(scene: THREE.Scene) {
  const relEdges = graphData.edges.filter(e => e.kind === 'relation')
  const totalSeg = relEdges.length * SEG
  const posArr = new Float32Array(totalSeg * 2 * 3)
  const colArr = new Float32Array(totalSeg * 2 * 3)

  edgeMeta = []
  let written = 0
  relEdges.forEach(e => {
    const a = indexOfId.get(e.source)
    const b = indexOfId.get(e.target)
    if (a === undefined || b === undefined) return
    const pa = packed[a].pos
    const pb = packed[b].pos
    // 拱起中点：轻微外拱（避免共线重叠，但保持"星图连线"的克制）
    const mid = pa.clone().add(pb).multiplyScalar(0.5)
    const out = mid.clone().normalize().multiplyScalar(mid.length() * 0.035 + 0.5)
    const ctrl = mid.add(out)
    edgeMeta.push({ a, b, kind: e.kind, family: e.family, pa: pa.clone(), ctrl, pb: pb.clone() })
    const base = written * SEG
    written++
    for (let s = 0; s < SEG; s++) {
      const t0 = s / SEG
      const t1 = (s + 1) / SEG
      const p0 = quadBezier(pa, ctrl, pb, t0)
      const p1 = quadBezier(pa, ctrl, pb, t1)
      const i0 = (base + s) * 2
      posArr[i0 * 3] = p0.x; posArr[i0 * 3 + 1] = p0.y; posArr[i0 * 3 + 2] = p0.z
      posArr[(i0 + 1) * 3] = p1.x; posArr[(i0 + 1) * 3 + 1] = p1.y; posArr[(i0 + 1) * 3 + 2] = p1.z
    }
  })

  edgeGeo = new THREE.BufferGeometry()
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
  edgeGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3))
  edgeMesh = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
  )
  scene.add(edgeMesh)
  updateEdgeColors()
}

function quadBezier(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const u = 1 - t
  return new THREE.Vector3(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z
  )
}

/** 关系族基础色（日读 / 夜读统一用色相，夜读整体提亮）——整体偏淡，星图以星光为主 */
const FAMILY_HUE: Record<string, number> = {
  causal: 0x9a9288,
  connect: 0xa8a092,
  liege: 0xa8705e,
  ally: 0x6f8496,
  cultural: 0x7d9282,
  analogy: 0xa08c66,
  institut: 0x968468,
  rival: 0xb4634f,
  kindred: 0xa8705e,
  martial: 0x96705c
}

function updateEdgeColors() {
  if (!edgeGeo) return
  const colAttr = edgeGeo.getAttribute('color') as THREE.BufferAttribute
  if (!colAttr) return
  const arr = colAttr.array as Float32Array
  const night = ui.mode === 'night' ? 1 : 0
  const c = new THREE.Color()
  const viewFam = VIEW_FAMILIES[viewMode]
  edgeMeta.forEach((meta, ei) => {
    let r: number, g: number, b: number
    if (pathEdgeSet) {
      // 寻脉模式：路径边朱砂高亮，其余近乎隐没
      if (pathEdgeSet.has(ei)) {
        r = PATH_COLOR.r; g = PATH_COLOR.g; b = PATH_COLOR.b
      } else {
        r = c.set(FAMILY_HUE[meta.family] ?? 0x8c8378).r * 0.1
        g = c.g * 0.1
        b = c.b * 0.1
      }
    } else {
      const highlighted = focusIdx >= 0 && (meta.a === focusIdx || meta.b === focusIdx)
      const dimmed = focusIdx >= 0 && !highlighted
      c.set(FAMILY_HUE[meta.family] ?? 0x8c8378)
      if (night) c.lerp(new THREE.Color(0xffffff), 0.35)
      // 视图预设：非本族关系大幅降权；泛关系（关涉）常态即降权
      const inView = !viewFam || viewFam.has(meta.family)
      const familyWeight = (meta.family === 'connect' ? 0.55 : 1) * (inView ? 1 : 0.1)
      const mul = (highlighted ? 1.0 : dimmed ? 0.28 : 0.62) * familyWeight
      r = c.r * mul
      g = c.g * mul
      b = c.b * mul
    }
    // 每条边 SEG 段 × 2 个端点，同色
    const start = ei * SEG * 2
    for (let s = 0; s < SEG * 2; s++) {
      arr[(start + s) * 3] = r
      arr[(start + s) * 3 + 1] = g
      arr[(start + s) * 3 + 2] = b
    }
  })
  colAttr.needsUpdate = true
}

/* 朝代锚点标签：canvas 白字纹理 + material.color 染色（白×色=任意色，昼夜切换零重建） */
const ANCHOR_INK_DAY = new THREE.Color('#2B2620')
const ANCHOR_INK_NIGHT = new THREE.Color('#F4EBDC')
function buildAnchorLabels(scene: THREE.Scene) {
  for (const theme of dynastyThemes) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 256, 128)
    ctx.font = '700 76px "Songti SC","STSong","SimSun",serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(theme.hanzi, 128, 60)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 })
    mat.color.copy(ui.mode === 'night' ? ANCHOR_INK_NIGHT : ANCHOR_INK_DAY)
    const sprite = new THREE.Sprite(mat)
    const anchor = dynastyAnchorPosition(theme.id)
    sprite.position.set(anchor[0], anchor[1] + 6.8, anchor[2])
    sprite.scale.set(9.5, 4.75, 1)
    scene.add(sprite)
    anchorLabels.push(sprite)
  }
}

/* 星尘：极淡的漂浮微点，夜读增强 */
function buildStarDust(scene: THREE.Scene) {
  const COUNT = reducedMotion ? 0 : 420
  if (!COUNT) return
  const pos = new Float32Array(COUNT * 3)
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (hash01('dust-x', i) - 0.5) * 150
    pos[i * 3 + 1] = hash01('dust-y', i) * 44 - 6
    pos[i * 3 + 2] = (hash01('dust-z', i) - 0.5) * 150
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  starDust = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.22, color: DAY.edge.clone(), transparent: true, opacity: 0.32, depthWrite: false })
  )
  scene.add(starDust)
}

/* ── 主循环 ── */
function update(dt: number, _t: number, camera: THREE.PerspectiveCamera) {
  // 相机轨道（拖拽环绕 + 滚轮缩放）
  camState.theta += (camState.thetaT - camState.theta) * Math.min(1, dt * 5)
  camState.phi += (camState.phiT - camState.phi) * Math.min(1, dt * 5)
  camState.radius += (camState.radiusT - camState.radius) * Math.min(1, dt * 4)
  const r = camState.radius
  const sp = Math.sin(camState.phi)
  // 注视目标平滑飞行（寻脉/复位时）
  camTarget.lerp(camTargetT, Math.min(1, dt * 2.2))
  camera.position.set(
    camTarget.x + Math.sin(camState.theta) * sp * r,
    camTarget.y + Math.cos(camState.phi) * r + 6,
    camTarget.z + Math.cos(camState.theta) * sp * r
  )
  camera.lookAt(camTarget)

  // 夜读过渡 + 星尘配色
  const nightTarget = ui.mode === 'night' ? 1 : 0
  if (material) {
    const u = material.uniforms
    u.uNight.value += (nightTarget - u.uNight.value) * Math.min(1, dt * 2)
    // 容器高度变化时同步点大小标定
    const h = container.value?.clientHeight ?? 0
    if (h > 0 && Math.abs((u.uHeight.value as number) - h) > 1) {
      u.uHeight.value = h
    }
  }
  if (starDust) {
    const m = starDust.material as THREE.PointsMaterial
    m.color.lerp(ui.mode === 'night' ? NIGHT.edge : DAY.edge, Math.min(1, dt * 2))
    m.opacity = ui.mode === 'night' ? 0.5 : 0.32
  }
  // 锚点标签：颜色向目标墨色（昼夜）过渡
  for (const lbl of anchorLabels) {
    const m = lbl.material as THREE.SpriteMaterial
    m.color.lerp(nightTarget ? ANCHOR_INK_NIGHT : ANCHOR_INK_DAY, Math.min(1, dt * 2))
  }

  // P1：寻脉粒子流动 + 中文标签跟随投影
  updateParticles(dt)
  updateLabelPositions()
}

/* ── 拾取（屏幕空间最近节点）── */
function pickNode(clientX: number, clientY: number, camera: THREE.PerspectiveCamera): number {
  const el = container.value
  if (!el) return -1
  const rect = el.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width) * 2 - 1
  const y = -((clientY - rect.top) / rect.height) * 2 + 1
  let best = -1
  let bestD = Infinity
  const v = new THREE.Vector3()
  for (let i = 0; i < packed.length; i++) {
    v.copy(packed[i].pos)
    v.project(camera)
    if (v.z > 1) continue
    const dx = v.x - x
    const dy = v.y - y
    const d = dx * dx + dy * dy
    // 节点越大越易拾取
    const th = 0.0016 + packed[i].size * 0.00085
    if (d < th && d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/* ── 寻脉路径（P1）：高亮 + 朱砂流动粒子 ── */
const PATH_COLOR = new THREE.Color(0xc14a35)

/** 设置寻脉路径（来自 graph.findPath）；null 清除 */
function setPath(steps: PathStep[] | null) {
  if (!steps || !steps.length || !sceneRef) {
    const had = !!pathEdgeSet
    pathEdgeSet = null
    pathNodeSet = null
    removePathParticles()
    refreshHighlight()
    if (had) restoreHome()
    return
  }
  const edges = new Set<number>()
  const nodes = new Set<number>()
  for (const step of steps) {
    const a = indexOfId.get(step.fromId)
    const b = indexOfId.get(step.toId)
    if (a === undefined || b === undefined) continue
    nodes.add(a)
    nodes.add(b)
    for (let i = 0; i < edgeMeta.length; i++) {
      const m = edgeMeta[i]
      if ((m.a === a && m.b === b) || (m.a === b && m.b === a)) {
        edges.add(i)
        break
      }
    }
  }
  pathEdgeSet = edges
  pathNodeSet = nodes
  buildPathParticles([...edges])
  refreshHighlight()

  // 相机飞向路径邻域（取路径节点包围盒，留出呼吸空间）
  const box = new THREE.Box3()
  for (const i of nodes) {
    box.expandByPoint(packed[i].pos.clone().addScalar(4))
    box.expandByPoint(packed[i].pos.clone().addScalar(-4))
  }
  box.getCenter(camTargetT)
  const size = box.getSize(new THREE.Vector3())
  const fov = (42 * Math.PI) / 180
  const aspect = Math.max(0.6, (container.value?.clientWidth ?? 1200) / (container.value?.clientHeight ?? 700))
  const dV = (size.y / 2) / Math.tan(fov / 2)
  const dH = (Math.max(size.x, size.z) / 2) / (Math.tan(fov / 2) * aspect)
  camState.radiusT = Math.min(90, Math.max(18, Math.max(dV, dH) * 1.15))
}

/** 退出寻脉：恢复全景取景 */
function restoreHome() {
  camTargetT.copy(homeTarget)
  camState.radiusT = homeRadius
}

function buildPathParticles(edgeIndices: number[]) {
  removePathParticles()
  if (!edgeIndices.length || !sceneRef) return
  const PER_EDGE = 5
  const count = edgeIndices.length * PER_EDGE
  const posArr = new Float32Array(count * 3)
  particleState = []
  for (let i = 0; i < edgeIndices.length; i++) {
    for (let k = 0; k < PER_EDGE; k++) {
      particleState.push({
        edgeIdx: edgeIndices[i],
        t: k / PER_EDGE + hash01('pt' + i + k) * 0.12,
        speed: 0.22 + 0.12 * ((i + k) % 3)
      })
    }
  }
  pathParticleGeo = new THREE.BufferGeometry()
  pathParticleGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
  pathParticles = new THREE.Points(
    pathParticleGeo,
    new THREE.PointsMaterial({
      color: PATH_COLOR.clone(),
      size: 1.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    })
  )
  sceneRef.add(pathParticles)
  updateParticles(0)
}

function removePathParticles() {
  if (pathParticles && sceneRef) sceneRef.remove(pathParticles)
  pathParticles = null
  pathParticleGeo = null
  particleState = []
}

const _pTmp = new THREE.Vector3()
function quadBezierInto(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t
  out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z
  )
  return out
}

function updateParticles(dt: number) {
  if (!pathParticles || !pathParticleGeo) return
  const attr = pathParticleGeo.getAttribute('position') as THREE.BufferAttribute
  const arr = attr.array as Float32Array
  for (let i = 0; i < particleState.length; i++) {
    const ps = particleState[i]
    ps.t = (ps.t + ps.speed * dt) % 1
    const m = edgeMeta[ps.edgeIdx]
    if (!m) continue
    quadBezierInto(m.pa, m.ctrl, m.pb, ps.t, _pTmp)
    arr[i * 3] = _pTmp.x
    arr[i * 3 + 1] = _pTmp.y
    arr[i * 3 + 2] = _pTmp.z
  }
  attr.needsUpdate = true
}

/* ── 高亮更新 ── */
function refreshHighlight() {
  if (!pointsGeo) return
  const hlAttr = pointsGeo.getAttribute('aHighlight') as THREE.BufferAttribute
  const arr = hlAttr.array as Float32Array
  // 寻脉模式：路径星辰点亮，其余隐入夜幕（保留微弱上下文）
  if (pathNodeSet) {
    for (let i = 0; i < packed.length; i++) arr[i] = pathNodeSet.has(i) ? 1.4 : 0.2
  } else {
    const activeIdx = focusIdx >= 0 ? focusIdx : hoverIdx
    if (activeIdx < 0) {
      for (let i = 0; i < packed.length; i++) arr[i] = 1
    } else {
      const nbrs = packed[activeIdx].neighbors
      for (let i = 0; i < packed.length; i++) {
        if (i === activeIdx) arr[i] = 1.35
        else if (nbrs.has(i)) arr[i] = 1.0
        else arr[i] = 0.16
      }
    }
  }
  hlAttr.needsUpdate = true
  updateEdgeColors()
  updateLabelContent()
}

/* ── 指针事件 ── */
function currentCamera(): THREE.PerspectiveCamera | null {
  const h = getHandle()
  return h ? h.camera : null
}

function onPointerMove(e: PointerEvent) {
  const cam = currentCamera()
  if (!cam) return
  if (dragging) {
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    dragMoved = Math.max(dragMoved, Math.abs(dx) + Math.abs(dy))
    camState.thetaT = camState.thetaT - dx * 0.0055
    camState.phiT = Math.min(Math.PI - 0.24, Math.max(0.24, camState.phiT - dy * 0.0045))
    dragStart = { x: e.clientX, y: e.clientY }
    return
  }
  // hover 拾取（节流于帧内自然频率即可）
  const idx = pickNode(e.clientX, e.clientY, cam)
  if (idx !== hoverIdx) {
    hoverIdx = idx
    container.value && (container.value.style.cursor = idx >= 0 ? 'pointer' : 'grab')
    refreshHighlight()
    emit('hover', idx >= 0 ? packed[idx].node : null)
  }
}

function onPointerDown(e: PointerEvent) {
  dragging = true
  dragMoved = 0
  dragStart = { x: e.clientX, y: e.clientY }
}

function onPointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  if (dragMoved < 6) {
    const cam = currentCamera()
    if (!cam) return
    const idx = pickNode(e.clientX, e.clientY, cam)
    if (idx >= 0 && idx !== focusIdx) {
      focusIdx = idx
      refreshHighlight()
      emit('focus', packed[idx].node)
    } else if (idx < 0 && focusIdx >= 0) {
      // 点击空白：取消聚焦
      focusIdx = -1
      refreshHighlight()
      emit('focus', null)
    }
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  camState.radiusT = Math.min(110, Math.max(16, camState.radiusT + e.deltaY * 0.04))
}

onMounted(() => {
  if (window.innerWidth < 768) {
    emit('fallback')
    return
  }
  watch(
    supported,
    v => {
      if (v) buildScene()
      else emit('fallback')
    },
    { immediate: true }
  )
})

onBeforeUnmount(() => {
  if (container.value) container.value.style.cursor = ''
  packed = []
  indexOfId = new Map()
  edgeMeta = []
  pointsMesh = null
  pointsGeo = null
  edgeMesh = null
  edgeGeo = null
  anchorLabels = []
  starDust = null
  material = null
  focusIdx = -1
  hoverIdx = -1
})

/* 夜读切换时刷新边色 */
watch(
  () => ui.mode,
  () => {
    updateEdgeColors()
  }
)
</script>

<template>
  <div
    ref="container"
    class="absolute inset-0 touch-none select-none"
    role="img"
    aria-label="万卷星图：三百年史事与人物的三维关系网络，点击节点聚焦，拖拽环视"
    @pointermove="onPointerMove"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  >
    <div ref="labelLayer" class="sg-labels" aria-hidden="true"></div>
  </div>
</template>

<style>
/* 万卷星图 · 中文标签层（池化 DOM，每帧投影定位） */
.sg-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 5;
}
.sg-label {
  position: absolute;
  left: 0;
  top: 0;
  padding: 1px 7px;
  font-family: var(--font-serif);
  font-size: 12px;
  letter-spacing: 0.08em;
  line-height: 1.5;
  color: var(--ink-strong);
  background: color-mix(in srgb, var(--paper-base) 78%, transparent);
  border: 1px solid var(--hairline);
  white-space: nowrap;
  will-change: transform;
}
.sg-label-focus {
  color: var(--dynasty-accent);
  border-color: color-mix(in srgb, var(--dynasty-accent) 45%, transparent);
  font-weight: 700;
}
</style>
