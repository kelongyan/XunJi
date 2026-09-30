import MiniSearch from 'minisearch'
import { pinyin } from 'pinyin-pro'
import { ref } from 'vue'
import { allHistoryEntries } from '../data'
import type { HistoryEntry } from '../types/history'

export function useSearch() {
  const isReady = ref(false)
  
  // 建立 MiniSearch 索引
  const miniSearch = new MiniSearch<HistoryEntry>({
    fields: ['name', 'summary', 'interpretation', 'pinyin', 'aliases', 'tags'],
    storeFields: ['id', 'name', 'type', 'dynasty', 'era', 'summary', 'roles', 'tags', 'pinyin'],
    searchOptions: {
      boost: { name: 3, aliases: 2, tags: 2, summary: 1 },
      prefix: true,
      fuzzy: 0.2
    }
  })

  // 载入索引数据
  miniSearch.addAll(allHistoryEntries)
  isReady.value = true

  function search(query: string, filterType?: string): HistoryEntry[] {
    const trimmed = query.trim()
    if (!trimmed) {
      if (!filterType || filterType === 'all') return allHistoryEntries
      return allHistoryEntries.filter(item => item.type === filterType)
    }

    // 拼音首字母与全拼模糊检索增强
    const pinyinQuery = pinyin(trimmed, { toneType: 'none', type: 'array' }).join('')
    
    const results = miniSearch.search(trimmed)
    let matchedIds = new Set(results.map(r => r.id))

    // 补充拼音首字母匹配
    allHistoryEntries.forEach(entry => {
      if (entry.pinyin.includes(pinyinQuery) || (entry.aliases && entry.aliases.some(a => a.includes(trimmed)))) {
        matchedIds.add(entry.id)
      }
    })

    const matchedEntries = allHistoryEntries.filter(entry => matchedIds.has(entry.id))

    if (!filterType || filterType === 'all') {
      return matchedEntries
    }
    return matchedEntries.filter(entry => entry.type === filterType)
  }

  return {
    isReady,
    search
  }
}
