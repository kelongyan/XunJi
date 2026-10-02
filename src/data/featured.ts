/**
 * 运营位收口：此前 zhang-juzheng 作为「今日一史」/默认检索词/兜底 id 硬编码散布在
 * Home / EntryDetail / WenPanel 等处，换运营位要改多处且文案双写漂移。统一从本模块取。
 */
export const FEATURED_ENTRY_ID = 'zhang-juzheng'

/** 检索框为空时点「考索文脉」的默认检索词 */
export const DEFAULT_SEARCH_KEYWORD = '张居正'

/** 今日词条卡片的一句话导语（刻意精炼，与正文 summary 分工；换词条须同步改写） */
export const FEATURED_BLURB = '字叔大，号太岳，湖广江陵人。万历朝内阁首辅、明代杰出改革家。'
