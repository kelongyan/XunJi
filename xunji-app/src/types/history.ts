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
  kind: 'vase' | 'codex' | 'armillary' | 'ship'
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
  location?: string
  impact?: string
  image?: HistoryImage
  /** 器物 3D 展台 */
  relic?: RelicInfo
  /** 史家朱批（页边竖排批语，静态评点 / 后续 AI 批语共用） */
  comment?: string
}
