import type { Directive } from 'vue'
import { prefersReducedMotion } from '../utils/motion'

/**
 * v-reveal：滚动进入视口时渐显上浮（配合 style.css 的 .reveal-init / .reveal-in）。
 * 用法：v-reveal 或 v-reveal="120"（错落延迟毫秒）。
 * prefers-reduced-motion 下直接显示，不注册观察器。
 */
const reduced = prefersReducedMotion()

interface RevealEl extends HTMLElement {
  _revealObserver?: IntersectionObserver
  _revealTimer?: number
}

export const vReveal: Directive<RevealEl, number | undefined> = {
  mounted(el, binding) {
    if (reduced || typeof IntersectionObserver === 'undefined') return
    const delay = binding.value ?? 0
    el.classList.add('reveal-init')
    el.style.transitionDelay = `${delay}ms`
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('reveal-in')
            // 过渡完成后清掉延迟，避免残留影响 hover 等交互动画
            el._revealTimer = window.setTimeout(() => {
              el.style.transitionDelay = ''
            }, delay + 900)
            io.disconnect()
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -36px 0px' }
    )
    io.observe(el)
    el._revealObserver = io
  },
  unmounted(el) {
    el._revealObserver?.disconnect()
    if (el._revealTimer) window.clearTimeout(el._revealTimer)
  }
}
