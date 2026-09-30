import { ref } from 'vue'

/**
 * 寻迹足迹与钤印藏书（localStorage 持久化，模块级单例响应式）。
 * 足迹 = 浏览过的词条（最近在前，上限 12）；
 * 藏书 = 钤印收藏的词条（详情页盖私人藏书印）。
 */
const FOOTPRINT_KEY = 'xunji-footprints'
const COLLECT_KEY = 'xunji-collections'
const MAX_ITEMS = 12

export interface FootprintItem {
  id: string
  ts: number
}

function read(key: string): FootprintItem[] {
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? (JSON.parse(raw) as FootprintItem[]) : []
    return Array.isArray(list) ? list.filter(x => x && typeof x.id === 'string') : []
  } catch {
    return []
  }
}

function write(key: string, list: FootprintItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_ITEMS)))
  } catch {
    /* 存储不可用时静默 */
  }
}

const footprints = ref<FootprintItem[]>(read(FOOTPRINT_KEY))
const collections = ref<FootprintItem[]>(read(COLLECT_KEY))

export function useFootprint() {
  /** 记录一次到访：去重置顶 */
  function record(id: string) {
    if (!id) return
    const rest = footprints.value.filter(x => x.id !== id)
    footprints.value = [{ id, ts: Date.now() }, ...rest].slice(0, MAX_ITEMS)
    write(FOOTPRINT_KEY, footprints.value)
  }

  /** 钤印 / 取消收藏，返回钤印后的状态 */
  function toggleCollect(id: string): boolean {
    const has = collections.value.some(x => x.id === id)
    if (has) {
      collections.value = collections.value.filter(x => x.id !== id)
    } else {
      collections.value = [{ id, ts: Date.now() }, ...collections.value].slice(0, MAX_ITEMS)
    }
    write(COLLECT_KEY, collections.value)
    return !has
  }

  function isCollected(id: string): boolean {
    return collections.value.some(x => x.id === id)
  }

  return { footprints, collections, record, toggleCollect, isCollected }
}
