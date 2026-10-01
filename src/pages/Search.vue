<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { RefreshCw, ExternalLink } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import Masthead from '../components/common/Masthead.vue'
import SearchSuggest from '../components/search/SearchSuggest.vue'
import { useSearch } from '../composables/useSearch'
import { useTypewriter } from '../composables/useTypewriter'
import { splitHighlight } from '../utils/highlight'
import { allHistoryEntries } from '../data'
import type { HistoryEntry } from '../types/history'

const route = useRoute()
const router = useRouter()
const { search } = useSearch()

const query = ref((route.query.q as string) || '')
const currentType = ref((route.query.type as string) || 'all')
const searchResults = ref<HistoryEntry[]>([])

// 第一条重点结果专属的打字机流式呈现
const { displayedText, isTyping, start: startTypewriter, skip: skipTypewriter } = useTypewriter()

/** 空结果推荐：全站高频标签（前 8 个） */
const hotTags = computed(() => {
  const counter = new Map<string, number>()
  for (const entry of allHistoryEntries) {
    for (const tag of entry.tags) counter.set(tag, (counter.get(tag) ?? 0) + 1)
  }
  return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag)
})

function handleSelect(entry: HistoryEntry) {
  router.push(`/entry/${entry.id}`)
}

function doSearch() {
  searchResults.value = search(query.value, currentType.value)
  if (searchResults.value.length > 0) {
    const first = searchResults.value[0]
    startTypewriter(first.interpretation || first.summary)
  }
}

function handleSearchSubmit() {
  router.replace({
    query: {
      ...route.query,
      q: query.value,
      type: currentType.value !== 'all' ? currentType.value : undefined
    }
  })
  doSearch()
}

function selectType(type: string) {
  currentType.value = type
  handleSearchSubmit()
}

function replayStreaming() {
  if (searchResults.value.length > 0) {
    const first = searchResults.value[0]
    startTypewriter(first.interpretation || first.summary)
  }
}

function handleSkip() {
  if (searchResults.value.length > 0) {
    const first = searchResults.value[0]
    skipTypewriter(first.interpretation || first.summary)
  }
}

watch(() => route.query, () => {
  query.value = (route.query.q as string) || ''
  currentType.value = (route.query.type as string) || 'all'
  doSearch()
})

onMounted(() => {
  doSearch()
})
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between">
    <div>
      <TextbookHeader folio="042" subChapter="中国历史文献数据库 · 全文检索与流式考索" />

      <main class="max-w-7xl mx-auto px-6 py-10">
        <!-- 检索栏与分类筛选条 (文武双线装帧) -->
        <div v-reveal class="mb-12 space-y-7">
          <form @submit.prevent="handleSearchSubmit" class="relative flex flex-col md:flex-row gap-4">
            <div class="relative flex-1 flex">
              <SearchSuggest
                v-model="query"
                input-class="pr-28"
                placeholder="检索人物、重大事件、传世典籍、官制兵制（支持拼音缩写如：zjz、土木堡）..."
                @select="handleSelect"
                @submit="handleSearchSubmit"
              />
              <button
                type="button"
                @click="replayStreaming"
                title="重新触发流式播放"
                class="absolute right-3.5 top-3 text-[13px] text-muted-foreground hover:text-primary flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw class="w-4 h-4" />
                <span class="hidden sm:inline font-serif">重放考索</span>
              </button>
            </div>
            <button 
              type="submit" 
              class="px-9 py-3.5 bg-primary text-primary-foreground font-serif text-[15px] font-bold flex items-center justify-center space-x-2 shadow-sm transition-transform active:scale-95 cursor-pointer"
            >
              <span>考索文脉</span>
            </button>
          </form>

          <!-- 分类筛选器 -->
          <div class="pt-6 border-t border-border/60 flex flex-wrap items-center justify-between gap-4 text-[13px]">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span class="eyebrow is-plain">分类筛选</span>
              <button 
                @click="selectType('all')" 
                :class="currentType === 'all' ? 'text-[var(--dynasty-accent)]' : 'text-muted-foreground hover:text-foreground'"
                class="px-3 py-1 text-[13px] tracking-[0.16em] transition-colors cursor-pointer"
              >
                全部检索
              </button>
              <button 
                @click="selectType('emperor')" 
                :class="currentType === 'emperor' ? 'text-[var(--dynasty-accent)]' : 'text-muted-foreground hover:text-foreground'"
                class="px-3 py-1 text-[13px] tracking-[0.16em] transition-colors cursor-pointer"
              >
                帝王
              </button>
              <button 
                @click="selectType('figure')" 
                :class="currentType === 'figure' ? 'text-[var(--dynasty-accent)]' : 'text-muted-foreground hover:text-foreground'"
                class="px-3 py-1 text-[13px] tracking-[0.16em] transition-colors cursor-pointer"
              >
                人物
              </button>
              <button 
                @click="selectType('event')" 
                :class="currentType === 'event' ? 'text-[var(--dynasty-accent)]' : 'text-muted-foreground hover:text-foreground'"
                class="px-3 py-1 text-[13px] tracking-[0.16em] transition-colors cursor-pointer"
              >
                事件
              </button>
              <button 
                @click="selectType('classic')" 
                :class="currentType === 'classic' ? 'text-[var(--dynasty-accent)]' : 'text-muted-foreground hover:text-foreground'"
                class="px-3 py-1 text-[13px] tracking-[0.16em] transition-colors cursor-pointer"
              >
                典籍
              </button>
              <button 
                @click="selectType('system')" 
                :class="currentType === 'system' ? 'text-[var(--dynasty-accent)]' : 'text-muted-foreground hover:text-foreground'"
                class="px-3 py-1 text-[13px] tracking-[0.16em] transition-colors cursor-pointer"
              >
                制度
              </button>
            </div>
            <div class="index-meta">
              <span>全文匹配 · 纯本地 MiniSearch 索引</span>
            </div>
          </div>
        </div>

        <!-- 结果展示区 -->
        <div class="space-y-8">
          <div v-reveal class="flex items-center justify-between gap-4 pb-3.5 border-b border-border/60">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <span class="eyebrow">检索核心词</span>
              <strong class="text-foreground text-[15px]">「{{ query || '历代通览' }}」</strong>
              <span class="index-meta">寻得相关文献 <span v-count-up="{ to: searchResults.length, duration: 700 }" class="tabular-nums"></span> 卷</span>
            </div>
            <div class="flex items-center space-x-4">
              <span v-if="isTyping" class="inline-flex items-center text-primary font-bold tracking-wider">
                <span class="ink-cursor mr-2"></span>
                <span>流式呈现中...</span>
              </span>
              <button 
                v-if="isTyping" 
                @click="handleSkip" 
                class="text-[13px] underline text-muted-foreground hover:text-foreground cursor-pointer"
              >
                跳过动画
              </button>
            </div>
          </div>

          <div v-if="searchResults.length === 0" class="py-16 text-center">
            <p class="font-serif text-base text-foreground/80">未寻见相关史料词条</p>
            <p class="text-[13px] font-serif text-muted-foreground mt-2.5">试试拼音首字母（如 zjz）或从高频词条索引入手：</p>
            <div class="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2.5 text-[13px] font-serif">
              <button
                v-for="tag in hotTags"
                :key="tag"
                type="button"
                class="text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors cursor-pointer"
                @click="query = tag; doSearch()"
              >
                {{ tag }}
              </button>
            </div>
          </div>

          <TransitionGroup v-else name="result-swap" tag="div" class="space-y-8 relative" appear>
            <article
              v-for="(entry, index) in searchResults"
              :key="entry.id"
              class="result-card relative pt-7 border-t border-border/60 space-y-4"
              :style="{ '--stagger': `${Math.min(400, index * 55)}ms` }"
            >
              <div class="flex items-start justify-between gap-6">
                <div class="space-y-2.5 flex-1 min-w-0">
                  <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                    <span class="text-[13px] tracking-[0.2em] text-[var(--dynasty-accent)]">
                      {{ entry.type === 'emperor' ? '帝王' : entry.type === 'figure' ? '人物' : entry.type === 'event' ? '事件' : entry.type === 'classic' ? '典籍' : '制度' }}
                    </span>
                    <h2 class="text-2xl md:text-3xl text-foreground" style="font-family: var(--font-serif)">
                      <RouterLink :to="`/entry/${entry.id}`" class="hover:text-[var(--dynasty-accent)] transition-colors inline-flex items-center gap-2">
                        <span>{{ entry.name }}</span>
                        <ExternalLink class="w-4 h-4 text-muted-foreground" />
                      </RouterLink>
                    </h2>
                    <span class="index-meta">
                      {{ entry.pinyin }} · {{ entry.era || entry.dynasty }}
                    </span>
                  </div>
                  <p class="text-[15px] font-serif text-muted-foreground">
                    <template v-for="(seg, si) in splitHighlight(entry.summary, query)" :key="si">
                      <mark v-if="seg.hit" class="suggest-hit">{{ seg.text }}</mark>
                      <template v-else>{{ seg.text }}</template>
                    </template>
                  </p>
                </div>
                <SealStamp :text="entry.type === 'emperor' ? '帝胄' : entry.type === 'figure' ? '名贤' : '典据'" />
              </div>

              <!-- 若有历史配图，在检索卡片中展示缩略图版 -->
              <div v-if="entry.image" class="mt-4 py-3.5 border-y border-border/60 flex items-center gap-4">
                <img :src="entry.image.src" :alt="entry.image.caption" class="w-32 h-20 object-contain border border-border/60 bg-card/40 shrink-0" />
                <div class="text-[13px] font-serif text-muted-foreground">
                  <span class="text-foreground font-bold block mb-0.5">【历史插图资料】</span>
                  <span>{{ entry.image.caption }}</span>
                </div>
              </div>

              <!-- 第一条结果启用流式解读展示 -->
              <div v-if="index === 0" class="pt-5 border-t border-border/60 font-serif text-[15px] leading-relaxed text-foreground max-w-3xl">
                <div class="text-indent-chinese">
                  {{ displayedText }}
                  <span v-if="isTyping" class="ink-cursor"></span>
                </div>
              </div>

              <!-- 标签与关联网脉 -->
              <div class="pt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-serif">
                <span class="eyebrow is-plain">关联网脉</span>
                <RouterLink 
                  v-for="tag in entry.tags" 
                  :key="tag" 
                  :to="`/search?q=${tag}`" 
                  class="text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors"
                >
                  {{ tag }}
                </RouterLink>
              </div>
            </article>
          </TransitionGroup>
        </div>
      </main>
    </div>

    <!-- 底部版心页码 -->
    <Masthead left="寻迹 · 检索流式呈现引擎" note="古籍装帧信息层级与排印规制" folio="043" />
  </div>
</template>
