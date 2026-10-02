export type EntryType = 'emperor' | 'figure' | 'event' | 'classic' | 'system'

export interface Chapter {
  heading: string
  paragraphs: string[]
}

export interface TimelineNode {
  year: number | string
  era?: string
  event: string
}

export interface Relation {
  targetId: string
  name?: string
  type: string
  note?: string
}

export interface Quote {
  text: string
  source: string
}

export interface HistoryImage {
  src: string
  caption: string
  source?: string
}

/** 器物 3D 展台引用（RelicViewer 程序化器物） */
export interface RelicInfo {
  kind: 'vase' | 'codex' | 'armillary' | 'ship' | 'typecase'
  name: string
  caption: string
}

export interface HistoryEntry {
  id: string
  type: EntryType
  name: string
  pinyin: string
  aliases?: string[]
  dynasty: string
  era?: string
  lifespan?: {
    birth?: number
    death?: number
  }
  year?: {
    start: number
    end?: number
  }
  roles?: string[]
  summary: string
  background?: string
  chapters: Chapter[]
  interpretation: string
  timeline?: TimelineNode[]
  relations?: Relation[]
  quotes?: Quote[]
  sources: string[]
  tags: string[]
  image?: HistoryImage
  /** 器物 3D 展台 */
  relic?: RelicInfo
  /** 史家朱批（页边竖排批语，静态评点 / 后续 AI 批语共用） */
  comment?: string
}

/** 首页、检索与图谱使用的轻量词条目录：不含长篇正文，也不含
 *  interpretation/timeline/quotes/sources（这四项在懒加载扩展包，见 generate-catalog.mjs）。 */
export type HistoryEntryCatalog = Pick<
  HistoryEntry,
  | 'id'
  | 'type'
  | 'name'
  | 'pinyin'
  | 'aliases'
  | 'dynasty'
  | 'era'
  | 'lifespan'
  | 'year'
  | 'roles'
  | 'summary'
  | 'relations'
  | 'tags'
  | 'image'
  | 'relic'
  | 'comment'
> & { initials: string; detailSource: DetailSource }

/** 目录扩展包记录（catalog-ext.ts，懒加载）：问典 RAG 与今日词条专用 */
export interface CatalogExtRecord {
  /** 深度解读（构建期截 420 字；详情页用的是全量词条完整版） */
  interpretation?: string
  quotes?: Quote[]
  sources?: string[]
}

/** 史册残页池条目（chronicle.ts，懒加载） */
export interface ChronicleItem {
  year: number | string
  event: string
  entryId: string
  entryName: string
}

export type DetailSource =
  | 'emperors'
  | 'figures'
  | 'events'
  | 'classics-systems'
  | 'tang'
  | 'song'
  | 'han'
  | 'qing'
