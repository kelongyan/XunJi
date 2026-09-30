<script setup lang="ts">
/**
 * 时空推演面板：列出本朝可推演事件，展开反事实分叉长卷。
 * 全部内容为预置推演卷宗（非史实），右上角朱印常驻标注。
 */
import { computed, ref } from 'vue'
import { History as HistoryIcon, ChevronDown, ChevronUp } from 'lucide-vue-next'
import SealStamp from '../common/SealStamp.vue'
import CfBranch from './CfBranch.vue'
import { counterfactualTrees } from '../../data/counterfactuals'
import { getDynastyTheme } from '../../data/dynastyThemes'

const props = defineProps<{
  dynasty: string
}>()

const trees = computed(() => counterfactualTrees.filter(t => t.dynasty === props.dynasty))
const theme = computed(() => getDynastyTheme(props.dynasty))
const expandedId = ref<string | null>(null)

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <section class="border-wenwu-primary p-7 md:p-9 bg-card/75 shadow-sm relative overflow-hidden">
    <!-- 朱印水印 -->
    <div class="absolute right-5 top-5 opacity-90">
      <SealStamp text="推演非史实" class="seal-stamp-sm" />
    </div>

    <div class="flex items-center space-x-2.5 pb-3.5 mb-5 border-b-2 border-border/80 pr-24">
      <span class="w-2.5 h-2.5 bg-primary"></span>
      <h3 class="text-lg font-textbook-title text-foreground tracking-wide">时空推演 · 反事实长卷</h3>
    </div>

    <p class="text-xs font-serif text-muted-foreground leading-relaxed mb-6 max-w-2xl">
      以下卷宗为<strong class="text-foreground">反事实历史推演</strong>：从史实的某个岔口出发，沿另一条路径推想历史的走向。实线为史实，朱色虚线为推演——推演不是史实，但读懂岔口，才读懂历史。
    </p>

    <div v-if="trees.length === 0" class="text-center py-10 border border-dashed border-border/70 bg-background/40">
      <p class="font-serif text-sm text-muted-foreground">「{{ theme.hanzi }}」朝的推演卷宗尚在修撰，敬请期待。</p>
    </div>

    <div v-else class="space-y-5">
      <div v-for="tree in trees" :key="tree.id" class="border border-border/70 bg-background/50">
        <!-- 收起态：卷宗题签 -->
        <button
          type="button"
          class="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-primary/5 transition-colors cursor-pointer"
          @click="toggle(tree.id)"
        >
          <div class="flex items-center space-x-3 min-w-0">
            <HistoryIcon class="w-4 h-4 text-primary shrink-0" />
            <div class="min-w-0">
              <div class="text-xs font-serif text-muted-foreground">推演卷宗 · 由「{{ tree.seedEventTitle }}」岔出</div>
              <div class="text-sm md:text-base font-serif font-black text-foreground truncate">{{ tree.question }}</div>
            </div>
          </div>
          <component :is="expandedId === tree.id ? ChevronUp : ChevronDown" class="w-4 h-4 text-muted-foreground shrink-0" />
        </button>

        <!-- 展开态：史实主干 + 分叉长卷 -->
        <div v-if="expandedId === tree.id" class="px-5 pb-6 pt-2 border-t border-border/60">
          <!-- 史实主干（实线） -->
          <div class="border-l-4 border-l-muted-foreground/40 bg-card/70 p-4 mt-3">
            <span class="text-[10px] font-serif font-bold px-1.5 py-0.5 bg-muted-foreground/20 text-muted-foreground tracking-widest">史实</span>
            <p class="text-xs md:text-[13px] font-serif text-foreground/85 leading-relaxed mt-2">{{ tree.reality }}</p>
          </div>
          <!-- 分叉起点 -->
          <div class="mt-5 flex items-center space-x-3">
            <span class="w-2.5 h-2.5 bg-primary rotate-45"></span>
            <span class="text-xs font-serif font-bold dynasty-accent-text tracking-widest">自此处岔出 · 沿另一条路推想</span>
          </div>
          <CfBranch :node="tree.root" class="mt-3" />
        </div>
      </div>
    </div>
  </section>
</template>
