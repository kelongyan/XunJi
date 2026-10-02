<script setup lang="ts">
/**
 * 殿试三题 · 科举小考（/exam）
 *
 * 从编年长卷自动出题（src/data/exam.ts，纯本地静态数据），
 * 三问四选一，答毕按对题数颁功名（落第→状元），盖功名印、记历史最高。
 * 答题正确时盖小朱印（复用 stamp-pressing 动效），放榜走 v-reveal 错落。
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import Masthead from '../components/common/Masthead.vue'
import { getDynastyTheme } from '../data/dynastyThemes'
import {
  generateExamPaper,
  rankOf,
  readBestRank,
  saveBestRank,
  type ExamQuestion
} from '../data/exam'
import { playStampSound } from '../composables/useSound'

type Phase = 'answer' | 'reveal' | 'result'

const route = useRoute()
/** 可选 ?seed= 固定题卷（演示录制 / 回归测试用；缺省按时间随机） */
function seedFromRoute(): number {
  const raw = Number(route.query.seed)
  return Number.isFinite(raw) && raw > 0 ? raw : Date.now()
}

/** 每次入卷换题（"再考一卷"也走这里） */
const paper = ref(generateExamPaper(seedFromRoute()))
const idx = ref(0)
const phase = ref<Phase>('answer')
/** 本卷每题的选择（-1 未答） */
const picks = ref<number[]>([-1, -1, -1])
/** 揭示态下的正确项闪现 */
const justCorrect = ref(false)

const q = computed<ExamQuestion | null>(() => paper.value.questions[idx.value] ?? null)
const theme = computed(() => getDynastyTheme(q.value?.dynastyId ?? 'ming'))
const correctCount = computed(() =>
  paper.value.questions.reduce((n, item, i) => (picks.value[i] === item.answer ? n + 1 : n), 0)
)
const rank = computed(() => rankOf(phase.value === 'result' ? correctCount.value : 0))
const best = ref(readBestRank())

function pick(i: number) {
  if (phase.value !== 'answer' || !q.value) return
  picks.value[idx.value] = i
  justCorrect.value = i === q.value.answer
  phase.value = 'reveal'
  if (justCorrect.value) playStampSound()
}

function next() {
  if (idx.value + 1 >= paper.value.questions.length) {
    best.value = saveBestRank(correctCount.value)
    phase.value = 'result'
    return
  }
  idx.value++
  phase.value = 'answer'
}

function retake() {
  paper.value = generateExamPaper()
  idx.value = 0
  picks.value = [-1, -1, -1]
  phase.value = 'answer'
}

/** 结果页按对题数着印色：满红为状元 */
const rankTone = computed(() =>
  correctCount.value >= 3 ? 'var(--dynasty-accent)' : 'var(--ink-soft)'
)
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between">
    <div>
      <TextbookHeader folio="093" subChapter="殿试三题 · 科举小考" />

      <main class="max-w-[880px] mx-auto px-6 py-10">
        <!-- 卷头 -->
        <div v-reveal class="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
          <div class="space-y-3">
            <div class="eyebrow">贡院开考 · 三问定功名</div>
            <h1 class="display-title">殿试三题</h1>
            <p class="text-[15px] font-serif text-muted-foreground max-w-xl leading-relaxed">
              题目皆出自站内编年长卷的史事要义——读过的卷子，这里都问得到。三问四选一，答毕放榜颁功名。
            </p>
          </div>
          <div class="flex items-center gap-5 shrink-0">
            <div class="text-right space-y-1.5">
              <div class="spec-number">{{ best >= 0 ? rankOf(best).rank : '—' }}</div>
              <div class="spec-label">平生功名</div>
            </div>
            <SealStamp :text="best >= 0 ? rankOf(best).seal : '白身'" class="seal-drop hidden sm:block" />
          </div>
        </div>

        <!-- 答题卷面 -->
        <div
          v-if="phase !== 'result' && q"
          :key="idx"
          class="border-wenwu bg-card/40 p-6 md:p-9 relative"
          :style="{ '--dynasty-accent': theme.accent }"
        >
          <!-- 题次与年份 -->
          <div class="flex items-baseline justify-between gap-4 mb-5">
            <span class="eyebrow">第{{ ['一', '二', '三'][idx] }}问</span>
            <span class="index-meta">{{ q.year }}</span>
          </div>

          <!-- 题干（史事要义，隐去事件名） -->
          <p class="text-[16px] font-serif leading-loose text-foreground mb-7 font-textbook-reading">
            {{ q.stem }}
          </p>

          <!-- 四选一 -->
          <div class="grid gap-3">
            <button
              v-for="(opt, i) in q.options"
              :key="i"
              type="button"
              class="text-left px-5 py-3.5 border border-border/70 bg-paper-soft/60 font-serif text-[15px] transition-all duration-200 cursor-pointer flex items-center justify-between gap-3"
              :class="[
                phase === 'answer'
                  ? 'hover:border-[var(--dynasty-accent)] hover:bg-card hover-lift'
                  : ''
              ]"
              :style="
                phase !== 'answer'
                  ? i === q.answer
                    ? { borderColor: 'var(--dynasty-accent)', borderWidth: '1.5px', backgroundColor: 'color-mix(in srgb, var(--dynasty-accent) 7%, transparent)' }
                    : picks[idx] === i
                      ? { opacity: 0.55 }
                      : { opacity: 0.75 }
                  : {}
              "
              :disabled="phase !== 'answer'"
              @click="pick(i)"
            >
              <span>
                <span class="text-muted-foreground/70 mr-3">{{ '甲乙丙丁'[i] }}.</span>
                <span class="text-foreground">{{ opt }}</span>
              </span>
              <!-- 答对落小印 -->
              <span
                v-if="phase === 'reveal' && i === q.answer"
                class="stamp-pressing shrink-0 w-7 h-7 border flex items-center justify-center text-[12px] font-kai"
                :style="{ borderColor: 'var(--dynasty-accent)', color: 'var(--dynasty-accent)', transform: 'rotate(-4deg)' }"
              >中</span>
              <span
                v-else-if="phase === 'reveal' && picks[idx] === i"
                class="shrink-0 text-[12px] text-muted-foreground/60"
              >误</span>
            </button>
          </div>

          <!-- 揭示解析 -->
          <Transition name="fade-swap">
            <div v-if="phase === 'reveal'" class="mt-7 pt-5 border-t border-border/60 space-y-4">
              <p class="text-[13px] font-serif text-muted-foreground leading-relaxed">
                <span class="eyebrow is-plain mr-2">史官按</span>{{ q.note }}
              </p>
              <div class="flex items-center justify-between gap-4 flex-wrap">
                <RouterLink
                  v-if="q.entryId"
                  :to="`/entry/${q.entryId}`"
                  class="text-[13px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 transition-opacity"
                >展开此卷 · 看词条全文 →</RouterLink>
                <button
                  type="button"
                  class="px-6 py-2 border border-[var(--dynasty-accent)] text-[var(--dynasty-accent)] text-[15px] font-serif tracking-[0.2em] hover:bg-[color-mix(in_srgb,var(--dynasty-accent)_8%,transparent)] transition-colors cursor-pointer"
                  @click="next"
                >
                  {{ idx + 1 >= paper.questions.length ? '呈卷放榜' : '下一问 →' }}
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- 放榜 -->
        <div v-if="phase === 'result'" class="text-center py-10 space-y-8">
          <!-- 功名大印 -->
          <div class="inline-block v-reveal">
            <div
              class="w-28 h-28 border-[3px] flex items-center justify-center mx-auto stamp-pressing"
              :style="{ borderColor: rankTone, color: rankTone }"
            >
              <span class="font-kai text-[2.6rem] tracking-[0.1em] leading-none pt-2">{{ rank.seal }}</span>
            </div>
          </div>

          <div v-reveal="120" class="space-y-2.5">
            <div class="eyebrow">金榜题名 · {{ correctCount }} / {{ paper.questions.length }} 问</div>
            <p class="display-heading">{{ rank.rank }}</p>
            <p class="text-[15px] font-serif text-muted-foreground max-w-md mx-auto leading-relaxed font-textbook-quote">
              {{ rank.comment }}
            </p>
          </div>

          <!-- 本卷对错回顾 -->
          <div v-reveal="220" class="max-w-lg mx-auto text-left space-y-2">
            <div v-for="(item, i) in paper.questions" :key="i" class="flex items-center gap-3 text-[13px] font-serif">
              <span
                class="w-5 h-5 shrink-0 border flex items-center justify-center text-[12px]"
                :style="picks[i] === item.answer
                  ? { borderColor: 'var(--dynasty-accent)', color: 'var(--dynasty-accent)' }
                  : { borderColor: 'var(--hairline)', color: 'var(--ink-faint)' }"
              >{{ picks[i] === item.answer ? '中' : '误' }}</span>
              <span class="index-meta shrink-0">{{ '甲乙丙'[i] }}问 · {{ item.year.split(' · ')[0] }}</span>
              <span class="text-foreground/85 truncate">{{ item.options[item.answer] }}</span>
            </div>
          </div>

          <div v-reveal="320" class="flex items-center justify-center gap-8 pt-2">
            <button
              type="button"
              class="px-7 py-2.5 border border-[var(--dynasty-accent)] text-[var(--dynasty-accent)] text-[15px] font-serif tracking-[0.22em] hover:bg-[color-mix(in_srgb,var(--dynasty-accent)_8%,transparent)] transition-colors cursor-pointer"
              @click="retake"
            >再考一卷</button>
            <RouterLink
              to="/timeline"
              class="text-[13px] font-serif text-muted-foreground hover:text-foreground transition-colors"
            >回编年长卷温书 →</RouterLink>
          </div>
        </div>

        <!-- 出题说明（数据诚信） -->
        <p v-reveal class="mt-12 text-[12px] text-muted-foreground/70 font-serif leading-relaxed max-w-2xl">
          出题说明：全部题干与答案取自站内编年长卷的史实条目，干扰项取同朝代他事——不出无据之题，不设陷阱之问。功名只记本机（localStorage），不作云端比较。
        </p>
      </main>
    </div>

    <Masthead left="寻迹 · 殿试三题" note="科举小考 · 三问定功名" folio="093" />
  </div>
</template>
