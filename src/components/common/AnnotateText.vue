<script setup lang="ts">
/**
 * 典籍夹注 · 正文术语自动标注（A3）
 *
 * 把纯文本中的 glossary.ts 术语渲染为朱色小字标注，悬停/点按弹出
 * 古籍双行夹注卡（白话释义 + 词条直达 + B6 再问史官）。
 *
 * 算法约定：
 * - 最长匹配优先（「八股取士」优先于「取士」类子串）；
 * - 不嵌套：已匹配区段内部的术语不再匹配（原文段落结构清晰，一次扫描足够）；
 * - 输入必须是纯文本（调用方保证）——史料引文原文不注，标题不注。
 */
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { GLOSSARY, type GlossaryTerm } from '../../data/glossary'
import { createChatStream, llmEnabled, MODEL_FAST } from '../../services/llm'
import { PERSONA } from '../../services/prompts'

const props = defineProps<{
  text: string
}>()

interface Segment {
  /** 纯文本片段 */
  plain?: string
  /** 术语标注片段 */
  hit?: { term: GlossaryTerm; raw: string }
}

/** 单次扫描 + 最长匹配（术语表 ≤100 条，性能无忧） */
function segment(source: string): Segment[] {
  const out: Segment[] = []
  let buf = ''
  let i = 0
  outer: while (i < source.length) {
    // 尝试在 i 处匹配术语（最长优先）
    const candidates = TERM_TRIES.filter(t => source.startsWith(t.term, i))
    const best = candidates.sort((a, b) => b.term.length - a.term.length)[0]
    if (best) {
      if (buf) {
        out.push({ plain: buf })
        buf = ''
      }
      out.push({ hit: { term: best, raw: source.slice(i, i + best.term.length) } })
      i += best.term.length
      continue outer
    }
    buf += source[i]
    i++
  }
  if (buf) out.push({ plain: buf })
  return out
}

/** 预构建检索表（按 term 建映射，避免每段全表扫） */
const TERM_TRIES: GlossaryTerm[] = [...GLOSSARY].sort((a, b) => b.term.length - a.term.length)

const segments = computed(() => segment(props.text ?? ''))

/* ── 夹注卡 ── */
const active = ref<GlossaryTerm | null>(null)
const cardStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })
const cardRef = ref<HTMLElement | null>(null)
/** 触发标注的锚点（openHit 时从 currentTarget 记录；v-for 内 template ref 会是数组，不可用） */
let anchorEl: HTMLElement | null = null

function openHit(hit: { term: GlossaryTerm; raw: string }, ev?: MouseEvent | KeyboardEvent) {
  if (active.value?.term === hit.term.term) {
    close()
    return
  }
  anchorEl = (ev?.currentTarget as HTMLElement | null) ?? anchorEl
  active.value = hit.term
  // 下一帧定位（等卡片渲染后量尺寸）
  requestAnimationFrame(() => positionCard())
  ev?.stopPropagation()
}

function close() {
  active.value = null
}

function onDocClick() {
  close()
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKey)
  followupAbort?.abort()
})

const KIND_LABEL: Record<GlossaryTerm['kind'], string> = {
  institution: '制度',
  office: '职官',
  event: '史事',
  concept: '义理',
  text: '典籍'
}

/* ── B6 释疑直答：夹注卡内「再问史官」，围绕本术语的多轮追问 ── */
const followupOpen = ref(false)
const followupHistory = ref<Array<{ q: string; a: string }>>([])
const followupInput = ref('')
const followupLoading = ref(false)
const followupInkout = ref(false)
let followupAbort: AbortController | null = null
/** 每个术语的会话独立保存（同一术语重开续接） */
const followupSessions = new Map<string, Array<{ q: string; a: string }>>()

function toggleFollowup() {
  if (!active.value) return
  followupOpen.value = !followupOpen.value
  if (followupOpen.value) {
    followupHistory.value = followupSessions.get(active.value.term) ?? []
    nextTick(positionCard)
  }
}

function positionCard() {
  const anchor = anchorEl
  const card = cardRef.value
  if (!anchor || !card) return
  const a = anchor.getBoundingClientRect()
  const c = card.getBoundingClientRect()
  let x = a.left + a.width / 2 - c.width / 2
  x = Math.max(12, Math.min(x, window.innerWidth - c.width - 12))
  let y = a.top - c.height - 10
  if (y < 12) y = a.bottom + 10
  cardStyle.value = { left: `${x}px`, top: `${y}px` }
}

async function askFollowup() {
  const term = active.value
  const question = followupInput.value.trim()
  if (!term || !question || followupLoading.value) return
  followupInput.value = ''
  followupLoading.value = true
  followupInkout.value = false
  const turn = { q: question, a: '' }
  followupHistory.value.push(turn)
  followupSessions.set(term.term, followupHistory.value)
  followupAbort = new AbortController()
  // 多轮上下文：把此前问答一并带上，约束在本术语范围内
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: `${PERSONA}\n当前讨论的术语是「${term.term}」（${term.note}）。回答限定在此术语相关范围内，80 字内，一两句即可。` }
  ]
  for (const h of followupHistory.value.slice(0, -1)) {
    messages.push({ role: 'user', content: h.q })
    messages.push({ role: 'assistant', content: h.a })
  }
  messages.push({ role: 'user', content: question })
  try {
    await createChatStream(
      messages,
      d => {
        turn.a += d
        followupHistory.value = [...followupHistory.value] // 触发响应
      },
      {
        model: MODEL_FAST,
        maxTokens: 500,
        signal: followupAbort.signal,
        // 演示回放：预录一条（录制/断网演示兜底；真模型时忽略）
        replayText: '史臣曰：一条鞭法并赋役、征银两，开后世摊丁入亩之先声，然其弊在胥吏为奸，万历后渐失初意。'
      }
    )
    followupLoading.value = false
    nextTick(positionCard)
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    followupLoading.value = false
    followupInkout.value = true
  }
}

/** 打开/关闭/切换术语时同步追问面板：旧流必须中断，loading 必须复位（否则按钮永久禁用） */
watch(active, t => {
  followupAbort?.abort()
  followupLoading.value = false
  followupOpen.value = false
  followupInkout.value = false
  followupHistory.value = t ? followupSessions.get(t.term) ?? [] : []
})
</script>

<template>
  <span class="anno-text">
    <template v-for="(seg, i) in segments" :key="i">
      <template v-if="seg.plain !== undefined">{{ seg.plain }}</template>
      <span
        v-else
        class="anno-hit"
        role="button"
        tabindex="0"
        :title="seg.hit!.term.note"
        @click.stop="openHit(seg.hit!, $event)"
        @keydown.enter.stop="openHit(seg.hit!, $event)"
      >{{ seg.hit!.raw }}</span>
    </template>

    <!-- 双行夹注浮卡 -->
    <Teleport to="body">
      <Transition name="anno-pop">
        <div
          v-if="active"
          ref="cardRef"
          class="anno-card"
          :style="cardStyle"
          role="note"
          @click.stop
        >
          <div class="flex items-baseline justify-between gap-4 mb-1.5">
            <span class="font-serif font-bold text-[15px] text-foreground">{{ active.term }}</span>
            <span class="text-[12px] tracking-[0.18em] text-muted-foreground/70">{{ KIND_LABEL[active.kind] }}</span>
          </div>
          <p class="font-serif text-[13px] text-muted-foreground leading-relaxed">{{ active.note }}</p>

          <!-- B6 释疑直答：再问史官（多轮，限本术语范围） -->
          <div v-if="llmEnabled()" class="mt-2.5">
            <button
              v-if="!followupOpen"
              type="button"
              class="text-[12px] font-serif text-muted-foreground/70 hover:text-[var(--dynasty-accent)] transition-colors cursor-pointer"
              @click.stop="toggleFollowup"
            >✦ 再问史官</button>
            <div v-else class="border-t border-border/60 pt-2 mt-1 space-y-2" @click.stop>
              <div v-for="(h, hi) in followupHistory" :key="hi" class="space-y-1">
                <p class="text-[12px] font-serif text-foreground/80"><span class="text-muted-foreground/50 mr-1">问</span>{{ h.q }}</p>
                <p class="text-[12px] font-serif text-muted-foreground leading-relaxed"><span class="text-[var(--dynasty-accent)]/70 mr-1">史官</span>{{ h.a }}<span v-if="followupLoading && hi === followupHistory.length - 1 && !h.a" class="ink-cursor"></span></p>
              </div>
              <div v-if="followupInkout" class="text-[12px] font-serif text-muted-foreground/60">墨尽——稍候再问。</div>
              <div class="flex items-center gap-2">
                <input
                  v-model="followupInput"
                  type="text"
                  class="flex-1 min-w-0 bg-transparent border-b border-border/70 py-1 text-[12px] font-serif text-foreground outline-none focus:border-[var(--dynasty-accent)] transition-colors placeholder:text-muted-foreground/40"
                  placeholder="就此术语追问一句……"
                  @keyup.enter.stop="askFollowup"
                />
                <button
                  type="button"
                  class="text-[12px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 transition-opacity cursor-pointer shrink-0 disabled:opacity-40"
                  :disabled="followupLoading || !followupInput.trim()"
                  @click.stop="askFollowup"
                >问</button>
              </div>
            </div>
          </div>

          <div class="mt-2.5 pt-2 border-t border-border/60 flex items-center justify-between gap-3">
            <RouterLink
              v-if="active.entryId"
              :to="`/entry/${active.entryId}`"
              class="text-[12px] font-serif text-[var(--dynasty-accent)] hover:opacity-80 transition-opacity"
              @click="close"
            >直达此卷 →</RouterLink>
            <span v-else class="text-[12px] font-serif text-muted-foreground/50">夹注</span>
            <button type="button" class="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer" @click.stop="close">收</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.anno-hit {
  color: var(--dynasty-accent);
  border-bottom: 1px dashed color-mix(in srgb, var(--dynasty-accent) 55%, transparent);
  cursor: help;
  transition: opacity 0.15s ease;
}
.anno-hit:hover {
  opacity: 0.8;
}

.anno-card {
  position: fixed;
  z-index: 60;
  width: min(320px, calc(100vw - 32px));
  background: var(--paper-base, #f7f2e3);
  border: 1px solid color-mix(in srgb, var(--dynasty-accent) 40%, transparent);
  box-shadow: 0 8px 24px rgba(31, 27, 22, 0.14);
  padding: 0.75rem 0.9rem;
}
:global(html.dark) .anno-card {
  background: #241e17;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.anno-pop-enter-active,
.anno-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.anno-pop-enter-from,
.anno-pop-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
@media (prefers-reduced-motion: reduce) {
  .anno-pop-enter-active,
  .anno-pop-leave-active {
    transition: none;
  }
}
</style>
