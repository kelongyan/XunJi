<script setup lang="ts">
/**
 * 万卷星图 · 全站关系图谱页
 * 五朝为星，万卷为野：339 词条 + 940 段关系的三维可漫游网络。
 * 派生数据由 src/data/graph.ts 构建，场景由 StarGraph.vue 渲染。
 * P1：寻脉（BFS 最短关系链 + 流动粒子）· 视图预设 · 深链聚焦 · 打字机侧栏。
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { ArrowRight, X, Route as RouteIcon, Undo2 } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import Masthead from '../components/common/Masthead.vue'
import SealStamp from '../components/common/SealStamp.vue'
import { graphData, findPath, PATH_DEMOS, GRAPH_VIEWS, GRAPH_STORIES, type GraphNode, type GraphView, type PathStep, type GraphStory } from '../data/graph'
import { RELATION_FAMILIES, RELATION_FAMILY_META, type RelationFamily } from '../data/relationTaxonomy'
import { defaultDynasty, getDynastyTheme } from '../data/dynastyThemes'
import { useTypewriter } from '../composables/useTypewriter'

const StarGraph = defineAsyncComponent(() => import('../components/three/StarGraph.vue'))
const Graph2D = defineAsyncComponent(() => import('../components/two/Graph2D.vue'))

const route = useRoute()
const show3d = ref(true)
const focused = ref<GraphNode | null>(null)
const hovered = ref<GraphNode | null>(null)
const starReady = ref(false)
/** StarGraph 暴露的方法（defineAsyncComponent 泛型推断不完整，手写契约） */
interface StarGraphApi {
  focusNodeById(id: string): boolean
  flyToNode(id: string): boolean
  restoreView(): void
  setPath(steps: PathStep[] | null): void
  setView(v: GraphView): void
  clearFocus(): void
}
const starRef = ref<StarGraphApi | null>(null)
const graph2dRef = ref<StarGraphApi | null>(null)
/** 当前活跃的星图实例（3D 或 2D 降级），API 协议一致 */
const star = computed<StarGraphApi | null>(() => (show3d.value ? starRef.value : graph2dRef.value))

/* ── 寻脉状态机：idle →（选定起点）→ pick-destination →（选定终点）→ 展示路径 ── */
const routeMode = ref<'idle' | 'pick-destination'>('idle')
const routeFrom = ref<string | null>(null)
const routePath = ref<PathStep[] | null>(null)

/* ── 视图预设 ── */
const activeView = ref<GraphView>('all')
watch(activeView, v => {
  star.value?.setView(v)
})

/* 页面进入即复位朝代染色（星图以全朝视角呈现，页面主题取明并为默认） */
watch(
  () => true,
  () => {
    document.documentElement.dataset.dynasty = defaultDynasty.id
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  document.documentElement.dataset.dynasty = defaultDynasty.id
})

/* ── 深链：/graph?focus=<id> → 图就绪后自动聚焦 ── */
watch(
  () => [starReady.value, route.query.focus] as const,
  ([ready, focusId]) => {
    if (!ready || typeof focusId !== 'string') return
    star.value?.focusNodeById(focusId)
  },
  { immediate: true }
)

/** 聚焦节点的关系清单（按关系族分组，供侧栏"关联谱系"） */
const focusRelations = computed(() => {
  const node = focused.value
  if (!node || node.kind !== 'entry') return []
  const byId = new Map(graphData.nodes.map(n => [n.id, n]))
  const rows: Array<{ other: string; otherId: string; family: RelationFamily; raw: string; dir: '出' | '入' }> = []
  for (const e of graphData.edges) {
    if (e.kind !== 'relation') continue
    if (e.source === node.id) {
      const o = byId.get(e.target)
      if (o) rows.push({ other: o.name, otherId: o.id, family: e.family, raw: e.rawType, dir: '出' })
    } else if (e.target === node.id) {
      const o = byId.get(e.source)
      if (o) rows.push({ other: o.name, otherId: o.id, family: e.family, raw: e.rawType, dir: '入' })
    }
  }
  return rows.slice(0, 18)
})

/** 聚焦节点的连边数（含入向与出向） */
const focusLinkCount = computed(() => {
  const node = focused.value
  if (!node) return 0
  return graphData.edges.filter(
    e => e.kind === 'relation' && (e.source === node.id || e.target === node.id)
  ).length
})

/** 侧栏摘要：打字机流式呈现（与全站语言一致） */
const { displayedText, isTyping, start: startTypewriter, skip: skipTypewriter } = useTypewriter({
  baseSpeed: 22,
  commaDelay: 55,
  periodDelay: 110
})
watch(
  () => focused.value?.id,
  () => {
    const s = focused.value?.entry?.summary ?? ''
    if (s) startTypewriter(s)
  }
)
const focusSummary = computed(() => displayedText.value)

const stat = computed(() => {
  const entries = graphData.nodes.filter(n => n.kind === 'entry')
  const relations = graphData.edges.filter(e => e.kind === 'relation')
  return { entries: entries.length, relations: relations.length }
})

const typeLabel = (t: string) =>
  t === 'emperor' ? '帝王篇' : t === 'figure' ? '人物篇' : t === 'event' ? '重大事件' : t === 'classic' ? '传世典籍' : t === 'system' ? '典章制度' : t

const familyLine = (f: RelationFamily) => RELATION_FAMILY_META[f]?.line ?? 'solid'

function onFocus(node: GraphNode | null) {
  focused.value = node
  // 寻脉待终点模式：点击即作为终点连线
  if (routeMode.value === 'pick-destination' && node && routeFrom.value && node.id !== routeFrom.value) {
    finishRoute(node.id)
  }
}
function onHover(node: GraphNode | null) {
  hovered.value = node
}

/* ── 寻脉操作 ── */
function startRouteFrom(id: string) {
  routeMode.value = 'pick-destination'
  routeFrom.value = id
  routePath.value = null
  star.value?.setPath(null)
}
function startDemoRoute(demo: { from: string; to: string }) {
  routeFrom.value = demo.from
  routeMode.value = 'pick-destination'
  finishRoute(demo.to)
}
function finishRoute(toId: string) {
  if (!routeFrom.value) return
  const steps = findPath(routeFrom.value, toId)
  routePath.value = steps
  star.value?.setPath(steps)
  routeMode.value = 'idle'
  // 聚焦终点，侧栏同步
  star.value?.focusNodeById(toId)
}
function cancelRoute() {
  routeMode.value = 'idle'
  routeFrom.value = null
  routePath.value = null
  star.value?.setPath(null)
}
function closeFocus() {
  focused.value = null
  if (routeMode.value !== 'idle') cancelRoute()
}
/** 星图聚焦事件 → 同步高亮侧栏印章色 */
const focusedTheme = computed(() => (focused.value ? getDynastyTheme(focused.value.dynastyId) : null))

/** 寻脉起点的显示名 */
const routeFromName = computed(() => graphData.nodes.find(n => n.id === routeFrom.value)?.name ?? '')

/* ── 因果流变（P2 · Connected Papers 前因/后果范式）：按方向拆因果族边 ── */
const causalFlows = computed(() => {
  const node = focused.value
  if (!node || node.kind !== 'entry') return null
  const byId = new Map(graphData.nodes.map(n => [n.id, n]))
  const incoming: Array<{ id: string; name: string; raw: string }> = []
  const outgoing: Array<{ id: string; name: string; raw: string }> = []
  for (const e of graphData.edges) {
    if (e.kind !== 'relation' || e.family !== 'causal') continue
    if (e.target === node.id) {
      const o = byId.get(e.source)
      if (o) incoming.push({ id: o.id, name: o.name, raw: e.rawType })
    } else if (e.source === node.id) {
      const o = byId.get(e.target)
      if (o) outgoing.push({ id: o.id, name: o.name, raw: e.rawType })
    }
  }
  if (!incoming.length && !outgoing.length) return null
  return {
    incoming: incoming.slice(0, 4),
    outgoing: outgoing.slice(0, 4),
    inCount: incoming.length,
    outCount: outgoing.length
  }
})

function onStarReady() {
  starReady.value = true
}

/* ── 导览故事线（P2）：预置分镜自动巡游 ── */
const tour = ref<{ story: GraphStory; step: number } | null>(null)
let tourTimer = 0
const TOUR_STEP_MS = 4600

function startTour(story: GraphStory) {
  cancelRoute()
  focused.value = null
  tour.value = { story, step: 0 }
  playTourStep()
}
function playTourStep() {
  const t = tour.value
  if (!t) return
  const step = t.story.steps[t.step]
  star.value?.flyToNode(step.id)
  window.clearTimeout(tourTimer)
  tourTimer = window.setTimeout(() => {
    if (!tour.value) return
    if (t.step + 1 >= t.story.steps.length) {
      endTour()
      return
    }
    tour.value.step++
    playTourStep()
  }, TOUR_STEP_MS)
}
function endTour() {
  window.clearTimeout(tourTimer)
  tour.value = null
  star.value?.clearFocus()
  star.value?.restoreView()
}
onBeforeUnmount(() => window.clearTimeout(tourTimer))

/* ── 键盘：Esc 退出导览/寻脉/聚焦 ── */
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (tour.value) {
    endTour()
    return
  }
  if (routeMode.value !== 'idle') cancelRoute()
  else if (focused.value) {
    focused.value = null
    star.value?.clearFocus()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between">
    <div>
      <TextbookHeader folio="071" subChapter="万卷星图 · 全站关系网络" />

      <main class="max-w-[1500px] mx-auto px-6 py-8">
        <!-- 页头 -->
        <div v-reveal class="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
          <div class="space-y-3">
            <div class="eyebrow">星野分野 · 关系总览</div>
            <h1 class="display-title">万卷星图</h1>
            <p class="text-[15px] font-serif text-muted-foreground max-w-2xl leading-relaxed">
              五朝为定盘之星，词条作漫天星野——{{ stat.entries }} 颗星辰、{{ stat.relations }} 缕星光。拖拽环视，点击星辰聚焦，一眼看清人物与事件的千古因缘。
            </p>
          </div>
          <div class="flex items-center gap-5 shrink-0">
            <div class="text-right space-y-1.5">
              <div class="spec-number">{{ stat.entries }}</div>
              <div class="spec-label">词条星辰</div>
            </div>
            <div class="text-right space-y-1.5">
              <div class="spec-number">{{ stat.relations }}</div>
              <div class="spec-label">关系星光</div>
            </div>
            <SealStamp text="星图" class="seal-drop hidden sm:block" />
          </div>
        </div>

        <!-- 工具条：寻脉演示对 + 视图预设 + 导览 -->
        <div v-reveal class="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span class="eyebrow is-plain shrink-0">寻脉试例</span>
            <button
              v-for="demo in PATH_DEMOS"
              :key="demo.label"
              type="button"
              class="px-3 py-1 text-[13px] tracking-[0.14em] border-b border-transparent font-serif transition-colors cursor-pointer"
              :class="routeFrom === demo.from && routePath ? 'text-[var(--dynasty-accent)] border-[var(--dynasty-accent)]' : 'text-muted-foreground hover:text-[var(--dynasty-accent)]'"
              @click="startDemoRoute(demo)"
            >
              {{ demo.label }}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span class="eyebrow is-plain shrink-0">导览</span>
            <button
              v-for="story in GRAPH_STORIES"
              :key="story.id"
              type="button"
              class="px-3 py-1 text-[13px] tracking-[0.14em] border-b border-transparent font-serif transition-colors cursor-pointer"
              :class="tour?.story.id === story.id ? 'text-[var(--dynasty-accent)] border-[var(--dynasty-accent)]' : 'text-muted-foreground hover:text-[var(--dynasty-accent)]'"
              @click="tour?.story.id === story.id ? endTour() : startTour(story)"
            >
              {{ story.title }}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 md:ml-auto">
            <span class="eyebrow is-plain shrink-0">视图</span>
            <button
              v-for="v in GRAPH_VIEWS"
              :key="v.id"
              type="button"
              :title="v.note"
              class="px-3 py-1 text-[13px] tracking-[0.14em] border-b border-transparent font-serif transition-colors cursor-pointer"
              :class="activeView === v.id ? 'text-[var(--dynasty-accent)] border-[var(--dynasty-accent)]' : 'text-muted-foreground hover:text-foreground'"
              @click="activeView = v.id"
            >
              {{ v.label }}
            </button>
          </div>
        </div>

        <!-- 星图画布 -->
        <div
          class="relative w-full overflow-hidden border border-border/70 bg-background/40"
          :style="{ height: 'clamp(620px, 78vh, 920px)' }"
        >
          <template v-if="show3d">
            <StarGraph ref="starRef" @focus="onFocus" @hover="onHover" @fallback="show3d = false" @ready="onStarReady" />
            <!-- 导览浮签（画布顶部中央，优先于寻脉提示） -->
            <Transition name="guide-fade">
              <div
                v-if="tour"
                class="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-5 py-2 bg-card/95 border border-border/80 text-[13px] font-serif flex items-center gap-4 max-w-[92%]"
              >
                <span class="dynasty-accent-text font-bold shrink-0">导览 · {{ tour.story.title }}</span>
                <span class="text-muted-foreground truncate">{{ tour.story.steps[tour.step].note }}</span>
                <span class="index-meta shrink-0">{{ tour.step + 1 }} / {{ tour.story.steps.length }}</span>
                <button type="button" class="text-muted-foreground hover:text-foreground cursor-pointer shrink-0" @click="endTour">跳过</button>
              </div>
            </Transition>

            <!-- 寻脉状态浮签（画布顶部中央） -->
            <Transition name="guide-fade">
              <div
                v-if="routeMode === 'pick-destination'"
                class="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 bg-card/95 border border-border/80 text-[13px] font-serif text-foreground flex items-center gap-3"
              >
                <span class="dynasty-accent-text font-bold">寻脉</span>
                <span>自「{{ routeFromName }}」出发 · 请点击终点星辰</span>
                <button type="button" class="text-muted-foreground hover:text-foreground cursor-pointer" @click="cancelRoute">取消</button>
              </div>
            </Transition>

            <!-- 操作提示（底部细条） -->
            <div class="absolute bottom-0 inset-x-0 px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted-foreground bg-gradient-to-t from-[color:var(--paper-base)] to-transparent pointer-events-none">
              <span>拖动环视</span>
              <span>滚轮推近</span>
              <span>点击星辰聚焦</span>
              <span>空白处取消</span>
            </div>

            <!-- 悬停题名（左上角即时反馈） -->
            <Transition name="fade-swap">
              <div
                v-if="hovered && (!focused || hovered.id !== focused.id)"
                class="absolute top-3 left-3 px-3 py-1.5 bg-card/90 border border-border/70 text-[13px] font-serif pointer-events-none"
              >
                {{ hovered.name }}
                <span class="text-muted-foreground/80 ml-2">{{ hovered.dynasty }}</span>
              </div>
            </Transition>

            <!-- 聚焦侧栏 -->
            <Transition name="guide-fade">
              <aside
                v-if="focused"
                class="absolute top-0 right-0 h-full w-full sm:w-[340px] bg-card/95 backdrop-blur-sm border-l border-border/70 overflow-y-auto"
              >
                <div class="p-5 space-y-5">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span
                        class="w-2.5 h-2.5 shrink-0"
                        :style="{ backgroundColor: focusedTheme?.accent }"
                      ></span>
                      <span class="index-meta truncate">{{ focused.dynasty }}{{ focused.entry?.era ? ' · ' + focused.entry.era : '' }}</span>
                    </div>
                    <button
                      type="button"
                      class="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                      aria-label="收起侧栏"
                      @click="closeFocus"
                    >
                      <X class="w-4 h-4" />
                    </button>
                  </div>

                  <div class="space-y-2">
                    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                      <h2 class="display-heading !text-[1.6rem]">{{ focused.name }}</h2>
                      <span class="index-meta">{{ typeLabel(focused.type) }}</span>
                    </div>
                    <p class="text-[13px] font-serif text-muted-foreground">星度 {{ focused.degree }} 途 · {{ focusLinkCount }} 缕星光相连</p>
                  </div>

                  <p v-if="focusSummary" class="text-[13px] font-serif text-foreground/85 leading-relaxed min-h-[4.5em]">
                    {{ focusSummary }}<span v-if="isTyping" class="ink-cursor"></span>
                  </p>
                  <div v-if="isTyping" class="-mt-3">
                    <button type="button" class="text-[12px] underline text-muted-foreground hover:text-foreground cursor-pointer" @click="skipTypewriter(focused.entry?.summary ?? '')">跳过动画</button>
                  </div>

                  <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <RouterLink
                      v-if="focused.kind === 'entry'"
                      :to="`/entry/${focused.id}`"
                      class="inline-flex items-center gap-1.5 text-[13px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 transition-opacity"
                    >
                      <span>进入词条全文</span>
                      <ArrowRight class="w-3.5 h-3.5" />
                    </RouterLink>
                    <button
                      v-if="focused.kind === 'entry' && focused.id !== routeFrom"
                      type="button"
                      class="inline-flex items-center gap-1.5 text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors cursor-pointer"
                      @click="startRouteFrom(focused.id)"
                    >
                      <RouteIcon class="w-3.5 h-3.5" />
                      <span>自此星寻脉</span>
                    </button>
                  </div>

                  <!-- 因果流变（承前 / 启后） -->
                  <template v-if="causalFlows">
                    <div class="rule"></div>
                    <div>
                      <div class="eyebrow mb-2.5">因果流变 · 时序之链</div>
                      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] font-serif">
                        <div>
                          <div class="index-meta mb-1.5">承前 <span class="text-muted-foreground/60">{{ causalFlows.inCount }}</span></div>
                          <ul class="space-y-1.5">
                            <li v-for="(c, i) in causalFlows.incoming" :key="'in' + i">
                              <RouterLink :to="`/entry/${c.id}`" class="text-foreground/85 hover:text-[var(--dynasty-accent)] transition-colors">{{ c.name }}</RouterLink>
                              <span class="text-muted-foreground/60 block text-[12px]">{{ c.raw }}</span>
                            </li>
                            <li v-if="!causalFlows.incoming.length" class="text-muted-foreground/50">—</li>
                          </ul>
                        </div>
                        <div>
                          <div class="index-meta mb-1.5">启后 <span class="text-muted-foreground/60">{{ causalFlows.outCount }}</span></div>
                          <ul class="space-y-1.5">
                            <li v-for="(c, i) in causalFlows.outgoing" :key="'out' + i">
                              <RouterLink :to="`/entry/${c.id}`" class="text-foreground/85 hover:text-[var(--dynasty-accent)] transition-colors">{{ c.name }}</RouterLink>
                              <span class="text-muted-foreground/60 block text-[12px]">{{ c.raw }}</span>
                            </li>
                            <li v-if="!causalFlows.outgoing.length" class="text-muted-foreground/50">—</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </template>

                  <template v-if="focusRelations.length">
                    <div class="rule"></div>
                    <div>
                      <div class="eyebrow mb-2.5">关联谱系 · 星光所至</div>
                      <ul class="space-y-2">
                        <li
                          v-for="(r, i) in focusRelations"
                          :key="i"
                          class="flex items-center gap-2 text-[13px] font-serif leading-snug"
                        >
                          <span
                            class="w-4 shrink-0 border-t"
                            :style="{
                              borderColor: focusedTheme?.accent,
                              borderTopStyle: familyLine(r.family) === 'dashed' ? 'dashed' : familyLine(r.family) === 'dotted' ? 'dotted' : 'solid',
                              opacity: 0.8
                            }"
                          ></span>
                          <RouterLink :to="`/entry/${r.otherId}`" class="text-foreground/90 hover:text-[var(--dynasty-accent)] transition-colors shrink-0">
                            {{ r.other }}
                          </RouterLink>
                          <span class="text-muted-foreground/80 truncate">{{ r.raw }}<template v-if="r.dir === '入'"> ←</template></span>
                        </li>
                      </ul>
                    </div>
                  </template>
                </div>
              </aside>
            </Transition>
          </template>

          <!-- 2D 降级版（窄屏 / WebGL 不可用）：共享同一布局的简化星图 -->
          <Graph2D
            v-else
            ref="graph2dRef"
            @focus="onFocus"
            @ready="onStarReady"
          />
        </div>

        <!-- 寻脉卷：BFS 最短关系链（像一页从星图上拓下的笺） -->
        <Transition name="fade-swap">
          <div v-if="routePath" class="mt-4">
            <div class="rule"></div>
            <div class="py-5 flex flex-col lg:flex-row lg:items-baseline gap-3 lg:gap-6">
              <span class="eyebrow shrink-0">寻脉卷 · {{ routePath.length }} 步可达</span>
              <div class="flex-1 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] font-serif">
                <template v-for="(s, i) in routePath" :key="i">
                  <RouterLink
                    v-if="i === 0"
                    :to="`/entry/${s.fromId}`"
                    class="text-foreground hover:text-[var(--dynasty-accent)] transition-colors"
                  >{{ s.fromName }}</RouterLink>
                  <span class="text-muted-foreground/70">—[{{ s.rawType }}]→</span>
                  <RouterLink :to="`/entry/${s.toId}`" class="text-foreground hover:text-[var(--dynasty-accent)] transition-colors">{{ s.toName }}</RouterLink>
                </template>
              </div>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-[13px] font-serif text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                @click="cancelRoute"
              >
                <Undo2 class="w-3.5 h-3.5" />
                <span>收束此卷</span>
              </button>
            </div>
            <div class="rule"></div>
          </div>
        </Transition>

        <!-- 图例与说明 -->
        <div v-reveal class="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div>
            <div class="eyebrow mb-3.5">光谱图例 · 关系十族</div>
            <ul class="grid grid-cols-2 gap-x-6 gap-y-2.5">
              <li v-for="f in RELATION_FAMILIES" :key="f.id" class="flex items-center gap-2.5 text-[13px] font-serif">
                <span
                  class="w-6 shrink-0 border-t-2"
                  :style="{ borderColor: 'var(--ink-soft)', borderTopStyle: f.line === 'dashed' ? 'dashed' : f.line === 'dotted' ? 'dotted' : 'solid' }"
                ></span>
                <span class="text-foreground/90">{{ f.label }}</span>
              </li>
            </ul>
          </div>
          <div>
            <div class="eyebrow mb-3.5">星体图例 · 五种形态</div>
            <ul class="space-y-2.5 text-[13px] font-serif">
              <li class="flex items-center gap-3"><span class="w-2.5 h-2.5 rounded-full bg-[var(--ink-soft)]"></span>人物 · 圆</li>
              <li class="flex items-center gap-3"><span class="w-2.5 h-2.5 bg-[var(--ink-soft)]"></span>帝王 · 方</li>
              <li class="flex items-center gap-3"><span class="w-2.5 h-2.5 bg-[var(--ink-soft)] rotate-45"></span>事件 · 菱形</li>
              <li class="flex items-center gap-3"><span class="w-2.5 h-2.5 bg-[var(--ink-soft)]" style="clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)"></span>典籍 / 制度 · 六边形</li>
            </ul>
          </div>
          <div>
            <div class="eyebrow mb-3.5">观星须知</div>
            <p class="text-[13px] font-serif text-muted-foreground leading-relaxed">
              星体大小取自词条在史事中的关联广度；星体分布以编年骨架为底，兼有星群自然团簇。五朝锚点已按年代排开，跨朝代连线即为古今之回响——明清鼎革、汉唐并峙，皆可循迹。
            </p>
          </div>
        </div>
      </main>
    </div>

    <Masthead left="寻迹 · 万卷星图" note="星野分野 · 关系总览" folio="072" />
  </div>
</template>
