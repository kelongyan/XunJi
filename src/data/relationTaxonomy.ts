/**
 * 关系族归一化（关系图谱数据层）
 *
 * 背景：全站 relations[].type 由多批内容流水线生成，共 408 种，其中 302 种仅出现 1 次，
 * 无法直接用于视觉编码。此处以「有序规则」将其收敛为 10 大关系族：
 * 视觉层只对族做编码（线色/线型），原始 type 保留，hover 时展示原文。
 *
 * 规则顺序敏感（先匹配先归类）：亲缘 → 君臣 → 对立 → 师友 → 因果 → 制度 → 军事 → 文典 → 类比 → 关涉兜底。
 * 兜底族「关涉」收容参与/相关类泛词与历史长尾（如「殿试开创」「随扈被俘」）。
 */

export type RelationFamily =
  | 'kindred'
  | 'liege'
  | 'rival'
  | 'ally'
  | 'causal'
  | 'institut'
  | 'martial'
  | 'cultural'
  | 'analogy'
  | 'connect'

export interface RelationFamilyMeta {
  id: RelationFamily
  /** 图例中文名 */
  label: string
  /** 视觉线型（图谱渲染用） */
  line: 'solid' | 'dashed' | 'dotted'
  /** 日读线色（星图边 / 图例同源） */
  hue: string
  /** 夜读线色（灯火提亮） */
  hueNight: string
  /** 图例说明 */
  note: string
}

/** 关系族元数据（顺序即图例展示顺序；色值为星图边色唯一来源） */
export const RELATION_FAMILIES: RelationFamilyMeta[] = [
  { id: 'liege', label: '君臣', line: 'solid', hue: '#a8705e', hueNight: '#cf8a70', note: '君臣知遇 · 辅臣部将' },
  { id: 'causal', label: '因果时序', line: 'solid', hue: '#9a9288', hueNight: '#c0b8ab', note: '前因后果 · 背景影响' },
  { id: 'rival', label: '对立', line: 'dashed', hue: '#b4634f', hueNight: '#e08066', note: '政敌党争 · 弹劾构陷' },
  { id: 'ally', label: '师友同侪', line: 'solid', hue: '#6f8496', hueNight: '#93b0c6', note: '同僚师承 · 并称举荐' },
  { id: 'cultural', label: '文化典籍', line: 'solid', hue: '#7d9282', hueNight: '#a0c2ac', note: '典籍修撰 · 思想渊源' },
  { id: 'analogy', label: '历史类比', line: 'dotted', hue: '#a08c66', hueNight: '#c9b184', note: '相似事件 · 史鉴对照' },
  { id: 'institut', label: '制度政制', line: 'solid', hue: '#968468', hueNight: '#bda684', note: '制度变法 · 赋役选官' },
  { id: 'kindred', label: '亲缘', line: 'solid', hue: '#a8705e', hueNight: '#cf8a70', note: '父子帝系 · 婚姻册封' },
  { id: 'martial', label: '军事外交', line: 'solid', hue: '#96705c', hueNight: '#bd917a', note: '战役讨伐 · 会盟和议' },
  { id: 'connect', label: '关涉', line: 'solid', hue: '#a8a092', hueNight: '#c6bdae', note: '参与关联 · 综合牵涉' }
]

/** 关系族日读色速查（渲染层用） */
export const RELATION_HUE: Record<RelationFamily, string> = Object.fromEntries(
  RELATION_FAMILIES.map(f => [f.id, f.hue])
) as Record<RelationFamily, string>

/** 关系族夜读色速查（渲染层用） */
export const RELATION_HUE_NIGHT: Record<RelationFamily, string> = Object.fromEntries(
  RELATION_FAMILIES.map(f => [f.id, f.hueNight])
) as Record<RelationFamily, string>

/** 有序规则表（先匹配先归类） */
const RULES: Array<[RelationFamily, RegExp]> = [
  ['kindred', /^父|^母|父子|祖孙|叔侄|兄弟|后妃|婚姻|姻亲|宗室|妻|驸马|亲族|家族|帝系|继统之侄|储君|继位之君|继承者|后继之君|先祖|父亲|养子|亲属|承盟之君|亡国之君|治世之君|舅甥/],
  ['liege', /君臣|君主|帝王|皇帝|天子|臣属|臣下|臣僚|旧主|部将|麾下|主君|效忠|辅臣|主仆|谋主|赏识|知遇|平反对象|夺位之始|缔造者|创立者|推行者|决策者|主持者|颁布者|诏修者|敕修|创始关系|王朝开创者|转折人物|制度重塑者|制度推行|制度源头|制度建设|施政榜样|主政推行|推行|颁行者|献策|主持签订|主持|伯乐与被举者/],
  ['rival', /政敌|敌对|仇|对立|反对|弹劾|构陷|倾轧|诬|叛逆|对抗|僭|篡|夺位|平叛|镇压|讨伐|受害者|败亡|内部矛盾|政争|乱政|党争|受累|政见相左|相左|纠举|争|迫害对象|雪耻之志|抗元人物|清洗/],
  ['ally', /同僚|并称|好友|交游|交谊|门生|弟子|师生|师承|学生|幕僚|举荐|引荐|推荐|同门|同事|同年|同党|联盟|合作|推崇|仰慕|后继|传承|承续|倚重|政治支持|支持|同朝大臣|同期将帅|阵营|同型|同乡挚友/],
  ['causal', /前因|后果|因果|导致|后续|影响|背景|起因|导火索|缘起|伏笔|渊源|源流|母体|基础|前提|结果|映照|先例|参照|借鉴|镜鉴|承继|关联|相关|后续事件|历史渊源|直接回应|促成|沿袭|奠基|依托|前史|时代底色|时代|时期|由盛转衰|盛极而衰|转折|见证|善后之策|历史动因|事件因应|后世回响|后世流变|后世效仿|历史镜|文明载体/],
  ['institut', /制度|体制|官制|法|政策|改革|变法|举措|赋役|财政|军制|选官|吏治|典章|机构|政务|政制|职官|进身之阶|登第|殿试开创|文官来源|政治动员/],
  ['martial', /战|役|军事|征|北伐|防御|守|攻|围|兵变|会盟|和议|结盟|外交|朝贡|海防|平定|殉国|将帅|随扈被俘|亲历事件|亲历|亲历实录/],
  ['cultural', /典籍|著作|文献|史学|思想|学术|文学|诗|理学|儒学|学说|史书|记载|主修|编撰|编纂|收录|成书|取资|原型|史料|素材|口述|亲撰|主编|体例|传播|内容对象|主角|案件|案例|集大成|改编|史籍考辨|事迹见载|学统流变|后学继承|精神感召|身后从祀|身后追祀|主持修撰|史评比拟/],
  ['analogy', /类比|相似|同类|对照|呼应|复现|历史镜像|史鉴类比|治世并称|并称对比|同为/]
]

/** 将原始关系 type 归类到关系族（含兜底，永不失败） */
export function classifyRelation(rawType: string | undefined): RelationFamily {
  if (!rawType) return 'connect'
  for (const [family, re] of RULES) {
    if (re.test(rawType)) return family
  }
  return 'connect'
}

/** 关系族元数据速查 */
export const RELATION_FAMILY_META: Record<RelationFamily, RelationFamilyMeta> = Object.fromEntries(
  RELATION_FAMILIES.map(f => [f.id, f])
) as Record<RelationFamily, RelationFamilyMeta>
