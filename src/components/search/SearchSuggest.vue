<script setup lang="ts">
/**
 * 检索联想输入框：输入即下拉建议（名称/别名/标签/拼音首字母），
 * ↑↓ 键盘选择、Enter 直达词条或提交检索、Esc 收起。
 * Home 与 Search 两处共用。
 *
 * 下拉层 Teleport 到 body + fixed 定位：Home 的 Hero 区带 overflow-hidden
 * （3D 长河溢控），内联下拉会被裁到只剩数条；脱离文档流后不再受祖先裁剪。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search as SearchIcon } from 'lucide-vue-next'
import { allHistoryEntries } from '../../data'
import { entryTypeLabel } from '../../data/entryMeta'
import type { HistoryEntryCatalog } from '../../types/history'
import { splitHighlight } from '../../utils/highlight'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    inputClass?: string
  }>(),
  {
    placeholder: '检索历代人物、重大事件、传世典籍、官制兵制…',
    inputClass: ''
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [entry: HistoryEntryCatalog]
  submit: []
}>()

const inputRef = ref<HTMLInputElement>()
const focused = ref(false)
const activeIndex = ref(-1)

/* Teleport 下拉定位：随输入框视口坐标漂移 */
const dropStyle = ref<Record<string, string>>({})
function updateDropPos() {
  const el = inputRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  dropStyle.value = {
    position: 'fixed',
    left: `${r.left}px`,
    top: `${r.bottom + 8}px`,
    width: `${r.width}px`
  }
}
function onViewportChange() {
  if (!showList.value) return
  updateDropPos()
}
onMounted(() => {
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})

const suggestions = computed<HistoryEntryCatalog[]>(() => {
  const q = props.modelValue.trim().toLowerCase()
  if (!q) return []
  const scored: Array<{ entry: HistoryEntryCatalog; score: number }> = []
  for (const entry of allHistoryEntries) {
    let score = 0
    if (entry.name.toLowerCase().includes(q)) score = 5
    else if (entry.aliases?.some(a => a.toLowerCase().includes(q))) score = 4
    else if (entry.tags.some(t => t.toLowerCase().includes(q))) score = 3
    else if (entry.pinyin.startsWith(q)) score = 2
    else if (q.length >= 2 && entry.initials.startsWith(q)) score = 2
    if (score) scored.push({ entry, score: score * 100 - entry.name.length })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(s => s.entry)
})

const showList = computed(() => focused.value && suggestions.value.length > 0)

watch(
  () => props.modelValue,
  () => {
    activeIndex.value = -1
  }
)

/* 联想出现时默认预选第一条：Enter 即直达；同时重算下拉视口坐标 */
watch(showList, visible => {
  if (visible) updateDropPos()
})

/* 联想出现时默认预选第一条：Enter 即直达 */
watch(suggestions, list => {
  activeIndex.value = list.length ? 0 : -1
})

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

function onKeydown(e: KeyboardEvent) {
  if (!suggestions.value.length) {
    if (e.key === 'Enter') emit('submit')
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIndex.value >= 0) doSelect(suggestions.value[activeIndex.value])
    else emit('submit')
  } else if (e.key === 'Escape') {
    activeIndex.value = -1
    inputRef.value?.blur()
  }
}

function doSelect(entry: HistoryEntryCatalog) {
  activeIndex.value = -1
  emit('select', entry)
}
</script>

<template>
  <div class="relative flex-1">
    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground">
      <SearchIcon class="w-5 h-5 text-muted-foreground" />
    </div>
    <input
      ref="inputRef"
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      class="w-full pl-12 pr-4 py-3.5 bg-background/90 border-2 border-border focus:border-primary focus:outline-none text-foreground text-[15px] font-serif placeholder:font-serif placeholder:text-muted-foreground/70 transition-colors shadow-inner"
      :class="inputClass"
      @input="onInput"
      @keydown="onKeydown"
      @focus="focused = true"
      @blur="focused = false"
    />

    <!-- 联想下拉：Teleport 到 body（fixed 定位），不受祖先 overflow-hidden 裁剪 -->
    <Teleport to="body">
      <Transition name="fade-swap">
        <ul
          v-if="showList"
          class="suggest-list z-[80] border border-border bg-card shadow-lg overflow-hidden"
          :style="dropStyle"
          role="listbox"
        >
          <li
            v-for="(entry, i) in suggestions"
            :key="entry.id"
            class="suggest-item px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer"
            :class="i === activeIndex ? 'bg-primary/10' : ''"
            @mousedown.prevent="doSelect(entry)"
            @mousemove="activeIndex = i"
          >
            <span class="text-[15px] font-serif text-foreground truncate">
              <template v-for="(seg, si) in splitHighlight(entry.name, modelValue)" :key="si">
                <span v-if="seg.hit" class="suggest-hit">{{ seg.text }}</span>
                <template v-else>{{ seg.text }}</template>
              </template>
            </span>
            <span class="text-[13px] font-serif text-muted-foreground shrink-0">
              <span class="dynasty-accent-text">{{ entry.dynasty }}</span>
              <span class="mx-1 text-border">/</span>{{ entryTypeLabel(entry.type) }}<template v-if="entry.era"> · {{ entry.era }}</template>
            </span>
          </li>
          <li class="px-4 py-1.5 text-[12px] font-serif text-muted-foreground/70 border-t border-border/60 bg-background/60">
            ↑↓ 选择 · Enter 直达词条 · Esc 收起
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>
