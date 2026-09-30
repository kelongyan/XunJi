/**
 * 一朝一色 · 朝代主题元数据
 * 同时服务三处：CSS token（data-dynasty）、首页 3D 时空长河浮岛、多朝代路由。
 * accent 值与 style.css 中 html[data-dynasty] 的 token 保持一致。
 */
export interface DynastyTheme {
  id: string
  /** 数据文件中的 dynasty 字段值（如 entry.dynasty === '明'） */
  hanzi: string
  /** 卷轴浮岛 / 印章用大字 */
  sealText: string
  years: [number, number]
  span: string
  /** 日读主题色 */
  accent: string
  accentSoft: string
  /** 夜读主题色（提亮） */
  accentNight: string
  /** 浮岛一句话题记 */
  tagline: string
  /** 是否已收录词条（false = 修典中，浮岛不可点击） */
  live: boolean
}

export const dynastyThemes: DynastyTheme[] = [
  {
    id: 'han',
    hanzi: '汉',
    sealText: '大汉',
    years: [-202, 220],
    span: '前202 — 220',
    accent: '#2B2B31',
    accentSoft: '#4A4A55',
    accentNight: '#8E8EA0',
    tagline: '凿空西域 · 独尊儒术',
    live: false
  },
  {
    id: 'tang',
    hanzi: '唐',
    sealText: '大唐',
    years: [618, 907],
    span: '618 — 907',
    accent: '#9A7226',
    accentSoft: '#B98F45',
    accentNight: '#D4AC5B',
    tagline: '万国衣冠 · 鎏金盛世',
    live: true
  },
  {
    id: 'song',
    hanzi: '宋',
    sealText: '大宋',
    years: [960, 1279],
    span: '960 — 1279',
    accent: '#4E7D93',
    accentSoft: '#6E9CB0',
    accentNight: '#8FB8CA',
    tagline: '雨过天青 · 文治风华',
    live: true
  },
  {
    id: 'ming',
    hanzi: '明',
    sealText: '大明',
    years: [1368, 1644],
    span: '1368 — 1644',
    accent: '#A8352A',
    accentSoft: '#C75B4A',
    accentNight: '#C9564A',
    tagline: '洪武开基 · 甲申国变',
    live: true
  },
  {
    id: 'qing',
    hanzi: '清',
    sealText: '大清',
    years: [1636, 1912],
    span: '1636 — 1912',
    accent: '#2F4E6E',
    accentSoft: '#4A6E8E',
    accentNight: '#7FA3C4',
    tagline: '康乾鼎盛 · 三千年变局',
    live: false
  }
]

export const defaultDynasty = dynastyThemes.find(d => d.id === 'ming')!

/** 数据文件的 dynasty 字段（'明' / '明朝' 等）→ 主题 id */
export function dynastyIdFromHanzi(hanzi: string | undefined): string {
  if (!hanzi) return defaultDynasty.id
  const hit = dynastyThemes.find(d => hanzi.startsWith(d.hanzi))
  return hit ? hit.id : defaultDynasty.id
}

export function getDynastyTheme(id: string): DynastyTheme {
  return dynastyThemes.find(d => d.id === id) ?? defaultDynasty
}
