/** 全站统一的动效偏好判定（原 8 处内联 matchMedia 收口）。 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
