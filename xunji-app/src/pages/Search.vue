<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { RefreshCw, ExternalLink } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
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
        <div v-reveal class="border-wenwu p-8 md:p-10 bg-card/75 mb-10 shadow-sm space-y-6">
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
                class="absolute right-3.5 top-3 text-xs text-muted-foreground hover:text-primary flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw class="w-4 h-4" />
                <span class="hidden sm:inline font-serif">重放考索</span>
              </button>
            </div>
            <button 
              type="submit" 
              class="px-9 py-3.5 bg-primary text-primary-foreground font-serif text-sm font-bold flex items-center justify-center space-x-2 shadow-sm transition-transform active:scale-95 cursor-pointer"
            >
              <span>考索文脉</span>
            </button>
          </form>

          <!-- 分类筛选器 -->
          <div class="pt-5 border-t-2 border-border/70 flex flex-wrap items-center justify-between gap-4 text-xs font-serif">
            <div class="flex items-center space-x-2.5">
              <span class="text-foreground/85 font-bold tracking-wider">分类筛选：</span>
              <button 
                @click="selectType('all')" 
                :class="currentType === 'all' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'bg-background border border-border text-muted-foreground hover:text-foreground'"
                class="px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                全部检索
              </button>
              <button 
                @click="selectType('emperor')" 
                :class="currentType === 'emperor' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'bg-background border border-border text-muted-foreground hover:text-foreground'"
                class="px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                帝王
              </button>
              <button 
                @click="selectType('figure')" 
                :class="currentType === 'figure' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'bg-background border border-border text-muted-foreground hover:text-foreground'"
                class="px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                人物
              </button>
              <button 
                @click="selectType('event')" 
                :class="currentType === 'event' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'bg-background border border-border text-muted-foreground hover:text-foreground'"
                class="px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                事件
              </button>
              <button 
                @click="selectType('classic')" 
                :class="currentType === 'classic' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'bg-background border border-border text-muted-foreground hover:text-foreground'"
                class="px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                典籍
              </button>
              <button 
                @click="selectType('system')" 
                :class="currentType === 'system' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'bg-background border border-border text-muted-foreground hover:text-foreground'"
                class="px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                制度
              </button>
            </div>
            <div class="text-muted-foreground tracking-wide">
              <span>全文匹配：纯本地 MiniSearch 索引</span>
            </div>
          </div>
        </div>

        <!-- 结果展示区 -->
        <div class="space-y-8">
          <div v-reveal class="flex items-center justify-between text-xs font-serif text-muted-foreground pb-3 border-b-2 border-border/80">
            <div class="flex items-center space-x-3">
              <span>检索核心词：<strong class="text-foreground text-sm font-black">「{{ query || '历代通览' }}」</strong></span>
              <span class="text-border">/</span>
              <span class="tracking-wide">寻得相关文献 {{ searchResults.length }} 卷</span>
            </div>
            <div class="flex items-center space-x-4">
              <span v-if="isTyping" class="inline-flex items-center text-primary font-bold tracking-wider">
                <span class="ink-cursor mr-2"></span>
                <span>流式呈现中...</span>
              </span>
              <button 
                v-if="isTyping" 
                @click="handleSkip" 
                class="text-xs underline text-muted-foreground hover:text-foreground cursor-pointer"
              >
                跳过动画
              </button>
            </div>
          </div>

          <div v-if="searchResults.length === 0" class="border-wenwu p-12 text-center bg-card/40 my-8">
            <p class="font-serif text-base text-foreground/80">未寻见相关史料词条</p>
            <p class="text-xs font-serif text-muted-foreground mt-2">试试拼音首字母（如 zjz）或从高频词条索引入手：</p>
            <div class="mt-4 flex flex-wrap justify-center gap-2 text-xs font-serif">
              <button
                v-for="tag in hotTags"
                :key="tag"
                type="button"
                class="px-2.5 py-1 bg-background border border-border hover:border-primary hover:text-primary transition-colors cursor-pointer"
                @click="query = tag; doSearch()"
              >
                {{ tag }}
              </button>
            </div>
          </div>

          <div v-else class="space-y-8">
            <article
              v-for="(entry, index) in searchResults"
              :key="entry.id"
              v-reveal="index * 70"
              :class="index === 0 ? 'border-wenwu-primary bg-card/90 p-7 md:p-9' : 'border-wenwu bg-card/65 p-7 md:p-8'"
              class="result-card relative shadow-sm space-y-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="px-2.5 py-0.5 bg-primary text-primary-foreground text-xs font-serif font-bold">
                      {{ entry.type === 'emperor' ? '帝王' : entry.type === 'figure' ? '人物' : entry.type === 'event' ? '事件' : entry.type === 'classic' ? '典籍' : '制度' }}
                    </span>
                    <h2 class="text-2xl md:text-3xl font-serif font-black text-foreground">
                      <RouterLink :to="`/entry/${entry.id}`" class="hover:text-primary transition-colors flex items-center space-x-2">
                        <span>{{ entry.name }}</span>
                        <ExternalLink class="w-4 h-4 text-muted-foreground" />
                      </RouterLink>
                    </h2>
                    <span class="text-xs md:text-sm font-serif text-muted-foreground">
                      {{ entry.pinyin }} · {{ entry.era || entry.dynasty }}
                    </span>
                  </div>
                  <p class="text-xs md:text-[13px] font-serif text-muted-foreground pt-1">
                    <template v-for="(seg, si) in splitHighlight(entry.summary, query)" :key="si">
                      <mark v-if="seg.hit" class="suggest-hit">{{ seg.text }}</mark>
                      <template v-else>{{ seg.text }}</template>
                    </template>
                  </p>
                </div>
                <SealStamp :text="entry.type === 'emperor' ? '帝胄' : entry.type === 'figure' ? '名贤' : '典据'" />
              </div>

              <!-- 若有历史配图，在检索卡片中展示缩略图版 -->
              <div v-if="entry.image" class="mt-4 p-3 bg-background border border-border flex items-center gap-4">
                <img :src="entry.image.src" :alt="entry.image.caption" class="w-32 h-20 object-contain border border-border/60 bg-card/40 shrink-0" />
                <div class="text-xs font-serif text-muted-foreground">
                  <span class="text-foreground font-bold block mb-0.5">【历史插图资料】</span>
                  <span>{{ entry.image.caption }}</span>
                </div>
              </div>

              <!-- 第一条结果启用流式解读展示 -->
              <div v-if="index === 0" class="pt-4 border-t border-border font-serif text-[15px] leading-relaxed text-foreground textbook-reading-column font-textbook-body">
                <div class="text-indent-chinese">
                  {{ displayedText }}
                  <span v-if="isTyping" class="ink-cursor"></span>
                </div>
              </div>

              <!-- 标签与关联网脉 -->
              <div class="pt-4 border-t border-border/60 flex flex-wrap items-center gap-2.5 text-xs font-serif">
                <span class="text-foreground/80 font-bold tracking-wider">关联网脉：</span>
                <RouterLink 
                  v-for="tag in entry.tags" 
                  :key="tag" 
                  :to="`/search?q=${tag}`" 
                  class="px-2.5 py-0.5 bg-background border border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors"
                >
                  {{ tag }}
                </RouterLink>
              </div>
            </article>
          </div>
        </div>
      </main>
    </div>

    <!-- 底部版心页码 -->
    <footer class="mt-20 border-t border-border bg-card/40 py-8 text-center text-xs text-muted-foreground font-serif">
      <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>寻迹中国风历史检索 · 检索流式呈现引擎</div>
        <div class="textbook-folio font-bold text-foreground/70">· 043 ·</div>
        <div>古籍装帧信息层级与排印规制</div>
      </div>
    </footer>
  </div>
</template>
