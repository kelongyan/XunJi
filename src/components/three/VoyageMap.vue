<script setup lang="ts">
/**
 * 郑和下西洋 · 针路图（详情页内嵌 3D 场景）
 * 仿《郑和航海图》罗盘针路风格：纸底图 + 金色飞线 + 宝船沿线巡游。
 * 航点为历史航路的风格化示意（非精确地理投影）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { useThreeScene } from '../../composables/useThreeScene'
import { useUiStore } from '../../stores/ui'

const container = ref<HTMLElement>()
const ui = useUiStore()
const { supported, getHandle } = useThreeScene(container, { fov: 50, near: 0.1, far: 200 })

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const PAPER_DAY = new THREE.Color('#F2EDDC')
const PAPER_NIGHT = new THREE.Color('#1A1611')
const CHART_TINT_DAY = new THREE.Color('#FFFFFF')
const CHART_TINT_NIGHT = new THREE.Color('#5E584C')

/* 航点（风格化坐标，非地理投影） */
interface Port {
  name: string
  x: number
  y: number
  major?: boolean
}
const PORTS: Port[] = [
  { name: '刘家港', x: -16, y: 5.5, major: true },
  { name: '长乐港', x: -13.5, y: 3.8 },
  { name: '占城', x: -11, y: 2.2 },
  { name: '满剌加', x: -6, y: 0.4, major: true },
  { name: '苏门答腊', x: -4, y: -0.8 },
  { name: '锡兰山', x: -0.5, y: -1.6 },
  { name: '古里', x: 2.5, y: -2.2, major: true },
  { name: '忽鲁谟斯', x: 7.5, y: -3.6 },
  { name: '天方', x: 4.5, y: -6 },
  { name: '木骨都束', x: 8.5, y: -6.4 }
]
/* 航线段（按航点索引；古里为西向枢纽） */
const ROUTES: number[][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
  [6, 7], [6, 8], [6, 9]
]

/* 相机控制状态（交互与渲染循环共享同一份） */
const cam = { yaw: 0, pitch: 0.62, yawT: 0, pitchT: 0.62, dist: 20, distT: 20 }
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

/** 古地图底图：纸底 + 针路网格 + 罗盘 + 西洋水域晕染 */
function makeChartTexture(): THREE.CanvasTexture {
  const W = 1024
  const H = 563
  const [c, ctx] = makeCanvas(W, H)
  ctx.fillStyle = '#EFE7D3'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.10)'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = 0; y <= H; y += 64) {
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
  // 罗盘
  const cx = W - 108
  const cy = 108
  const r = 58
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
  // 题跋
  ctx.fillStyle = 'rgba(61, 55, 47, 0.75)'
  ctx.font = '400 22px "Kaiti SC", "KaiTi", "STKaiti", serif'
  ctx.fillText('自刘家港开船至忽鲁谟斯诸番 · 针路摹本', 26, H - 30)
  // 文武边框
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.7)'
  ctx.lineWidth = 4
  ctx.strokeRect(10, 10, W - 20, H - 20)
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.3)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(20, 20, W - 40, H - 40)
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

  scene.background = (ui.mode === 'night' ? PAPER_NIGHT : PAPER_DAY).clone()

  /* 底图 */
  const chart = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 22),
    new THREE.MeshBasicMaterial({ map: makeChartTexture(), fog: false, toneMapped: false })
  )
  chart.rotation.x = -Math.PI / 2
  scene.add(chart)

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
  const portPos = (p: Port) => new THREE.Vector3(p.x, 0.12, p.y)
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

  /* 宝船（程序化低模） */
  const ship = new THREE.Group()
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.14, 1.05),
    new THREE.MeshBasicMaterial({ color: 0x54432f, fog: false })
  )
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.1, 0.72),
    new THREE.MeshBasicMaterial({ color: 0x6b5138, fog: false })
  )
  deck.position.y = 0.12
  ship.add(hull, deck)
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
    ship.add(mast, sail)
  })
  scene.add(ship)

  /* 主航线巡游曲线（刘家港→古里） */
  const mainPath = new THREE.CatmullRomCurve3([0, 1, 2, 3, 4, 5, 6].map(i => portPos(PORTS[i])))

  onFrame((dt, t) => {
    flowUniforms.uTime.value = t
    if (!reducedMotion) {
      // 宝船往复巡游
      const span = 7
      const phase = Math.abs(((t * 0.035) % (span * 2)) - span) / span
      ship.position.copy(mainPath.getPointAt(phase))
      const tangent = mainPath.getTangentAt(phase)
      ship.rotation.y = Math.atan2(tangent.x, tangent.z)
      // idle 缓慢自转
      if (!dragging) cam.yawT += dt * 0.045
    }
    cam.yaw += (cam.yawT - cam.yaw) * Math.min(1, dt * 4)
    cam.pitch += (cam.pitchT - cam.pitch) * Math.min(1, dt * 4)
    cam.dist += (cam.distT - cam.dist) * Math.min(1, dt * 4)
    camera.position.set(
      Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      Math.sin(cam.pitch) * cam.dist,
      Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist
    )
    camera.lookAt(0, 0, -0.5)
    // 日夜过渡
    const target = ui.mode === 'night' ? 1 : 0
    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(target ? PAPER_NIGHT : PAPER_DAY, dt * 2)
    }
    ;(chart.material as THREE.MeshBasicMaterial).color.lerp(
      target ? CHART_TINT_NIGHT : CHART_TINT_DAY,
      dt * 2
    )
  })
}

/* 交互 */
function onPointerDown(e: PointerEvent) {
  dragging = true
  last = { x: e.clientX, y: e.clientY }
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  const dx = e.clientX - last.x
  const dy = e.clientY - last.y
  last = { x: e.clientX, y: e.clientY }
  cam.yawT = THREE.MathUtils.clamp(cam.yawT + dx * 0.004, -1.1, 1.1)
  cam.pitchT = THREE.MathUtils.clamp(cam.pitchT + dy * 0.003, 0.2, 1.15)
}
function onPointerUp() {
  dragging = false
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
    class="relative w-full h-[380px] md:h-[440px] touch-none select-none cursor-grab active:cursor-grabbing"
    role="img"
    aria-label="郑和下西洋针路图：自刘家港至忽鲁谟斯等诸番航路，金色飞线，宝船巡游"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  />
</template>
