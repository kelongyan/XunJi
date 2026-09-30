<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Sun, Moon, Volume2, VolumeX } from 'lucide-vue-next'
import { useUiStore } from '../../stores/ui'

defineProps<{
  folio?: string
  subChapter?: string
}>()

const ui = useUiStore()

const navItems = [
  { to: '/', label: '目录总览', exact: true },
  { to: '/search', label: '史料考索', exact: false },
  { to: '/timeline', label: '纪年长卷', exact: false },
  { to: '/graph', label: '万卷星图', exact: false },
  { to: '/compare', label: '双卷合参', exact: false }
]
</script>

<template>
  <header class="sticky top-0 z-40 bg-background/85 backdrop-blur-sm border-b border-border/60">
    <div class="w-full px-6 md:px-10 py-3.5 flex items-center justify-between gap-6">
      <div class="flex items-center gap-3.5 min-w-0">
        <RouterLink
          to="/"
          class="seal-stamp seal-stamp-horizontal seal-stamp-sm hover:opacity-90 transition-opacity shrink-0"
          title="返回目录总览"
        >
          寻迹
        </RouterLink>
        <span class="eyebrow is-plain hidden sm:inline-flex truncate">
          {{ subChapter || '中国历史知识库 · 历代通览' }}
        </span>
      </div>

      <span class="fish-tail hidden md:inline-block absolute left-1/2 -translate-x-1/2" aria-hidden="true"></span>

      <div class="flex items-center gap-4 md:gap-5 shrink-0">
        <nav class="hidden sm:flex items-center gap-4 md:gap-5">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="text-[13px] tracking-[0.2em] text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors whitespace-nowrap"
            :class="
              item.exact
                ? '[&.router-link-exact-active]:text-[var(--dynasty-accent)]'
                : '[&.router-link-active]:text-[var(--dynasty-accent)]'
            "
          >
            {{ item.label }}
          </RouterLink>
        </nav>
        <button
          type="button"
          class="mode-toggle"
          :title="ui.mode === 'day' ? '切换夜读（灯下纸墨）' : '切回日读'"
          :aria-label="ui.mode === 'day' ? '切换到夜读模式' : '切换到日读模式'"
          @click="ui.toggleMode()"
        >
          <Sun v-if="ui.mode === 'night'" class="w-3 h-3" />
          <Moon v-else class="w-3 h-3" />
          <span class="hidden lg:inline">{{ ui.mode === 'day' ? '夜读' : '日读' }}</span>
        </button>
        <button
          type="button"
          class="mode-toggle !px-2"
          :title="ui.soundOn ? '关闭音效（盖印声等）' : '开启音效（盖印声等）'"
          :aria-label="ui.soundOn ? '关闭音效' : '开启音效'"
          @click="ui.toggleSound()"
        >
          <Volume2 v-if="ui.soundOn" class="w-3 h-3" />
          <VolumeX v-else class="w-3 h-3" />
        </button>
        <span class="index-no hidden md:inline">· {{ folio || '001' }} ·</span>
      </div>
    </div>
  </header>
</template>
