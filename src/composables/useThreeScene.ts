import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import * as THREE from 'three'

export interface ThreeSceneHandle {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** 注册每帧回调（dt 秒 / elapsed 秒） */
  onFrame(cb: (dt: number, elapsed: number) => void): void
}

export interface UseThreeSceneOptions {
  fov?: number
  near?: number
  far?: number
}

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function disposeMaterial(material: THREE.Material, textures: Set<THREE.Texture>) {
  const candidate = material as THREE.Material & Record<string, unknown>
  const textureKeys = [
    'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap',
    'envMap', 'lightMap', 'metalnessMap', 'normalMap', 'roughnessMap', 'specularMap'
  ]
  for (const key of textureKeys) {
    const value = candidate[key.trim()]
    if (value instanceof THREE.Texture) textures.add(value)
  }
  const shader = material as THREE.ShaderMaterial
  if (shader.uniforms) {
    for (const uniform of Object.values(shader.uniforms)) {
      if (uniform.value instanceof THREE.Texture) textures.add(uniform.value)
    }
  }
  material.dispose()
}

/**
 * Three.js 场景生命周期封装：初始化 / 自适应尺寸 / 渲染循环 / 资源销毁。
 * DPR 上限 1.75；页面不可见时暂停渲染；prefers-reduced-motion 交由调用方降级动效。
 */
export function useThreeScene(container: Ref<HTMLElement | undefined>, opts: UseThreeSceneOptions = {}) {
  const supported = ref(false)

  let renderer: THREE.WebGLRenderer | null = null
  let scene: THREE.Scene | null = null
  let camera: THREE.PerspectiveCamera | null = null
  let resizeObserver: ResizeObserver | null = null
  let frameCbs: Array<(dt: number, elapsed: number) => void> = []
  let timer: THREE.Timer | null = null

  function resize() {
    if (!renderer || !camera || !container.value) return
    const w = container.value.clientWidth
    const h = container.value.clientHeight
    if (w === 0 || h === 0) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  onMounted(() => {
    const el = container.value
    if (!el || !detectWebGL()) return

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.domElement.style.display = 'block'
    el.appendChild(renderer.domElement)

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(opts.fov ?? 45, el.clientWidth / el.clientHeight, opts.near ?? 0.1, opts.far ?? 400)

    timer = new THREE.Timer()
    timer.connect(document) // Page Visibility：隐藏时暂停计时，切回不产生大跳变
    renderer.setAnimationLoop(() => {
      const tmr = timer
      if (!renderer || !scene || !camera || !tmr || document.hidden) return
      tmr.update()
      const dt = Math.min(tmr.getDelta(), 0.05)
      const elapsed = tmr.getElapsed()
      for (const cb of frameCbs) cb(dt, elapsed)
      renderer.render(scene, camera)
    })

    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(el)

    supported.value = true
  })

  onBeforeUnmount(() => {
    frameCbs = []
    resizeObserver?.disconnect()
    resizeObserver = null
    renderer?.setAnimationLoop(null)
    timer?.disconnect()
    timer = null
    const textures = new Set<THREE.Texture>()
    if (scene) {
      scene.traverse(obj => {
        const renderable = obj as THREE.Mesh & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }
        renderable.geometry?.dispose()
        const material = renderable.material
        if (Array.isArray(material)) material.forEach(m => disposeMaterial(m, textures))
        else if (material) disposeMaterial(material, textures)
      })
    }
    textures.forEach(texture => texture.dispose())
    renderer?.dispose()
    renderer?.forceContextLoss()
    if (renderer?.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement)
    renderer = null
    scene = null
    camera = null
  })

  function getHandle(): ThreeSceneHandle | null {
    if (!renderer || !scene || !camera) return null
    return {
      renderer,
      scene,
      camera,
      onFrame(cb: (dt: number, elapsed: number) => void) {
        frameCbs.push(cb)
      }
    }
  }

  return { supported, getHandle }
}
