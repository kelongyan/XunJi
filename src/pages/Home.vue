<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Minimize2 } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import DataBand from '../components/common/DataBand.vue'
import IndexList from '../components/common/IndexList.vue'
import Masthead from '../components/common/Masthead.vue'
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

/** 数据带（大数字 + 微型标签） */
const dataItems = computed(() => [
  { value: stats.value.span, label: '年跨度 · 自汉至清' },
  { value: stats.value.dynasties, label: '朝已修典' },
  { value: stats.value.entries, label: '卷词条目录' },
  { value: stats.value.quotes, label: '段史料引文' }
])

/** 词条分类目录（编目式索引行） */
const indexItems = [
  { name: '帝王录', meta: '太祖 · 成祖 · 崇祯', value: `${typeCounts.emperor} 位`, to: '/search?type=emperor' },
  { name: '重臣学士', meta: '于谦 · 王阳明 · 戚继光', value: `${typeCounts.figure} 位`, to: '/search?type=figure' },
  { name: '重大事件', meta: '靖难之役 · 土木堡之变', value: `${typeCounts.event} 件`, to: '/search?type=event' },
  { name: '传世典籍', meta: '《永乐大典》《本草纲目》', value: `${typeCounts.classic} 部`, to: '/search?type=classic' },
  { name: '制度地理', meta: '内阁制 · 一条鞭法', value: `${typeCounts.system} 项`, to: '/search?type=system' }
]

/** 图版大观：从已配图词条中轮转精选（每日轮换，五朝兼顾，按汉唐宋明清编年排序） */
const galleryItems = computed(() => {
  const pool = allHistoryEntries.filter(e => e.image?.src?.endsWith('.webp'))
  if (!pool.length) return []
  const d = new Date()
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate()
  const byDynasty = new Map<string, typeof pool>()
  for (const e of pool) {
    if (!byDynasty.has(e.dynasty)) byDynasty.set(e.dynasty, [])
    byDynasty.get(e.dynasty)!.push(e)
  }
  const lists = [...byDynasty.values()].map(list => {
    const arr = [...list]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (seed * 9301 + i * 49297) % (i + 1)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  })
  const picked: typeof pool = []
  for (let round = 0; picked.length < 8; round++) {
    let added = false
    for (const l of lists) {
      if (l[round]) {
        picked.push(l[round])
        added = true
        if (picked.length >= 8) break
      }
    }
    if (!added) break
  }
  const order = ['汉', '唐', '宋', '明', '清']
  return picked.sort((a, b) => order.indexOf(a.dynasty) - order.indexOf(b.dynasty))
})

/** 已开卷图版总数（数据诚信：运行时真实统计） */
const galleryTotal = computed(
  () => allHistoryEntries.filter(e => e.image?.src?.endsWith('.webp')).length
)

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
  // Timeline 已支持五朝（han/tang/song/ming/qing），统一携带朝代参数直达对应长卷
  if (theme.id === 'ming') router.push('/timeline')
  else router.push(`/timeline?dynasty=${theme.id}`)
}

const hoverTheme = ref<DynastyTheme | null>(null)
function onDynastyHover(theme: DynastyTheme | null) {
  hoverTheme.value = theme
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
      <TextbookHeader v-if="!ui.immersive" folio="001" subChapter="中国历史知识库 · 汉唐宋明清五朝通览" />

      <!-- 封面题签式 Hero：3D 时空长河全宽沉浸（桌面） / 静态封面（降级） -->
      <section
        class="relative w-full overflow-hidden"
        :class="show3d ? (ui.immersive ? 'fixed inset-0 z-[60]' : '') : 'py-10'"
      >
        <button
          v-if="ui.immersive"
          type="button"
          class="absolute top-5 right-6 z-30 mode-toggle !text-[13px]"
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
            @hover="onDynastyHover"
          />

          <!-- 卷轴悬停浮签：朝代名 / 年号跨度 / 一句题记 / 是否可入 -->
          <Transition name="guide-fade">
            <div
              v-if="introDone && hoverTheme && !ui.immersive"
              class="absolute z-20 right-6 bottom-24 md:bottom-28 px-4 py-3 bg-card/95 border border-border/80 backdrop-blur-sm pointer-events-none max-w-[280px] space-y-1.5"
            >
              <div class="flex items-center gap-2.5">
                <span class="w-2 h-2 shrink-0" :style="{ backgroundColor: hoverTheme.accent }"></span>
                <span class="font-serif text-[15px] text-foreground">{{ hoverTheme.hanzi }}朝</span>
                <span class="index-meta">{{ hoverTheme.span }}</span>
              </div>
              <p class="text-[13px] font-serif text-muted-foreground leading-snug">{{ hoverTheme.tagline }}</p>
              <p class="text-[12px] font-serif" :class="hoverTheme.live ? 'text-[var(--dynasty-accent)]' : 'text-muted-foreground/70'">
                {{ hoverTheme.live ? '点击卷轴 · 展开编年长卷' : '修典中 · 尚未开卷' }}
              </p>
            </div>
          </Transition>

          <div
            class="relative z-10 flex flex-col justify-center py-12 pointer-events-none transition-opacity duration-[1200ms]"
            :class="[introDone ? 'opacity-100' : 'opacity-0', ui.immersive ? 'min-h-screen' : 'min-h-[clamp(560px, 80vh, 880px)]']"
          >
            <div v-show="!ui.immersive" class="max-w-6xl mx-auto w-full px-6 md:px-10">
              <div class="max-w-3xl space-y-5">
                <div class="eyebrow">汉 · 唐 · 宋 · 明 · 清 五朝已开卷</div>
                <h1 class="display-title drop-shadow-[0_1px_0_rgba(247,243,232,0.7)]">
                  纵观华夏，<br />
                  <span class="display-em">一部长河里的通史</span>。
                </h1>
                <p class="text-base md:text-xl font-serif text-muted-foreground leading-relaxed max-w-2xl">
                  以中国传统典籍装帧的视觉语言为基调，宋体正文、朱笔圈点、竖排史料——像翻一部会呼吸的纸墨史册。
                </p>
              </div>

              <!-- 检索：仿古籍目录索引检索签（带联想直达） -->
              <div
                class="mt-9 pt-7 border-t border-border/70 max-w-3xl"
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
                    class="px-9 py-3.5 bg-[var(--dynasty-accent)] hover:opacity-90 text-primary-foreground font-serif tracking-[0.2em] text-[15px] flex items-center justify-center gap-2.5 transition-opacity active:scale-95 cursor-pointer"
                  >
                    <span>开卷寻迹</span>
                    <ArrowRight class="w-4 h-4" />
                  </button>
                </form>

                <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span class="eyebrow is-plain">核心词条索引</span>
                  <RouterLink to="/entry/zhang-juzheng" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">张居正</RouterLink>
                  <RouterLink to="/search?q=靖难之役" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">靖难之役</RouterLink>
                  <RouterLink to="/search?q=永乐大典" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">永乐大典</RouterLink>
                  <RouterLink to="/search?q=一条鞭法" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">一条鞭法</RouterLink>
                  <RouterLink to="/search?q=王阳明" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">王阳明</RouterLink>
                </div>

                <div class="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
                  <span>拖动环视</span>
                  <span>滚轮推近</span>
                  <span>点击卷轴启程</span>
                  <span>空白处点墨捞史</span>
                  <span class="inline-flex items-center gap-1.5"><kbd class="kbd">H</kbd> 沉浸</span>
                </div>
              </div>
            </div>
          </div>

          <div class="absolute bottom-0 inset-x-0 h-28 bg-gradient-to-b from-transparent to-[color:var(--paper-base)] pointer-events-none z-[5]"></div>
        </template>

        <!-- 静态降级封面（窄屏 / WebGL 不可用） -->
        <template v-else>
          <div class="max-w-7xl mx-auto px-6">
            <div class="flex justify-between items-start gap-8 mb-10">
              <div class="space-y-4 max-w-3xl">
                <div class="eyebrow">汉 · 唐 · 宋 · 明 · 清 五朝已开卷</div>
                <h1 class="display-title">
                  纵观华夏，<br />
                  <span class="display-em">一部长河里的通史</span>。
                </h1>
                <p class="text-base md:text-xl font-serif text-muted-foreground leading-relaxed max-w-2xl">
                  以中国传统典籍装帧的视觉语言为基调，宋体正文、朱笔圈点、竖排史料——像翻一部会呼吸的纸墨史册。
                </p>
              </div>
              <div class="hidden sm:flex items-center gap-3 shrink-0">
                <div class="text-right">
                  <span class="index-meta block">当前专题 · 明朝</span>
                  <span class="index-meta">1368 — 1644</span>
                </div>
                <SealStamp text="大明" />
              </div>
            </div>

            <div class="rule"></div>

            <div class="mt-8">
              <form @submit.prevent="handleSearch" class="relative flex flex-col md:flex-row gap-3.5 max-w-3xl">
                <SearchSuggest
                  v-model="searchKeyword"
                  @select="onSearchSelect"
                  @submit="handleSearch"
                />
                <button
                  type="submit"
                  class="px-9 py-3.5 bg-[var(--dynasty-accent)] hover:opacity-90 text-primary-foreground font-serif tracking-[0.2em] text-[15px] flex items-center justify-center gap-2.5 transition-opacity active:scale-95 cursor-pointer"
                >
                  <span>开卷寻迹</span>
                  <ArrowRight class="w-4 h-4" />
                </button>
              </form>

              <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span class="eyebrow is-plain">核心词条索引</span>
                <RouterLink to="/entry/zhang-juzheng" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">张居正</RouterLink>
                <RouterLink to="/search?q=靖难之役" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">靖难之役</RouterLink>
                <RouterLink to="/search?q=永乐大典" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">永乐大典</RouterLink>
                <RouterLink to="/search?q=一条鞭法" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">一条鞭法</RouterLink>
                <RouterLink to="/search?q=王阳明" class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors">王阳明</RouterLink>
              </div>
            </div>
          </div>
        </template>
      </section>

      <!-- 诚实数据带（数据即景观） -->
      <div v-show="!ui.immersive" class="max-w-7xl mx-auto px-6">
        <div class="rule"></div>
        <DataBand :items="dataItems" />
        <div class="rule"></div>
      </div>

      <main v-show="!ui.immersive" class="max-w-7xl mx-auto px-6 py-14">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-14 md:gap-16">
          <!-- 左侧主栏 -->
          <div class="md:col-span-2 space-y-14">
            <!-- 今日一史 -->
            <article v-if="todayEntry" v-reveal>
              <div class="py-4 flex items-baseline justify-between gap-4 border-t border-border/60">
                <span class="eyebrow">今日一史 · 重点词条</span>
                <span class="index-meta">{{ todayEntry.sources[0] }}</span>
              </div>

              <div class="flex items-start justify-between gap-8 mt-6">
                <div class="flex-1 min-w-0">
                  <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                    <h2 class="display-heading">{{ todayEntry.name }}</h2>
                    <span class="index-meta">{{ todayEntry.pinyin }}</span>
                    <span class="index-meta">{{ todayEntry.lifespan?.birth }}—{{ todayEntry.lifespan?.death }}</span>
                  </div>
                  <p class="text-[15px] font-serif text-muted-foreground mt-3">
                    字叔大，号太岳，湖广江陵人。万历朝内阁首辅、明代杰出改革家。
                  </p>

                  <div class="font-serif text-[15px] leading-loose text-foreground/90 mt-7">
                    <p class="text-indent-chinese textbook-dropcap">{{ todayEntry.summary }}</p>
                  </div>
                </div>
                <div v-if="todayEntry.image" class="hidden sm:block shrink-0 w-44">
                  <div class="framed-plate bg-card/50 overflow-hidden p-1.5">
                    <img
                      :src="todayEntry.image.src"
                      :alt="todayEntry.image.caption"
                      class="w-full h-auto object-cover"
                    />
                  </div>
                  <p class="index-meta mt-2.5 text-center">图版 · 古籍摹本</p>
                </div>
                <SealStamp v-else text="首辅" class="seal-drop hidden sm:block shrink-0" />
              </div>

              <div
                v-if="todayEntry.quotes?.length"
                class="mt-8 pl-5 border-l-2"
                :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 45%, transparent)' }"
              >
                <p class="font-textbook-quote text-[15px] leading-loose text-foreground/95">
                  「{{ todayEntry.quotes[0].text }}」
                </p>
                <p class="index-meta mt-2.5 text-right">—— {{ todayEntry.quotes[0].source }}</p>
              </div>

              <div class="mt-7 flex justify-end">
                <RouterLink
                  :to="`/entry/${todayEntry.id}`"
                  class="text-[13px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 inline-flex items-center gap-1.5 tracking-wide transition-opacity"
                >
                  <span>进入词条全文阅读</span>
                  <ArrowRight class="w-3.5 h-3.5" />
                </RouterLink>
              </div>
            </article>

            <!-- 史册残页 · 今日一叶 -->
            <div v-if="fragment" v-reveal="90">
              <div class="rule"></div>
              <div class="py-5 flex flex-col sm:flex-row sm:items-baseline gap-3 sm:gap-5">
                <span class="eyebrow shrink-0">史册残页 · 今日一叶</span>
                <p class="text-[13px] font-serif text-muted-foreground leading-relaxed flex-1">
                  <strong class="text-foreground font-normal">{{ fragment.year }}</strong> · {{ fragment.event }}
                </p>
                <RouterLink
                  :to="`/entry/${fragment.entryId}`"
                  class="text-[13px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 shrink-0 transition-opacity"
                >
                  出自 {{ fragment.entryName }} →
                </RouterLink>
              </div>
            </div>

            <!-- 专题专栏（编目式） -->
            <div v-reveal="140">
              <div class="eyebrow mb-2">专题专栏</div>
              <RouterLink to="/timeline?dynasty=ming" class="index-row items-center group">
                <span class="index-name">历代编年长卷</span>
                <span class="index-meta hidden sm:inline">唐 · 宋 · 明 三卷已展</span>
                <ArrowRight class="w-3.5 h-3.5 text-[var(--dynasty-accent)]" />
              </RouterLink>
              <RouterLink to="/compare" class="index-row items-center group">
                <span class="index-name">朝代对读</span>
                <span class="index-meta hidden sm:inline">双词条跨朝代合参</span>
                <ArrowRight class="w-3.5 h-3.5 text-[var(--dynasty-accent)]" />
              </RouterLink>
            </div>

            <!-- 图版大观（历代木刻绣像精选） -->
            <div v-if="galleryItems.length" v-reveal="165">
              <div class="rule"></div>
              <div class="py-4 flex items-baseline justify-between gap-4">
                <span class="eyebrow">图版大观 · 历代绣像精选</span>
                <span class="index-meta">已开卷 {{ galleryTotal }} 幅</span>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-8 mt-6">
                <RouterLink
                  v-for="item in galleryItems"
                  :key="item.id"
                  :to="`/entry/${item.id}`"
                  class="group block"
                >
                  <div class="framed-plate bg-card/50 overflow-hidden p-1.5 relative">
                    <img
                      :src="item.image?.src"
                      :alt="item.image?.caption"
                      loading="lazy"
                      class="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                    <!-- 藏印角标：hover 时浮出（观画钤印的暗示，点击即入词条） -->
                    <span
                      class="absolute top-2.5 right-2.5 seal-stamp seal-stamp-sm pointer-events-none opacity-0 translate-y-1 rotate-6 transition-all duration-300 group-hover:opacity-95 group-hover:translate-y-0 group-hover:rotate-0"
                      aria-hidden="true"
                    >藏</span>
                  </div>
                  <div class="mt-3 flex items-baseline justify-between gap-2">
                    <span class="text-[13px] font-serif text-foreground truncate group-hover:text-[var(--dynasty-accent)] transition-colors">{{ item.name }}</span>
                    <span class="index-meta shrink-0">{{ item.dynasty }}</span>
                  </div>
                </RouterLink>
              </div>
            </div>

            <!-- 延伸思辨（页边批注形态） -->
            <div
              v-reveal="190"
              class="pl-5 border-l-2"
              :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 45%, transparent)' }"
            >
              <div class="eyebrow mb-3">延伸思辨</div>
              <p class="text-[13px] font-serif text-muted-foreground leading-loose font-textbook-quote">
                明朝废除丞相设立内阁，对<span class="brush-em text-foreground">君主专制中央集权</span>制度产生了怎样的深远影响？张居正<span class="brush-em text-foreground">一条鞭法</span>改革又是如何解决财政危机的？
              </p>
              <div class="mt-4">
                <RouterLink to="/search?q=内阁制" class="text-[13px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 transition-opacity">
                  查看制度专题解读 →
                </RouterLink>
              </div>
            </div>
          </div>

          <!-- 右侧栏 -->
          <div class="space-y-14">
            <!-- 我的寻迹 -->
            <div v-reveal="60">
              <div class="flex items-baseline justify-between gap-3 pb-3">
                <span class="eyebrow">我的寻迹</span>
                <span class="index-meta">足迹 · 藏书阁</span>
              </div>
              <div class="rule"></div>

              <div class="pt-5">
                <span class="index-meta block mb-2.5">足迹 · 最近到访</span>
                <div v-if="recentFootprints.length" class="text-[15px] font-serif">
                  <RouterLink
                    v-for="f in recentFootprints"
                    :key="f.id"
                    :to="`/entry/${f.id}`"
                    class="flex items-center justify-between py-1.5 border-b border-border/40 hover:text-[var(--dynasty-accent)] transition-colors"
                  >
                    <span>{{ entryName(f.id) }}</span>
                    <span class="index-meta">{{ timeAgo(f.ts) }}</span>
                  </RouterLink>
                </div>
                <p v-else class="text-[13px] font-serif text-muted-foreground leading-relaxed">
                  漫游未启——去词条里走走，脚印会留在这里。
                </p>
              </div>

              <div class="pt-6">
                <span class="index-meta block mb-3">藏书阁 · 已钤印</span>
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
                <p v-else class="text-[13px] font-serif text-muted-foreground leading-relaxed">
                  在词条页钤下一枚藏书印，此书即入阁。
                </p>
              </div>
            </div>

            <!-- 词条分类目录 -->
            <div v-reveal="110">
              <div class="flex items-baseline justify-between gap-3 pb-3">
                <span class="eyebrow">词条分类目录</span>
                <span class="index-meta">核心条目索引</span>
              </div>
              <IndexList :items="indexItems" />
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
          class="fixed z-[80] w-72 bg-card border border-border shadow-lg p-4 space-y-2 probe-pop"
          :style="{ left: `${probe.x - 144}px`, top: `${probe.y - 20}px` }"
        >
          <div class="flex items-center justify-between">
            <span class="eyebrow">墨痕拾遗</span>
            <button type="button" class="text-muted-foreground hover:text-foreground text-[13px] cursor-pointer" @click="closeProbe">✕</button>
          </div>
          <p class="text-[13px] font-serif text-foreground/90 leading-relaxed">
            <strong class="font-normal">{{ probe.item.year }}</strong> · {{ probe.item.event }}
          </p>
          <RouterLink
            :to="`/entry/${probe.item.entryId}`"
            class="inline-block text-[13px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 transition-opacity"
            @click="closeProbe"
          >
            出自 {{ probe.item.entryName }} →
          </RouterLink>
        </div>
      </Transition>
    </Teleport>

    <!-- 首访三步引导 -->
    <GuideOverlay v-model="guideOpen" />

    <!-- 底部版记 -->
    <div v-show="!ui.immersive">
      <Masthead left="寻迹 · 中国历史知识库" note="汉 · 唐 · 宋 · 明 · 清 五朝通览" folio="002" />
    </div>
  </div>
</template>
