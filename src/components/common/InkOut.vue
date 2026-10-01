<script setup lang="ts">
/**
 * 「墨尽」错误态：AI 功能统一风格化报错（技术文案不露脸）
 * 砚台见底 + 毛笔摊手意趣（方案书风险预案配图同款设定）。
 */
defineProps<{
  /** 重试回调；不传则只显示静态提示 */
  retry?: () => void
  /** 紧凑模式（侧栏/浮层内用） */
  compact?: boolean
}>()
</script>

<template>
  <div
    class="border border-border/70 bg-paper-soft/70 text-center"
    :class="compact ? 'px-4 py-3' : 'px-6 py-8'"
    role="status"
  >
    <span class="seal-stamp text-[12px] py-0.5 px-1.5 mb-2 inline-block" style="opacity: 0.85">墨尽</span>
    <p class="text-[13px] font-serif text-muted-foreground leading-relaxed">
      {{ compact ? '砚中墨尽，史官暂歇——稍后再问。' : '砚中墨尽，史官暂歇。此乃翰墨生成之限，非卷帙之失；稍候可再试，卷中正文不受其扰。' }}
    </p>
    <button
      v-if="retry"
      type="button"
      class="mt-3 text-[13px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 transition-opacity cursor-pointer"
      @click="retry"
    >再磨一砚 · 重试</button>
  </div>
</template>
