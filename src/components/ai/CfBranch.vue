<script setup lang="ts">
/**
 * 推演分支节点（递归渲染）。
 * 视觉语法：实线灰卡 = 史实，朱色虚线卡 = 推演支线。
 * B2：叶子节点可「请史官续推」——LLM 活生成一层分支，挂到本地树；
 * 生成失败出墨尽态可重试；活生成内容同样带「非史实」标注。
 */
import { onBeforeUnmount, ref } from 'vue'
import { Plus, PenLine } from 'lucide-vue-next'
import type { CfNode } from '../../data/counterfactuals'
import { chatJson, llmEnabled, MODEL_FAST } from '../../services/llm'
import { counterfactualPrompt } from '../../services/prompts'
import { REPLAY_CF_BRANCH } from '../../services/replayFixtures'
import InkOut from '../common/InkOut.vue'

const props = defineProps<{
  node: CfNode
  depth?: number
  /** 祖先分支名链（供 prompt 沿途上下文） */
  ancestry?: string[]
}>()

const expanded = ref(false)

/* ── B2 活生成 ── */
const genState = ref<'idle' | 'loading' | 'done' | 'inkout'>('idle')
/** 活生成的一层分支（独立于静态 children，同构渲染） */
const aiChildren = ref<CfNode[]>([])
let genSeq = 0
let abort: AbortController | undefined

async function continueInk() {
  if (genState.value === 'loading' || !llmEnabled()) return
  genState.value = 'loading'
  const seq = ++genSeq
  abort?.abort()
  abort = new AbortController()
  try {
    const out = await chatJson<{
      branch: string
      narrative: string
      children?: Array<{ hint: string }>
    }>(
      counterfactualPrompt({
        event: props.node.title,
        narrative: props.node.narrative,
        parentPath: props.ancestry ?? []
      }),
      // 结构化输出走快速档（非推理模型），JSON 小预算不会被思考链烧穿
      {
        model: MODEL_FAST,
        maxTokens: 900,
        temperature: 0.9,
        // 演示回放：预录一层推演（录制/断网兜底；真模型时忽略）
        replayText: REPLAY_CF_BRANCH,
        signal: abort.signal
      }
    )
    if (seq !== genSeq) return // 已被重置/切换
    const idBase = `cf-ai-${Date.now()}-${seq}`
    aiChildren.value = [
      {
        id: idBase,
        title: out.branch || '史官续推',
        narrative: out.narrative || '',
        children: (out.children ?? []).slice(0, 2).map((c, i) => ({
          id: `${idBase}-h${i}`,
          title: c.hint,
          narrative: '此向尚待史官展卷续推——点击上层「再推一步」沿此路再问。'
        }))
      }
    ]
    genState.value = 'done'
    expanded.value = true
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    genState.value = 'inkout'
  }
}

onBeforeUnmount(() => {
  abort?.abort()
})

function resetGen() {
  genSeq++
  genState.value = 'idle'
  aiChildren.value = []
  expanded.value = false
}

/** 展示用合并 children（静态在前，AI 续推在后） */
function allChildren(): CfNode[] {
  return [...(props.node.children ?? []), ...aiChildren.value]
}
function hasAnyChildren(): boolean {
  return !!(props.node.children?.length || aiChildren.value.length)
}
</script>

<template>
  <div :class="depth ? 'cf-branch mt-4 pl-5' : ''">
    <div class="cf-card border-wenwu border-l-4 border-l-primary/70 bg-card/80 p-4 md:p-5 shadow-sm relative">
      <!-- 推演支线小标 -->
      <span
        v-if="depth"
        class="absolute -top-2.5 left-4 text-[12px] font-serif font-bold px-1.5 py-0.5 bg-primary text-primary-foreground tracking-widest"
      >
        推演
      </span>
      <h5 class="text-[15px] md:text-base font-serif font-black text-foreground flex items-center justify-between gap-3">
        <span>{{ node.title }}</span>
        <span class="text-[12px] text-muted-foreground/70 font-normal shrink-0">非史实</span>
      </h5>
      <p class="text-[15px] font-serif text-muted-foreground leading-relaxed mt-2 font-textbook-body">
        {{ node.narrative }}
      </p>
      <button
        v-if="hasAnyChildren() && !expanded"
        type="button"
        class="mt-3 inline-flex items-center space-x-1.5 text-[13px] font-serif font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer"
        @click="expanded = true"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>再推一步</span>
      </button>

      <!-- B2 请史官续推（叶子/想多要一层时皆可用；服务可用才显示） -->
      <div v-if="llmEnabled()" class="mt-3">
        <button
          v-if="genState === 'idle'"
          type="button"
          class="inline-flex items-center space-x-1.5 text-[13px] font-serif text-muted-foreground hover:text-primary transition-colors cursor-pointer"
          @click="continueInk"
        >
          <PenLine class="w-3.5 h-3.5" />
          <span>请史官续推一步</span>
        </button>
        <span v-else-if="genState === 'loading'" class="inline-flex items-center space-x-1.5 text-[13px] font-serif text-muted-foreground/70">
          <PenLine class="w-3.5 h-3.5 animate-pulse" />
          <span>史官运笔中……</span>
        </span>
        <button
          v-else-if="genState === 'done'"
          type="button"
          class="text-[12px] font-serif text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
          @click="resetGen"
        >收起续推</button>
        <InkOut v-else-if="genState === 'inkout'" compact :retry="continueInk" />
      </div>
    </div>

    <!-- 下层分支：展开时枝条生长 + 卡片错落浮现 -->
    <Transition name="cf-children">
      <div v-if="expanded && (node.children || aiChildren.length)" class="space-y-0">
        <CfBranch
          v-for="(child, ci) in allChildren()"
          :key="child.id"
          :node="child"
          :depth="(depth ?? 0) + 1"
          :ancestry="[...(ancestry ?? []), node.title]"
          class="cf-stagger"
          :style="{ animationDelay: `${ci * 90}ms` }"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 枝条：自父卡底部向下"生长"的朱色虚线，常态缓缓流动（推演仍在延续） */
.cf-branch {
  position: relative;
}
.cf-branch::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background-image: repeating-linear-gradient(
    to bottom,
    color-mix(in srgb, var(--primary) 55%, transparent) 0 6px,
    transparent 6px 12px
  );
  transform-origin: top;
  animation:
    cfLineGrow 0.42s cubic-bezier(0.3, 0.7, 0.3, 1) both,
    cfDashFlow 2.2s linear 0.42s infinite;
}
@keyframes cfLineGrow {
  0% { transform: scaleY(0); }
  100% { transform: scaleY(1); }
}
@keyframes cfDashFlow {
  0% { background-position: 0 0; }
  100% { background-position: 0 12px; }
}

/* 卡片浮现（错落由内联 animationDelay 驱动） */
.cf-stagger .cf-card {
  animation: cfCardIn 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@keyframes cfCardIn {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* 展开容器入场 */
.cf-children-enter-active {
  transition: opacity 0.3s ease;
}
.cf-children-enter-from {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .cf-branch::before {
    animation: none;
    transform: scaleY(1);
  }
  .cf-stagger .cf-card {
    animation: none;
  }
  .cf-children-enter-active {
    transition: none;
  }
}
</style>
