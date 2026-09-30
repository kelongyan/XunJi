<script setup lang="ts">
/**
 * 3D 时空长河（首页首屏）
 * 水墨长河 + 远山视差 + 各朝代卷轴浮岛 + 墨滴聚字开场 + 夜读灯影联动。
 * 桌面 / WebGL 可用时渲染；窄屏或 WebGL 不可用 emit('fallback') 交给父组件降级。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { useThreeScene } from '../../composables/useThreeScene'
import { dynastyThemes, type DynastyTheme } from '../../data/dynastyThemes'
import { useUiStore } from '../../stores/ui'

const emit = defineEmits<{
  select: [theme: DynastyTheme]
  fallback: []
  'intro-done': []
  probe: [pos: { x: number; y: number }]
}>()

const container = ref<HTMLElement>()
const ui = useUiStore()
const { supported, getHandle } = useThreeScene(container, { fov: 45, near: 0.1, far: 420 })

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ── 色板（与 style.css token 对应）── */
const DAY = {
  paper: new THREE.Color('#F2EDDC'),
  ink: new THREE.Color('#3D372F'),
  mountain: new THREE.Color('#5A5147'),
  lamp: new THREE.Color('#E8B96A')
}
const NIGHT = {
  paper: new THREE.Color('#1A1611'),
  ink: new THREE.Color('#B8B2A4'),
  mountain: new THREE.Color('#8F887A'),
  lamp: new THREE.Color('#E8B96A')
}

let disposeFns: Array<() => void> = []
let nightTarget = ui.mode === 'night' ? 1 : 0
let nightValue = nightTarget
let introFinished = false

/* ── canvas 纹理工具 ── */
function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  return [c, ctx]
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeMountainTexture(seed: number, alphaTop: number): THREE.CanvasTexture {
  const W = 512
  const H = 160
  const [c, ctx] = makeCanvas(W, H)
  const ridge = (x: number) =>
    H * 0.52 -
    (Math.sin(x * 0.018 + seed * 3.1) * 22 +
      Math.sin(x * 0.045 + seed * 7.7) * 13 +
      Math.sin(x * 0.11 + seed * 13.3) * 5)
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (let x = 0; x <= W; x += 4) ctx.lineTo(x, ridge(x))
  ctx.lineTo(W, H)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, `rgba(74, 68, 58, ${alphaTop})`)
  grad.addColorStop(0.55, `rgba(74, 68, 58, ${alphaTop * 0.45})`)
  grad.addColorStop(1, `rgba(74, 68, 58, 0)`)
  ctx.fillStyle = grad
  ctx.fill()
  return toTexture(c)
}

function makeScrollTexture(theme: DynastyTheme): THREE.CanvasTexture {
  const W = 512
  const H = 768
  const [c, ctx] = makeCanvas(W, H)

  // 纸底
  ctx.fillStyle = '#EFE7D3'
  roundRect(ctx, 26, 14, W - 52, H - 28, 10)
  ctx.fill()
  // 内衬文武线
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.75)'
  ctx.lineWidth = 3
  roundRect(ctx, 44, 32, W - 88, H - 64, 6)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.35)'
  ctx.lineWidth = 1.5
  roundRect(ctx, 54, 42, W - 108, H - 84, 4)
  ctx.stroke()

  // 竖排朝代大字
  ctx.fillStyle = '#2B2620'
  ctx.font = '700 168px "Songti SC", "STSong", "SimSun", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const chars = theme.hanzi.split('')
  const cx = W / 2
  chars.forEach((ch, i) => {
    const total = chars.length * 190
    ctx.fillText(ch, cx, H / 2 - total / 2 + 95 + i * 190)
  })

  // 右上竖排起讫年
  ctx.fillStyle = 'rgba(90, 81, 71, 0.85)'
  ctx.font = '400 26px "Songti SC", "STSong", "SimSun", serif'
  const spanChars = theme.span.split('')
  spanChars.forEach((ch, i) => {
    ctx.fillText(ch, W - 86, 92 + i * 30)
  })

  // 左下印章
  ctx.save()
  if (theme.live) {
    ctx.fillStyle = theme.accent
    roundRect(ctx, 66, H - 176, 104, 104, 10)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '800 58px "Songti SC", "STSong", "SimSun", serif'
    ctx.fillText(theme.hanzi, 66 + 52, H - 176 + 54)
  } else {
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 5
    ctx.globalAlpha = 0.55
    roundRect(ctx, 66, H - 176, 104, 104, 10)
    ctx.stroke()
    ctx.fillStyle = theme.accent
    ctx.font = '800 58px "Songti SC", "STSong", "SimSun", serif'
    ctx.fillText(theme.hanzi, 66 + 52, H - 176 + 54)
    // 修典中题记
    ctx.font = '400 30px "Kaiti SC", "KaiTi", "STKaiti", serif'
    ctx.fillStyle = 'rgba(61, 55, 47, 0.7)'
    ctx.fillText('修 典 中', 66 + 52, H - 214)
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // 上下轴头（卷轴杆）
  ctx.fillStyle = '#3A2E22'
  roundRect(ctx, 0, 0, W, 20, 6)
  ctx.fill()
  roundRect(ctx, 0, H - 20, W, 20, 6)
  ctx.fill()
  ctx.fillStyle = '#54432F'
  roundRect(ctx, -8, 0, 18, 20, 6)
  ctx.fill()
  roundRect(ctx, W - 10, 0, 18, 20, 6)
  ctx.fill()
  roundRect(ctx, -8, H - 20, 18, 20, 6)
  ctx.fill()
  roundRect(ctx, W - 10, H - 20, 18, 20, 6)
  ctx.fill()

  return toTexture(c)
}

function makeLampTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(232, 185, 106, 0.85)')
  g.addColorStop(0.4, 'rgba(232, 185, 106, 0.35)')
  g.addColorStop(1, 'rgba(232, 185, 106, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return toTexture(c)
}

function makeDotTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(32, 32)
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15)
  g.addColorStop(0, 'rgba(61, 55, 47, 0.9)')
  g.addColorStop(1, 'rgba(61, 55, 47, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 32)
  return toTexture(c)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* ── 长河 shader ── */
const RIVER_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const RIVER_FRAG = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uLamp;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = vWorld.xz * 0.055;
  p.y -= uTime * 0.22;
  float n = fbm(p + fbm(p * 0.6) * 0.7);
  float contour = abs(fract(n * 3.0 - uTime * 0.05) - 0.5) * 2.0;
  float shore = smoothstep(26.0, 9.0, abs(vWorld.x));
  float inkLine = smoothstep(0.82, 1.0, 1.0 - contour) * smoothstep(0.35, 0.75, n);
  float base = smoothstep(0.2, 0.8, n) * 0.28;
  vec3 col = mix(uPaper, uInk, (base + inkLine * 0.5) * (0.2 + 0.8 * shore));
  float lane = exp(-pow(vWorld.x / 7.0, 2.0));
  col += uInk * lane * 0.06;
  col += uLamp * lane * uNight * (0.16 + 0.08 * sin(uTime * 0.8 + vWorld.z * 0.35));
  gl_FragColor = vec4(col, 1.0);
}
`

/* ── 场景构建 ── */
interface Island {
  theme: DynastyTheme
  mesh: THREE.Mesh
  baseY: number
  glowMat: THREE.MeshBasicMaterial
  lampMat: THREE.MeshBasicMaterial
  wobbleRemaining: number
}

let islands: Island[] = []
let riverUniforms: Record<string, THREE.IUniform> | null = null
let intro: {
  points: THREE.Points
  mat: THREE.PointsMaterial
  geo: THREE.BufferGeometry
  scatter: Float32Array
  targets: Float32Array
  startTime: number
} | null = null
let camState = { yaw: 0, pitch: 0, yawT: 0, pitchT: 0, z: 24, zT: 24 }
let raycaster: THREE.Raycaster | null = null
let pointerNdc = new THREE.Vector2(-10, -10)
let hoverIsland: Island | null = null
let dragging = false
let dragMoved = 0
let dragStart = { x: 0, y: 0 }

function buildScene() {
  const handle = getHandle()
  if (!handle) return
  const { scene, camera, onFrame } = handle

  // 重置模块级开场状态（支持组件重挂载）
  introFinished = false

  const startNight = ui.mode === 'night'
  nightValue = startNight ? 1 : 0
  nightTarget = nightValue

  scene.background = (startNight ? NIGHT.paper : DAY.paper).clone()
  scene.fog = new THREE.Fog(scene.background.clone(), 42, 150)

  camera.position.set(0, reducedMotion ? 6.5 : 15, reducedMotion ? 24 : 46)
  camState.z = reducedMotion ? 24 : 46
  camState.zT = 24

  /* 长河 */
  const riverGeo = new THREE.PlaneGeometry(320, 240)
  riverGeo.rotateX(-Math.PI / 2)
  riverUniforms = {
    uTime: { value: 0 },
    uNight: { value: nightValue },
    uPaper: { value: (startNight ? NIGHT.paper : DAY.paper).clone() },
    uInk: { value: (startNight ? NIGHT.ink : DAY.ink).clone() },
    uLamp: { value: DAY.lamp.clone() }
  }
  const river = new THREE.Mesh(
    riverGeo,
    new THREE.ShaderMaterial({
      uniforms: riverUniforms,
      vertexShader: RIVER_VERT,
      fragmentShader: RIVER_FRAG,
      fog: false
    })
  )
  river.position.set(0, 0, -40)
  scene.add(river)

  /* 远山（四层视差） */
  const mountains: THREE.Mesh[] = []
  const mtnCfg = [
    { z: -86, scale: 1.35, alpha: 0.16 },
    { z: -62, scale: 1.15, alpha: 0.24 },
    { z: -40, scale: 0.95, alpha: 0.34 },
    { z: -22, scale: 0.8, alpha: 0.46 }
  ]
  mtnCfg.forEach((cfg, i) => {
    const tex = makeMountainTexture(i * 4.7 + 1.3, cfg.alpha)
    const geo = new THREE.PlaneGeometry(210 * cfg.scale, 46 * cfg.scale)
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })
    const m = new THREE.Mesh(geo, mat)
    m.position.set(0, 8, cfg.z)
    scene!.add(m)
    mountains.push(m)
  })
  onFrame((_dt, t) => {
    mountains.forEach((m, i) => {
      m.position.x = Math.sin(t * 0.03 + i * 1.7) * (1.6 + i * 0.8)
    })
  })

  /* 朝代卷轴浮岛 */
  const lampTex = makeLampTexture()
  const layout: Record<string, [number, number, number]> = {
    han: [-13, 2.6, -46],
    tang: [10, 2.6, -34],
    song: [-6, 2.6, -22],
    qing: [12, 2.6, -14],
    ming: [3.5, 2.6, -7]
  }
  islands = dynastyThemes.map(theme => {
    const tex = makeScrollTexture(theme)
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 5.1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, toneMapped: false })
    )
    const [x, y, z] = layout[theme.id] ?? [0, 2.6, -10]
    mesh.position.set(x, y, z)
    scene!.add(mesh)

    // 浮岛主题色微光（衬底）
    const glowMat = new THREE.MeshBasicMaterial({
      map: lampTex,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    })
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.5), glowMat)
    glow.position.set(x, y + 0.4, z - 0.2)
    scene!.add(glow)

    // 水面灯影（夜读可见）
    const lampMat = new THREE.MeshBasicMaterial({
      map: lampTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    })
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.4), lampMat)
    lamp.rotation.x = -Math.PI / 2
    lamp.position.set(x, 0.03, z + 1.2)
    scene!.add(lamp)

    return { theme, mesh, baseY: y, glowMat, lampMat, wobbleRemaining: 0 }
  })

  onFrame((dt, t) => {
    islands.forEach((isl, i) => {
      const hoverLift = hoverIsland === isl ? 0.35 : 0
      let wobble = 0
      if (isl.wobbleRemaining > 0) {
        isl.wobbleRemaining -= dt
        wobble = Math.sin(isl.wobbleRemaining * 22) * 0.14 * isl.wobbleRemaining * 2
      }
      const targetY = isl.baseY + Math.sin(t * 0.7 + i * 2.1) * 0.1 + hoverLift
      isl.mesh.position.y += (targetY - isl.mesh.position.y) * Math.min(1, dt * 6)
      isl.mesh.rotation.z = wobble
      const lampTarget = nightValue * (isl.theme.live ? 0.85 : 0.4)
      isl.lampMat.opacity += (lampTarget - isl.lampMat.opacity) * Math.min(1, dt * 3)
      const glowTarget = (isl.theme.live ? 0.3 : 0.14) + nightValue * 0.22
      isl.glowMat.opacity += (glowTarget - isl.glowMat.opacity) * Math.min(1, dt * 3)
    })
  })

  /* 墨点粒子 */
  const dotTex = makeDotTexture()
  const COUNT = reducedMotion ? 0 : 850
  if (COUNT > 0) {
    const pos = new Float32Array(COUNT * 3)
    const speeds = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120
      pos[i * 3 + 1] = Math.random() * 14 + 0.3
      pos[i * 3 + 2] = -Math.random() * 100 + 8
      speeds[i] = 0.15 + Math.random() * 0.25
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.24,
      map: dotTex,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      fog: false
    })
    const points = new THREE.Points(geo, mat)
    scene.add(points)
    onFrame(dt => {
      const arr = geo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < COUNT; i++) {
        let y = arr.getY(i) + speeds[i] * dt
        if (y > 14.5) y = 0.3
        arr.setY(i, y)
      }
      arr.needsUpdate = true
    })
  }

  /* 墨滴聚字开场（每次会话只播一次） */
  if (!reducedMotion && !sessionStorage.getItem('xunji-intro-seen')) {
    intro = buildIntro(scene)
    onFrame((_dt, t) => updateIntro(t))
  } else {
    introFinished = true
    emit('intro-done')
  }

  /* 相机与日夜过渡主循环 */
  onFrame((dt, t) => {
    // 相机入场 + 滚轮缩放
    camState.z += (camState.zT - camState.z) * Math.min(1, dt * 1.4)
    if (!reducedMotion) camState.zT += (24 - camState.zT) * Math.min(1, dt * 0.55)
    camera.position.z = camState.z
    camera.position.y = 6.5 + (camState.z - 24) * 0.28

    // 拖拽环视 + idle 扫视
    camState.yaw += (camState.yawT - camState.yaw) * Math.min(1, dt * 4)
    camState.pitch += (camState.pitchT - camState.pitch) * Math.min(1, dt * 4)
    if (!dragging) {
      camState.yawT += (0 - camState.yawT) * Math.min(1, dt * 0.8)
      camState.pitchT += (0 - camState.pitchT) * Math.min(1, dt * 0.8)
    }
    const idleX = reducedMotion ? 0 : Math.sin(t * 0.07) * 1.4
    camera.lookAt(camState.yaw * 9 + idleX - 1.6, 2.2 - camState.pitch * 6, -12)

    // 日夜过渡
    nightValue += (nightTarget - nightValue) * Math.min(1, dt * 2)
    if (riverUniforms) {
      riverUniforms.uTime.value = t
      riverUniforms.uNight.value = nightValue
      ;(riverUniforms.uPaper.value as THREE.Color).lerp(nightTarget ? NIGHT.paper : DAY.paper, dt * 2)
      ;(riverUniforms.uInk.value as THREE.Color).lerp(nightTarget ? NIGHT.ink : DAY.ink, dt * 2)
    }
    if (scene.background instanceof THREE.Color) {
      scene.background.lerp(nightTarget ? NIGHT.paper : DAY.paper, dt * 2)
      if (scene.fog) (scene.fog as THREE.Fog).color.copy(scene.background)
    }

    // hover 拾取
    if (raycaster && !dragging) {
      raycaster.setFromCamera(pointerNdc, camera)
      const hits = raycaster.intersectObjects(islands.map(i => i.mesh), false)
      const first = hits[0]?.object
      const found = islands.find(i => i.mesh === first) ?? null
      if (found !== hoverIsland) {
        hoverIsland = found
        document.body.style.cursor = found ? 'pointer' : ''
      }
    }
  })

  raycaster = new THREE.Raycaster()
}

/* ── 墨滴聚字 ── */
function buildIntro(scene: THREE.Scene) {
  const [, ctx] = makeCanvas(340, 170)
  ctx.fillStyle = '#000'
  ctx.font = '900 132px "Songti SC", "STSong", "SimSun", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('寻迹', 170, 88)
  const data = ctx.getImageData(0, 0, 340, 170).data

  const targets: number[] = []
  for (let y = 0; y < 170; y += 3) {
    for (let x = 0; x < 340; x += 3) {
      if (data[(y * 340 + x) * 4 + 3] > 128) {
        // 映射到相机前平面：全宽视锥下字幅放大，z = 12
        targets.push(((x / 340) - 0.5) * 17.5, 7.4 - ((y / 170) - 0.5) * 6.6, 12)
      }
    }
  }
  const N = targets.length / 3
  const scatter = new Float32Array(N * 3)
  const arr = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    scatter[i * 3] = (Math.random() - 0.5) * 60
    scatter[i * 3 + 1] = Math.random() * 16
    scatter[i * 3 + 2] = 12 - Math.random() * 30
    arr[i * 3] = scatter[i * 3]
    arr[i * 3 + 1] = scatter[i * 3 + 1]
    arr[i * 3 + 2] = scatter[i * 3 + 2]
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.14,
    color: new THREE.Color('#2B2620'),
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  })
  const points = new THREE.Points(geo, mat)
  scene.add(points)
  return { points, mat, scatter, targets: new Float32Array(targets), startTime: -1, geo }
}

function updateIntro(t: number) {
  if (!intro || introFinished) return
  if (intro.startTime < 0) intro.startTime = t
  const local = t - intro.startTime
  const arr = intro.geo.getAttribute('position') as THREE.BufferAttribute
  const N = arr.count
  if (local < 0.4) return
  const gather = Math.min(1, (local - 0.4) / 2.2)
  const e = 1 - Math.pow(1 - gather, 3)
  if (gather < 1) {
    for (let i = 0; i < N; i++) {
      const jx = Math.sin(t * 3 + i) * 0.06 * (1 - gather)
      arr.setX(i, intro.scatter[i * 3] + (intro.targets[i * 3] - intro.scatter[i * 3]) * e + jx)
      arr.setY(i, intro.scatter[i * 3 + 1] + (intro.targets[i * 3 + 1] - intro.scatter[i * 3 + 1]) * e)
      arr.setZ(i, intro.targets[i * 3 + 2])
    }
    arr.needsUpdate = true
  } else if (local < 3.6) {
    const fade = (local - 2.6) / 1.0
    intro.mat.opacity = Math.max(0, 0.92 * (1 - fade))
    for (let i = 0; i < N; i++) {
      arr.setY(i, intro.targets[i * 3 + 1] + fade * fade * 2.2)
    }
    arr.needsUpdate = true
  } else {
    finishIntro()
  }
}

function finishIntro() {
  if (introFinished) return
  introFinished = true
  sessionStorage.setItem('xunji-intro-seen', '1')
  if (intro) {
    intro.mat.visible = false
    intro.points.visible = false
  }
  emit('intro-done')
}

/* ── 交互 ── */
function onPointerMove(e: PointerEvent) {
  if (!container.value) return
  const rect = container.value.getBoundingClientRect()
  pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  if (dragging) {
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    dragMoved = Math.max(dragMoved, Math.abs(dx) + Math.abs(dy))
    camState.yawT = THREE.MathUtils.clamp(camState.yawT + dx * 0.0016, -0.5, 0.5)
    camState.pitchT = THREE.MathUtils.clamp(camState.pitchT + dy * 0.0016, -0.28, 0.28)
    dragStart = { x: e.clientX, y: e.clientY }
  }
}

function onPointerDown(e: PointerEvent) {
  dragging = true
  dragMoved = 0
  dragStart = { x: e.clientX, y: e.clientY }
  if (!introFinished) finishIntro()
}

function onPointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  if (dragMoved < 6 && hoverIsland) {
    const isl = hoverIsland
    if (isl.theme.live) {
      ui.inkFlash(isl.theme.sealText, () => emit('select', isl.theme))
    } else {
      // 修典中：抖动示意，不可进入
      isl.wobbleRemaining = 0.5
    }
  } else if (dragMoved < 6 && !hoverIsland && introFinished) {
    // 点墨捞史：点击长河空白处，捞起一叶史册
    emit('probe', { x: e.clientX, y: e.clientY })
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!introFinished) finishIntro()
  camState.zT = THREE.MathUtils.clamp(camState.zT + e.deltaY * 0.012, 17, 40)
}

function onKeydown() {
  if (!introFinished) finishIntro()
}

onMounted(() => {
  // 窄屏或 WebGL 不可用 → 降级静态 Hero
  if (window.innerWidth < 768) {
    emit('fallback')
    return
  }
  // useThreeScene 的初始化先于本钩子执行：true 立即建场景，false（WebGL 不可用）降级
  watch(
    supported,
    v => {
      if (v) buildScene()
      else emit('fallback')
    },
    { immediate: true }
  )

  window.addEventListener('keydown', onKeydown)
  disposeFns.push(() => window.removeEventListener('keydown', onKeydown))
})

onBeforeUnmount(() => {
  document.body.style.cursor = ''
  disposeFns.forEach(fn => fn())
  disposeFns = []
})

/* 夜读切换（由 store 驱动） */
watch(
  () => ui.mode,
  mode => {
    nightTarget = mode === 'night' ? 1 : 0
  }
)
</script>

<template>
  <div
    ref="container"
    class="absolute inset-0 touch-none select-none"
    role="img"
    aria-label="水墨时空长河：自汉至清各朝代卷轴浮岛，点击明朝卷轴进入"
    @pointermove="onPointerMove"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  />
</template>
