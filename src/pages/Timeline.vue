<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { ExternalLink } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import Masthead from '../components/common/Masthead.vue'
import CounterfactualPanel from '../components/ai/CounterfactualPanel.vue'
import AnnotateText from '../components/common/AnnotateText.vue'
import { dynastyTimelines } from '../data/timelines'
import { dynastyThemes, getDynastyTheme, defaultDynasty } from '../data/dynastyThemes'

const route = useRoute()
const router = useRouter()

const availableIds = ['han', 'tang', 'song', 'ming', 'qing']
const currentId = computed(() => {
  const q = route.query.dynasty as string
  return availableIds.includes(q) ? q : 'ming'
})
const theme = computed(() => getDynastyTheme(currentId.value))
const events = computed(() => dynastyTimelines[currentId.value] ?? [])
const years = computed(() => theme.value.years[1] - theme.value.years[0])

const summaries: Record<string, string> = {
  han: '两汉四百余年，自高祖定鼎至献帝禅让，中经文景之治的休养生息、武帝的开拓进取与独尊儒术、昭宣的中兴、光武的重建汉室。中原王朝的疆域轮廓、官僚体制与精神底色，正在这四百年间奠定下来。',
  tang: '大唐二百八十九年，在政治上完成三省六部与科举取士的制度定型，在文明气象上兼容并蓄、万国来朝；开元极盛与安史断裂之间，蕴含着古代王朝由盛转衰最深刻的一组因果关系。',
  song: '赵宋三百一十九年，以重文轻武换来内部百年安定与文治巅峰，也以强干弱枝埋下武力不振的病根；从陈桥兵变到崖山蹈海，一条「文明与安全如何兼得」的主线贯穿始终。',
  ming: '明代二百七十六年间，在政治体制上完成自唐宋中书门下省制向明清高度皇权垄断内阁制的质变；在经济体制上一条鞭法开赋役折银之先河，为晚明江南商品经济繁荣提供了法制基础。万历新政与张居正身后政局变迁之间，蕴含着深刻的内在联系。',
  qing: '清朝入关定鼎至宣统退位凡二百六十八年，上承康乾盛世之极盛，下历三千年未有之变局。从十全武功的拓疆到鸦片战争的屈辱，从洋务自强到辛亥鼎革，中国古代社会的终章在此写就。'
}

watch(
  () => currentId.value,
  id => {
    document.documentElement.dataset.dynasty = id
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  document.documentElement.dataset.dynasty = defaultDynasty.id
})

function selectDynasty(id: string) {
  if (!availableIds.includes(id)) return
  router.replace({ query: { ...route.query, dynasty: id } })
}

/* ── 长卷「描线生长」：中轴墨线随滚动自上而下生长 ── */
const axisRef = ref<HTMLElement | null>(null)
const axisProgress = ref(0)
const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
let scrollRaf = 0

function updateAxis() {
  scrollRaf = 0
  const el = axisRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const vh = window.innerHeight
  // 起点：轴线顶到达视口 72% 处；终点：轴线底经过视口 40% 处
  const traveled = vh * 0.72 - rect.top
  const total = rect.height - vh * 0.32
  axisProgress.value = reducedMotion ? 1 : Math.min(1, Math.max(0, traveled / Math.max(1, total)))
}

function onScroll() {
  if (!scrollRaf) scrollRaf = requestAnimationFrame(updateAxis)
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  updateAxis()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
})

/* 朝代切换后重新测量（内容高度变了） */
watch(currentId, () => {
  requestAnimationFrame(updateAxis)
})
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between">
    <div>
      <TextbookHeader folio="088" :subChapter="`${theme.hanzi}朝编年通览 · 经折装时空轴线`" />

      <main class="max-w-7xl mx-auto px-6 py-12">
        <!-- 朝代切换卷签 -->
        <div v-reveal class="flex flex-wrap items-center justify-center gap-3 mb-10">
          <button
            v-for="d in dynastyThemes"
            :key="d.id"
            type="button"
            :disabled="!availableIds.includes(d.id)"
            @click="selectDynasty(d.id)"
            class="px-4 py-1.5 text-[13px] tracking-[0.22em] border-b border-transparent transition-colors"
            :class="[
              currentId === d.id
                ? 'text-[var(--dynasty-accent)] border-[var(--dynasty-accent)]'
                : availableIds.includes(d.id)
                  ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                  : 'text-muted-foreground/40 cursor-not-allowed'
            ]"
          >
            {{ d.hanzi }}<span v-if="!availableIds.includes(d.id)" class="text-[12px] ml-1 opacity-70">修典中</span>
          </button>
        </div>

        <!-- 长卷说明头 (仿古籍文武双线框) -->
        <div v-reveal class="mb-16 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div class="space-y-4">
            <div class="eyebrow">时空通览 · 经折长卷</div>
            <h1 class="display-title">{{ theme.hanzi }}朝编年通览</h1>
            <p class="text-[15px] md:text-base font-serif text-muted-foreground max-w-2xl leading-relaxed">
              {{ theme.tagline }}——公元纪年与帝王年号双轨互见（{{ theme.span }}），理顺本朝兴衰的关键脉络。
            </p>
          </div>
          <div class="flex items-center gap-6 shrink-0">
            <SealStamp :text="theme.sealText" />
            <div class="text-right space-y-2.5">
              <div class="spec-number">{{ years }}</div>
              <div class="index-meta">国祚年数 · 收录 {{ events.length }} 事</div>
            </div>
          </div>
        </div>

        <!-- 编年时间轴（朝代切换时内容淡入替换）；中轴墨线随滚动生长 -->
        <Transition name="fade-swap" mode="out-in">
          <div ref="axisRef" :key="currentId" class="relative space-y-16">
            <!-- 中轴：底墨线（淡）+ 生长墨线（主题色，随滚动描画）+ 生长端光点
                 桌面用 left:50% 对齐（不靠 translate 取整，避免 1px 双线） -->
            <div class="hidden md:block absolute inset-y-0 left-1/2 -ml-px w-px bg-border/50 pointer-events-none" aria-hidden="true"></div>
            <div class="md:hidden absolute inset-y-0 left-8 w-px bg-border/50 pointer-events-none" aria-hidden="true"></div>
            <div
              class="hidden md:block absolute top-0 left-1/2 -ml-px w-px pointer-events-none timeline-ink-grow"
              :style="{ height: `${axisProgress * 100}%` }"
              aria-hidden="true"
            ></div>
            <div
              class="md:hidden absolute top-0 left-8 w-px pointer-events-none timeline-ink-grow"
              :style="{ height: `${axisProgress * 100}%` }"
              aria-hidden="true"
            ></div>
            <div
              class="hidden md:block absolute left-1/2 -ml-1 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none timeline-grow-dot"
              :style="{ top: `${axisProgress * 100}%`, opacity: axisProgress > 0.01 && axisProgress < 0.99 ? 1 : 0 }"
              aria-hidden="true"
            ></div>
            <div
              class="md:hidden absolute left-8 -ml-1 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none timeline-grow-dot"
              :style="{ top: `${axisProgress * 100}%`, opacity: axisProgress > 0.01 && axisProgress < 0.99 ? 1 : 0 }"
              aria-hidden="true"
            ></div>
          <div
            v-for="(ev, idx) in events"
            :key="ev.title"
            v-reveal
            class="relative flex flex-col md:flex-row items-center justify-between group"
          >
            <!-- 左侧内容 (偶数行文 / 奇数行要义) -->
            <div
              v-if="idx % 2 === 0"
              class="md:w-5/12 text-left md:text-right pr-0 md:pr-12 pl-16 md:pl-0 space-y-2"
            >
              <span class="block text-2xl md:text-3xl" style="font-family: var(--font-serif); color: var(--dynasty-accent); line-height: 1">
                {{ ev.year }}
              </span>
              <h3 class="text-xl md:text-2xl text-foreground mt-3" style="font-family: var(--font-serif)">
                <RouterLink v-if="ev.entryId" :to="`/entry/${ev.entryId}`" class="hover:text-[var(--dynasty-accent)] transition-colors flex items-center gap-2 md:justify-end">
                  <span>{{ ev.title }}</span>
                  <ExternalLink class="w-4 h-4 text-muted-foreground" />
                </RouterLink>
                <span v-else>{{ ev.title }}</span>
              </h3>
              <p class="text-[13px] md:text-[15px] font-serif text-muted-foreground leading-relaxed mt-2.5">
                <AnnotateText :text="ev.desc" />
              </p>
            </div>
            <div
              v-else
              class="md:w-5/12 pl-16 md:pl-12 order-2 md:order-1 mt-4 md:mt-0"
            >
              <div class="pl-4 border-l-2 text-[15px] font-serif text-muted-foreground" style="border-color: color-mix(in srgb, var(--dynasty-accent) 40%, transparent)">
                <div class="eyebrow mb-2">史事要义</div>
                <p class="leading-relaxed"><AnnotateText :text="ev.gist" /></p>
              </div>
            </div>

            <!-- 中心光标圆点（进入视口点亮） -->
            <div class="dot-pop absolute left-8 md:left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[var(--dynasty-accent)] border-[3px] border-background"></div>

            <!-- 右侧内容 (偶数行要义 / 奇数行文) -->
            <div
              v-if="idx % 2 === 0"
              class="md:w-5/12 pl-16 md:pl-12 mt-4 md:mt-0"
            >
              <div class="pl-4 border-l-2 text-[15px] font-serif text-muted-foreground" style="border-color: color-mix(in srgb, var(--dynasty-accent) 40%, transparent)">
                <div class="eyebrow mb-2">史事要义</div>
                <p class="leading-relaxed"><AnnotateText :text="ev.gist" /></p>
              </div>
            </div>
            <div
              v-else
              class="md:w-5/12 text-left pl-16 md:pl-12 order-1 md:order-2 space-y-2"
            >
              <span class="block text-2xl md:text-3xl" style="font-family: var(--font-serif); color: var(--dynasty-accent); line-height: 1">
                {{ ev.year }}
              </span>
              <h3 class="text-xl md:text-2xl text-foreground mt-3" style="font-family: var(--font-serif)">
                <RouterLink v-if="ev.entryId" :to="`/entry/${ev.entryId}`" class="hover:text-[var(--dynasty-accent)] transition-colors flex items-center gap-2 md:justify-end">
                  <span>{{ ev.title }}</span>
                  <ExternalLink class="w-4 h-4 text-muted-foreground" />
                </RouterLink>
                <span v-else>{{ ev.title }}</span>
              </h3>
              <p class="text-[13px] md:text-[15px] font-serif text-muted-foreground leading-relaxed mt-2.5">
                <AnnotateText :text="ev.desc" />
              </p>
            </div>
          </div>
          </div>
        </Transition>

        <!-- 编年综述板块 -->
        <div v-reveal class="mt-20">
          <div class="eyebrow mb-4">编年史事综述</div>
          <p class="text-[13px] md:text-[15px] font-serif text-muted-foreground leading-loose">
            {{ summaries[currentId] }}
          </p>
        </div>

        <!-- 入闱应试：读罢此卷，殿试三题 -->
        <div v-reveal class="mt-10 rule pt-6 pb-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div class="eyebrow mb-1.5">入闱应试</div>
            <p class="text-[13px] font-serif text-muted-foreground">
              读罢此卷，何不试才？——三问皆出自历代编年，答毕放榜，颁功名印。
            </p>
          </div>
          <RouterLink
            to="/exam"
            class="px-5 py-2 border border-[var(--dynasty-accent)] text-[var(--dynasty-accent)] text-[13px] font-serif tracking-[0.2em] hover:bg-[color-mix(in_srgb,var(--dynasty-accent)_8%,transparent)] transition-colors shrink-0"
          >入闱赴试 →</RouterLink>
        </div>

        <!-- 时空推演（反事实历史，非史实标注） -->
        <CounterfactualPanel v-reveal :dynasty="currentId" class="mt-16" />
      </main>

      <!-- 编年刻度尺（桌面右侧固定）：汉→清五段，当前段点墨、其余淡点 -->
      <nav
        class="hidden xl:flex fixed right-7 top-1/2 -translate-y-1/2 z-30 flex-col items-center gap-0.5"
        aria-label="朝代刻度尺"
      >
        <span class="w-px h-6 bg-border/70" aria-hidden="true"></span>
        <template v-for="(d, i) in dynastyThemes" :key="d.id">
          <button
            v-if="i > 0"
            type="button"
            class="w-px h-5 transition-colors"
            :class="currentId === d.id || currentId === dynastyThemes[i - 1].id ? 'bg-border' : 'bg-border/40'"
            aria-hidden="true"
            tabindex="-1"
          ></button>
          <button
            type="button"
            :disabled="!availableIds.includes(d.id)"
            class="group flex items-center gap-2 py-0.5 cursor-pointer disabled:cursor-not-allowed"
            :title="availableIds.includes(d.id) ? `跳转${d.hanzi}朝长卷` : `${d.hanzi}朝修典中`"
            @click="selectDynasty(d.id)"
          >
            <span
              class="font-serif transition-all"
              :class="[
                currentId === d.id
                  ? 'text-[15px] text-[var(--dynasty-accent)] font-bold'
                  : availableIds.includes(d.id)
                    ? 'text-[12px] text-muted-foreground/70 group-hover:text-foreground'
                    : 'text-[12px] text-muted-foreground/35'
              ]"
            >{{ d.hanzi }}</span>
            <span
              class="rounded-full transition-all"
              :class="currentId === d.id ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5 bg-border group-hover:bg-muted-foreground'"
              :style="currentId === d.id ? {
                backgroundColor: 'var(--dynasty-accent)',
                boxShadow: '0 0 0 4px color-mix(in srgb, var(--dynasty-accent) 18%, transparent)'
              } : undefined"
            ></span>
          </button>
        </template>
        <span class="w-px h-6 bg-border/70" aria-hidden="true"></span>
      </nav>
    </div>

    <!-- 底部版心页码 -->
    <Masthead left="寻迹 · 编年通览长卷" :note="`${theme.hanzi}朝纪年时序知识谱系`" folio="089" />
  </div>
</template>
