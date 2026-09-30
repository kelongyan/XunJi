<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import { getEntryById, allHistoryEntries } from '../data'
import { dynastyIdFromHanzi, defaultDynasty } from '../data/dynastyThemes'
import { useTypewriter } from '../composables/useTypewriter'
import { useFootprint } from '../composables/useFootprint'
import { playStampSound } from '../composables/useSound'

const VoyageMap = defineAsyncComponent(() => import('../components/three/VoyageMap.vue'))
const RelicViewer = defineAsyncComponent(() => import('../components/three/RelicViewer.vue'))

const route = useRoute()
const entryId = computed(() => (route.params.id as string) || 'zhang-juzheng')
const entry = computed(() => getEntryById(entryId.value) || getEntryById('zhang-juzheng')!)

/* 足迹：到访即留痕 */
const { record, toggleCollect, isCollected } = useFootprint()
watch(
  () => entry.value.id,
  id => record(id),
  { immediate: true }
)

const collected = computed(() => isCollected(entry.value.id))
function onToggleCollect() {
  const now = toggleCollect(entry.value.id)
  if (now) playStampSound()
}

/** 读此卷者亦读：关系直连 + 标签重叠 + 同朝代加权 */
const related = computed(() => {
  const self = entry.value
  const selfTags = new Set(self.tags)
  const direct = new Set((self.relations ?? []).map(r => r.targetId))
  return allHistoryEntries
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

const { displayedText, isTyping, start: startInterp, skip: skipInterp } = useTypewriter({
  baseSpeed: 30,
  commaDelay: 75,
  periodDelay: 150
})

function runFlow() {
  if (entry.value?.interpretation) {
    startInterp(entry.value.interpretation)
  }
}

function handleSkip() {
  if (entry.value?.interpretation) {
    skipInterp(entry.value.interpretation)
  }
}

onMounted(() => {
  runFlow()
})
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between">
    <div>
      <TextbookHeader folio="116" :subChapter="`${entry.dynasty}代 · ${entry.name}词条详述`" />

      <main class="max-w-7xl mx-auto px-6 py-12">
        <!-- 词条头信息：编目式刊头（去框，靠细线与留白组织层级） -->
        <div v-reveal class="mb-14">
          <div class="flex items-baseline justify-between gap-4 pb-4 border-b border-border/60">
            <span class="eyebrow">{{ entry.dynasty }}代 · {{ entry.name }}</span>
            <span class="index-meta">{{ entry.sources[0] }}</span>
          </div>

          <div class="flex items-start justify-between gap-8 mt-8">
            <div class="space-y-5 flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2.5 text-[13px] font-serif text-muted-foreground">
                <span class="dynasty-chip px-2.5 py-0.5 tracking-wider">
                  {{ entry.type === 'emperor' ? '帝王篇' : entry.type === 'figure' ? '人物篇' : entry.type === 'event' ? '重大事件' : '典章制度' }}
                </span>
                <span class="index-meta">正史核心词条</span>
              </div>

              <div>
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

              <p class="text-[15px] md:text-[15px] font-serif text-foreground/85 max-w-2xl leading-relaxed">
                {{ entry.summary }}
              </p>

              <div class="pt-1">
                <button
                  type="button"
                  class="collect-btn"
                  :class="collected ? 'is-collected' : ''"
                  :title="collected ? '从藏书阁取出' : '钤一枚私人藏书印，收入藏书阁'"
                  @click="onToggleCollect"
                >
                  <SealStamp :text="collected ? '已藏' : '钤印'" class="seal-stamp-sm !opacity-100" />
                  <span>{{ collected ? '已入藏书阁 · 点击取出' : '钤印收藏 · 入藏书阁' }}</span>
                </button>
              </div>

              <div
                v-if="entry.background"
                class="mt-5 pl-5 border-l-2"
                :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 45%, transparent)' }"
              >
                <div class="eyebrow mb-2">时代大背景</div>
                <p class="text-[13px] md:text-[15px] font-serif text-muted-foreground leading-relaxed">
                  {{ entry.background }}
                </p>
              </div>
            </div>

            <SealStamp :text="entry.type === 'emperor' ? '大明天子' : entry.type === 'figure' ? '正史名贤' : '制度典章'" subtext="钦定正史" class="seal-drop hidden sm:block shrink-0" />
          </div>
        </div>

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
                  {{ para }}
                </p>
              </div>

              <!-- 若该词条配有历史插图，则在第一节后插入图版（笺谱套色装裱） -->
              <div v-if="cIdx === 0 && entry.image" v-reveal class="textbook-figure-box my-8 framed-plate bg-card/50 shadow-sm">
                <div class="text-[13px] font-serif text-muted-foreground border-b border-border/80 pb-2.5 mb-3 flex items-center justify-between">
                  <span class="font-bold text-foreground flex items-center space-x-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    <span>【图版】{{ entry.name }}相关典籍与图谱摹本</span>
                  </span>
                  <span class="seal-stamp text-[12px] py-0.5 px-1">图版</span>
                </div>
                <div class="bg-background border border-border/70 p-2 overflow-hidden flex justify-center">
                  <img :src="entry.image.src" :alt="entry.image.caption" class="w-full max-w-lg h-auto object-contain" />
                </div>
                <p class="textbook-caption text-center">
                  {{ entry.image.caption }}
                </p>
              </div>
            </section>

            <!-- 针路图（词条专属 3D 航路，窄屏隐藏） -->
            <section v-if="entry.id === 'zhenghe-xiaxiyang'" v-reveal class="hidden md:block mb-12">
              <div class="framed-plate bg-card/65 shadow-sm overflow-hidden">
                <div class="text-[13px] font-serif text-muted-foreground border-b border-border/80 px-4 py-2.5 flex items-center justify-between">
                  <span class="font-bold text-foreground">【针路图】郑和七下西洋航路摹本</span>
                  <span class="seal-stamp text-[12px] py-0.5 px-1">针路</span>
                </div>
                <VoyageMap />
                <p class="textbook-caption text-center py-2.5">
                  航路为历史航线之风格化摹本，非精确地理投影 · 拖动环视，滚轮推近
                </p>
              </div>
            </section>

            <!-- 史学纵横（流式解读核心区） -->
            <section v-reveal class="border-wenwu-primary p-7 md:p-9 bg-card/85 relative shadow-sm textbook-reading-column my-8">
              <div class="flex items-baseline justify-between gap-4 pb-3.5 mb-6 border-b border-border/60">
                <h3 class="text-xl text-foreground tracking-wide" style="font-family: var(--font-serif)">史学纵横 · 深度解读</h3>
                <span class="index-meta">本地预置流式呈现</span>
              </div>

              <div class="font-serif text-[15px] leading-loose text-foreground">
                <p class="text-indent-chinese font-textbook-body">
                  {{ displayedText }}
                  <span v-if="isTyping" class="ink-cursor"></span>
                </p>
              </div>

              <div class="mt-6 pt-3.5 border-t border-border flex items-center justify-between text-[13px] font-serif text-muted-foreground">
                <span class="italic text-muted-foreground/90">—— 综合正史与断代专论 · 明代篇</span>
                <div class="flex items-center space-x-2">
                  <button v-if="isTyping" @click="handleSkip" class="hover:text-primary underline cursor-pointer">
                    快速完成
                  </button>
                </div>
              </div>
            </section>
          </div>

          <!-- 右侧：侧栏朱批 + 器物展台 + 史料卡片 + 知识链接 -->
          <div class="md:col-span-4 space-y-8">
            <!-- 史家朱批（竖排页边批语） -->
            <aside v-if="entry.comment" v-reveal class="flex justify-end pr-3 pt-1" aria-label="史家朱批">
              <p class="zhu-pi">{{ entry.comment }}</p>
            </aside>

            <!-- 器物 3D 展台 -->
            <aside v-if="entry.relic" v-reveal class="space-y-3">
              <div class="flex items-baseline justify-between gap-3 pb-3 border-b border-border/60">
                <span class="eyebrow whitespace-nowrap">器物展台 · {{ entry.relic.name }}</span>
                <span class="seal-stamp seal-stamp-sm shrink-0">器</span>
              </div>
              <RelicViewer :kind="entry.relic.kind" />
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
