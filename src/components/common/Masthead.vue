<script setup lang="ts">
defineProps<{
  /** 左侧栏目定位 */
  left?: string
  /** 中部注记（窄屏隐藏） */
  note?: string
  /** 右侧版记页码 */
  folio?: string
}>()
</script>

<template>
  <footer class="mt-20">
    <div class="max-w-7xl mx-auto px-6">
      <div class="rule"></div>
      <div class="pt-5 pb-9 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
        <span class="eyebrow is-plain">{{ left }}</span>
        <span v-if="note" class="eyebrow is-plain hidden md:inline-flex">{{ note }}</span>
        <span class="flex items-center gap-4">
          <RouterLink
            to="/about"
            class="text-[12px] tracking-[0.22em] text-muted-foreground/70 hover:text-[var(--dynasty-accent)] transition-colors"
          >修典纪要</RouterLink>
          <span class="index-no">· {{ folio }} ·</span>
        </span>
      </div>
    </div>
  </footer>
</template>
