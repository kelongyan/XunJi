import { dynastyIdFromHanzi } from './dynastyThemes'
import { historyCatalog } from './catalog'
import type { HistoryEntryCatalog } from '../types/history'

export const allHistoryEntries: HistoryEntryCatalog[] = historyCatalog

const entryById = new Map<string, HistoryEntryCatalog>(allHistoryEntries.map(entry => [entry.id, entry]))
const entriesByType = new Map<string, HistoryEntryCatalog[]>()
const entriesByDynasty = new Map<string, HistoryEntryCatalog[]>()
const reverseRelations = new Map<string, string[]>()

for (const entry of allHistoryEntries) {
  const byType = entriesByType.get(entry.type) ?? []
  byType.push(entry)
  entriesByType.set(entry.type, byType)

  const dynastyId = dynastyIdFromHanzi(entry.dynasty)
  const byDynasty = entriesByDynasty.get(dynastyId) ?? []
  byDynasty.push(entry)
  entriesByDynasty.set(dynastyId, byDynasty)

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

/** 按朝代 id 取词条（汉/唐/宋/明/清）。 */
export function getEntriesByDynasty(dynastyId: string): HistoryEntryCatalog[] {
  return entriesByDynasty.get(dynastyId) ?? []
}

/** 返回指向该词条的反向关系，用于详情页关联推荐。 */
export function getIncomingRelatedEntries(id: string): string[] {
  return reverseRelations.get(id) ?? []
}
