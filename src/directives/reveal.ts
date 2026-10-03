import type { Directive } from 'vue'
import { prefersReducedMotion } from '../utils/motion'

/**
 * v-reveal：滚动进入视口时渐显上浮（配合 style.css 的 .reveal-init / .reveal-in）。
 * 用法：v-reveal 或 v-reveal="120"（错落延迟毫秒）。
 * prefers-reduced-motion 下直接显示，不注册观察器。
 *
 * 全站共享单个 IntersectionObserver（此前每元素各建一个实例，长卷/详情页
 * 一屏可达 50+ 个）；元素命中即从观察表摘除，错落延迟仍由 transitionDelay 承担。
 */

interface RevealEl extends HTMLElement {
  _revealTimer?: number
}

/** 待显现元素 → 错落延迟（WeakMap：元素移除后不阻碍回收） */
const observed = new WeakMap<HTMLElement, number>()
let sharedIO: IntersectionObserver | null = null
const reduced = prefersReducedMotion()

function getObserver(): IntersectionObserver | null {
  if (sharedIO) return sharedIO
  if (typeof IntersectionObserver === 'undefined') return null
  sharedIO = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as RevealEl
        const delay = observed.get(el) ?? 0
        observed.delete(el)
        sharedIO?.unobserve(el)
        el.classList.add('reveal-in')
        // 过渡完成后清掉延迟，避免残留影响 hover 等交互动画
        el._revealTimer = window.setTimeout(() => {
          el.style.transitionDelay = ''
        }, delay + 900)
      }
    },
    { threshold: 0.1, rootMargin: '0px 0px -36px 0px' }
  )
  return sharedIO
}

export const vReveal: Directive<RevealEl, number | undefined> = {
  mounted(el, binding) {
    if (reduced || typeof IntersectionObserver === 'undefined') return
    const delay = binding.value ?? 0
    el.classList.add('reveal-init')
    el.style.transitionDelay = `${delay}ms`
    const io = getObserver()
    if (!io) return
    observed.set(el, delay)
    io.observe(el)
  },
  unmounted(el) {
    if (sharedIO && observed.has(el)) {
      sharedIO.unobserve(el)
      observed.delete(el)
    }
    if (el._revealTimer) window.clearTimeout(el._revealTimer)
  }
}
