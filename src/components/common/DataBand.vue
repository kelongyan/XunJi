<script setup lang="ts">
withDefaults(
  defineProps<{
    items: { value: string | number; label: string }[]
    /** 窄屏两列 / 桌面四列 */
    columns?: 2 | 3 | 4
  }>(),
  { columns: 4 }
)
</script>

<template>
  <div
    class="grid"
    :class="
      columns === 3
        ? 'grid-cols-3'
        : columns === 2
          ? 'grid-cols-2'
          : 'grid-cols-2 sm:grid-cols-4'
    "
  >
    <div
      v-for="(item, i) in items"
      :key="item.label"
      class="py-5 pr-4"
      :class="i > 0 ? 'border-l pl-5 sm:pl-6' : ''"
      :style="i > 0 ? { borderColor: 'var(--hairline)' } : undefined"
    >
      <div v-count-up="{ to: Number(item.value), duration: 1400 + i * 160 }" class="spec-number"></div>
      <div class="spec-label mt-2.5">{{ item.label }}</div>
    </div>
  </div>
</template>
