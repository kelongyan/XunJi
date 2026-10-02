<script setup lang="ts">
/**
 * 万卷星图 · 3D 关系图谱场景
 *
 * 构图：五朝锚点沿编年巨弧排开，词条如星群环拱本朝锚点，关系化为星光。
 * 技术：自写确定性 3D 力导向（初始化螺旋 + O(n²) 松弛，一次性预计算）；
 *       节点 Points 单 draw call（形状 SDF + 假光晕）；边为弧形 LineSegments（顶点色）。
 * 双态：uNight uniform 与 CSS token 同步（日读墨色星图 / 夜读灯火夜空）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { useThreeScene } from '../../composables/useThreeScene'
import { useUiStore } from '../../stores/ui'
import { graphData, dynastyAnchorPosition, type GraphNode, type GraphView, type PathStep } from '../../data/graph'
import { getGraphLayout } from '../../data/graphLayout'
import { dynastyThemes } from '../../data/dynastyThemes'
import { RELATION_HUE, RELATION_HUE_NIGHT, type RelationFamily } from '../../data/relationTaxonomy'

const emit = defineEmits<{
  focus: [node: GraphNode | null]
  hover: [node: GraphNode | null]
  fallback: []
  ready: []
}>()

const container = ref<HTMLElement | undefined>()
const labelLayer = ref<HTMLDivElement | undefined>()
const ui = useUiStore()
/** 视野角（相机 / 取景 / 点尺寸标定共用唯一值） */
const FOV_DEG = 42
const { supported, getHandle } = useThreeScene(container, { fov: FOV_DEG, near: 0.5, far: 400 })

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
    // 聚焦邻域：先焦点、后按度数降序的邻接（朝代锚点成员多时优先显示重要词条）
    const nbrs = [...packed[focusIdx].neighbors].sort(
      (a, b) => packed[b].node.degree - packed[a].node.degree
    )
    idxs.push(focusIdx, ...nbrs)
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
  bg: new THREE.Color('#F7F3E8')
}
const NIGHT = {
  ink: new THREE.Color('#EFE9DC'),
  bg: new THREE.Color('#1A1611')
}

/* 关系族日/夜色速查（唯一来源：relationTaxonomy） */
const hueDay = (family: string) => RELATION_HUE[family as RelationFamily] ?? RELATION_HUE.connect
const hueNight = (family: string) => RELATION_HUE_NIGHT[family as RelationFamily] ?? RELATION_HUE_NIGHT.connect

interface PackedNode {
  node: GraphNode
  pos: THREE.Vector3
  size: number
  shape: number
  colorDay: THREE.Color
  colorNight: THREE.Color
  /** 星辉闪烁相位（0-1，确定性 hash） */
  phase: number
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
/** 最近一次用户交互时间（梦境巡游用） */
let lastInteraction = performance.now()
/** 入场揭示进度 0→1（点亮星辰 + 相机缓推） */
let revealT = 0
/** 用户是否手动推拉过（手动后 resize 不强行重取景） */
let userZoomed = false
/** 边基准透明度（揭示动画在其上做乘法淡入） */
let edgeBaseOpacity = 0.38
/** 容器尺寸缓存（变化时重取景） */
let lastW = 0
let lastH = 0

/* ── 确定性布局 ── */
function hash01(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

/* ── 消费共享布局（graphLayout.ts：2D/3D 同一空间结构）── */
function computeLayout() {
  const layout = getGraphLayout()
  packed = layout.nodes.map(ln => ({
    node: ln.node,
    pos: new THREE.Vector3(ln.x, ln.y, ln.z),
    size: ln.size,
    shape: ln.shape,
    colorDay: new THREE.Color(ln.colorDay),
    colorNight: new THREE.Color(ln.colorNight),
    phase: hash01(ln.node.id, 21),
    highlight: 1,
    neighbors: ln.neighbors
  }))
  indexOfId = layout.indexOfId
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
  const fov = (FOV_DEG * Math.PI) / 180
  const aspect = Math.max(0.6, (container.value?.clientWidth ?? 1200) / (container.value?.clientHeight ?? 700))
  // 环绕视角下，水平约束取 x/z 较大者
  const halfY = size.y / 2
  const halfX = Math.max(size.x, size.z) / 2
  const dV = halfY / Math.tan(fov / 2)
  const dH = halfX / (Math.tan(fov / 2) * aspect)
  const dist = Math.max(dV, dH) * 1.06
  camState.radiusT = dist
  if (revealT === 0) {
    // 入场：自远而近缓推，兼作"揭幕"（reducedMotion 时直接落位）
    if (reducedMotion) {
      camState.radius = dist
    } else {
      camState.radius = dist * 1.34
      camState.phi = Math.min(Math.PI - 0.3, camState.phi + 0.1)
    }
  }
  homeTarget.copy(camTarget)
  camTargetT.copy(camTarget)
  homeRadius = camState.radiusT
}

/* ── 节点 shader（形状 SDF + 假光晕）── */
const NODE_VERT = /* glsl */ `
attribute float aSize;
attribute float aShape;
attribute float aHighlight;
attribute float aPhase;
attribute vec3 aColorDay;
attribute vec3 aColorNight;
uniform float uNight;
uniform float uReveal;
uniform float uPixelRatio;
uniform float uHeight;
varying float vShape;
varying float vHighlight;
varying float vPhase;
varying float vReveal;
varying vec3 vColor;
void main() {
  vShape = aShape;
  vHighlight = aHighlight;
  vPhase = aPhase;
  // 入场渐显：按星辉相位错落点亮（同一颗星每次进入顺序一致）
  vReveal = clamp(uReveal * 1.45 - aPhase * 0.45, 0.0, 1.0);
  vColor = mix(aColorDay, aColorNight, uNight);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float worldSize = aSize * (1.0 + aHighlight * 0.3);
  gl_PointSize = min(worldSize * (uHeight / (2.0 * tan(0.3665))) * uPixelRatio / max(1.0, -mv.z), 220.0);
}
`
const NODE_FRAG = /* glsl */ `
precision highp float;
varying float vShape;
varying float vHighlight;
varying float vPhase;
varying float vReveal;
varying vec3 vColor;
uniform vec3 uInkDay;
uniform vec3 uInkNight;
uniform float uNight;
uniform float uTime;
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
  // 星辉闪烁：每颗星独立相位（夜读更明显），像呼吸的灯火
  float twinkle = 0.86 + 0.14 * sin(uTime * 0.9 + vPhase * 6.2832) * (0.35 + 0.65 * uNight);
  if (vReveal <= 0.001) discard;
  float alpha = (core * 0.98 + halo * halo * 0.34) * twinkle * vReveal;
  if (alpha < 0.012) discard;
  vec3 ink = mix(uInkDay, uInkNight, uNight);
  float hl = clamp(vHighlight, 0.0, 1.4);
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
  // 减少动态偏好：跳过揭示动画与闪烁
  if (reducedMotion) revealT = 1

  const n = packed.length
  const posArr = new Float32Array(n * 3)
  const sizeArr = new Float32Array(n)
  const shapeArr = new Float32Array(n)
  const hlArr = new Float32Array(n)
  const phaseArr = new Float32Array(n)
  const dayArr = new Float32Array(n * 3)
  const nightArr = new Float32Array(n * 3)
  packed.forEach((p, i) => {
    posArr[i * 3] = p.pos.x
    posArr[i * 3 + 1] = p.pos.y
    posArr[i * 3 + 2] = p.pos.z
    sizeArr[i] = p.size
    shapeArr[i] = p.shape
    hlArr[i] = 1
    phaseArr[i] = p.phase
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
  pointsGeo.setAttribute('aPhase', new THREE.BufferAttribute(phaseArr, 1))
  pointsGeo.setAttribute('aColorDay', new THREE.BufferAttribute(dayArr, 3))
  pointsGeo.setAttribute('aColorNight', new THREE.BufferAttribute(nightArr, 3))

  material = new THREE.ShaderMaterial({
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
    uniforms: {
      uNight: { value: ui.mode === 'night' ? 1 : 0 },
      uReveal: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.75) },
      uHeight: { value: container.value?.clientHeight ?? 600 },
      uInkDay: { value: DAY.ink.clone() },
      uInkNight: { value: NIGHT.ink.clone() },
      uTime: { value: 0 }
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

  onFrame((dt, elapsed) => update(dt, elapsed, camera))
  emit('ready')
}

/* ── 对外 API（Graph.vue 通过 ref 调用）── */
/** 深链聚焦：按词条 id 聚焦节点 */
function focusNodeById(id: string): boolean {
  const idx = indexOfId.get(id)
  if (idx === undefined || !pointsGeo) return false
  focusIdx = idx
  hoverIdx = -1
  lastInteraction = performance.now()
  refreshHighlight()
  emit('focus', packed[idx].node)
  return true
}

/** 导览用：聚焦并让相机飞抵该星辰 */
function flyToNode(id: string): boolean {
  const ok = focusNodeById(id)
  if (ok) {
    const idx = indexOfId.get(id)
    if (idx !== undefined) {
      camTargetT.copy(packed[idx].pos)
      camState.radiusT = 30
    }
  }
  return ok
}
defineExpose({
  /** 深链聚焦：按词条 id 聚焦节点 */
  focusNodeById,
  /** 导览用：聚焦并让相机飞抵该星辰 */
  flyToNode,
  /** 恢复全景取景 */
  restoreView() {
    restoreHome()
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
    edgeMeta.push({ a, b, family: e.family, pa: pa.clone(), ctrl, pb: pb.clone() })
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
      opacity: 0.38,
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

function updateEdgeColors() {
  if (!edgeGeo) return
  const colAttr = edgeGeo.getAttribute('color') as THREE.BufferAttribute
  if (!colAttr) return
  const arr = colAttr.array as Float32Array
  const night = ui.mode === 'night'
  const c = new THREE.Color()
  const viewFam = VIEW_FAMILIES[viewMode]
  // 全局线透明度：寻脉时拉满（路径朱砂须醒目），夜读略压（防蛛网感）
  edgeBaseOpacity = pathEdgeSet ? 0.95 : night ? 0.3 : 0.38
  if (edgeMesh) {
    const mat = edgeMesh.material as THREE.LineBasicMaterial
    mat.opacity = edgeBaseOpacity
  }
  edgeMeta.forEach((meta, ei) => {
    let r: number, g: number, b: number
    if (pathEdgeSet) {
      // 寻脉模式：路径边朱砂高亮，其余近乎隐没
      if (pathEdgeSet.has(ei)) {
        r = PATH_COLOR.r; g = PATH_COLOR.g; b = PATH_COLOR.b
      } else {
        r = c.set(hueDay(meta.family)).r * 0.1
        g = c.g * 0.1
        b = c.b * 0.1
      }
    } else {
      // 焦点优先，其次悬停（hover 时边轻压，不掩盖全局）
      const activeIdx = focusIdx >= 0 ? focusIdx : hoverIdx
      const isFocus = focusIdx >= 0
      const highlighted = activeIdx >= 0 && (meta.a === activeIdx || meta.b === activeIdx)
      const dimmed = activeIdx >= 0 && !highlighted
      c.set(night ? hueNight(meta.family) : hueDay(meta.family))
      // 视图预设：非本族关系大幅降权；泛关系（关涉）常态即降权
      const inView = !viewFam || viewFam.has(meta.family)
      const familyWeight = (meta.family === 'connect' ? 0.55 : 1) * (inView ? 1 : 0.1)
      const mul = (highlighted ? 1.0 : dimmed ? (isFocus ? 0.28 : 0.6) : 0.62) * familyWeight
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
/** 与 anchorLabels 平行：每个标签对应的节点索引（聚焦联动压暗用） */
let anchorLabelIdx: number[] = []
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
    sprite.position.set(anchor[0], anchor[1] + 7.6, anchor[2])
    sprite.scale.set(8.4, 4.2, 1)
    scene.add(sprite)
    anchorLabels.push(sprite)
    anchorLabelIdx.push(indexOfId.get(`dynasty:${theme.id}`) ?? -1)
  }
}

/* 星尘：极淡的漂浮微点，夜读增强（色随日/夜平滑过渡） */
const DUST_DAY = new THREE.Color('#8C8378')
const DUST_NIGHT = new THREE.Color('#8B8070')
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
    new THREE.PointsMaterial({ size: 0.22, color: DUST_DAY.clone(), transparent: true, opacity: 0.32, depthWrite: false })
  )
  scene.add(starDust)
}

/* ── 主循环 ── */
function update(dt: number, t: number, camera: THREE.PerspectiveCamera) {
  // 容器尺寸剧变（窗口缩放 / 侧栏挤压）：重新取景（入场完成后才响应，避免打断揭幕）
  const w = container.value?.clientWidth ?? 0
  const h = container.value?.clientHeight ?? 0
  if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
    const first = lastW === 0
    lastW = w
    lastH = h
    // 入场完成后、未聚焦/寻脉/手动缩放时，尺寸变化重取景
    if (!first && revealT >= 1 && focusIdx < 0 && !pathNodeSet && !userZoomed) {
      frameLayout()
    }
  }

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

  // 入场揭示：星辰自上而下渐次点亮，星尘随之浮现
  if (revealT < 1) {
    revealT = Math.min(1, revealT + dt / 1.5)
  }

  // 夜读过渡 + 星尘配色
  const nightTarget = ui.mode === 'night' ? 1 : 0
  if (material) {
    const u = material.uniforms
    u.uNight.value += (nightTarget - u.uNight.value) * Math.min(1, dt * 2)
    u.uTime.value = t
    // 入场平滑步进（先慢后快再收）
    const e = revealT * revealT * (3 - 2 * revealT)
    u.uReveal.value = e
    // 边随揭示渐显（迟于星辰半步，先见星后有网）
    if (edgeMesh) {
      const mat = edgeMesh.material as THREE.LineBasicMaterial
      mat.opacity = edgeBaseOpacity * Math.min(1, Math.max(0, (revealT - 0.35) / 0.65))
    }
    // 容器高度变化时同步点大小标定
    const ch = container.value?.clientHeight ?? 0
    if (ch > 0 && Math.abs((u.uHeight.value as number) - ch) > 1) {
      u.uHeight.value = ch
    }
  }
  // 梦境巡游：空闲 8 秒后（无聚焦/无寻脉/未拖拽）相机极缓自转，如观星入梦
  const idleFor = (performance.now() - lastInteraction) / 1000
  const dreaming =
    !reducedMotion && idleFor > 8 && focusIdx < 0 && hoverIdx < 0 && !pathNodeSet && !dragging
  if (dreaming) {
    camState.thetaT += dt * 0.022
    camState.phiT += Math.sin(t * 0.11) * dt * 0.006
    camState.phiT = Math.min(1.32, Math.max(0.86, camState.phiT))
  }
  if (starDust) {
    const m = starDust.material as THREE.PointsMaterial
    m.color.lerp(ui.mode === 'night' ? DUST_NIGHT : DUST_DAY, Math.min(1, dt * 2))
    m.opacity = ui.mode === 'night' ? 0.5 : 0.32
  }
  // 锚点标签：颜色向目标墨色（昼夜）过渡 + 聚焦联动压暗
  for (let li = 0; li < anchorLabels.length; li++) {
    const m = anchorLabels[li].material as THREE.SpriteMaterial
    m.color.lerp(nightTarget ? ANCHOR_INK_NIGHT : ANCHOR_INK_DAY, Math.min(1, dt * 2))
    const idx = anchorLabelIdx[li]
    const inFocus = focusIdx >= 0 || !!pathNodeSet
    const isActive = idx >= 0 && (idx === focusIdx || idx === hoverIdx || pathNodeSet?.has(idx))
    // focus/寻脉：重压（4 倍收敛）；hover：轻压；常态：0.9
    const targetOp = isActive ? 0.95 : inFocus ? 0.3 : hoverIdx >= 0 ? 0.62 : 0.9
    m.opacity += (targetOp - m.opacity) * Math.min(1, dt * (inFocus ? 4 : 3))
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
  userZoomed = false
}

/** 圆形柔光点纹理（寻脉粒子用；模块级懒建一次） */
let dotTexture: THREE.CanvasTexture | null = null
function getDotTexture(): THREE.CanvasTexture {
  if (dotTexture) return dotTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.32, 'rgba(255,255,255,0.95)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  dotTexture = new THREE.CanvasTexture(canvas)
  dotTexture.colorSpace = THREE.SRGBColorSpace
  return dotTexture
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
      map: getDotTexture(),
      size: 1.5,
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
  pathParticleGeo?.dispose()
  if (pathParticles?.material) {
    const material = pathParticles.material as THREE.Material
    material.dispose()
  }
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
      const isFocus = focusIdx >= 0
      for (let i = 0; i < packed.length; i++) {
        if (i === activeIdx) arr[i] = 1.35
        else if (nbrs.has(i)) arr[i] = 1.0
        // hover 轻压（保持全图可读，仅示意关联）／focus 重压（聚焦叙事）
        else arr[i] = isFocus ? 0.16 : 0.55
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
  lastInteraction = performance.now()
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
  lastInteraction = performance.now()
  dragging = true
  dragMoved = 0
  dragStart = { x: e.clientX, y: e.clientY }
  // 指针捕获：拖拽移出画布仍持续环绕
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    /* 某些环境不支持捕获时静默降级 */
  }
}

function onPointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* 忽略 */
  }
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
  lastInteraction = performance.now()
  userZoomed = true
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
  dotTexture?.dispose()
  dotTexture = null
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
  /* 层序基线：画布之上、页面浮层（侧栏/浮签）之下 */
  z-index: 2;
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
