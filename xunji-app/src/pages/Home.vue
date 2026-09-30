<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Minimize2 } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import SearchSuggest from '../components/search/SearchSuggest.vue'
import GuideOverlay from '../components/common/GuideOverlay.vue'
import { getEntryById, getEntriesByType, allHistoryEntries } from '../data'
import { dynastyThemes, type DynastyTheme } from '../data/dynastyThemes'
import { useUiStore } from '../stores/ui'
import { useFootprint } from '../composables/useFootprint'

const InkRiver = defineAsyncComponent(() => import('../components/three/InkRiver.vue'))

const router = useRouter()
const ui = useUiStore()
const { footprints, collections } = useFootprint()

const searchKeyword = ref('')
const todayEntry = getEntryById('zhang-juzheng')

/** 首屏 3D 时空长河（窄屏 / WebGL 不可用时自动降级为静态封面） */
const show3d = ref(true)
const introDone = ref(false)

/** 分类计数运行时读取真实数据（数据诚信） */
const typeCounts = {
  emperor: getEntriesByType('emperor').length,
  figure: getEntriesByType('figure').length,
  event: getEntriesByType('event').length,
  classic: getEntriesByType('classic').length,
  system: getEntriesByType('system').length
}

/** 史册残页：按当日日期从全部编年节点中翻出"今日一叶" */
const timelinePool = allHistoryEntries.flatMap(e =>
  (e.timeline ?? []).map(n => ({ ...n, entryName: e.name, entryId: e.id }))
)
const fragment = (() => {
  if (timelinePool.length === 0) return null
  const d = new Date()
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate()
  return timelinePool[seed % timelinePool.length]
})()

/** 诚实数据带：跨度 / 朝代 / 词条 / 史料引文 */
const stats = computed(() => {
  const years = dynastyThemes.map(d => d.years)
  const span = Math.max(...years.map(y => y[1])) - Math.min(...years.map(y => y[0]))
  const quotes = allHistoryEntries.reduce((n, e) => n + (e.quotes?.length ?? 0), 0)
  return {
    span,
    dynasties: dynastyThemes.filter(d => d.live).length,
    entries: allHistoryEntries.length,
    quotes
  }
})

/** 我的寻迹：足迹 + 藏书阁 */
const recentFootprints = computed(() => footprints.value.slice(0, 3))
const collectedItems = computed(() => collections.value.slice(0, 8))
function entryName(id: string): string {
  return getEntryById(id)?.name ?? id
}
function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

/** 沉浸模式：H 进入 / Esc 退出（仅 3D 长河且开场完成后） */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    ui.exitImmersive()
    return
  }
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if ((e.key === 'h' || e.key === 'H') && show3d.value && introDone.value && !guideOpen.value) {
    ui.toggleImmersive()
  }
}

/** 首访引导：每台设备一次，聚字开场结束后浮现 */
const guideOpen = ref(false)
const guidePending = ref(!localStorage.getItem('xunji-guide-seen'))
watch(introDone, done => {
  if (done && guidePending.value && show3d.value) guideOpen.value = true
})
watch(guideOpen, open => {
  if (!open) guidePending.value = false
})

/** 点墨捞史：点击长河空白，捞出一叶编年残句 */
const probe = ref<{ x: number; y: number; item: (typeof timelinePool)[number] } | null>(null)
let probeTimer = 0
function onProbe(pos: { x: number; y: number }) {
  if (!timelinePool.length) return
  const item = timelinePool[Math.floor(Math.random() * timelinePool.length)]
  probe.value = {
    x: Math.min(Math.max(pos.x, 170), window.innerWidth - 190),
    y: Math.min(Math.max(pos.y, 120), window.innerHeight - 160),
    item
  }
  window.clearTimeout(probeTimer)
  probeTimer = window.setTimeout(() => {
    probe.value = null
  }, 6000)
}
function closeProbe() {
  window.clearTimeout(probeTimer)
  probe.value = null
}

function onDynastySelect(theme: DynastyTheme) {
  if (theme.id === 'ming') router.push('/timeline')
  else if (theme.id === 'tang' || theme.id === 'song') router.push(`/timeline?dynasty=${theme.id}`)
}

function onSearchSelect(entry: { id: string }) {
  router.push(`/entry/${entry.id}`)
}

function handleSearch() {
  router.push({
    path: '/search',
    query: { q: searchKeyword.value || '张居正' }
  })
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.clearTimeout(probeTimer)
})
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between" :class="ui.immersive ? 'overflow-hidden h-screen' : ''">
    <div>
      <TextbookHeader v-if="!ui.immersive" folio="001" />

      <!-- 封面题签式 Hero：3D 时空长河全宽沉浸（桌面） / 静态封面（降级） -->
      <section
        class="relative w-full overflow-hidden"
        :class="show3d ? (ui.immersive ? 'fixed inset-0 z-[60]' : '') : 'border-b-2 border-border/60 py-10'"
      >
        <!-- 沉浸模式退出 -->
        <button
          v-if="ui.immersive"
          type="button"
          class="absolute top-5 right-6 z-30 mode-toggle !text-xs"
          @click="ui.exitImmersive()"
        >
          <Minimize2 class="w-3.5 h-3.5" />
          <span>退出沉浸 · Esc</span>
        </button>

        <!-- 3D 时空长河模式 -->
        <template v-if="show3d">
            <InkRiver
              class="absolute inset-0"
              @select="onDynastySelect"
              @fallback="show3d = false"
              @intro-done="introDone = true"
              @probe="onProbe"
            />

            <div
              class="relative z-10 flex flex-col justify-center py-12 pointer-events-none transition-opacity duration-[1200ms]"
              :class="[introDone ? 'opacity-100' : 'opacity-0', ui.immersive ? 'min-h-screen' : 'min-h-[clamp(560px, 80vh, 880px)]']"
            >
              <div v-show="!ui.immersive" class="max-w-6xl mx-auto w-full px-6 md:px-10">
              <div class="max-w-3xl space-y-4">
                <div class="inline-flex items-center space-x-2 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs">
                  <span class="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                  <span>全面的中国历史学习站 · 首期上线明朝，后续持续扩充各朝代</span>
                </div>
                <h1 class="font-textbook-hero text-foreground drop-shadow-[0_1px_0_rgba(247,243,232,0.8)]">
                  寻迹 · 中国历史检索站
                </h1>
                <p class="text-base md:text-lg font-serif text-muted-foreground leading-relaxed max-w-2xl font-textbook-body pt-1">
                  以中国传统典籍装帧的视觉语言为基调，宋体正文、文武双线史料卡、霞鹜文楷古籍引文，像翻一部会呼吸的纸墨史册。
                </p>
              </div>

              <!-- 搜索框：仿古籍「目录索引检索签」（带联想直达） -->
              <div
                class="mt-8 pt-6 border-t-2 border-border/70 max-w-3xl"
                :class="introDone ? 'pointer-events-auto' : 'pointer-events-none'"
              >
                <form @submit.prevent="handleSearch" class="relative flex flex-col md:flex-row gap-3.5">
                  <SearchSuggest
                    v-model="searchKeyword"
                    @select="onSearchSelect"
                    @submit="handleSearch"
                  />
                  <button
                    type="submit"
                    class="px-9 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground font-serif tracking-widest text-sm font-bold flex items-center justify-center space-x-2 transition-transform active:scale-95 shadow-sm cursor-pointer"
                  >
                    <span>开卷寻迹</span>
                    <ArrowRight class="w-4 h-4" />
                  </button>
                </form>

                <!-- 搜索热词推荐 -->
                <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-serif">
                  <span class="text-foreground/85 font-bold">核心词条索引：</span>
                  <RouterLink to="/entry/zhang-juzheng" class="px-2.5 py-0.5 bg-background/85 border border-border hover:border-primary hover:text-primary transition-colors">张居正 (万历新政)</RouterLink>
                  <RouterLink to="/search?q=靖难之役" class="px-2.5 py-0.5 bg-background/85 border border-border hover:border-primary hover:text-primary transition-colors">靖难之役</RouterLink>
                  <RouterLink to="/search?q=永乐大典" class="px-2.5 py-0.5 bg-background/85 border border-border hover:border-primary hover:text-primary transition-colors">《永乐大典》</RouterLink>
                  <RouterLink to="/search?q=一条鞭法" class="px-2.5 py-0.5 bg-background/85 border border-border hover:border-primary hover:text-primary transition-colors">一条鞭法</RouterLink>
                  <RouterLink to="/search?q=王阳明" class="px-2.5 py-0.5 bg-background/85 border border-border hover:border-primary hover:text-primary transition-colors">王阳明 (知行合一)</RouterLink>
                </div>
              </div>
              </div>
            </div>

              <!-- 水墨收边：长河沉入纸面 -->
              <div class="absolute bottom-0 inset-x-0 h-28 bg-gradient-to-b from-transparent to-[color:var(--paper-base)] pointer-events-none z-[5]"></div>

              <!-- 底部操作条（常显，含沉浸模式） -->
              <div class="absolute bottom-5 inset-x-0 flex justify-center z-[8] pointer-events-none">
                <div class="px-5 py-1.5 bg-background/60 border border-border/60 backdrop-blur-sm text-[11px] font-serif text-muted-foreground tracking-wide flex items-center gap-2.5 flex-wrap justify-center">
                  <span>拖动环视</span><span class="text-border">·</span>
                  <span>滚轮推近</span><span class="text-border">·</span>
                  <span>点击卷轴启程</span><span class="text-border">·</span>
                  <span>空白处点墨捞史</span><span class="text-border">·</span>
                  <span><kbd class="kbd">H</kbd> 沉浸</span>
                </div>
              </div>

              <!-- 诚实数据带 -->
              <div class="absolute bottom-5 right-6 z-[8] pointer-events-none text-right hidden md:block">
                <div class="text-[11px] font-serif text-muted-foreground tracking-wider leading-relaxed">
                  <span class="text-foreground font-bold">自汉至清 {{ stats.span }} 年</span>
                  <span class="mx-1.5 text-border">·</span>{{ stats.dynasties }} 朝已修典
                  <span class="mx-1.5 text-border">·</span>{{ stats.entries }} 卷
                  <span class="mx-1.5 text-border">·</span>史料引文 {{ stats.quotes }} 段
                </div>
              </div>
          </template>

          <!-- 静态降级封面（窄屏 / WebGL 不可用） -->
          <template v-else>
            <div class="max-w-7xl mx-auto px-6">
            <div class="flex justify-between items-start mb-8 border-b-2 border-border/80 pb-5">
              <div class="space-y-1.5">
                <span class="text-xs uppercase tracking-widest text-primary font-bold">
                  CHINESE HISTORY · 华夏历代通览 · 首期明朝
                </span>
                <p class="text-lg font-serif font-black text-foreground">
                  纵观华夏各代 · 逐朝收录详解
                </p>
                <p class="text-xs font-serif text-muted-foreground/90">
                  中国历史知识检索 · 首期明朝，后续持续扩充历代
                </p>
              </div>
              <div class="text-right flex items-center space-x-3 shrink-0">
                <div class="text-right hidden sm:block">
                  <span class="text-xs font-serif text-muted-foreground block">当前专题 · 明朝</span>
                  <span class="text-[10px] font-mono text-muted-foreground/80">1368 — 1644 · 国祚二百七十六年</span>
                </div>
                <SealStamp text="大明" />
              </div>
            </div>

            <div class="max-w-3xl my-8 space-y-4">
              <div class="inline-flex items-center space-x-2 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                <span>全面的中国历史学习站 · 首期上线明朝，后续持续扩充各朝代</span>
              </div>
              <h1 class="font-textbook-hero text-foreground">
                寻迹 · 中国历史检索站
              </h1>
              <p class="text-base md:text-lg font-serif text-muted-foreground leading-relaxed max-w-2xl font-textbook-body pt-1">
                以中国传统典籍装帧的视觉语言为基调，纯本地精准流式呈现。宋体正文、文武双线史料卡、霞鹜文楷古籍引文，像翻一部会呼吸的纸墨史册。
              </p>
            </div>

            <div class="mt-10 pt-7 border-t-2 border-border/70">
              <form @submit.prevent="handleSearch" class="relative flex flex-col md:flex-row gap-3.5">
                <SearchSuggest
                  v-model="searchKeyword"
                  @select="onSearchSelect"
                  @submit="handleSearch"
                />
                <button
                  type="submit"
                  class="px-9 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground font-serif tracking-widest text-sm font-bold flex items-center justify-center space-x-2 transition-transform active:scale-95 shadow-sm cursor-pointer"
                >
                  <span>开卷寻迹</span>
                  <ArrowRight class="w-4 h-4" />
                </button>
              </form>

              <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-serif">
                <span class="text-foreground/85 font-bold">核心词条索引：</span>
                <RouterLink to="/entry/zhang-juzheng" class="px-2.5 py-0.5 bg-background border border-border hover:border-primary hover:text-primary transition-colors">张居正 (万历新政)</RouterLink>
                <RouterLink to="/search?q=靖难之役" class="px-2.5 py-0.5 bg-background border border-border hover:border-primary hover:text-primary transition-colors">靖难之役</RouterLink>
                <RouterLink to="/search?q=永乐大典" class="px-2.5 py-0.5 bg-background border border-border hover:border-primary hover:text-primary transition-colors">《永乐大典》</RouterLink>
                <RouterLink to="/search?q=一条鞭法" class="px-2.5 py-0.5 bg-background border border-border hover:border-primary hover:text-primary transition-colors">一条鞭法</RouterLink>
                <RouterLink to="/search?q=王阳明" class="px-2.5 py-0.5 bg-background border border-border hover:border-primary hover:text-primary transition-colors">王阳明 (知行合一)</RouterLink>
              </div>
            </div>
            </div>
          </template>
        </section>

      <main v-show="!ui.immersive" class="max-w-7xl mx-auto px-6 py-12">
        <!-- 核心板块双栏布局：今日一史 + 分类导航 -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-10">
          <!-- 左侧：今日一史卡片（2列） -->
          <div class="md:col-span-2 space-y-8">
            <div v-if="todayEntry" v-reveal class="border-wenwu p-7 md:p-9 bg-card/75 relative shadow-sm space-y-5">
              <div class="flex items-center justify-between pb-3.5 border-b-2 border-border/80">
                <div class="flex items-center space-x-2.5">
                  <span class="w-2.5 h-2.5 bg-primary"></span>
                  <h2 class="text-base font-textbook-title tracking-wide text-foreground">今日一史 · 重点词条</h2>
                </div>
                <span class="text-xs font-serif text-muted-foreground">{{ todayEntry.sources[0] }}</span>
              </div>

              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-baseline space-x-3.5">
                    <h3 class="text-3xl md:text-4xl font-serif font-black text-foreground">{{ todayEntry.name }}</h3>
                    <span class="text-xs font-serif text-muted-foreground">{{ todayEntry.pinyin }} ({{ todayEntry.lifespan?.birth }}—{{ todayEntry.lifespan?.death }})</span>
                  </div>
                  <p class="text-xs font-serif text-muted-foreground mt-1.5">字叔大，号太岳，湖广江陵人。万历朝内阁首辅、明代杰出改革家。</p>
                </div>
                <SealStamp text="首辅" class="seal-drop" />
              </div>

              <!-- 摘要正文 -->
              <div class="font-serif text-[15px] leading-relaxed text-foreground/90 space-y-3 font-textbook-body textbook-reading-column pt-1">
                <p class="text-indent-chinese textbook-dropcap">
                  {{ todayEntry.summary }}
                </p>
              </div>

              <!-- 史料卡片 -->
              <div v-if="todayEntry.quotes?.length" class="p-5 border-wenwu border-l-4 border-l-primary bg-background shadow-sm space-y-2">
                <div class="flex items-center justify-between text-xs text-muted-foreground pb-1.5 border-b border-border/60">
                  <span class="font-serif text-primary font-bold">【史料原文】</span>
                  <span class="font-serif">——{{ todayEntry.quotes[0].source }}</span>
                </div>
                <p class="font-textbook-quote text-sm text-foreground/95 leading-relaxed italic">
                  「{{ todayEntry.quotes[0].text }}」
                </p>
              </div>

              <!-- 底部链接操作 -->
              <div class="pt-4 border-t border-border flex items-center justify-between text-xs">
                <span class="text-muted-foreground font-serif">词条内容：生平年表、一条鞭法述评、四方史论</span>
                <RouterLink 
                  :to="`/entry/${todayEntry.id}`" 
                  class="font-serif font-bold text-primary hover:text-primary/80 flex items-center space-x-1"
                >
                  <span>进入词条全文阅读</span>
                  <ArrowRight class="w-3.5 h-3.5" />
                </RouterLink>
              </div>
            </div>

            <!-- 史册残页：今日一叶 -->
            <div v-if="fragment" v-reveal="90" class="border-wenwu p-5 bg-card/55 flex flex-col sm:flex-row items-start sm:items-center gap-3 shadow-sm hover-lift">
              <span class="text-xs font-serif font-bold dynasty-accent-text tracking-widest shrink-0">【史册残页 · 今日一叶】</span>
              <p class="text-xs font-serif text-muted-foreground leading-relaxed flex-1">
                <strong class="text-foreground font-bold">{{ fragment.year }}</strong> · {{ fragment.event }}
              </p>
              <RouterLink
                :to="`/entry/${fragment.entryId}`"
                class="text-xs font-serif font-bold text-primary hover:text-primary/80 shrink-0"
              >
                出自 {{ fragment.entryName }} →
              </RouterLink>
            </div>

            <!-- 编年长卷导览横幅 -->
            <div v-reveal="140" class="border-wenwu p-7 bg-card/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover-lift">
              <div>
                <span class="text-xs text-primary font-serif font-bold tracking-widest block mb-1">【时序专栏】</span>
                <h3 class="text-lg font-textbook-title text-foreground">历代编年长卷 · 唐宋明三卷已展</h3>
                <p class="text-xs font-serif text-muted-foreground mt-1 max-w-md leading-relaxed">
                  自晋阳起兵至崖山蹈海，自洪武建元至甲申国变——三个朝代的风云时空坐标轴横向展开。
                </p>
              </div>
              <RouterLink
                to="/timeline?dynasty=ming"
                class="px-5 py-2.5 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs font-serif font-bold transition-colors shrink-0"
              >
                展开长卷
              </RouterLink>
            </div>

            <!-- 朝代对读入口横幅 -->
            <div v-reveal="190" class="border-wenwu p-7 bg-card/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover-lift">
              <div>
                <span class="text-xs text-primary font-serif font-bold tracking-widest block mb-1">【双卷合参】</span>
                <h3 class="text-lg font-textbook-title text-foreground">朝代对读</h3>
                <p class="text-xs font-serif text-muted-foreground mt-1 max-w-md leading-relaxed">
                  王安石变法对读一条鞭法、靖康之变对读土木堡之变——把两个朝代并置合参，看历史的因果与回声。
                </p>
              </div>
              <RouterLink
                to="/compare"
                class="px-5 py-2.5 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs font-serif font-bold transition-colors shrink-0"
              >
                双卷合参
              </RouterLink>
            </div>
          </div>

          <!-- 右侧：分类目录导航（1列） -->
          <div class="space-y-8">
            <!-- 我的寻迹：足迹 + 藏书阁 -->
            <div v-reveal="60" class="border-wenwu p-6 md:p-7 bg-card/65 shadow-sm space-y-4 hover-lift">
              <div class="pb-3 border-b-2 border-border/80 flex items-center justify-between">
                <h2 class="text-sm font-textbook-title tracking-wider text-foreground">我的寻迹</h2>
                <span class="text-[11px] text-muted-foreground font-serif">足迹 · 藏书阁</span>
              </div>

              <div>
                <span class="text-[11px] font-serif font-bold dynasty-accent-text tracking-widest block mb-2">足迹 · 最近到访</span>
                <div v-if="recentFootprints.length" class="space-y-0.5 text-sm font-serif">
                  <RouterLink
                    v-for="f in recentFootprints"
                    :key="f.id"
                    :to="`/entry/${f.id}`"
                    class="flex items-center justify-between py-1.5 border-b border-border/40 hover:text-primary transition-colors group"
                  >
                    <span class="text-foreground/90 group-hover:text-primary transition-colors">{{ entryName(f.id) }}</span>
                    <span class="text-[10px] font-mono text-muted-foreground">{{ timeAgo(f.ts) }}</span>
                  </RouterLink>
                </div>
                <p v-else class="text-xs font-serif text-muted-foreground leading-relaxed">漫游未启——去词条里走走，脚印会留在这里。</p>
              </div>

              <div>
                <span class="text-[11px] font-serif font-bold dynasty-accent-text tracking-widest block mb-2">藏书阁 · 已钤印</span>
                <div v-if="collectedItems.length" class="flex flex-wrap gap-2">
                  <RouterLink
                    v-for="c in collectedItems"
                    :key="c.id"
                    :to="`/entry/${c.id}`"
                    class="seal-stamp seal-stamp-sm hover:opacity-90 transition-opacity"
                    :title="entryName(c.id)"
                  >
                    {{ entryName(c.id) }}
                  </RouterLink>
                </div>
                <p v-else class="text-xs font-serif text-muted-foreground leading-relaxed">在词条页钤下一枚藏书印，此书即入阁。</p>
              </div>
            </div>

            <div v-reveal="110" class="border-wenwu p-6 md:p-7 bg-card/65 shadow-sm space-y-4 hover-lift">
              <div class="pb-3 border-b-2 border-border/80 flex items-center justify-between">
                <h2 class="text-sm font-textbook-title tracking-wider text-foreground">词条分类目录</h2>
                <span class="text-[11px] text-muted-foreground font-serif">核心条目索引</span>
              </div>

              <div class="divide-y divide-border/60 text-sm font-serif">
                <RouterLink to="/search?type=emperor" class="py-3.5 flex items-center justify-between hover:text-primary group transition-colors">
                  <div class="flex items-center space-x-2.5">
                    <span class="text-xs font-mono text-muted-foreground group-hover:text-primary font-bold">01</span>
                    <span class="font-bold">帝王录 ({{ typeCounts.emperor }} 位)</span>
                  </div>
                  <span class="text-xs text-muted-foreground">太祖、成祖、崇祯等</span>
                </RouterLink>

                <RouterLink to="/search?type=figure" class="py-3.5 flex items-center justify-between hover:text-primary group transition-colors">
                  <div class="flex items-center space-x-2.5">
                    <span class="text-xs font-mono text-muted-foreground group-hover:text-primary font-bold">02</span>
                    <span class="font-bold">重臣学士 ({{ typeCounts.figure }} 位)</span>
                  </div>
                  <span class="text-xs text-muted-foreground">于谦、王阳明、戚继光</span>
                </RouterLink>

                <RouterLink to="/search?type=event" class="py-3.5 flex items-center justify-between hover:text-primary group transition-colors">
                  <div class="flex items-center space-x-2.5">
                    <span class="text-xs font-mono text-muted-foreground group-hover:text-primary font-bold">03</span>
                    <span class="font-bold">重大事件 ({{ typeCounts.event }} 件)</span>
                  </div>
                  <span class="text-xs text-muted-foreground">靖难之役、土木堡之变</span>
                </RouterLink>

                <RouterLink to="/search?type=classic" class="py-3.5 flex items-center justify-between hover:text-primary group transition-colors">
                  <div class="flex items-center space-x-2.5">
                    <span class="text-xs font-mono text-muted-foreground group-hover:text-primary font-bold">04</span>
                    <span class="font-bold">传世典籍 ({{ typeCounts.classic }} 部)</span>
                  </div>
                  <span class="text-xs text-muted-foreground">《永乐大典》《本草纲目》</span>
                </RouterLink>

                <RouterLink to="/search?type=system" class="py-3.5 flex items-center justify-between hover:text-primary group transition-colors">
                  <div class="flex items-center space-x-2.5">
                    <span class="text-xs font-mono text-muted-foreground group-hover:text-primary font-bold">05</span>
                    <span class="font-bold">制度地理 ({{ typeCounts.system }} 项)</span>
                  </div>
                  <span class="text-xs text-muted-foreground">内阁制、一条鞭法</span>
                </RouterLink>
              </div>
            </div>

            <!-- 延伸思辨组件 -->
            <div v-reveal="170" class="border-wenwu p-6 bg-card/45 shadow-sm space-y-3">
              <div class="flex items-center space-x-2 pb-2 border-b border-border/60">
                <span class="text-primary font-bold">◆</span>
                <h4 class="text-xs font-textbook-title text-foreground tracking-wide">延伸思辨</h4>
              </div>
              <p class="text-xs md:text-[13px] font-serif text-muted-foreground leading-relaxed font-textbook-quote">
                明朝废除丞相设立内阁，对<span class="brush-em text-foreground">君主专制中央集权</span>制度产生了怎样的深远影响？张居正<span class="brush-em text-foreground">一条鞭法</span>改革又是如何解决财政危机的？
              </p>
              <div class="pt-3 border-t border-border/60 text-right">
                <RouterLink to="/search?q=内阁制" class="text-xs font-serif text-primary hover:underline font-bold">
                  查看制度专题解读 →
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- 点墨捞史：虚空捞起的残句小笺 -->
    <Teleport to="body">
      <Transition name="guide-fade">
        <div
          v-if="probe"
          class="fixed z-[80] w-72 border-wenwu bg-card/95 shadow-lg p-4 space-y-2 probe-pop"
          :style="{ left: `${probe.x - 144}px`, top: `${probe.y - 20}px` }"
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-serif font-bold dynasty-accent-text tracking-widest">【墨痕拾遗】</span>
            <button type="button" class="text-muted-foreground hover:text-foreground text-xs cursor-pointer" @click="closeProbe">✕</button>
          </div>
          <p class="text-xs font-serif text-foreground/90 leading-relaxed">
            <strong class="font-bold">{{ probe.item.year }}</strong> · {{ probe.item.event }}
          </p>
          <RouterLink
            :to="`/entry/${probe.item.entryId}`"
            class="inline-block text-[11px] font-serif font-bold text-primary hover:text-primary/80"
            @click="closeProbe"
          >
            出自 {{ probe.item.entryName }} →
          </RouterLink>
        </div>
      </Transition>
    </Teleport>

    <!-- 首访三步引导 -->
    <GuideOverlay v-model="guideOpen" />

    <!-- 底部版权与版心页码 -->
    <footer v-show="!ui.immersive" class="mt-16 border-t border-border bg-card/40 py-8 text-center text-xs text-muted-foreground font-serif">
      <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center space-x-2">
          <SealStamp text="寻迹" />
          <span>中国历史知识库 · 首期明朝，持续扩充历代 (Vue 3 本地运行)</span>
        </div>
        <div class="textbook-folio font-bold text-foreground/70">· 002 ·</div>
        <div>
          <span>中国风历史检索 · 纯本地流式体验架构</span>
        </div>
      </div>
    </footer>
  </div>
</template>
