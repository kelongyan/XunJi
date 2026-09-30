<script setup lang="ts">
/**
 * 首访三步引导（3D 长河 onboarding，对标诗云式步进卡）。
 * 每台设备只出现一次（localStorage xunji-guide-seen）。
 */
import { computed, ref } from 'vue'
import { ScrollText, Move3d, MousePointerClick } from 'lucide-vue-next'
import SealStamp from './SealStamp.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const steps = [
  {
    icon: ScrollText,
    title: '每座卷轴，是一个朝代',
    desc: '汉、唐、宋、明、清五座卷轴沿河排布——已修典的三卷，可以进入。'
  },
  {
    icon: Move3d,
    title: '拖动环视 · 滚轮推近',
    desc: '镜头属于你。拖动转向，滚轮沿河推近，像撑一支竹篙顺流而下。'
  },
  {
    icon: MousePointerClick,
    title: '点击卷轴启程',
    desc: '点击明朝卷轴，进入那个朝代的颜色；空白处的墨点里，也藏着一叶史册——试试点墨捞史。'
  }
]

const step = ref(0)
const isLast = computed(() => step.value === steps.length - 1)

function next() {
  if (isLast.value) close()
  else step.value++
}

function close() {
  localStorage.setItem('xunji-guide-seen', '1')
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="guide-fade">
      <div v-if="modelValue" class="fixed inset-0 z-[70] flex items-center justify-center bg-background/45 backdrop-blur-[2px]" @click.self="close">
        <div class="guide-pop border-wenwu bg-card/95 shadow-lg px-8 md:px-10 py-8 max-w-md mx-6 text-center relative">
          <div class="absolute -top-4 -right-3">
            <SealStamp text="启程" class="seal-stamp-sm" />
          </div>
          <div class="text-[11px] font-mono text-muted-foreground tracking-[0.3em] mb-3">{{ step + 1 }} / {{ steps.length }}</div>
          <component :is="steps[step].icon" class="w-7 h-7 mx-auto text-primary mb-3" />
          <h3 class="text-xl font-serif font-black text-foreground tracking-wide">{{ steps[step].title }}</h3>
          <p class="text-xs md:text-[13px] font-serif text-muted-foreground leading-relaxed mt-3 font-textbook-body">
            {{ steps[step].desc }}
          </p>
          <div class="flex items-center justify-center gap-1.5 my-5">
            <span
              v-for="(_, i) in steps"
              :key="i"
              class="w-1.5 h-1.5 rounded-full transition-colors"
              :class="i === step ? 'bg-primary' : 'bg-border'"
            ></span>
          </div>
          <div class="flex items-center justify-center gap-3">
            <button
              type="button"
              class="text-xs font-serif text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-3 py-1.5"
              @click="close"
            >
              跳过
            </button>
            <button
              type="button"
              class="px-7 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-serif tracking-widest text-sm font-bold transition-transform active:scale-95 cursor-pointer"
              @click="next"
            >
              {{ isLast ? '开卷寻迹' : '下一步' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
