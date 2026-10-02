<script setup lang="ts">
/**
 * 修典纪要（/about）：数据来源与编修规范
 *
 * 答辩「数据诚信」环节材料：正史来源清单、修典流水线叙事、
 * 推演非史实声明、引用规范。数字全部取运行时真实值。
 */
import { computed } from 'vue'
import TextbookHeader from '../components/common/TextbookHeader.vue'
import Masthead from '../components/common/Masthead.vue'
import DataBand from '../components/common/DataBand.vue'
import IndexList from '../components/common/IndexList.vue'
import SealStamp from '../components/common/SealStamp.vue'
import { allHistoryEntries, getEntriesByType } from '../data'
import { graphData } from '../data/graph'
import { dynastyTimelines } from '../data/timelines'

/** 各类型词条数（运行时真实计数） */
const typeCounts = computed(() => [
  { label: '帝王本纪', n: getEntriesByType('emperor').length },
  { label: '人物列传', n: getEntriesByType('figure').length },
  { label: '重大事件', n: getEntriesByType('event').length },
  { label: '传世典籍', n: getEntriesByType('classic').length },
  { label: '典章制度', n: getEntriesByType('system').length }
])

/** 引用史料种数（运行时从 sources 字段统计） */
const sourceCount = computed(() => {
  const set = new Set<string>()
  for (const e of allHistoryEntries) {
    for (const s of e.sources ?? []) {
      for (const m of s.matchAll(/《[^》]*》/g)) set.add(m[0])
    }
  }
  return set.size
})

/** 长卷纪事总数 */
const timelineCount = computed(() => Object.values(dynastyTimelines).reduce((n, list) => n + list.length, 0))

/** 数据带（真实计数，数据诚信是底线） */
const stats = computed(() => [
  { value: String(allHistoryEntries.length), label: '收录词条' },
  { value: String(graphData.edges.filter(e => e.kind === 'relation').length), label: '人物关系' },
  { value: String(timelineCount.value), label: '编年纪事' },
  { value: String(sourceCount.value), label: '引用史料（种）' }
])

/** 主要引用史籍（编目式索引） */
const primarySources = [
  { name: '《明史》', note: '清代官修 · 明朝正史主源（张廷玉等奉敕撰）' },
  { name: '《明实录》', note: '明代官方编年史料长编' },
  { name: '《宋史》', note: '元代官修 · 宋朝正史主源（脱脱等奉敕撰）' },
  { name: '《续资治通鉴长编》', note: '李焘 · 北宋编年史巨帙' },
  { name: '《资治通鉴》', note: '司马光 · 编年体通史（汉唐部分主源）' },
  { name: '《旧唐书》《新唐书》', note: '五代与宋代官修 · 唐朝正史双源' },
  { name: '《贞观政要》', note: '吴兢 · 贞观君臣论政专题史料' },
  { name: '《汉书》《后汉书》', note: '汉朝正史前后双源' },
  { name: '《清实录》《清史稿》', note: '清代编年与近代所修正史稿' },
  { name: '沈括《梦溪笔谈》', note: '科技史料（活字印刷最早记载）' }
]
</script>

<template>
  <div class="min-h-screen font-sans text-foreground paper-texture flex flex-col justify-between">
    <div>
      <TextbookHeader folio="101" subChapter="修典纪要 · 数据来源与编修规范" />

      <main class="max-w-[1000px] mx-auto px-6 py-10">
        <!-- 卷头 -->
        <div v-reveal class="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
          <div class="space-y-3">
            <div class="eyebrow">凡例 · 开卷之约</div>
            <h1 class="display-title">修典纪要</h1>
            <p class="text-[15px] font-serif text-muted-foreground max-w-2xl leading-relaxed">
              修典如筑塔，一砖一石皆需有据。此卷记本站数据从何而来、如何编修、何处存疑——把家底摊开给读者看，是史家本分。
            </p>
          </div>
          <SealStamp text="修典" subtext="有据可查" class="seal-drop hidden sm:block shrink-0" />
        </div>

        <!-- 数据带（真实计数） -->
        <DataBand v-reveal="120" :items="stats" class="mb-14" />

        <!-- 编修体例 -->
        <section v-reveal class="mb-14">
          <div class="eyebrow mb-5">编修体例 · 五类分编</div>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-5">
            <div v-for="t in typeCounts" :key="t.label" class="rule pt-3">
              <div class="spec-number !text-[1.7rem]">{{ t.n }}</div>
              <div class="spec-label">{{ t.label }}</div>
            </div>
          </div>
        </section>

        <!-- 修典流水线 -->
        <section v-reveal class="mb-14">
          <div class="eyebrow mb-5">修典流水线 · 一条词条的诞生</div>
          <div class="border-wenwu bg-card/50 p-6 md:p-8">
            <ol class="space-y-4 text-[15px] font-serif leading-relaxed">
              <li class="flex gap-4">
                <span class="index-no shrink-0">一</span>
                <span><strong class="text-foreground">选题定目</strong>：依正史纲目定收录范围，帝王、名臣、大战、大政、大典，宁缺毋滥。</span>
              </li>
              <li class="flex gap-4">
                <span class="index-no shrink-0">二</span>
                <span><strong class="text-foreground">草拟初稿</strong>：本站自建「内容锻造炉」以大模型辅助起草，prompt 限定文体（史传体）与字数，喂入已收录词条白名单防串写。</span>
              </li>
              <li class="flex gap-4">
                <span class="index-no shrink-0">三</span>
                <span><strong class="text-foreground">人工校订</strong>：逐条核对史料原文、年代、职官、地名； AI 草稿只当毛坯，定稿必经人手——史实责任在人不在机器。</span>
              </li>
              <li class="flex gap-4">
                <span class="index-no shrink-0">四</span>
                <span><strong class="text-foreground">关系织网</strong>：为每条词条标注人物关系（{{ graphData.edges.filter(e => e.kind === 'relation').length }} 条，归一为十族），供万卷星图寻脉。</span>
              </li>
              <li class="flex gap-4">
                <span class="index-no shrink-0">五</span>
                <span><strong class="text-foreground">机审坏链</strong>：构建期跑关系审计（audit-relations.mjs），坏链须清零方可入库；当前 <strong class="text-[var(--dynasty-accent)]">0 坏链</strong>。</span>
              </li>
            </ol>
          </div>
        </section>

        <!-- 主要引用史籍 -->
        <section v-reveal class="mb-14">
          <div class="eyebrow mb-2">主要引用史籍 · 编目</div>
          <p class="text-[13px] font-serif text-muted-foreground mb-6">
            全站 {{ sourceCount }} 种史籍引用，此处列十部主干；每条词条页脚均附「史料原文」出处。
          </p>
          <IndexList :items="primarySources.map(s => ({ name: s.name, meta: s.note }))" />
        </section>

        <!-- 三条声明 -->
        <section v-reveal class="space-y-8">
          <div class="pl-5 border-l-2" :style="{ borderColor: 'color-mix(in srgb, var(--dynasty-accent) 45%, transparent)' }">
            <div class="eyebrow mb-2.5">推演 · 非史实（重要声明）</div>
            <p class="text-[15px] font-serif text-muted-foreground leading-loose">
              「时空推演」栏目的反事实推演（如"若土木堡无此败"）为<strong class="text-foreground">思想实验</strong>，非史实，亦非本站立场。全部推演页角均盖"推演 · 非史实"朱印，请与正文严格区分。
            </p>
          </div>
          <div class="pl-5 border-l-2 border-border">
            <div class="eyebrow mb-2.5">器物与针路 · 示意声明</div>
            <p class="text-[15px] font-serif text-muted-foreground leading-loose">
              器物 3D 展台为程序化示意模型（非文物扫描件）；针路图为历史航路的风格化摹本，非精确地理投影。二者皆为帮助理解之示意，不作史料引用。
            </p>
          </div>
          <div class="pl-5 border-l-2 border-border">
            <div class="eyebrow mb-2.5">收录边界</div>
            <p class="text-[15px] font-serif text-muted-foreground leading-loose">
              现收录汉、唐、宋、明、清五朝词条 {{ allHistoryEntries.length }} 条；其余朝代<b class="text-foreground">陆续修典中</b>（站内以"修典中"标注，不以占位数字充数）。计数皆取运行时真实值。
            </p>
          </div>
        </section>
      </main>
    </div>

    <Masthead left="寻迹 · 修典纪要" note="数据来源与编修规范 · 开卷之约" folio="101" />
  </div>
</template>
