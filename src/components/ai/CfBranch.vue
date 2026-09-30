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
  <div :class="depth ? 'mt-4 pl-5 border-l-2 border-dashed border-primary/40' : ''">
    <div class="border-wenwu border-l-4 border-l-primary/70 bg-card/80 p-4 md:p-5 shadow-sm relative">
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

    <!-- 下层分支 -->
    <div v-if="expanded && node.children" class="space-y-0">
      <CfBranch v-for="child in node.children" :key="child.id" :node="child" :depth="(depth ?? 0) + 1" />
    </div>
  </div>
</template>
