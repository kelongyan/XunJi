import { historyCatalog } from './catalog'
import type { HistoryEntryCatalog } from '../types/history'

export const allHistoryEntries: HistoryEntryCatalog[] = historyCatalog

const entryById = new Map<string, HistoryEntryCatalog>(allHistoryEntries.map(entry => [entry.id, entry]))
const entriesByType = new Map<string, HistoryEntryCatalog[]>()
const reverseRelations = new Map<string, string[]>()

for (const entry of allHistoryEntries) {
  const byType = entriesByType.get(entry.type) ?? []
  byType.push(entry)
  entriesByType.set(entry.type, byType)

  for (const relation of entry.relations ?? []) {
    const incoming = reverseRelations.get(relation.targetId) ?? []
    incoming.push(entry.id)
    reverseRelations.set(relation.targetId, incoming)
  }
}

export function getEntryById(id: string): HistoryEntryCatalog | undefined {
  return entryById.get(id)
}

export function getEntriesByType(type: string): HistoryEntryCatalog[] {
  if (!type || type === 'all') return allHistoryEntries
  return entriesByType.get(type) ?? []
}

/** 返回指向该词条的反向关系，用于详情页关联推荐。 */
export function getIncomingRelatedEntries(id: string): string[] {
  return reverseRelations.get(id) ?? []
}
