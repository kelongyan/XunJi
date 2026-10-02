<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { ArrowLeft, ArrowRight } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import { allHistoryEntries, getEntryById as getCatalogEntryById, getIncomingRelatedEntries } from '../data'
import { getEntryById } from '../data/details'
import { dynastyIdFromHanzi, defaultDynasty } from '../data/dynastyThemes'
import { useTypewriter } from '../composables/useTypewriter'
import { useFootprint } from '../composables/useFootprint'
import { playStampSound } from '../composables/useSound'
import { downloadExLibris } from '../data/exlibris'
import { createChatStream, userWithImage, llmEnabled, REPLAY_MODE, MODEL_VISION, MODEL_FAST } from '../services/llm'
import { interpretPrompt, commentPrompt, relicPrompt } from '../services/prompts'
import InkOut from '../components/common/InkOut.vue'
import AnnotateText from '../components/common/AnnotateText.vue'
import type { HistoryEntry, HistoryEntryCatalog } from '../types/history'

const VoyageMap = defineAsyncComponent(() => import('../components/three/VoyageMap.vue'))
const RelicViewer = defineAsyncComponent(() => import('../components/three/RelicViewer.vue'))

/* 针路图挂载表：词条 id → 航线图数据（voyages.ts）；新图加一行即可 */
const VOYAGE_MOUNT: Record<string, { chartId: string; title: string }> = {
  'zhenghe-xiaxiyang': { chartId: 'zhenghe', title: '郑和七下西洋航路摹本' },
  xuanzang: { chartId: 'xuanzang', title: '玄奘西行取经之路摹本' },
  'xuanzang-xixing-qufa': { chartId: 'xuanzang', title: '玄奘西行取经之路摹本' }
}
const voyage = computed(() => VOYAGE_MOUNT[entry.value.id] ?? null)

const route = useRoute()
const entryId = computed(() => (route.params.id as string) || 'zhang-juzheng')
const entry = computed(() => getEntryById(entryId.value)!)

/* 足迹：到访即留痕 */
const { record, toggleCollect, isCollected } = useFootprint()
watch(
  () => entry.value.id,
  id => record(id),
  { immediate: true }
)

const collected = computed(() => isCollected(entry.value.id))
/** 钤印压印动效开关（点击入藏时重播） */
const stampPress = ref(false)
let stampTimer = 0
function onToggleCollect() {
  const now = toggleCollect(entry.value.id)
  if (now) {
    playStampSound()
    // 重播"压印 + 墨渗涟漪"（先复位再触发，保证连续点击都能播放）
    stampPress.value = false
    requestAnimationFrame(() => {
      stampPress.value = true
      window.clearTimeout(stampTimer)
      stampTimer = window.setTimeout(() => (stampPress.value = false), 750)
    })
  }
}
onBeforeUnmount(() => window.clearTimeout(stampTimer))

/** 拓藏书票：Canvas 合成并下载（exlibris.ts） */
function onExlibris() {
  downloadExLibris(entry.value)
}

/** 读此卷者亦读：关系直连 + 标签重叠 + 同朝代加权 */
const related = computed(() => {
  const self = entry.value
  const selfTags = new Set(self.tags)
  const direct = new Set((self.relations ?? []).map(r => r.targetId))
  const candidates = new Map<string, HistoryEntry | HistoryEntryCatalog>()
  for (const relatedId of getIncomingRelatedEntries(self.id)) {
    const related = getCatalogEntryById(relatedId)
    if (related) candidates.set(related.id, related)
  }
  for (const targetId of direct) {
    const related = getCatalogEntryById(targetId)
    if (related) candidates.set(related.id, related)
  }
  for (const related of allHistoryEntries) {
    if (related.id !== self.id && related.tags.some(tag => selfTags.has(tag))) candidates.set(related.id, related)
  }
  return [...candidates.values()]
    .filter(e => e.id !== self.id)
    .map(e => {
      let score = (e.relations ?? []).some(r => r.targetId === self.id) || direct.has(e.id) ? 3 : 0
      score += e.tags.filter(t => selfTags.has(t)).length * 2
      if (e.dynasty === self.dynasty) score += 1
      return { entry: e, score }
    })
    .filter(x => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.entry)
})

function typeSeal(type: string): string {
  return type === 'emperor' ? '帝' : type === 'figure' ? '人' : type === 'event' ? '事' : type === 'classic' ? '典' : '制'
}

/* 一朝一色：进入词条即染上该朝代的颜色 */
watch(
  () => entry.value.dynasty,
  d => {
    document.documentElement.dataset.dynasty = dynastyIdFromHanzi(d)
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  document.documentElement.dataset.dynasty = defaultDynasty.id
})

const { displayedText, isTyping, start: startInterp, skip: skipInterp, stop: stopInterp } = useTypewriter({
  baseSpeed: 30,
  commaDelay: 75,
  periodDelay: 150
})

/* ── B1 真·流式史学纵横：活生成优先，静态兜底 ──
 * 状态机：static（静态回放）| live（AI 流式）| inkout（墨尽回退）
 * 失败/断网/未配 key 时无缝回退静态 interpretation——页面永远有字。 */
type InterpMode = 'static' | 'live' | 'inkout'
const interpMode = ref<InterpMode>('static')
const interpSource = ref<'static' | 'ai' | 'replay'>('static')
let liveBuffer = ''
let liveAbort: AbortController | null = null
let commentAbort: AbortController | null = null
let entryMounted = false

function resetInterpretation() {
  liveAbort?.abort()
  liveAbort = null
  stopInterp()
  liveBuffer = ''
  displayedText.value = ''
  isTypingManual.value = false
  interpMode.value = 'static'
  interpSource.value = 'static'
}

/** 静态回放（fallback 与 reduced-motion 路径） */
function runStatic() {
  interpMode.value = 'static'
  interpSource.value = 'static'
  if (entry.value?.interpretation) startInterp(entry.value.interpretation)
}

async function runLive() {
  if (!llmEnabled() || !entry.value) {
    runStatic()
    return
  }
  // 有静态稿可兜底；live 失败时切回
  if (!entry.value.interpretation) {
    runStatic()
    return
  }
  interpMode.value = 'live'
  interpSource.value = REPLAY_MODE ? 'replay' : 'ai'
  liveBuffer = ''
  displayedText.value = ''
  startInterp('') // 清打字机状态（占位空串，isTyping 会被 AI 流接管）
  stopInterp()
  isTypingManual.value = true
  liveAbort = new AbortController()
  try {
    await createChatStream(
      interpretPrompt({
        name: entry.value.name,
        dynasty: entry.value.dynasty,
        summary: entry.value.summary ?? '',
        background: entry.value.background ?? '',
        sources: entry.value.sources ?? []
      }),
      delta => {
        liveBuffer += delta
        displayedText.value = liveBuffer
      },
      {
        signal: liveAbort.signal,
        // 预算须覆盖思考链 + 正文（推理模型的 reasoning:false 只减不消，个别词条
        // 思考链会超长——实测郑和条约 2000 被烧穿，留足 4000）
        maxTokens: 4000,
        // 演示回放（VITE_LLM_REPLAY=1）：以词条自带的深度解读逐字回放，
        // 与真流式 UI 同观感，零网络依赖（录制 / 断网演示兜底）
        replayText: entry.value.interpretation
      }
    )
    isTypingManual.value = false
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    // 墨尽：无缝回退静态稿
    runStatic()
  }
}

/** 活流式时手控光标（打字机 isTyping 不适用） */
const isTypingManual = ref(false)
const interpTyping = computed(() => (interpMode.value === 'live' ? isTypingManual.value : isTyping.value))

function runFlow() {
  // reduced-motion：直落静态完整呈现，不出 AI（尊重系统动效偏好）
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    runStatic()
    if (entry.value?.interpretation) skipInterp(entry.value.interpretation)
    return
  }
  runLive()
}

function handleSkip() {
  if (interpMode.value === 'live') {
    // 活流式跳过：中止流，保留已到字句（若有静态稿则补全）
    liveAbort?.abort()
    isTypingManual.value = false
    displayedText.value = liveBuffer || entry.value?.interpretation || ''
  } else if (entry.value?.interpretation) {
    skipInterp(entry.value.interpretation)
  }
}

/** 重试活生成（墨尽后） */
function retryLive() {
  if (llmEnabled()) runLive()
  else runStatic()
}

/* ── B4 AI 史官朱批：静态 comment 字段优先；无则按需活批（失败静默，不扰阅读） ── */
const aiComment = ref('')
const commentState = ref<'idle' | 'loading' | 'done' | 'inkout'>('idle')
const commentRequested = new Set<string>()

async function genComment() {
  const e = entry.value
  if (!e || e.comment || !llmEnabled()) return
  commentAbort?.abort()
  commentAbort = new AbortController()
  const requestEntryId = e.id
  commentState.value = 'loading'
  commentRequested.add(e.id)
  let buf = ''
  try {
    await createChatStream(
      commentPrompt({ name: e.name, dynasty: e.dynasty, summary: e.summary ?? '' }),
      d => {
        buf += d
        aiComment.value = buf
      },
      // 短文本走快速档（非推理模型，秒回；主力 reasoning 模型思考链会烧穿小预算——实测 §0.3）
      {
        model: MODEL_FAST,
        maxTokens: 400,
        signal: commentAbort.signal,
        // 演示回放：预录一条张居正批语（录制/断网兜底；真模型时忽略）
        replayText: entry.value.comment ?? '史臣曰：功冠一时，而祸发身后；威震九重，而名毁于酷。刚愎之失，惜哉。'
      }
    )
    if (entry.value.id !== requestEntryId) return
    commentState.value = 'done'
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    if (entry.value.id !== requestEntryId) return
    aiComment.value = ''
    commentState.value = 'inkout'
  }
}

/* ── B5 考据对影：状态声明（须先于 immediate watch，防 TDZ） ── */
const plateImgRef = ref<HTMLImageElement | null>(null)
const relicStudy = ref<{ state: 'idle' | 'loading' | 'done' | 'inkout'; text: string; loading: boolean }>({
  state: 'idle',
  text: '',
  loading: false
})
let studyAbort: AbortController | null = null

function resetStudy() {
  studyAbort?.abort()
  relicStudy.value = { state: 'idle', text: '', loading: false }
}

// 词条切换：静态批语存在则清 AI 态；无静态批语且服务可用则懒生成（每词条只请求一次）
watch(
  () => entry.value.id,
  () => {
    resetInterpretation()
    commentAbort?.abort()
    resetStudy()
    aiComment.value = ''
    commentState.value = 'idle'
    if (entry.value.comment) {
    } else if (llmEnabled() && !commentRequested.has(entry.value.id)) {
      commentRequested.add(entry.value.id)
      aiComment.value = ''
      genComment()
    }
    if (entryMounted) runFlow()
  },
  { immediate: true }
)

async function studyPlate() {
  const e = entry.value
  const img = plateImgRef.value
  if (!e?.image || !img || !llmEnabled()) return
  relicStudy.value = { state: 'loading', text: '', loading: true }
  studyAbort = new AbortController()
  try {
    // 本地图转 base64：先 canvas 栅格化；失败则 fetch blob 转 dataURL。
    // 禁止直接把本地 URL 发给公网 API（会 400 "port not allowed"——已实测踩坑）。
    let dataUrl = ''
    try {
      const canvas = document.createElement('canvas')
      const w = 512
      const ratio = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1
      canvas.width = w
      canvas.height = Math.round(w * ratio) || 384
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      dataUrl = canvas.toDataURL('image/png')
      if (dataUrl.length < 2000) throw new Error('empty raster') // SVG 未渲染兜底
    } catch {
      const blob = await (await fetch(e.image.src, { signal: studyAbort.signal })).blob()
      dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(fr.result as string)
        fr.onerror = reject
        fr.readAsDataURL(blob)
      })
    }
    await createChatStream(
      [userWithImage(relicStudyInstruction(e), dataUrl)],
      d => {
        relicStudy.value.text += d
      },
      // 图版必须走 vision 模型（主力模型不支持图像——"未获入目"实测踩坑）。
      // intern-s2 视觉稳（kimi-k2.6 思考链烧穿任何预算，弃用）；
      // 但其推理链较长（实测 ~600-1400 tokens），预算须 ≥2500，耗时约 60-90s
      {
        model: MODEL_VISION,
        maxTokens: 2600,
        signal: studyAbort.signal,
        // 演示回放：预录一段考据（录制/断网兜底；真模型时忽略）
        replayText:
          '所给惟画像一帧。其人朱袍玉带，冠展脚幞头，胸缀仙鹤云纹，执简而立，背衬殿阁松峦。按旧制，仙鹤为文官一品补子；然幞头展脚之式，近于宋制。此或后世追绘前贤之图，未可知也。\n\n然站内所止此丹青，不见姓名、爵里、行状、出处。无征不信，阙疑为上。其人谁氏、历官何如、功过安在，卷中未载，不敢妄拟。\n\n史臣曰：丹青可传衣冠之神，而不可考信。史官之法，必待简书；徒见云鹤补子、朱衣执简，不足以立传。宁阙毋滥，其此之谓。'
      }
    )
    relicStudy.value.state = 'done'
    relicStudy.value.loading = false
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    relicStudy.value.state = 'inkout'
    relicStudy.value.loading = false
  }
}

function relicStudyInstruction(e: NonNullable<typeof entry.value>): string {
  return relicPrompt({ name: e.name, caption: e.image?.caption ?? '' })[0].content as string
}

onMounted(() => {
  entryMounted = true
  runFlow()
})

/* ── 阅读书签线：滚动进度 + 回卷首 ── */
const readProgress = ref(0)
const showBackTop = computed(() => readProgress.value > 0.7)
let readRaf = 0

function updateReadProgress() {
  readRaf = 0
  const doc = document.documentElement
  const total = doc.scrollHeight - window.innerHeight
  readProgress.value = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0
}

function onReadScroll() {
  if (!readRaf) readRaf = requestAnimationFrame(updateReadProgress)
}

function backToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', onReadScroll, { passive: true })
  window.addEventListener('resize', onReadScroll, { passive: true })
  updateReadProgress()
})
onBeforeUnmount(() => {
  liveAbort?.abort()
  commentAbort?.abort()
  studyAbort?.abort()
  window.removeEventListener('scroll', onReadScroll)
  window.removeEventListener('resize', onReadScroll)
  if (readRaf) cancelAnimationFrame(readRaf)
})
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between" style="overflow-x: clip">
    <div>
      <TextbookHeader folio="116" :subChapter="`${entry.dynasty}代 · ${entry.name}词条详述`" />

      <main class="max-w-7xl mx-auto px-6 py-12">
        <!-- 阅读书签线（右侧固定：墨线随滚动填充，朱头随行，滚过七成浮出回卷首） -->
        <aside class="hidden xl:flex fixed right-8 top-1/2 -translate-y-1/2 z-30 flex-col items-center gap-3" aria-hidden="true">
          <span class="text-[12px] font-serif text-muted-foreground/60 tracking-[0.3em]" style="writing-mode: vertical-rl">卷</span>
          <div class="relative w-px h-44 bg-border/60">
            <div
              class="absolute top-0 left-0 w-px bg-[var(--dynasty-accent)] transition-[height] duration-150 ease-out"
              :style="{ height: `${readProgress * 100}%` }"
            ></div>
            <div
              class="absolute -left-[3.5px] w-2 h-2 rounded-full bg-[var(--dynasty-accent)] transition-[top] duration-150 ease-out"
              :style="{ top: `calc(${readProgress * 100}% - 4px)` }"
            ></div>
          </div>
          <button
            type="button"
            class="text-[12px] font-serif text-[var(--dynasty-accent)] hover:opacity-75 transition-opacity duration-300 cursor-pointer tracking-[0.24em]"
            style="writing-mode: vertical-rl"
            :class="showBackTop ? 'opacity-100' : 'opacity-0 pointer-events-none'"
            title="回到卷首"
            @click="backToTop"
          >
            回卷首
          </button>
        </aside>

        <!-- 词条头信息：编目式刊头（去框，靠细线与留白组织层级）；开卷逐层写就 -->
        <div class="mb-14">
          <div v-reveal class="flex items-baseline justify-between gap-4 pb-4 border-b border-border/60">
            <span class="eyebrow">{{ entry.dynasty }}代 · {{ entry.name }}</span>
            <span class="index-meta">{{ entry.sources[0] }}</span>
          </div>

          <div class="flex items-start justify-between gap-8 mt-8">
            <div class="space-y-5 flex-1 min-w-0">
              <div v-reveal="80" class="flex flex-wrap items-center gap-2.5 text-[13px] font-serif text-muted-foreground">
                <span class="dynasty-chip px-2.5 py-0.5 tracking-wider">
                  {{ entry.type === 'emperor' ? '帝王篇' : entry.type === 'figure' ? '人物篇' : entry.type === 'event' ? '重大事件' : '典章制度' }}
                </span>
                <span class="index-meta">正史核心词条</span>
              </div>

              <div v-reveal="160">
                <div class="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                  <h1 class="display-title">{{ entry.name }}</h1>
                  <span class="index-meta">{{ entry.pinyin }}</span>
                  <span v-if="entry.lifespan" class="index-meta">
                    公元 {{ entry.lifespan.birth }} — {{ entry.lifespan.death }} 年
                  </span>
                </div>
                <p v-if="entry.roles?.length" class="index-meta mt-3">
                  {{ entry.roles.join(' · ') }}
                </p>
              </div>

              <p v-reveal="240" class="text-[15px] md:text-[15px] font-serif text-foreground/85 max-w-2xl leading-relaxed">
                <AnnotateText :text="entry.summary" />
              </p>

              <div v-reveal="320" class="pt-1 flex flex-wrap items-center gap-x-5 gap-y-3">
                <button
                  type="button"
                  class="collect-btn stamp-ripple"
                  :class="[collected ? 'is-collected' : '', stampPress ? 'stamp-pressing' : '']"
                  :title="collected ? '从藏书阁取出' : '钤一枚私人藏书印，收入藏书阁'"
                  @click="onToggleCollect"
                >
                  <SealStamp :text="collected ? '已藏' : '钤印'" class="seal-stamp-sm !opacity-100" />
                  <span>{{ collected ? '已入藏书阁 · 点击取出' : '钤印收藏 · 入藏书阁' }}</span>
                </button>
                <button
                  v-if="collected"
                  type="button"
                  class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  title="生成一张可下载分享的藏书票"
                  @click="onExlibris"
                >
                  <span class="seal-stamp text-[12px] py-0.5 px-1">票</span>
                  <span>拓一枚藏书票</span>
                </button>
              </div>

              <div
                v-if="entry.background"
                v-reveal="400"
                class="mt-5 pl-5 border-l-2"
                :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 45%, transparent)' }"
              >
                <div class="eyebrow mb-2">时代大背景</div>
                <p class="text-[13px] md:text-[15px] font-serif text-muted-foreground leading-relaxed">
                  <AnnotateText :text="entry.background" />
                </p>
              </div>
            </div>

            <SealStamp :text="entry.type === 'emperor' ? '大明天子' : entry.type === 'figure' ? '正史名贤' : '制度典章'" subtext="钦定正史" class="seal-drop hidden sm:block shrink-0" />
          </div>
        </div>

        <!-- 针路图（词条专属 3D 航路长卷，窄屏隐藏；数据驱动，见 VOYAGE_MOUNT）。
             沉浸式（2026-10-01 精修）：全视口宽破格 + 无框 + 四边羽化融入纸色，
             题签/钤印/注记浮于画面、与版心对齐。 -->
        <section v-if="voyage" v-reveal class="hidden md:block relative my-4 full-bleed">
           <VoyageMap :key="entry.id + '-' + voyage.chartId" :chart-id="voyage.chartId" />
          <div class="absolute inset-0 z-10 pointer-events-none select-none">
            <div class="relative h-full max-w-7xl mx-auto px-6">
              <!-- 题签（左上）：栏目 + 图名 -->
              <div class="absolute left-8 top-8">
                <div class="flex items-center gap-2.5">
                  <span class="w-1.5 h-1.5 bg-primary shrink-0"></span>
                  <span class="text-[13px] font-serif text-muted-foreground tracking-[0.18em]">针路图</span>
                </div>
                <div class="mt-1.5 text-lg md:text-xl font-serif text-foreground tracking-wide">{{ voyage.title }}</div>
              </div>
              <!-- 钤印（右上） -->
              <SealStamp text="针路" class="absolute right-8 top-8 opacity-90" />
              <!-- 注记（右下）：风格化声明 + 交互提示 -->
              <p class="absolute right-8 bottom-6 text-[12px] font-serif text-muted-foreground/70 text-right">
                航路为历史航线之风格化摹本，非精确地理投影<br />拖动环视 · 滚轮推近
              </p>
            </div>
          </div>
        </section>

        <!-- 桌面双栏：正文 (65%) + 侧栏知识链接与史料卡 (35%) -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-12">
          <!-- 左侧：正文排版（32-36字黄金栏宽） -->
          <div class="md:col-span-8 space-y-12 font-serif leading-relaxed text-foreground">
            <!-- 章节渲染 -->
            <section
              v-for="(chapter, cIdx) in entry.chapters"
              :key="cIdx"
              v-reveal
              class="textbook-reading-column space-y-4"
            >
              <div class="flex items-baseline justify-between gap-4 pb-3.5 mb-7 border-b border-border/60">
                <h2 class="text-xl md:text-2xl text-foreground" style="font-family: var(--font-serif)">{{ chapter.heading }}</h2>
                <span class="index-meta">第 {{ cIdx + 1 }} 节</span>
              </div>

              <div class="text-indent-chinese text-[15px] md:text-base text-foreground/90 font-textbook-body space-y-4">
                <p
                  v-for="(para, pIdx) in chapter.paragraphs"
                  :key="pIdx"
                  :class="cIdx === 0 && pIdx === 0 ? 'textbook-dropcap' : ''"
                >
                  <AnnotateText :text="para" />
                </p>
              </div>

              <!-- 若该词条配有历史插图，则在第一节后插入图版（笺谱套色装裱）+ B5 考据对影 -->
              <div v-if="cIdx === 0 && entry.image" v-reveal class="textbook-figure-box my-8 framed-plate bg-card/50 shadow-sm">
                <div class="text-[13px] font-serif text-muted-foreground border-b border-border/80 pb-2.5 mb-3 flex items-center justify-between">
                  <span class="font-bold text-foreground flex items-center space-x-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    <span>【图版】{{ entry.name }}相关典籍与图谱摹本</span>
                  </span>
                  <span class="seal-stamp text-[12px] py-0.5 px-1">图版</span>
                </div>
                <div class="bg-background border border-border/70 p-2 overflow-hidden flex justify-center">
                  <img ref="plateImgRef" :src="entry.image.src" :alt="entry.image.caption" class="w-full max-w-lg h-auto object-contain" crossorigin="anonymous" />
                </div>
                <p class="textbook-caption text-center">
                  {{ entry.image.caption }}
                </p>
                <!-- 考据对影：AI 史官看图鉴识（多模态） -->
                <div class="px-4 pb-3 pt-1">
                  <button
                    v-if="relicStudy.state !== 'done'"
                    type="button"
                    class="text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    :disabled="relicStudy.state === 'loading'"
                    @click="studyPlate"
                  >
                    <span class="seal-stamp text-[12px] py-0.5 px-1">考</span>
                    <span>{{ relicStudy.state === 'loading' ? '史官展卷细鉴……（约需一两分钟）' : '考据对影 · 请史官鉴识此图' }}</span>
                  </button>
                  <div v-if="relicStudy.state === 'done'" class="border-l-2 pl-4 mt-2" :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 40%, transparent)' }">
                    <div class="eyebrow mb-1.5">名物考据 · 翰墨生成</div>
                    <p class="text-[13px] md:text-[15px] font-serif text-muted-foreground leading-relaxed whitespace-pre-wrap">{{ relicStudy.text }}<span v-if="relicStudy.loading" class="ink-cursor"></span></p>
                    <button type="button" class="mt-2 text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer" @click="resetStudy">收起考据</button>
                  </div>
                  <div v-if="relicStudy.state === 'inkout'" class="mt-2">
                    <InkOut compact :retry="studyPlate" />
                  </div>
                </div>
              </div>
            </section>

            <!-- 史学纵横（流式解读核心区）：AI 活生成，静态稿兜底 -->
            <section v-reveal class="border-wenwu-primary p-7 md:p-9 bg-card/85 relative shadow-sm textbook-reading-column my-8">
              <div class="flex items-baseline justify-between gap-4 pb-3.5 mb-6 border-b border-border/60">
                <h3 class="text-xl text-foreground tracking-wide" style="font-family: var(--font-serif)">史学纵横 · 深度解读</h3>
                <span class="index-meta">
                  <template v-if="interpSource === 'ai'">翰墨生成 · 史官现书</template>
                  <template v-else-if="interpSource === 'replay'">翰墨生成 · 演示回放</template>
                  <template v-else>本卷预置 · 流式呈现</template>
                </span>
              </div>

              <InkOut v-if="interpMode === 'inkout'" compact :retry="retryLive" />

              <div v-else class="font-serif text-[15px] leading-loose text-foreground">
                <p class="text-indent-chinese font-textbook-body">
                  {{ displayedText }}
                  <span v-if="interpTyping" class="ink-cursor"></span>
                </p>
              </div>

              <div class="mt-6 pt-3.5 border-t border-border flex items-center justify-between text-[13px] font-serif text-muted-foreground">
                <span class="italic text-muted-foreground/90">
                  {{ interpSource === 'static' ? '—— 综合正史与断代专论' : '—— AI 史官据本卷史料现书 · 或有讹误，以正史为准' }}
                </span>
                <div class="flex items-center space-x-2">
                  <button v-if="interpTyping" @click="handleSkip" class="hover:text-primary underline cursor-pointer">
                    快速完成
                  </button>
                </div>
              </div>
            </section>
          </div>

          <!-- 右侧：侧栏朱批 + 器物展台 + 史料卡片 + 知识链接 -->
          <div class="md:col-span-4 space-y-8">
            <!-- 史家朱批（竖排页边批语）：静态字段优先；无则 AI 史官活批（B4） -->
            <aside v-if="entry.comment || aiComment" v-reveal class="flex justify-end pr-3 pt-1" aria-label="史家朱批">
              <div class="relative">
                <p class="zhu-pi zhu-pi-write">{{ entry.comment ?? aiComment }}</p>
                <span
                  v-if="!entry.comment && aiComment"
                  class="absolute -bottom-5 right-0 text-[12px] tracking-[0.18em] text-muted-foreground/60 font-sans whitespace-nowrap"
                >翰墨生成</span>
              </div>
            </aside>
            <!-- AI 活批生成中/失败（无静态批语时才出现） -->
            <aside v-if="!entry.comment && commentState === 'inkout'" v-reveal class="flex justify-end pr-3 pt-1">
              <div class="w-[3.2rem]"><InkOut compact :retry="genComment" /></div>
            </aside>

            <!-- 器物 3D 展台 -->
            <aside v-if="entry.relic" v-reveal class="space-y-3">
              <div class="flex items-baseline justify-between gap-3 pb-3 border-b border-border/60">
                <span class="eyebrow whitespace-nowrap">器物展台 · {{ entry.relic.name }}</span>
                <span class="seal-stamp seal-stamp-sm shrink-0">器</span>
              </div>
               <RelicViewer :key="entry.id + '-' + entry.relic.kind" :kind="entry.relic.kind" />
              <p class="text-[13px] font-serif text-muted-foreground leading-relaxed">{{ entry.relic.caption }}</p>
            </aside>

            <!-- 史料卡片（竖排引文 · 古籍自右向左读） -->
            <aside
              v-for="(q, qIdx) in entry.quotes"
              :key="qIdx"
              v-reveal="qIdx * 90"
              class="pl-5 border-l-2"
              :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 45%, transparent)' }"
            >
              <div class="flex items-baseline justify-between gap-3 pb-3 border-b border-border/60">
                <span class="eyebrow whitespace-nowrap shrink-0">史料原文 · 卷 {{ qIdx + 1 }}</span>
                <span class="index-meta text-right truncate">{{ q.source }}</span>
              </div>
              <div class="flex items-start justify-end gap-4 pt-4">
                <blockquote class="vertical-quote font-textbook-quote text-[15px] text-foreground/95">
                  「{{ q.text }}」
                </blockquote>
                <span class="seal-stamp seal-stamp-sm shrink-0 mt-1" aria-hidden="true">笺</span>
              </div>
            </aside>

            <!-- 知识链接 -->
            <div v-if="entry.relations?.length" v-reveal class="space-y-1">
              <div class="pb-3 border-b border-border/60">
                <span class="eyebrow">知识链接 · 关联谱系</span>
              </div>
              <div class="text-[15px] font-serif">
                <div
                  v-for="(rel, rIdx) in entry.relations"
                  :key="rIdx"
                  class="py-3.5 border-b border-border/40 last:border-b-0"
                >
                  <div class="flex justify-between items-center font-bold pb-1">
                    <RouterLink :to="`/entry/${rel.targetId}`" class="hover:text-primary text-[15px]">
                      {{ rel.name }}
                    </RouterLink>
                    <span class="index-meta">
                      {{ rel.type }}
                    </span>
                  </div>
                  <p class="text-muted-foreground leading-relaxed mt-1">{{ rel.note }}</p>
                </div>
              </div>
              <RouterLink
                :to="`/graph?focus=${entry.id}`"
                class="inline-flex items-center gap-1.5 mt-3 text-[13px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 transition-opacity"
                title="在万卷星图中查看此卷的关系网络"
              >
                <span>在星图中查看此卷</span>
                <ArrowRight class="w-3.5 h-3.5" />
              </RouterLink>
            </div>

            <!-- 资料考证出处 -->
            <div v-reveal class="text-[13px] font-serif text-muted-foreground space-y-3">
              <span class="eyebrow block">考证典据源流</span>
              <ul class="list-disc list-inside space-y-1.5 leading-relaxed">
                <li v-for="src in entry.sources" :key="src">{{ src }}</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 词条底部横向生平时间轴 -->
        <section v-if="entry.timeline?.length" v-reveal class="mt-16">
          <div class="flex items-baseline justify-between gap-4 pb-3.5 border-b border-border/60">
            <span class="eyebrow">{{ entry.name }}纪年时序</span>
            <span class="index-meta">横向时间轴</span>
          </div>

          <div class="relative overflow-x-auto pb-4 no-scrollbar">
            <div class="min-w-[760px] flex items-start justify-between border-t pt-4 relative" :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 45%, transparent)' }">
              <div 
                v-for="(tNode, tIdx) in entry.timeline" 
                :key="tIdx"
                class="flex-1 pr-4 relative"
              >
                <div class="dot-pop w-3.5 h-3.5 rounded-full bg-[var(--dynasty-accent)] -mt-6 mb-2 border-2 border-background"></div>
                <span class="text-base block" style="font-family: var(--font-serif); color: var(--dynasty-accent)">{{ tNode.year }}</span>
                <p class="text-[13px] font-serif text-foreground/90 mt-1 leading-relaxed">{{ tNode.event }}</p>
              </div>
            </div>
          </div>
        </section>
        <!-- 读此卷者亦读：词条关联推荐 -->
        <section v-if="related.length" v-reveal class="mt-14">
          <div class="flex items-baseline justify-between gap-4 pb-3.5 border-b border-border/60 mb-8">
            <span class="eyebrow">读此卷者亦读</span>
            <span class="index-meta">词条关联推荐</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            <RouterLink
              v-for="rel in related"
              :key="rel.id"
              :to="`/entry/${rel.id}`"
              class="border-t border-border/60 pt-5 hover-lift group block"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="text-[13px] font-serif text-muted-foreground">{{ rel.dynasty }}<template v-if="rel.era"> · {{ rel.era }}</template></span>
                <span class="seal-stamp seal-stamp-sm">{{ typeSeal(rel.type) }}</span>
              </div>
              <h4 class="text-base font-serif font-black text-foreground group-hover:text-primary transition-colors">{{ rel.name }}</h4>
              <p class="text-[15px] font-serif text-muted-foreground leading-relaxed mt-1.5 line-clamp-2">{{ rel.summary }}</p>
            </RouterLink>
          </div>
        </section>
      </main>
    </div>

    <!-- 底部版心页码 -->
    <footer class="mt-20">
      <div class="max-w-7xl mx-auto px-6">
        <div class="rule"></div>
        <div class="pt-5 pb-9 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
          <RouterLink to="/search" class="eyebrow is-plain hover:text-[var(--dynasty-accent)] transition-colors">
            <ArrowLeft class="w-3 h-3" />
            <span>返回检索</span>
          </RouterLink>
          <span class="index-meta">{{ entry.dynasty }}代历史词条 · {{ entry.name }}</span>
          <span class="index-no">· 117 ·</span>
        </div>
      </div>
    </footer>
  </div>
</template>
