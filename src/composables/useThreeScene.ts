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
    if (scene) {
      scene.traverse(obj => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat?.dispose()
        const anyMat = mesh.material as { map?: THREE.Texture } | undefined
        anyMat?.map?.dispose()
      })
    }
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
