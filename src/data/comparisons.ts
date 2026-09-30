/**
 * 朝代对读 · 预置对读卷宗（跨朝代词条双栏对照 + 史官合论）
 */
export interface ComparisonItem {
  id: string
  title: string
  /** 对读主题一句话 */
  theme: string
  aEntryId: string
  bEntryId: string
  /** 对读维度标签 */
  dimension: string
  /** 史官合论（预写） */
  verdict: string
}

export const comparisons: ComparisonItem[] = [
  {
    id: 'compare-fiscal-reform',
    title: '王安石变法 与 一条鞭法',
    theme: '两场财政改革，隔着四百年的回声',
    aEntryId: 'wanganshi-bianfa',
    bEntryId: 'yitiaobian-fa',
    dimension: '赋役改革谱系',
    verdict:
      '史臣曰：熙宁青苗欲以官府信贷夺兼并之利，一条鞭欲以折银代役顺白银之势——一者逆势而创制，一者顺势而收编。安石之败在官僚机器反噬新法，居正之成在白银经济水到渠成。读此二案可知：改革成败不在设计之精，而在是否顺着社会经济的水性行船。'
  },
  {
    id: 'compare-emperor-captured',
    title: '靖康之变 与 土木堡之变',
    theme: '两位被掳天子，两种国运走向',
    aEntryId: 'jingkang-zhibian',
    bEntryId: 'tumu-zhi-bian',
    dimension: '君主被掳之鉴',
    verdict:
      '史臣曰：徽钦北狩而宋室南渡偏安，英宗北狩而明室立景泰死守——同是天子陷虏，一退一进，国运遂判。靖康之后宋弃中原如弃敝屣，土木之后明守北京如守命脉。危局之解不在兵之多寡，在庙堂有无死守之志：于谦一人，抵得半壁江山。'
  },
  {
    id: 'compare-civil-order',
    title: '科举制 与 重文轻武',
    theme: '文官政治的一体两面',
    aEntryId: 'keju-zhi',
    bEntryId: 'zhongwen-qingwu',
    dimension: '文治制度',
    verdict:
      '史臣曰：科举开入仕之门，重文定用文之局，二者相济而成士大夫政治——宋之文明冠绝古今者赖此，宋之武备积弱不振者亦赖此。制度如药，同方而效异：用于承平则为栋梁，临于强敌则成掣肘。读史者当思其两面，不可执一而论。'
  }
]
