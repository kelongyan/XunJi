<script setup lang="ts">
/**
 * 推演分支节点（递归渲染）。
 * 视觉语法：实线灰卡 = 史实，朱色虚线卡 = 推演支线。
 */
import { ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import type { CfNode } from '../../data/counterfactuals'

const props = defineProps<{
  node: CfNode
  depth?: number
}>()

const expanded = ref(false)
const hasChildren = !!props.node.children?.length
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
        v-if="hasChildren && !expanded"
        type="button"
        class="mt-3 inline-flex items-center space-x-1.5 text-[13px] font-serif font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer"
        @click="expanded = true"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>再推一步</span>
      </button>
    </div>

    <!-- 下层分支：展开时枝条生长 + 卡片错落浮现 -->
    <Transition name="cf-children">
      <div v-if="expanded && node.children" class="space-y-0">
        <CfBranch
          v-for="(child, ci) in node.children"
          :key="child.id"
          :node="child"
          :depth="(depth ?? 0) + 1"
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
