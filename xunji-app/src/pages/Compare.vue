<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { Scale } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import { comparisons } from '../data/comparisons'
import { getEntryById } from '../data'
import { dynastyIdFromHanzi, getDynastyTheme, defaultDynasty } from '../data/dynastyThemes'
import { onBeforeUnmount } from 'vue'

const route = useRoute()
const router = useRouter()

const currentId = computed(() => {
  const q = route.query.set as string
  return comparisons.some(c => c.id === q) ? q : comparisons[0].id
})
const current = computed(() => comparisons.find(c => c.id === currentId.value)!)
const entryA = computed(() => getEntryById(current.value.aEntryId))
const entryB = computed(() => getEntryById(current.value.bEntryId))

const themeOf = (hanzi: string | undefined) => getDynastyTheme(dynastyIdFromHanzi(hanzi))

watch(
  () => current.value,
  () => {
    // 对读双朝代色：取 A 方朝代染色（B 方 chip 用各自主题色）
    if (entryA.value) document.documentElement.dataset.dynasty = dynastyIdFromHanzi(entryA.value.dynasty)
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  document.documentElement.dataset.dynasty = defaultDynasty.id
})

function select(id: string) {
  router.replace({ query: { ...route.query, set: id } })
}
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between">
    <div>
      <TextbookHeader folio="052" subChapter="朝代对读 · 双卷合参" />

      <main class="max-w-7xl mx-auto px-6 py-10">
        <!-- 页头 -->
        <div v-reveal class="border-wenwu p-8 md:p-10 mb-10 bg-card/75 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div class="space-y-3">
            <div class="inline-flex items-center space-x-2 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-widest">
              <Scale class="w-3.5 h-3.5" />
              <span>【朝代对读 · 双卷合参】</span>
            </div>
            <h1 class="font-textbook-hero text-foreground">朝代对读</h1>
            <p class="text-sm font-serif text-muted-foreground max-w-xl leading-relaxed font-textbook-body">
              把两个朝代的词条并置合参，在对照中看清历史的因果与回声。
            </p>
          </div>
          <SealStamp text="合参" class="seal-drop" />
        </div>

        <!-- 对读卷宗切换 -->
        <div v-reveal class="flex flex-wrap gap-3 mb-8">
          <button
            v-for="c in comparisons"
            :key="c.id"
            type="button"
            class="px-4 py-2 border-2 text-xs font-serif font-bold tracking-wide transition-colors"
            :class="currentId === c.id
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'border-border text-muted-foreground hover:border-primary hover:text-primary bg-background'"
            @click="select(c.id)"
          >
            {{ c.title }}
          </button>
        </div>

        <!-- 当前对读主题 -->
        <div class="mb-8">
          <h2 class="text-xl md:text-2xl font-serif font-black text-foreground">{{ current.title }}</h2>
          <p class="text-sm font-serif text-muted-foreground mt-1.5">{{ current.theme }}<span class="mx-2 text-border">/</span><span class="dynasty-accent-text font-bold">{{ current.dimension }}</span></p>
        </div>

        <!-- 双栏对照 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12" v-if="entryA && entryB">
          <article
            v-for="(entry, i) in [entryA, entryB]"
            :key="entry.id"
            v-reveal="i * 120"
            class="border-wenwu bg-card/70 shadow-sm relative hover-lift"
          >
            <div
              class="absolute top-0 left-0 px-2.5 py-1 text-xs font-serif font-black text-white"
              :style="{ backgroundColor: themeOf(entry.dynasty).accent }"
            >
              {{ i === 0 ? '甲卷' : '乙卷' }} · {{ themeOf(entry.dynasty).hanzi }}
            </div>
            <div class="p-6 md:p-8 pt-10 space-y-4">
              <RouterLink :to="`/entry/${entry.id}`" class="text-2xl md:text-3xl font-serif font-black text-foreground hover:text-primary transition-colors block">
                {{ entry.name }}
              </RouterLink>
              <p class="text-xs font-serif text-muted-foreground">{{ entry.pinyin }}<template v-if="entry.era"> · {{ entry.era }}</template></p>
              <p class="text-sm font-serif text-foreground/85 leading-relaxed font-textbook-body">
                {{ entry.summary }}
              </p>
              <div class="border-t border-border/60 pt-4">
                <span class="text-[11px] font-serif font-bold dynasty-accent-text tracking-widest block mb-1.5">史学纵横 · 摘句</span>
                <p class="text-xs font-serif text-muted-foreground leading-relaxed font-textbook-quote">
                  {{ entry.interpretation }}
                </p>
              </div>
              <div v-if="entry.quotes?.length" class="border-l-4 border-l-primary/60 bg-background/70 p-3.5">
                <p class="font-textbook-quote text-xs text-foreground/90 leading-relaxed">「{{ entry.quotes[0].text }}」</p>
                <p class="text-[10px] font-serif text-muted-foreground mt-1.5 text-right">——{{ entry.quotes[0].source }}</p>
              </div>
              <RouterLink :to="`/entry/${entry.id}`" class="inline-flex text-xs font-serif font-bold text-primary hover:text-primary/80 transition-colors">
                进入 {{ entry.name }} 全文 →
              </RouterLink>
            </div>
          </article>
        </div>

        <!-- 史官合论（切换对读组时重播入场） -->
        <div :key="currentId" v-reveal class="border-wenwu-primary p-7 md:p-9 bg-card/85 shadow-sm relative">
          <div class="absolute right-6 top-6 opacity-90">
            <SealStamp text="史臣曰" class="seal-stamp-sm seal-drop" />
          </div>
          <div class="flex items-center space-x-2.5 pb-3.5 mb-5 border-b-2 border-border/80 pr-24">
            <span class="w-2.5 h-2.5 bg-primary"></span>
            <h3 class="text-lg font-textbook-title text-foreground tracking-wide">史官合论</h3>
          </div>
          <p class="text-sm md:text-[15px] font-serif text-foreground/90 leading-loose font-textbook-quote">
            {{ current.verdict }}
          </p>
        </div>
      </main>
    </div>

    <footer class="mt-16 border-t border-border bg-card/40 py-8 text-center text-xs text-muted-foreground font-serif">
      <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>寻迹中国风历史检索 · 朝代对读</div>
        <div class="textbook-folio font-bold text-foreground/70">· 053 ·</div>
        <div>双卷合参 · 异代互鉴</div>
      </div>
    </footer>
  </div>
</template>
