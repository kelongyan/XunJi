<script setup lang="ts">
withDefaults(
  defineProps<{
    text: string
    subtext?: string
    size?: 'sm' | 'md' | 'lg'
    horizontal?: boolean
  }>(),
  {
    size: 'md',
    horizontal: false,
  }
)
</script>

<template>
  <div class="inline-flex flex-col items-center select-none">
    <span
      class="seal-stamp"
      :class="[
        size === 'sm' ? 'seal-stamp-sm' : size === 'lg' ? 'seal-stamp-lg' : 'seal-stamp-md',
        { 'seal-stamp-horizontal': horizontal }
      ]"
    >
      {{ text }}
    </span>
    <span v-if="subtext" class="text-[12px] text-muted-foreground font-serif mt-1.5 tracking-wider">
      {{ subtext }}
    </span>
  </div>
</template>
