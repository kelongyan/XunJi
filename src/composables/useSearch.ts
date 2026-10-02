import MiniSearch from 'minisearch'
import { allHistoryEntries, getEntryById } from '../data'
import type { HistoryEntryCatalog } from '../types/history'

const miniSearch = new MiniSearch<HistoryEntryCatalog>({
    fields: ['name', 'summary', 'pinyin', 'initials', 'aliases', 'tags'],
    // 命中后全部经 getEntryById 回表取数，store 只需存 id
    storeFields: ['id'],
    searchOptions: {
      boost: { name: 3, aliases: 2, tags: 2, summary: 1 },
      prefix: true,
      fuzzy: 0.2
    }
})

miniSearch.addAll(allHistoryEntries)

export function useSearch() {

  function search(query: string, filterType?: string): HistoryEntryCatalog[] {
    const trimmed = query.trim()
    if (!trimmed) {
      if (!filterType || filterType === 'all') return allHistoryEntries
      return allHistoryEntries.filter(item => item.type === filterType)
    }

    const results = miniSearch.search(trimmed)
    let matchedIds = new Set(results.map(r => r.id))

    // 补充拼音首字母匹配
    allHistoryEntries.forEach(entry => {
    if (
      entry.pinyin.includes(trimmed.toLowerCase()) ||
      entry.initials.startsWith(trimmed.toLowerCase()) ||
      (entry.aliases && entry.aliases.some(a => a.includes(trimmed)))
    ) {
        matchedIds.add(entry.id)
      }
    })

    const matchedEntries = [...matchedIds]
      .map(id => getEntryById(id))
      .filter((entry): entry is HistoryEntryCatalog => Boolean(entry))

    if (!filterType || filterType === 'all') {
      return matchedEntries
    }
    return matchedEntries.filter(entry => entry.type === filterType)
  }

  return {
    search
  }
}
