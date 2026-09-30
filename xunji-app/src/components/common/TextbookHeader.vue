<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Sun, Moon, Volume2, VolumeX } from 'lucide-vue-next'
import { useUiStore } from '../../stores/ui'

defineProps<{
  folio?: string
  subChapter?: string
}>()

const ui = useUiStore()
</script>

<template>
  <header class="textbook-running-header bg-card/85 backdrop-blur-sm sticky top-0 z-40">
    <div class="w-full px-6 md:px-10 py-3 flex items-center justify-between">
      <!-- 左侧：页码 + 印章徽标 + 章节小引 -->
      <div class="flex items-center gap-4">
        <span class="textbook-folio font-bold text-foreground">· {{ folio || '001' }} ·</span>
        <RouterLink
          to="/"
          class="seal-stamp seal-stamp-horizontal seal-stamp-sm hover:opacity-90 transition-opacity"
          title="返回目录总览"
        >
          寻迹
        </RouterLink>
        <span class="hidden sm:inline text-xs text-muted-foreground font-medium tracking-wide">
          {{ subChapter || '中国风历史检索 · 历代通览' }}
        </span>
      </div>

      <!-- 中缝鱼尾（版心装饰，窄屏隐藏） -->
      <span class="fish-tail hidden md:inline-block absolute left-1/2 -translate-x-1/2" aria-hidden="true"></span>

      <!-- 右侧：导航 + 日夜切换 -->
      <div class="flex items-center gap-5">
        <nav class="flex items-center gap-3 sm:gap-5 text-xs">
          <RouterLink
            to="/"
            exact-active-class="text-primary font-bold border-b-2 border-primary pb-0.5"
            inactive-class="text-muted-foreground hover:text-primary transition-colors"
          >
            目录总览
          </RouterLink>
          <RouterLink
            to="/search"
            active-class="text-primary font-bold border-b-2 border-primary pb-0.5"
            inactive-class="text-muted-foreground hover:text-primary transition-colors"
          >
            史料考索
          </RouterLink>
          <RouterLink
            to="/timeline"
            active-class="text-primary font-bold border-b-2 border-primary pb-0.5"
            inactive-class="text-muted-foreground hover:text-primary transition-colors"
          >
            纪年长卷
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
          <span class="hidden sm:inline">{{ ui.mode === 'day' ? '夜读' : '日读' }}</span>
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
      </div>
    </div>
  </header>
</template>
