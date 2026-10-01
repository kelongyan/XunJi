<script setup lang="ts">
/**
 * 文物 3D 展台：程序化低模器物（青花瓶 / 书函 / 浑天仪 / 宝船），可拖转缩放。
 * 暖光展台 + 墨晕底座，器物 idle 缓慢自转，拖转带惯性。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { useThreeScene } from '../../composables/useThreeScene'
import { useUiStore } from '../../stores/ui'

export interface RelicKind {
  kind: 'vase' | 'codex' | 'armillary' | 'ship' | 'typecase'
}

const props = defineProps<{
  kind: RelicKind['kind']
}>()

const container = ref<HTMLElement>()
const ui = useUiStore()
const { supported, getHandle } = useThreeScene(container, { fov: 42, near: 0.1, far: 60 })

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let spinVel = 0.35
let dragging = false
let last = { x: 0 }
let relicGroup: THREE.Group | null = null
/* P2：入场浮起 + 底座呼吸 + 夜读灯光联动 */
let haloMat: THREE.MeshBasicMaterial | null = null
let keyLight: THREE.DirectionalLight | null = null
let ambientLight: THREE.AmbientLight | null = null
let appearT = 0
/** 夜读灯光过渡值（0=日读 1=夜读） */
let nightValue = 0

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

/** 青花缠枝纹（环绕瓶身） */
function makePorcelainTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256)
  ctx.fillStyle = '#F4F1E8'
  ctx.fillRect(0, 0, 512, 256)
  const blue = '#2A4D7C'
  // 上下弦纹
  ctx.strokeStyle = blue
  ctx.lineWidth = 4
  ;[26, 230].forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke()
  })
  // 波涛纹带
  ctx.lineWidth = 3
  for (let band = 0; band < 2; band++) {
    const y0 = band === 0 ? 46 : 210
    for (let x = 0; x < 512; x += 24) {
      ctx.beginPath()
      ctx.arc(x + 12, y0, 10, Math.PI, 0)
      ctx.stroke()
    }
  }
  // 缠枝团花
  for (let i = 0; i < 4; i++) {
    const cx = 64 + i * 128
    const cy = 128
    ctx.beginPath()
    ctx.arc(cx, cy, 26, 0, Math.PI * 2)
    ctx.stroke()
    for (let p = 0; p < 8; p++) {
      const a = (p * Math.PI) / 4
      ctx.beginPath()
      ctx.ellipse(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 9, 5, a, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()
  }
  return toTexture(c)
}

/** 书函绢面 */
function makeSilkTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256)
  ctx.fillStyle = '#28466B'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  for (let i = 0; i < 256; i += 8) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke()
  }
  return toTexture(c)
}

/** 竖排签条 */
function makeLabelTexture(text: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 192)
  ctx.fillStyle = '#F4F1E8'
  ctx.fillRect(0, 0, 64, 192)
  ctx.strokeStyle = 'rgba(61,55,47,0.5)'
  ctx.strokeRect(3, 3, 58, 186)
  ctx.font = '700 26px "Songti SC", "STSong", "SimSun", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  text.split('').forEach((ch, i) => {
    ctx.fillStyle = '#2B2620'
    ctx.fillText(ch, 32, 32 + i * 32)
  })
  return toTexture(c)
}

/** 泥活字单字字面（陶底墨字，居中） */
function makeTypeFaceTexture(ch: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(64, 64)
  ctx.fillStyle = '#C9BBA0'
  ctx.fillRect(0, 0, 64, 64)
  // 陶字边沿一圈深色（凸出字面感）
  ctx.strokeStyle = 'rgba(74, 62, 48, 0.55)'
  ctx.lineWidth = 3
  ctx.strokeRect(2, 2, 60, 60)
  ctx.font = '700 34px "Songti SC", "STSong", "SimSun", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#2B2620'
  ctx.fillText(ch, 32, 34)
  return toTexture(c)
}

function buildRelic(): THREE.Group {
  const g = new THREE.Group()
  if (props.kind === 'vase') {
    // 瓶形 profile：底 → 腹 → 颈 → 口
    const pts: THREE.Vector2[] = []
    const profile: Array<[number, number]> = [
      [0.02, 0], [0.5, 0.02], [0.62, 0.12], [0.68, 0.4], [0.62, 0.8],
      [0.42, 1.05], [0.24, 1.25], [0.2, 1.45], [0.24, 1.6], [0.3, 1.66], [0.28, 1.7]
    ]
    profile.forEach(([x, y]) => pts.push(new THREE.Vector2(x, y)))
    const mat = new THREE.MeshStandardMaterial({ map: makePorcelainTexture(), roughness: 0.35, metalness: 0.05 })
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mat))
    g.position.y = -0.85
  } else if (props.kind === 'codex') {
    const silk = new THREE.MeshStandardMaterial({ map: makeSilkTexture(), roughness: 0.85 })
    const sizes: Array<[number, number, number, number]> = [
      [1.3, 0.16, 0.95, 0],
      [1.2, 0.14, 0.88, 0.15],
      [1.1, 0.13, 0.8, 0.28],
      [0.95, 0.12, 0.7, 0.39]
    ]
    sizes.forEach(([w, h, d, y], i) => {
      const vol = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), silk)
      vol.position.set(i * 0.015 - 0.02, h / 2 + y, i * 0.01)
      vol.rotation.y = (i - 1.5) * 0.06
      g.add(vol)
    })
    // 题签
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.5),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture('永樂大典'), transparent: false, fog: false })
    )
    label.position.set(0.35, 0.55, 0.49)
    label.rotation.y = 0.06
    g.add(label)
    g.position.y = -0.45
  } else if (props.kind === 'armillary') {
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6b3a, roughness: 0.45, metalness: 0.65 })
    const rings: Array<[number, number, number, number]> = [
      [1.0, 0.035, 0.35, 0],   // 赤道环
      [0.85, 0.03, 1.2, 0.5],  // 子午环（倾斜）
      [0.7, 0.03, 0.6, -0.9],
      [0.55, 0.028, 1.35, 0.2]
    ]
    rings.forEach(([r, t, rotX, rotZ]) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 12, 64), bronze)
      ring.rotation.set(rotX, 0, rotZ)
      g.add(ring)
    })
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x2f5d7c, roughness: 0.5, metalness: 0.2 })
    )
    g.add(earth)
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 1.2, 12),
      bronze
    )
    pillar.position.y = -0.85
    g.add(pillar)
    g.position.y = 0.1
  } else if (props.kind === 'typecase') {
    // 泥活字格：木框托盘 + 6×4 陶字阵列（字面朝上，轮换常用字）
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 0.8 })
    const tray = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 1.6), wood)
    tray.position.y = 0.02
    g.add(tray)
    // 四周围框（略高于字格，如木匣边沿）
    const rail: Array<[number, number, number, number]> = [
      [2.3, 0.22, 0.08, 0.78], [2.3, 0.22, 0.08, -0.78],
      [0.08, 0.22, 1.6, 1.11], [0.08, 0.22, 1.6, -1.11]
    ]
    rail.forEach(([w, h, d, z]) => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood)
      r.position.set(z === 1.11 || z === -1.11 ? z : 0, h / 2, z === 1.11 || z === -1.11 ? 0 : z)
      // 侧栏沿 x 轴排布
      if (Math.abs(z) === 0.78) r.position.x = 0
      else r.position.x = z
      g.add(r)
    })
    // 陶字：6 列 × 4 行，格盘分格 + 字面
    const chars = '尋跡活字印書溯源'.split('')
    const clayMat = new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.9 })
    const COLS = 6
    const ROWS = 4
    for (let cIdx = 0; cIdx < COLS; cIdx++) {
      for (let rIdx = 0; rIdx < ROWS; rIdx++) {
        const x = -0.95 + cIdx * 0.38
        const z = -0.57 + rIdx * 0.38
        const cell = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.32), clayMat)
        cell.position.set(x, 0.15, z)
        g.add(cell)
        // 字面（CanvasTexture 单字，朝上）
        const ch = chars[(cIdx * ROWS + rIdx) % chars.length]
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(0.26, 0.26),
          new THREE.MeshBasicMaterial({ map: makeTypeFaceTexture(ch), fog: false })
        )
        face.rotation.x = -Math.PI / 2
        face.position.set(x, 0.225, z)
        g.add(face)
      }
    }
    g.position.y = -0.45
  } else {
    // ship：简版宝船
    const wood = new THREE.MeshStandardMaterial({ color: 0x54432f, roughness: 0.8 })
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 1.8), wood)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 1.3), new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 0.8 }))
    deck.position.y = 0.2
    g.add(hull, deck)
    ;[-0.55, 0, 0.55].forEach(z => {
      const h = 0.9 - Math.abs(z) * 0.35
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 8), wood)
      mast.position.set(0, h / 2 + 0.25, z)
      const sail = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, h * 0.66),
        new THREE.MeshStandardMaterial({ color: 0xe8dcc0, side: THREE.DoubleSide, roughness: 0.9 })
      )
      sail.position.set(0, mast.position.y + 0.03, z)
      g.add(mast, sail)
    })
    g.position.y = -0.55
  }
  return g
}

function buildScene() {
  const handle = getHandle()
  if (!handle) return
  const { scene, camera, onFrame } = handle

  scene.background = null

  /* 灯光（暖光展台；夜读联动调暗降温） */
  ambientLight = new THREE.AmbientLight(0xfff6e8, 1.1)
  scene.add(ambientLight)
  keyLight = new THREE.DirectionalLight(0xffe8c4, 2.2)
  keyLight.position.set(3, 5, 4)
  scene.add(keyLight)
  const rim = new THREE.DirectionalLight(0xd8e4f0, 0.7)
  rim.position.set(-4, 2.5, -3)
  scene.add(rim)

  /* 墨晕底座（呼吸光晕由 haloMat 引用驱动） */
  const [c, ctx] = makeCanvas(256, 256)
  const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 126)
  grad.addColorStop(0, 'rgba(61, 55, 47, 0.35)')
  grad.addColorStop(0.65, 'rgba(61, 55, 47, 0.12)')
  grad.addColorStop(1, 'rgba(61, 55, 47, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 256, 256)
  haloMat = new THREE.MeshBasicMaterial({ map: toTexture(c), transparent: true, depthWrite: false, fog: false })
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), haloMat)
  halo.rotation.x = -Math.PI / 2
  halo.position.y = -1.02
  scene.add(halo)

  /* 器物（入场自底座升起；reducedMotion 直落位） */
  relicGroup = buildRelic()
  scene.add(relicGroup)
  appearT = reducedMotion ? 1 : 0

  camera.position.set(0, 1.4, 4.6)
  camera.lookAt(0, 0, 0)

  onFrame((dt, t) => {
    // 入场浮起：0.9s 缓出，自下方 1.2 单位升起并淡入（材质透明度渐显）
    if (appearT < 1) {
      appearT = Math.min(1, appearT + dt / 0.9)
      const e = 1 - Math.pow(1 - appearT, 3)
      relicGroup!.position.y = buildFloat(t) + (1 - e) * -1.2
      relicGroup!.traverse(obj => {
        const mesh = obj as THREE.Mesh
        const mat = mesh.material as THREE.Material | undefined
        if (mat && 'opacity' in mat) {
          ;(mat as THREE.Material).transparent = true
          ;(mat as THREE.Material).opacity = e
        }
      })
    } else if (relicGroup) {
      relicGroup.position.y = buildFloat(t)
    }
    // 惯性衰减 + idle 自转
    if (!dragging) {
      spinVel += (0.35 - spinVel) * Math.min(1, dt * 1.2)
      if (relicGroup) relicGroup.rotation.y += spinVel * dt * (reducedMotion ? 0 : 1)
    }
    // 底座光晕：呼吸（浮起完成后才有存在感）+ 夜读增强
    nightValue += ((ui.mode === 'night' ? 1 : 0) - nightValue) * Math.min(1, dt * 2)
    if (haloMat) {
      const breath = reducedMotion ? 1 : 0.9 + Math.sin(t * 1.1) * 0.1
      haloMat.opacity = appearT * breath * (1 + nightValue * 0.5)
    }
    // 夜读灯光联动：整体稍暗、偏暖（展台灯下观器）
    if (keyLight) keyLight.intensity = 2.2 - nightValue * 0.6
    if (ambientLight) ambientLight.intensity = 1.1 - nightValue * 0.25
    camera.position.y = 1.4
    camera.lookAt(0, 0, 0)
  })
}

function buildFloat(t: number) {
  const base = props.kind === 'vase' ? -0.85 : props.kind === 'codex' ? -0.45 : props.kind === 'armillary' ? 0.1 : props.kind === 'typecase' ? -0.45 : -0.55
  return base + (reducedMotion ? 0 : Math.sin(t * 0.9) * 0.045)
}

/* 交互：拖转 + 惯性 */
function onPointerDown(e: PointerEvent) {
  dragging = true
  last = { x: e.clientX }
}
function onPointerMove(e: PointerEvent) {
  if (!dragging || !relicGroup) return
  const dx = e.clientX - last.x
  last = { x: e.clientX }
  relicGroup.rotation.y += dx * 0.012
  spinVel = dx * 0.9
}
function onPointerUp() {
  dragging = false
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const handle = getHandle()
  if (!handle) return
  const cam = handle.camera
  cam.position.z = THREE.MathUtils.clamp(cam.position.z + e.deltaY * 0.004, 3, 7)
}

onMounted(() => {
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
    class="relative w-full h-[240px] touch-none select-none cursor-grab active:cursor-grabbing"
    role="img"
    :aria-label="`器物展台：${kind}`"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  />
</template>
