<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { ExternalLink } from 'lucide-vue-next'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import SealStamp from '../components/common/SealStamp.vue'
import CounterfactualPanel from '../components/ai/CounterfactualPanel.vue'
import { dynastyTimelines } from '../data/timelines'
import { dynastyThemes, getDynastyTheme, defaultDynasty } from '../data/dynastyThemes'

const route = useRoute()
const router = useRouter()

const availableIds = ['tang', 'song', 'ming']
const currentId = computed(() => {
  const q = route.query.dynasty as string
  return availableIds.includes(q) ? q : 'ming'
})
const theme = computed(() => getDynastyTheme(currentId.value))
const events = computed(() => dynastyTimelines[currentId.value] ?? [])
const years = computed(() => theme.value.years[1] - theme.value.years[0])

const summaries: Record<string, string> = {
  tang: '大唐二百八十九年，在政治上完成三省六部与科举取士的制度定型，在文明气象上兼容并蓄、万国来朝；开元极盛与安史断裂之间，蕴含着古代王朝由盛转衰最深刻的一组因果关系。',
  song: '赵宋三百一十九年，以重文轻武换来内部百年安定与文治巅峰，也以强干弱枝埋下武力不振的病根；从陈桥兵变到崖山蹈海，一条「文明与安全如何兼得」的主线贯穿始终。',
  ming: '明代二百七十六年间，在政治体制上完成自唐宋中书门下省制向明清高度皇权垄断内阁制的质变；在经济体制上一条鞭法开赋役折银之先河，为晚明江南商品经济繁荣提供了法制基础。万历新政与张居正身后政局变迁之间，蕴含着深刻的内在联系。'
}

watch(
  () => currentId.value,
  id => {
    document.documentElement.dataset.dynasty = id
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  document.documentElement.dataset.dynasty = defaultDynasty.id
})

function selectDynasty(id: string) {
  if (!availableIds.includes(id)) return
  router.replace({ query: { ...route.query, dynasty: id } })
}
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between">
    <div>
      <TextbookHeader folio="088" :subChapter="`${theme.hanzi}朝编年通览 · 经折装时空轴线`" />

      <main class="max-w-7xl mx-auto px-6 py-12">
        <!-- 朝代切换卷签 -->
        <div v-reveal class="flex flex-wrap items-center justify-center gap-3 mb-10">
          <button
            v-for="d in dynastyThemes"
            :key="d.id"
            type="button"
            :disabled="!['tang', 'song', 'ming'].includes(d.id)"
            @click="selectDynasty(d.id)"
            class="px-5 py-2 border-2 text-sm font-serif font-bold tracking-widest transition-colors"
            :class="[
              currentId === d.id
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : ['tang', 'song', 'ming'].includes(d.id)
                  ? 'border-border text-muted-foreground hover:border-primary hover:text-primary bg-background cursor-pointer'
                  : 'border-border/60 text-muted-foreground/50 bg-background/50 cursor-not-allowed'
            ]"
          >
            {{ d.hanzi }}<span v-if="!['tang', 'song', 'ming'].includes(d.id)" class="text-[10px] ml-1 opacity-70">修典中</span>
          </button>
        </div>

        <!-- 长卷说明头 (仿古籍文武双线框) -->
        <div v-reveal class="border-wenwu p-8 md:p-12 bg-card/75 mb-14 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 shadow-sm">
          <div class="space-y-3">
            <div class="inline-flex items-center space-x-2 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-widest">
              <span>【时空通览 · 经折长卷】</span>
            </div>
            <h1 class="font-textbook-hero text-foreground">{{ theme.hanzi }}朝历史编年通览 ({{ theme.span }})</h1>
            <p class="text-sm md:text-base font-serif text-muted-foreground max-w-2xl leading-relaxed font-textbook-body pt-1">
              {{ theme.tagline }}——公元纪年与帝王年号双轨互见，理顺本朝兴衰的关键脉络。
            </p>
          </div>
          <div class="flex items-center space-x-5 shrink-0 pt-2 md:pt-0">
            <SealStamp :text="theme.sealText" />
            <div class="text-xs font-serif text-muted-foreground text-right border-l-2 border-border/80 pl-4 space-y-1">
              <div class="font-black text-foreground text-sm">国祚 {{ years }} 年</div>
              <div class="tracking-wider">编年大事总表</div>
              <div class="text-[10px] dynasty-accent-text font-bold">收录词条 {{ events.length }} 事</div>
            </div>
          </div>
        </div>

        <!-- 编年时间轴（朝代切换时内容淡入替换） -->
        <Transition name="fade-swap" mode="out-in">
          <div :key="currentId" class="space-y-16 relative before:absolute before:inset-0 before:left-8 before:w-0.5 before:bg-border md:before:left-1/2">
          <div
            v-for="(ev, idx) in events"
            :key="ev.title"
            v-reveal
            class="relative flex flex-col md:flex-row items-center justify-between group"
          >
            <!-- 左侧内容 (偶数行文 / 奇数行要义) -->
            <div
              v-if="idx % 2 === 0"
              class="md:w-5/12 text-left md:text-right pr-0 md:pr-12 pl-16 md:pl-0 space-y-2"
            >
              <span class="text-xs font-mono font-bold dynasty-accent-text px-3 py-1 bg-primary/10 border border-primary/20 tracking-wider">
                {{ ev.year }}
              </span>
              <h3 class="text-2xl font-serif font-black text-foreground pt-1">
                <RouterLink v-if="ev.entryId" :to="`/entry/${ev.entryId}`" class="hover:text-primary transition-colors flex items-center md:justify-end space-x-2">
                  <span>{{ ev.title }}</span>
                  <ExternalLink class="w-4 h-4 text-muted-foreground" />
                </RouterLink>
                <span v-else>{{ ev.title }}</span>
              </h3>
              <p class="text-xs md:text-sm font-serif text-muted-foreground leading-relaxed font-textbook-body">
                {{ ev.desc }}
              </p>
            </div>
            <div
              v-else
              class="md:w-5/12 pl-16 md:pl-12 order-2 md:order-1 mt-4 md:mt-0"
            >
              <div class="p-5 bg-card border-wenwu text-xs font-serif text-muted-foreground shadow-sm space-y-1.5">
                <div class="text-foreground font-bold flex items-center space-x-2 text-sm">
                  <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span>史事要义</span>
                </div>
                <p class="leading-relaxed">{{ ev.gist }}</p>
              </div>
            </div>

            <!-- 中心光标圆点（进入视口点亮） -->
            <div class="dot-pop absolute left-8 md:left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-primary border-4 border-background flex items-center justify-center shadow-md">
              <span class="w-2 h-2 rounded-full bg-white"></span>
            </div>

            <!-- 右侧内容 (偶数行要义 / 奇数行文) -->
            <div
              v-if="idx % 2 === 0"
              class="md:w-5/12 pl-16 md:pl-12 mt-4 md:mt-0"
            >
              <div class="p-5 bg-card border-wenwu text-xs font-serif text-muted-foreground shadow-sm space-y-1.5">
                <div class="text-foreground font-bold flex items-center space-x-2 text-sm">
                  <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span>史事要义</span>
                </div>
                <p class="leading-relaxed">{{ ev.gist }}</p>
              </div>
            </div>
            <div
              v-else
              class="md:w-5/12 text-left pl-16 md:pl-12 order-1 md:order-2 space-y-2"
            >
              <span class="text-xs font-mono font-bold dynasty-accent-text px-3 py-1 bg-primary/10 border border-primary/20 tracking-wider">
                {{ ev.year }}
              </span>
              <h3 class="text-2xl font-serif font-black text-foreground pt-1">
                <RouterLink v-if="ev.entryId" :to="`/entry/${ev.entryId}`" class="hover:text-primary transition-colors flex items-center md:justify-end space-x-2">
                  <span>{{ ev.title }}</span>
                  <ExternalLink class="w-4 h-4 text-muted-foreground" />
                </RouterLink>
                <span v-else>{{ ev.title }}</span>
              </h3>
              <p class="text-xs md:text-sm font-serif text-muted-foreground leading-relaxed font-textbook-body">
                {{ ev.desc }}
              </p>
            </div>
          </div>
          </div>
        </Transition>

        <!-- 编年综述板块 -->
        <div v-reveal class="mt-20 p-8 border-wenwu bg-card/75 shadow-sm space-y-3">
          <h4 class="text-base font-textbook-title text-foreground tracking-wide flex items-center space-x-2">
            <span class="text-primary">◆</span>
            <span>编年史事综述</span>
          </h4>
          <p class="text-xs md:text-[14px] font-serif text-muted-foreground leading-loose font-textbook-quote pt-1 border-t border-border/60">
            {{ summaries[currentId] }}
          </p>
        </div>

        <!-- 时空推演（反事实历史，非史实标注） -->
        <CounterfactualPanel v-reveal :dynasty="currentId" class="mt-16" />
      </main>
    </div>

    <!-- 底部版心页码 -->
    <footer class="mt-20 border-t border-border bg-card/40 py-8 text-center text-xs text-muted-foreground font-serif">
      <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>寻迹中国风历史检索系统 · 编年通览长卷</div>
        <div class="textbook-folio font-bold text-foreground/70">· 089 ·</div>
        <div>{{ theme.hanzi }}朝纪年时序知识谱系</div>
      </div>
    </footer>
  </div>
</template>
