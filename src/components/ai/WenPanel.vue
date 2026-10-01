<script setup lang="ts">
/**
 * 问典 · RAG 问答面板（Search 页「问典」页签）
 * 本地检索 top-k 卷目 → AI 史官流式作答 → 站内引用卡（可溯源直达）。
 * 断网/失败出墨尽态；检索与引用永远来自站内数据。
 */
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Search as SearchIcon, PenLine } from 'lucide-vue-next'
import InkOut from '../common/InkOut.vue'
import { askWen, retrieve, wenAvailable, extractCitations, type WenPassage } from '../../services/wen'

const question = ref('')
const answer = ref('')
const citations = ref<WenPassage[]>([])
const state = ref<'idle' | 'loading' | 'done' | 'inkout'>('idle')
const abort = new AbortController()

/** 预置示例问（引导首次使用） */
const EXAMPLES = [
  '张居正改革为什么最终失败？',
  '科举制度是怎么演变的？',
  '宋朝为什么重文轻武？'
]

async function ask(q?: string) {
  const query = (q ?? question.value).trim()
  if (!query || state.value === 'loading') return
  question.value = query
  state.value = 'loading'
  answer.value = ''
  citations.value = []
  try {
    const { source } = await askWen(
      query,
      d => { answer.value += d },
      {
        // 演示回放：预录一段完整史官答（接入层 REPLAY_MODE=1 时 replayText 生效；
        // 结尾「——据《…》」供引用卡解析，名称须为站内词条名）
        replayText: '史臣曰：张居正之败，非败于法，实败于势。观其当国十年，考成清丈、一条鞭法，太仓粟支十年，太仆银至四百余万，可谓起衰振隳。然威权过盛，独秉国政，倚太后与司礼监冯保之势，已伏怨府。神宗幼年受制，积憾于内；及居正病逝，帝亲政，即行清算，籍没抄家，祸延子孙。新政虽遭摧折，然一条鞭法与清丈成果多沿用不废，是法未尽亡，而人亡政息。其后神宗怠政近三十年，矿税病民，立储之争不休，朝局日坏，改革之基遂颓。故曰：张相之败，半在己之专擅，半在君心之翻覆。\n\n——据《张居正》《万历新政》《朱翊钧》',
        signal: abort.signal
      }
    )
    citations.value = extractCitations(answer.value, retrieve(query))
    state.value = 'done'
    void source
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    state.value = 'inkout'
  }
}

function reset() {
  abort.abort()
  state.value = 'idle'
  answer.value = ''
  citations.value = []
}

const passages = ref<WenPassage[]>([])
function previewPassages(q: string) {
  passages.value = retrieve(q)
}
void passages
void reset
</script>

<template>
  <div class="space-y-5">
    <!-- 提问行 -->
    <div class="flex items-stretch gap-3">
      <div class="flex-1 flex items-center gap-3 border border-border/80 bg-card/60 px-4 focus-within:border-[var(--dynasty-accent)] transition-colors">
        <SearchIcon class="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          v-model="question"
          type="text"
          class="flex-1 bg-transparent py-3 text-[15px] font-serif text-foreground outline-none placeholder:text-muted-foreground/50"
          placeholder="以史为据，问典一句……"
          @keyup.enter="ask()"
        />
      </div>
      <button
        type="button"
        :disabled="state === 'loading' || !question.trim()"
        class="px-6 border border-[var(--dynasty-accent)] text-[var(--dynasty-accent)] text-[15px] font-serif tracking-[0.18em] hover:bg-[color-mix(in_srgb,var(--dynasty-accent)_8%,transparent)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        @click="ask()"
      >
        {{ state === 'loading' ? '史官运笔中……' : '问典' }}
      </button>
    </div>

    <!-- 示例问 -->
    <div v-if="state === 'idle'" class="flex flex-wrap items-center gap-2.5">
      <span class="eyebrow is-plain">试问</span>
      <button
        v-for="ex in EXAMPLES"
        :key="ex"
        type="button"
        class="px-3 py-1 border border-border/70 text-[13px] font-serif text-muted-foreground hover:text-[var(--dynasty-accent)] hover:border-[var(--dynasty-accent)] transition-colors cursor-pointer"
        @click="ask(ex); previewPassages(ex)"
      >{{ ex }}</button>
    </div>

    <!-- 回答区 -->
    <div v-if="state === 'loading' && !answer" class="text-[13px] font-serif text-muted-foreground/70 flex items-center gap-2">
      <PenLine class="w-3.5 h-3.5 animate-pulse" /> 翻检卷帙，史官正在作答……
    </div>

    <InkOut v-if="state === 'inkout'" :retry="() => ask()" />

    <div v-if="answer" class="border-wenwu bg-card/70 p-5 md:p-6">
      <div class="eyebrow mb-3">史官对曰 · 翰墨生成</div>
      <p class="text-[15px] font-serif text-foreground/90 leading-loose whitespace-pre-wrap">{{ answer }}<span v-if="state === 'loading'" class="ink-cursor"></span></p>
      <p v-if="state === 'done'" class="mt-3 text-[12px] font-serif text-muted-foreground/60">AI 生成，或有讹误；所据卷目如下，可点入原文核对。</p>
    </div>

    <!-- 引用卡（可溯源） -->
    <div v-if="citations.length" class="space-y-2">
      <div class="eyebrow">所据卷目</div>
      <RouterLink
        v-for="p in citations"
        :key="p.id"
        :to="`/entry/${p.id}`"
        class="index-row"
      >
        <span class="seal-stamp text-[12px] py-0.5 px-1 shrink-0">卷</span>
        <span class="index-name">{{ p.name }}</span>
        <span class="index-meta hidden sm:inline">{{ p.dynasty }} · {{ p.text.slice(0, 28) }}……</span>
        <span class="index-meta">直达 ↗</span>
      </RouterLink>
    </div>

    <!-- 服务未配置态 -->
    <div v-if="!wenAvailable() && state === 'idle'" class="text-[13px] font-serif text-muted-foreground/60">
      翰墨未启——问典需接入大模型服务；检索仍可正常使用「史料考索」。
    </div>
  </div>
</template>
