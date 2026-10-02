import type { Directive } from 'vue'
import { prefersReducedMotion } from '../utils/motion'

/**
 * v-count-up：数字滚入视口后从 0 计数到目标值（编目数据的"落笔"动效）。
 *
 * 用法：
 *   v-count-up                      → 目标取挂载时 textContent 里的整数（静态数字，如数据带）
 *   v-count-up="3"                  → 数字：目标值（响应式变化时从旧值续滚）
 *   v-count-up="{ to: 3, duration: 700 }" → 对象：目标 + 时长
 *
 * 说明：目标值**由指令参数传入**（而非依赖 Vue 写进 DOM 的文本）——
 * 同元素上的插值会被编译器 hoist 静态化，指令读 DOM 拿不到新值（已踩坑）。
 * 指令全权接管该元素的 textContent。
 *
 * prefers-reduced-motion 下直落终值。
 */
const reduced = prefersReducedMotion()

type CountUpValue = number | { to: number; duration?: number } | undefined

interface CountUpEl extends HTMLElement {
  _countObserver?: IntersectionObserver
  _countRaf?: number
  _countTarget?: number
  /** 挂载时已首播过（IO 触发） */
  _countStarted?: boolean
}

function formatWithComma(n: number): string {
  return n.toLocaleString('en-US')
}

function animate(el: CountUpEl, from: number, target: number, duration: number) {
  if (from === target) {
    el.textContent = formatWithComma(target)
    return
  }
  const start = performance.now()
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    el.textContent = formatWithComma(Math.round(from + (target - from) * easeOut(t)))
    if (t < 1) {
      el._countRaf = requestAnimationFrame(tick)
    } else {
      el._countRaf = 0
    }
  }
  el._countRaf = requestAnimationFrame(tick)
}

/** 解析指令值 → { to, duration }；无值则从当前文本取整数 */
function parseValue(el: CountUpEl, value: CountUpValue): { to: number; duration: number } | null {
  if (typeof value === 'number') return { to: value, duration: 1400 }
  if (value && typeof value === 'object' && typeof value.to === 'number') {
    return { to: value.to, duration: value.duration ?? 1400 }
  }
  const raw = parseInt((el.textContent ?? '').replace(/[^\d]/g, ''), 10)
  return Number.isFinite(raw) ? { to: raw, duration: 1400 } : null
}

export const vCountUp: Directive<CountUpEl, CountUpValue> = {
  mounted(el, binding) {
    const parsed = parseValue(el, binding.value)
    if (!parsed) return
    el._countTarget = parsed.to
    if (reduced) {
      el.textContent = formatWithComma(parsed.to)
      return
    }
    el.textContent = '0'
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el._countStarted = true
            animate(el, 0, el._countTarget!, parsed.duration)
            io.disconnect()
          }
        }
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    el._countObserver = io
  },
  updated(el, binding) {
    // 目标值由参数传入（不再信任 DOM——插值可能被编译器静态化）
    const parsed = parseValue(el, binding.value)
    if (!parsed) return
    if (parsed.to === el._countTarget) return
    const from = el._countTarget ?? 0
    el._countTarget = parsed.to
    if (reduced) {
      el.textContent = formatWithComma(parsed.to)
      return
    }
    if (el._countRaf) cancelAnimationFrame(el._countRaf)
    // 已首播（可见）→ 续滚；未首播（仍在视口外）→ 保持 0，等 IO 触发
    if (el._countStarted) {
      animate(el, from, parsed.to, 420)
    } else {
      el.textContent = '0'
    }
  },
  unmounted(el) {
    el._countObserver?.disconnect()
    if (el._countRaf) cancelAnimationFrame(el._countRaf)
  }
}
