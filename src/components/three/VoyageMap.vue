<script setup lang="ts">
/**
 * 针路图（详情页内嵌 3D 场景，数据驱动可复用）
 * 仿《郑和航海图》罗盘针路风格：纸底图 + 金色飞线 + 宝船沿线巡游。
 * 航点为历史航路的风格化示意（非精确地理投影）。
 *
 * 沉浸式长卷（2026-10-01 精修）：无矩形边框——底图四边以 alpha 渐隐
 * 融入页面纸色（日夜读自适应）；平面尺寸外扩、相机锁定航路包围盒中心，
 * 保持地图内容居中、四周只余"无边海面"。
 * 航线数据外置：voyages.ts（郑和下西洋 / 玄奘西行等），新图加数据即可挂载。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { useThreeScene } from '../../composables/useThreeScene'
import { useUiStore } from '../../stores/ui'
import { getVoyage, type VoyageChart, type VoyagePort } from '../../data/voyages'

const props = defineProps<{ chartId: string }>()

const container = ref<HTMLElement>()
const ui = useUiStore()
const { supported, getHandle } = useThreeScene(container, { fov: 50, near: 0.1, far: 200 })

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const CHART_TINT_DAY = new THREE.Color('#FFFFFF')
const CHART_TINT_NIGHT = new THREE.Color('#5E584C')

const chart: VoyageChart = getVoyage(props.chartId)
const PORTS = chart.ports
const ROUTES = chart.routes

/* 航路包围盒中心（相机环绕与 lookAt 的目标，数据驱动） */
const focus = (() => {
  const xs = PORTS.map(p => p.x)
  const ys = PORTS.map(p => p.y)
  return new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...ys) + Math.max(...ys)) / 2)
})()

/* 相机控制状态（交互与渲染循环共享同一份） */
const cam = { yaw: 0, pitch: 0.62, yawT: 0, pitchT: 0.62, dist: 22, distT: 22 }
let dragging = false
let last = { x: 0, y: 0 }

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** 古地图底图：纸底 + 针路网格 + 罗盘 + 西洋水域晕染（无边框，四边渐隐） */
function makeChartTexture(): THREE.CanvasTexture {
  const W = 1280
  const H = 720
  const [c, ctx] = makeCanvas(W, H)
  ctx.fillStyle = '#EFE7D3'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.10)'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 72) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = 0; y <= H; y += 72) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }
  // 西洋水域晕染
  ctx.save()
  ctx.globalAlpha = 0.10
  ctx.fillStyle = '#2F5D7C'
  ctx.beginPath()
  ctx.moveTo(W * 0.42, H)
  ctx.bezierCurveTo(W * 0.46, H * 0.55, W * 0.58, H * 0.62, W * 0.66, H * 0.5)
  ctx.bezierCurveTo(W * 0.8, H * 0.42, W * 0.95, H * 0.5, W, H * 0.42)
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  // 罗盘（置于淡化带内侧，作为航路右上的细节彩蛋）
  const cx = W - 260
  const cy = 240
  const r = 64
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.55)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.stroke()
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55)
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    ctx.stroke()
  }
  ctx.fillStyle = '#A8352A'
  ctx.beginPath()
  ctx.moveTo(cx, cy - r * 0.52); ctx.lineTo(cx + 6, cy + 4); ctx.lineTo(cx - 6, cy + 4)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(61, 55, 47, 0.8)'
  ctx.font = '700 20px "Songti SC", "STSong", "SimSun", serif'
  ctx.textAlign = 'center'
  ctx.fillText('针', cx, cy + r * 0.55 + 24)
  // 四边渐隐（destination-out 抹除边缘）：底图不再是"一块板"，
  // 边缘融进页面纸色，配合 DOM 侧纸色背景实现无边长卷。
  const FADE = 220
  ctx.globalCompositeOperation = 'destination-out'
  const edgeGradients: Array<{ from: [number, number]; to: [number, number]; rect: [number, number, number, number] }> = [
    { from: [0, 0], to: [FADE, 0], rect: [0, 0, FADE, H] },           // 左
    { from: [W, 0], to: [W - FADE, 0], rect: [W - FADE, 0, FADE, H] },// 右
    { from: [0, 0], to: [0, FADE], rect: [0, 0, W, FADE] },           // 上
    { from: [0, H], to: [0, H - FADE], rect: [0, H - FADE, W, FADE] } // 下
  ]
  for (const { from, to, rect } of edgeGradients) {
    const g = ctx.createLinearGradient(from[0], from[1], to[0], to[1])
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(rect[0], rect[1], rect[2], rect[3])
  }
  ctx.globalCompositeOperation = 'source-over'
  return toTexture(c)
}

/** 竖排港名标签 */
function makePortLabel(name: string, major: boolean): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 320)
  const chars = name.split('')
  const fs = major ? 44 : 36
  ctx.font = `700 ${fs}px "Songti SC", "STSong", "SimSun", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const startY = 44
  chars.forEach((ch, i) => {
    ctx.fillStyle = major ? '#A8352A' : 'rgba(43, 38, 32, 0.92)'
    ctx.fillText(ch, 64, startY + i * (fs + 10))
  })
  return toTexture(c)
}

function buildScene() {
  const handle = getHandle()
  if (!handle) return
  const { scene, camera, onFrame } = handle

  /* 底图：平面外扩 + 四边羽化（沉浸式无边界），相机看点为航路包围盒中心。
   * 不设 scene.background——透明画布 + 页面前景纸色，边缘自然衔接。
   * renderOrder -1 + depthWrite false：底图先画、不挡后画的航线/标签。 */
  const chartMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 40),
    new THREE.MeshBasicMaterial({
      map: makeChartTexture(),
      fog: false,
      toneMapped: false,
      transparent: true,
      depthWrite: false
    })
  )
  chartMesh.renderOrder = -1
  chartMesh.rotation.x = -Math.PI / 2
  ;(chartMesh.material as THREE.MeshBasicMaterial).color.copy(
    ui.mode === 'night' ? CHART_TINT_NIGHT : CHART_TINT_DAY
  )
  scene.add(chartMesh)

  /* 航线（金色飞线 tube + 流光 shader） */
  const flowUniforms = { uTime: { value: 0 } }
  const routeMaterial = new THREE.ShaderMaterial({
    uniforms: flowUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec3 base = vec3(0.62, 0.48, 0.29);
        float t = fract(vUv.x * 1.2 - uTime * 0.35);
        float head = smoothstep(0.55, 1.0, t);
        float alpha = 0.22 + head * 0.78;
        vec3 col = mix(base, vec3(0.95, 0.78, 0.45), head);
        gl_FragColor = vec4(col, alpha);
      }
    `
  })
  const portPos = (p: VoyagePort) => new THREE.Vector3(p.x, 0.12, p.y)
  ROUTES.forEach(([a, b]) => {
    const pa = portPos(PORTS[a])
    const pb = portPos(PORTS[b])
    const mid = pa.clone().lerp(pb, 0.5)
    mid.y += Math.min(1.4, pa.distanceTo(pb) * 0.22)
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb)
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.045, 8, false), routeMaterial))
  })

  /* 港口节点 + 竖排标签 */
  PORTS.forEach(p => {
    const dot = new THREE.Mesh(
      p.major ? new THREE.ConeGeometry(0.22, 0.5, 16) : new THREE.SphereGeometry(0.13, 12, 12),
      new THREE.MeshBasicMaterial({ color: p.major ? 0xa8352a : 0x3d372f, fog: false })
    )
    dot.position.set(p.x, p.major ? 0.25 : 0.13, p.y)
    scene.add(dot)
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makePortLabel(p.name, !!p.major),
        transparent: true,
        depthWrite: false,
        fog: false,
        toneMapped: false
      })
    )
    const s = p.major ? 1.5 : 1.1
    label.scale.set(s * 0.4, s, 1)
    label.position.set(p.x + 0.55, s * 0.52, p.y - 0.3)
    scene.add(label)
  })

  /* 巡游主体（程序化低模）：chart.traveler 决定形制——sea=宝船 / land=行脚僧 */
  const traveler = new THREE.Group()
  if (chart.traveler === 'land') {
    // 行脚僧：棕袍身 + 斗笠 + 背篓（杖）
    const robe = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.42, 10),
      new THREE.MeshBasicMaterial({ color: 0x6b5138, fog: false })
    )
    robe.position.y = 0.21
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xd9c4a5, fog: false })
    )
    head.position.y = 0.48
    // 斗笠（扁圆锥）
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.08, 12),
      new THREE.MeshBasicMaterial({ color: 0xa89468, fog: false })
    )
    hat.position.y = 0.55
    // 背篓（身后小方筐）
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.2, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x8a6b3a, fog: false })
    )
    pack.position.set(0, 0.34, -0.13)
    traveler.add(robe, head, hat, pack)
  } else {
    // 宝船
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.14, 1.05),
      new THREE.MeshBasicMaterial({ color: 0x54432f, fog: false })
    )
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.1, 0.72),
      new THREE.MeshBasicMaterial({ color: 0x6b5138, fog: false })
    )
    deck.position.y = 0.12
    traveler.add(hull, deck)
    ;[-0.3, 0, 0.3].forEach(z => {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.5 - Math.abs(z) * 0.2, 8),
        new THREE.MeshBasicMaterial({ color: 0x3a2e22, fog: false })
      )
      mast.position.set(0, 0.35 - Math.abs(z) * 0.08, z)
      const sail = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.34 - Math.abs(z) * 0.14),
        new THREE.MeshBasicMaterial({ color: 0xe8dcc0, side: THREE.DoubleSide, fog: false })
      )
      sail.position.set(0, mast.position.y + 0.02, z)
      traveler.add(mast, sail)
    })
  }
  scene.add(traveler)

  /* 主航线巡游曲线（按 chart.mainPath） */
  const mainPath = new THREE.CatmullRomCurve3(chart.mainPath.map(i => portPos(PORTS[i])))

  onFrame((dt, t) => {
    flowUniforms.uTime.value = t
    if (!reducedMotion) {
      // 巡游主体往复巡游
      const span = 7
      const phase = Math.abs(((t * 0.035) % (span * 2)) - span) / span
      traveler.position.copy(mainPath.getPointAt(phase))
      const tangent = mainPath.getTangentAt(phase)
      traveler.rotation.y = Math.atan2(tangent.x, tangent.z)
      // idle 缓慢自转
      if (!dragging) cam.yawT += dt * 0.045
    }
    cam.yaw += (cam.yawT - cam.yaw) * Math.min(1, dt * 4)
    cam.pitch += (cam.pitchT - cam.pitch) * Math.min(1, dt * 4)
    cam.dist += (cam.distT - cam.dist) * Math.min(1, dt * 4)
    // 相机绕航路包围盒中心（focus）环绕；焦点随 yaw 微移，保证航路始终居中
    camera.position.set(
      focus.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      Math.sin(cam.pitch) * cam.dist,
      focus.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist
    )
    camera.lookAt(focus.x, 0, focus.z)
    // 日夜过渡：仅底图染色（透明画布无场景背景可过渡）
    const target = ui.mode === 'night' ? 1 : 0
    ;(chartMesh.material as THREE.MeshBasicMaterial).color.lerp(
      target ? CHART_TINT_NIGHT : CHART_TINT_DAY,
      dt * 2
    )
  })
}

/* 交互 */
function onPointerDown(e: PointerEvent) {
  dragging = true
  last = { x: e.clientX, y: e.clientY }
  try {
    // 捕获指针：拖出画布松手时 pointerup 仍派发到容器，dragging 不会卡死
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    /* 不可捕获时维持旧行为 */
  }
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  const dx = e.clientX - last.x
  const dy = e.clientY - last.y
  last = { x: e.clientX, y: e.clientY }
  cam.yawT = THREE.MathUtils.clamp(cam.yawT + dx * 0.004, -1.1, 1.1)
  cam.pitchT = THREE.MathUtils.clamp(cam.pitchT + dy * 0.003, 0.2, 1.15)
}
function onPointerUp(e: PointerEvent) {
  dragging = false
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* 未捕获或已释放：忽略 */
  }
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  cam.distT = THREE.MathUtils.clamp(cam.distT + e.deltaY * 0.012, 13, 30)
}

onMounted(() => {
  // 窄屏不建场景（挂载处用 hidden md:block 控制显示）
  if (window.innerWidth < 768) return
  watch(
    supported,
    v => {
      if (v) buildScene()
    },
    { immediate: true }
  )
})

onBeforeUnmount(() => {
  document.body.style.cursor = ''
})
</script>

<template>
  <div
    ref="container"
    class="relative w-full h-[420px] md:h-[clamp(480px,56vh,600px)] touch-none select-none cursor-grab active:cursor-grabbing"
    role="img"
    :aria-label="chart.ariaLabel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  >
    <!-- 画布边缘渐隐：四边向页面纸色过渡，消解矩形边界（跟随日夜读变量） -->
    <div class="voyage-vignette" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.voyage-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background:
    linear-gradient(to right, var(--paper-base) 0%, transparent 16%),
    linear-gradient(to left, var(--paper-base) 0%, transparent 16%),
    linear-gradient(to bottom, var(--paper-base) 0%, transparent 18%),
    linear-gradient(to top, var(--paper-base) 0%, transparent 18%);
}
</style>
