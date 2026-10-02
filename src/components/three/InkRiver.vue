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
  /** 悬停卷轴（可显示浮签：名称/年代/题记）；离开为 null */
  hover: [theme: DynastyTheme | null]
}>()

const container = ref<HTMLElement>()
const ui = useUiStore()
const { supported, getHandle } = useThreeScene(container, { fov: 45, near: 0.1, far: 420 })

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* 河面灯火（夜读灯影，昼夜统一暖金色） */
const LAMP = new THREE.Color('#E8B96A')

/* ── 色板（与 style.css token 对应）── */
const DAY = {
  paper: new THREE.Color('#F2EDDC'),
  ink: new THREE.Color('#3D372F'),
  mountain: new THREE.Color('#5A5147'),
  /** 卷轴纸面日读原色（不染色） */
  scrollTint: new THREE.Color('#FFFFFF'),
  /** 漂浮墨点日读色 */
  dust: new THREE.Color('#3D372F'),
  /** 聚字开场墨色 */
  intro: new THREE.Color('#2B2620')
}
const NIGHT = {
  paper: new THREE.Color('#1A1611'),
  ink: new THREE.Color('#B8B2A4'),
  mountain: new THREE.Color('#6E675B'),
  /** 夜读卷轴纸面：暖黄灯下纸 */
  scrollTint: new THREE.Color('#EFDFC0'),
  /** 夜读漂浮微尘（浅暖灰） */
  dust: new THREE.Color('#C9C0AE'),
  /** 夜读聚字（暖白） */
  intro: new THREE.Color('#EDE6D6')
}

let disposeFns: Array<() => void> = []
let nightTarget = ui.mode === 'night' ? 1 : 0
let nightValue = nightTarget
let introFinished = false
const _tmpColor = new THREE.Color()

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

/** 山形纹理：只烘白色 + 透明度（颜色交给 material 染色，日/夜可过渡） */
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
  grad.addColorStop(0, `rgba(255, 255, 255, ${alphaTop})`)
  grad.addColorStop(0.55, `rgba(255, 255, 255, ${alphaTop * 0.45})`)
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = grad
  ctx.fill()
  return toTexture(c)
}

function makeScrollTexture(theme: DynastyTheme): THREE.CanvasTexture {
  const W = 640
  const H = 960
  const [c, ctx] = makeCanvas(W, H)
  const INK = '#2B2620'

  const paperX = 34
  const paperY = 36
  const paperW = W - 68
  const paperH = H - paperY - 36

  // ── 纸面（暖纸底 + 纵向微渐变）──
  const paperGrad = ctx.createLinearGradient(0, paperY, 0, paperY + paperH)
  paperGrad.addColorStop(0, '#F2EBD9')
  paperGrad.addColorStop(0.5, '#EDE5D0')
  paperGrad.addColorStop(1, '#E6DCC2')
  ctx.fillStyle = paperGrad
  roundRect(ctx, paperX, paperY, paperW, paperH, 6)
  ctx.fill()

  // 纸纹（细密墨点，克制）
  ctx.save()
  roundRect(ctx, paperX, paperY, paperW, paperH, 6)
  ctx.clip()
  for (let i = 0; i < 900; i++) {
    const px = paperX + Math.random() * paperW
    const py = paperY + Math.random() * paperH
    ctx.fillStyle = `rgba(88, 76, 58, ${0.015 + Math.random() * 0.035})`
    ctx.fillRect(px, py, 1.4, 1.4)
  }
  ctx.restore()

  // 纸边轻描
  ctx.strokeStyle = 'rgba(58, 48, 36, 0.45)'
  ctx.lineWidth = 2
  roundRect(ctx, paperX + 1, paperY + 1, paperW - 2, paperH - 2, 6)
  ctx.stroke()

  // 内衬文武线（外粗内细）
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.6)'
  ctx.lineWidth = 2.5
  roundRect(ctx, paperX + 24, paperY + 24, paperW - 48, paperH - 48, 3)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.26)'
  ctx.lineWidth = 1
  roundRect(ctx, paperX + 35, paperY + 35, paperW - 70, paperH - 70, 2)
  ctx.stroke()

  // ── 竖排文字（题记在左 / 年代在右）──
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 左：一句话题记（去间隔点，竖排）
  const tagline = theme.tagline.replace(/[·\s]/g, '')
  ctx.fillStyle = 'rgba(74, 66, 54, 0.8)'
  ctx.font = '400 30px "Kaiti SC", "KaiTi", "STKaiti", serif'
  const tlX = paperX + 64
  const tlStart = H / 2 - (tagline.length * 38) / 2 + 19
  tagline.split('').forEach((ch, i) => ctx.fillText(ch, tlX, tlStart + i * 38))
  // 右：起讫年
  ctx.fillStyle = 'rgba(90, 81, 71, 0.78)'
  ctx.font = '400 27px "Songti SC", "STSong", "SimSun", serif'
  const spanChars = theme.span.replace(/\s/g, '').split('')
  spanChars.forEach((ch, i) => ctx.fillText(ch, W - paperX - 62, paperY + 46 + i * 32))

  // ── 朝代大字（居中，上下主题色题头线）──
  const bigY = H * 0.5 - 10
  ctx.font = '700 206px "Songti SC", "STSong", "SimSun", serif'
  ctx.fillStyle = INK
  ctx.fillText(theme.hanzi, W / 2, bigY)
  ctx.fillStyle = theme.accent
  ctx.globalAlpha = 0.8
  ctx.fillRect(W / 2 - 42, bigY - 158, 84, 4)
  ctx.fillRect(W / 2 - 42, bigY + 132, 84, 4)
  ctx.globalAlpha = 1

  // ── 左下印章（主题色；修典中为描边）──
  const sealSize = 118
  const sealX = paperX + 50
  const sealY = paperY + paperH - sealSize - 52
  ctx.save()
  if (theme.live) {
    ctx.fillStyle = theme.accent
    roundRect(ctx, sealX, sealY, sealSize, sealSize, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 250, 240, 0.5)'
    ctx.lineWidth = 2
    roundRect(ctx, sealX + 7, sealY + 7, sealSize - 14, sealSize - 14, 8)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 252, 245, 0.96)'
    ctx.font = '800 62px "Songti SC", "STSong", "SimSun", serif'
    ctx.fillText(theme.hanzi, sealX + sealSize / 2, sealY + sealSize / 2 + 4)
  } else {
    ctx.strokeStyle = theme.accent
    ctx.lineWidth = 5
    ctx.globalAlpha = 0.6
    roundRect(ctx, sealX, sealY, sealSize, sealSize, 12)
    ctx.stroke()
    ctx.fillStyle = theme.accent
    ctx.font = '800 62px "Songti SC", "STSong", "SimSun", serif'
    ctx.fillText(theme.hanzi, sealX + sealSize / 2, sealY + sealSize / 2 + 4)
    ctx.font = '400 30px "Kaiti SC", "KaiTi", "STKaiti", serif'
    ctx.fillStyle = 'rgba(61, 55, 47, 0.7)'
    ctx.fillText('修 典 中', sealX + sealSize / 2, sealY - 30)
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // ── 上下轴杆（圆柱感 + 轴头，伸出纸面）──
  const drawRod = (y: number) => {
    const g = ctx.createLinearGradient(0, y, 0, y + 32)
    g.addColorStop(0, '#6E543A')
    g.addColorStop(0.3, '#8A6B47')
    g.addColorStop(0.6, '#5A4229')
    g.addColorStop(1, '#39291A')
    ctx.fillStyle = g
    ctx.fillRect(paperX - 18, y, paperW + 36, 32)
    // 轴头（端面）
    ctx.fillStyle = '#2C2014'
    roundRect(ctx, paperX - 34, y - 4, 24, 40, 5)
    ctx.fill()
    roundRect(ctx, paperX + paperW + 10, y - 4, 24, 40, 5)
    ctx.fill()
    // 高光
    ctx.fillStyle = 'rgba(255, 240, 214, 0.2)'
    ctx.fillRect(paperX - 18, y + 6, paperW + 36, 3)
  }
  drawRod(6)
  drawRod(H - 38)

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
  baseScale: number
  glowMat: THREE.MeshBasicMaterial
  lampMat: THREE.MeshBasicMaterial
  paperMat: THREE.MeshBasicMaterial
  ringMat: THREE.MeshBasicMaterial
  reflectMat: THREE.MeshBasicMaterial
  wobbleRemaining: number
}

let islands: Island[] = []
let riverUniforms: Record<string, THREE.IUniform> | null = null
let mountainMats: THREE.MeshBasicMaterial[] = []
let dustMat: THREE.PointsMaterial | null = null
let intro: {
  points: THREE.Points
  mat: THREE.PointsMaterial
  geo: THREE.BufferGeometry
  scatter: Float32Array
  targets: Float32Array
  startTime: number
} | null = null
let camState = { yaw: 0, pitch: 0, yawT: 0, pitchT: 0, z: 24, zT: 24 }
/** 相机基准距离（沉浸态全屏画布推近构图，退出恢复 24） */
let baseZ = 24
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
  mountainMats = []
  dustMat = null

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
    uLamp: { value: LAMP.clone() }
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

  /* 远山（四层视差；颜色由 material 染色，随日夜过渡） */
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
    // 近山更实、远山更淡（夜读时统一向夜色收敛）
    mat.color.copy(startNight ? NIGHT.mountain : DAY.mountain)
    mat.color.multiplyScalar(1 - i * 0.06)
    mountainMats.push(mat)
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

  /* 朝代卷轴浮岛：五卷沿长河展卷（近大远小）
   * 世界坐标经透视反解并做矩形碰撞校验：自汉（左上远）至清（右下近）成一条展卷弧线，
   * 全部落位在画面右侧 60%~91% 区，避开左侧标题与检索区；底边统一贴水面。 */
  const lampTex = makeLampTexture()
  const layout: Record<string, { pos: [number, number, number]; scale: number }> = {
    han: { pos: [11.83, 2.7, -52], scale: 1.0 },
    tang: { pos: [16.29, 2.71, -38], scale: 1.0 },
    song: { pos: [18.46, 2.73, -26], scale: 1.0 },
    ming: { pos: [18.32, 3.0, -15], scale: 1.1 },
    qing: { pos: [18.83, 2.77, -7], scale: 1.0 }
  }
  islands = dynastyThemes.map(theme => {
    const tex = makeScrollTexture(theme)
    const paperMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      fog: false,
      toneMapped: false
    })
    // 夜读把纸面染暖（灯下纸），日读保持原色
    paperMat.color.copy(startNight ? NIGHT.scrollTint : DAY.scrollTint)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.1), paperMat)
    const cfg = layout[theme.id] ?? { pos: [0, 2.6, -10] as [number, number, number], scale: 1 }
    const [x, y, z] = cfg.pos
    mesh.position.set(x, y, z)
    mesh.scale.setScalar(cfg.scale)
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

    // 悬停朱砂描框（默认全透明，hover 时浮现）
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xa8352a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide
    })
    const ringGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.4 * cfg.scale + 0.35, 5.1 * cfg.scale + 0.35))
    const ring = new THREE.LineSegments(ringGeo, ringMat)
    ring.position.set(x, y, z + 0.05)
    scene!.add(ring)

    // 水面倒影：卷轴纹理垂直翻转压扁，淡出在水面（浮岛感的关键）
    const reflectTex = tex.clone()
    reflectTex.needsUpdate = true
    reflectTex.wrapS = reflectTex.wrapT = THREE.ClampToEdgeWrapping
    reflectTex.repeat.set(1, -0.42)   // 纵向翻转 + 压扁
    reflectTex.offset.set(0, 0.42)
    const reflectMat = new THREE.MeshBasicMaterial({
      map: reflectTex,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      fog: false
    })
    const reflect = new THREE.Mesh(new THREE.PlaneGeometry(3.4 * cfg.scale, 2.1 * cfg.scale), reflectMat)
    reflect.rotation.x = -Math.PI / 2
    reflect.position.set(x, 0.02, z + 2.35 * cfg.scale)
    scene!.add(reflect)

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

    return { theme, mesh, baseY: y, baseScale: cfg.scale, glowMat, lampMat, paperMat, ringMat, reflectMat, wobbleRemaining: 0 }
  })

  onFrame((dt, t) => {
    islands.forEach((isl, i) => {
      const isHover = hoverIsland === isl
      const hoverLift = isHover ? 0.45 : 0
      let wobble = 0
      if (isl.wobbleRemaining > 0) {
        isl.wobbleRemaining -= dt
        wobble = Math.sin(isl.wobbleRemaining * 22) * 0.14 * isl.wobbleRemaining * 2
      }
      const targetY = isl.baseY + Math.sin(t * 0.7 + i * 2.1) * 0.1 + hoverLift
      isl.mesh.position.y += (targetY - isl.mesh.position.y) * Math.min(1, dt * 6)
      isl.mesh.rotation.z = wobble
      // 悬停放大 4%（反馈存在感，不做夸张）
      const sTarget = isl.baseScale * (isHover ? 1.04 : 1)
      isl.mesh.scale.setScalar(isl.mesh.scale.x + (sTarget - isl.mesh.scale.x) * Math.min(1, dt * 7))
      const lampTarget = nightValue * (isl.theme.live ? 0.85 : 0.4)
      isl.lampMat.opacity += (lampTarget - isl.lampMat.opacity) * Math.min(1, dt * 3)
      const glowTarget = (isl.theme.live ? 0.3 : 0.14) + nightValue * 0.22 + (isHover ? 0.16 : 0)
      isl.glowMat.opacity += (glowTarget - isl.glowMat.opacity) * Math.min(1, dt * 3)
      // 悬停描框：可入卷的点亮朱砂，修典中的用灰墨弱描
      const ringTarget = isHover ? (isl.theme.live ? 0.55 : 0.22) : 0
      isl.ringMat.opacity += (ringTarget - isl.ringMat.opacity) * Math.min(1, dt * 6)
      isl.ringMat.color.set(isl.theme.live ? isl.theme.accent : '#8c8378')
      // 倒影：日读淡、夜读浓（灯影落水），悬停再亮一档
      const reflTarget = (0.14 + nightValue * 0.24) * (isHover ? 1.6 : 1)
      isl.reflectMat.opacity += (reflTarget - isl.reflectMat.opacity) * Math.min(1, dt * 3)
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
    mat.color.copy(startNight ? NIGHT.dust : DAY.dust)
    dustMat = mat
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
    // 相机入场 + 滚轮缩放（基准距离随沉浸态联动：全屏时推近压低视角，卷轴占更大画幅）
    baseZ = ui.immersive ? 16.5 : 24
    camState.z += (camState.zT - camState.z) * Math.min(1, dt * 1.4)
    if (!reducedMotion) camState.zT += (baseZ - camState.zT) * Math.min(1, dt * 0.55)
    camera.position.z = camState.z
    const baseY = ui.immersive ? 4.6 : 6.5
    camera.position.y = baseY + (camState.z - baseZ) * 0.28

    // 拖拽环视 + idle 扫视
    camState.yaw += (camState.yawT - camState.yaw) * Math.min(1, dt * 4)
    camState.pitch += (camState.pitchT - camState.pitch) * Math.min(1, dt * 4)
    if (!dragging) {
      camState.yawT += (0 - camState.yawT) * Math.min(1, dt * 0.8)
      camState.pitchT += (0 - camState.pitchT) * Math.min(1, dt * 0.8)
    }
    const idleX = reducedMotion ? 0 : Math.sin(t * 0.07) * 1.4
    // 沉浸态：注视点上移并朝卷轴群（右侧）偏移，收掉大片空水面
    const lookX = ui.immersive ? 9.5 : -1.6
    const lookY = ui.immersive ? 3.4 : 2.2
    const lookZ = ui.immersive ? -20 : -12
    camera.lookAt(camState.yaw * 9 + idleX + lookX, lookY - camState.pitch * 6, lookZ)

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
    // 远山 / 漂浮墨点 / 卷轴纸面 / 聚字：颜色随日夜平滑过渡
    for (let i = 0; i < mountainMats.length; i++) {
      const base = nightTarget ? NIGHT.mountain : DAY.mountain
      mountainMats[i].color.lerp(
        _tmpColor.copy(base).multiplyScalar(1 - i * 0.06),
        Math.min(1, dt * 2)
      )
    }
    if (dustMat) dustMat.color.lerp(nightTarget ? NIGHT.dust : DAY.dust, Math.min(1, dt * 2))
    for (const isl of islands) {
      isl.paperMat.color.lerp(nightTarget ? NIGHT.scrollTint : DAY.scrollTint, Math.min(1, dt * 2))
      isl.reflectMat.color.copy(isl.paperMat.color)
    }
    if (intro) intro.mat.color.lerp(nightTarget ? NIGHT.intro : DAY.intro, Math.min(1, dt * 2))

    // hover 拾取
    if (raycaster && !dragging) {
      raycaster.setFromCamera(pointerNdc, camera)
      const hits = raycaster.intersectObjects(islands.map(i => i.mesh), false)
      const first = hits[0]?.object
      const found = islands.find(i => i.mesh === first) ?? null
      if (found !== hoverIsland) {
        hoverIsland = found
        document.body.style.cursor = found ? 'pointer' : ''
        emit('hover', found?.theme ?? null)
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
    // 墨色随日夜联动（夜读为暖白，避免深底上隐形）
    color: (nightTarget ? NIGHT.intro : DAY.intro).clone(),
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

function onPointerLeave() {
  pointerNdc.set(-10, -10)
  if (hoverIsland) {
    hoverIsland = null
    emit('hover', null)
    document.body.style.cursor = ''
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
    @pointerleave="onPointerLeave"
    @wheel="onWheel"
  />
</template>
