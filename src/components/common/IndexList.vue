<script setup lang="ts">
import { RouterLink } from 'vue-router'

withDefaults(
  defineProps<{
    items: { name: string; meta?: string; value?: string; to?: string }[]
    /** 是否显示左侧 01/02 编号 */
    numbered?: boolean
  }>(),
  { numbered: true }
)

function no(i: number): string {
  return String(i + 1).padStart(2, '0')
}
</script>

<template>
  <div>
    <template v-for="(item, i) in items" :key="item.name">
      <RouterLink v-if="item.to" :to="item.to" class="index-row">
        <span v-if="numbered" class="index-no">{{ no(i) }}</span>
        <span class="index-name">{{ item.name }}</span>
        <span v-if="item.meta" class="index-meta hidden sm:inline">{{ item.meta }}</span>
        <span v-if="item.value" class="index-meta">{{ item.value }}</span>
      </RouterLink>
      <div v-else class="index-row">
        <span v-if="numbered" class="index-no">{{ no(i) }}</span>
        <span class="index-name">{{ item.name }}</span>
        <span v-if="item.meta" class="index-meta hidden sm:inline">{{ item.meta }}</span>
        <span v-if="item.value" class="index-meta">{{ item.value }}</span>
      </div>
    </template>
  </div>
</template>
