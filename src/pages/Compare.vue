<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import Masthead from '../components/common/Masthead.vue'
import { comparisons } from '../data/comparisons'
import { getEntryById } from '../data/details'
import { preloadEntries } from '../data/details'
import { dynastyIdFromHanzi, getDynastyTheme, defaultDynasty } from '../data/dynastyThemes'
import { useUiStore } from '../stores/ui'
import { onBeforeUnmount } from 'vue'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

const currentId = computed(() => {
  const q = route.query.set as string
  return comparisons.some(c => c.id === q) ? q : comparisons[0].id
})
const current = computed(() => comparisons.find(c => c.id === currentId.value)!)
const detailsReady = ref(false)
const entryA = computed(() => {
  void detailsReady.value
  return getEntryById(current.value.aEntryId)
})
const entryB = computed(() => {
  void detailsReady.value
  return getEntryById(current.value.bEntryId)
})

watch(
  () => current.value,
  async comparison => {
    detailsReady.value = false
    await preloadEntries([comparison.aEntryId, comparison.bEntryId])
    detailsReady.value = true
  },
  { immediate: true }
)

const themeOf = (hanzi: string | undefined) => getDynastyTheme(dynastyIdFromHanzi(hanzi))
/** 夜读用提亮版朝代色（accentNight），避免深底上发暗 */
const accentOf = (hanzi: string | undefined) =>
  ui.mode === 'night' ? themeOf(hanzi).accentNight : themeOf(hanzi).accent

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
        <div v-reveal class="mb-14 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div class="space-y-4">
            <div class="eyebrow">朝代对读 · 双卷合参</div>
            <h1 class="display-title">朝代对读</h1>
            <p class="text-[15px] font-serif text-muted-foreground max-w-xl leading-relaxed">
              把两个朝代的词条并置合参，在对照中看清历史的因果与回声。
            </p>
          </div>
          <SealStamp text="合参" class="seal-drop hidden sm:block" />
        </div>

        <!-- 对读卷宗切换 -->
        <div v-reveal class="flex flex-wrap gap-3 mb-8">
          <button
            v-for="c in comparisons"
            :key="c.id"
            type="button"
            class="px-4 py-1.5 text-[13px] tracking-[0.18em] border-b border-transparent transition-colors"
            :class="currentId === c.id
              ? 'text-[var(--dynasty-accent)] border-[var(--dynasty-accent)]'
              : 'text-muted-foreground hover:text-foreground cursor-pointer'"
            @click="select(c.id)"
          >
            {{ c.title }}
          </button>
        </div>

        <!-- 当前对读主题 -->
        <div class="mb-10">
          <div class="eyebrow mb-3.5">当前对读卷宗</div>
          <h2 class="display-heading">{{ current.title }}</h2>
          <p class="text-[15px] font-serif text-muted-foreground mt-3">{{ current.theme }}<span class="mx-2.5 text-border">·</span><span class="dynasty-accent-text">{{ current.dimension }}</span></p>
        </div>

        <!-- 双栏对照（切组时甲/乙卷相向合拢，中缝线缝合、骑缝印落定） -->
         <div v-if="detailsReady && entryA && entryB" :key="currentId" class="relative grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <!-- 中缝缝合线（合拢后自上而下画出；仅桌面） -->
          <div class="hidden md:block absolute left-1/2 top-0 bottom-0 w-px -ml-px pointer-events-none duo-seam" aria-hidden="true"></div>
          <!-- 骑缝印（两卷接缝处的压印，合拢后落下；仅桌面） -->
          <div class="hidden md:flex absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 pointer-events-none duo-seal" aria-hidden="true">
            <SealStamp text="骑缝" class="seal-stamp-sm" />
          </div>
          <article
            v-for="(entry, i) in [entryA, entryB]"
            :key="entry.id"
            class="relative pt-5 duo-join"
            :class="i === 0 ? 'duo-join-left' : 'duo-join-right'"
            :style="{ borderTop: `2px solid ${accentOf(entry.dynasty)}` }"
          >
            <div class="flex items-center gap-2.5 mb-5">
              <span class="w-2.5 h-2.5" :style="{ backgroundColor: accentOf(entry.dynasty) }"></span>
              <span class="index-meta">{{ i === 0 ? '甲卷' : '乙卷' }} · {{ themeOf(entry.dynasty).hanzi }}</span>
            </div>
            <div class="space-y-4">
              <RouterLink :to="`/entry/${entry.id}`" class="display-heading block hover:text-[var(--dynasty-accent)] transition-colors">
                {{ entry.name }}
              </RouterLink>
              <p class="index-meta">{{ entry.pinyin }}<template v-if="entry.era"> · {{ entry.era }}</template></p>
              <p class="text-[15px] font-serif text-foreground/85 leading-relaxed font-textbook-body">
                {{ entry.summary }}
              </p>
              <div class="pt-4 border-t border-border/60">
                <div class="eyebrow mb-2.5">史学纵横 · 摘句</div>
                <p class="text-[15px] font-serif text-muted-foreground leading-relaxed font-textbook-quote">
                  {{ entry.interpretation }}
                </p>
              </div>
              <div v-if="entry.quotes?.length" class="pl-4 border-l-2" :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 45%, transparent)' }">
                <p class="font-textbook-quote text-[13px] text-foreground/90 leading-relaxed">「{{ entry.quotes[0].text }}」</p>
                <p class="text-[12px] font-serif text-muted-foreground mt-1.5 text-right">——{{ entry.quotes[0].source }}</p>
              </div>
              <RouterLink :to="`/entry/${entry.id}`" class="inline-flex text-[13px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 transition-opacity">
                进入 {{ entry.name }} 全文 →
              </RouterLink>
            </div>
          </article>
        </div>

        <!-- 史官合论（切换对读组时重播入场） -->
        <div :key="currentId" v-reveal class="relative pl-6 border-l-2" :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 45%, transparent)' }">
          <div class="absolute right-0 -top-2 opacity-90">
            <SealStamp text="史臣曰" class="seal-stamp-sm seal-drop" />
          </div>
          <div class="eyebrow mb-4">史官合论</div>
          <p class="text-[15px] md:text-[15px] font-serif text-foreground/90 leading-loose pr-24">
            {{ current.verdict }}
          </p>
        </div>
      </main>
    </div>

    <Masthead left="寻迹 · 朝代对读" note="双卷合参 · 异代互鉴" folio="053" />
  </div>
</template>
