import type { HistoryEntry } from '../types/history'
import { emperors } from './emperors'
import { figures } from './figures'
import { events } from './events'
import { classicsAndSystems } from './classics-systems'
import { tangEntries } from './tang'
import { songEntries } from './song'
import { hanEntries } from './han'
import { qingEntries } from './qing'

export const allHistoryEntries: HistoryEntry[] = [
  ...emperors,
  ...figures,
  ...events,
  ...classicsAndSystems,
  ...tangEntries,
  ...songEntries,
  ...hanEntries,
  ...qingEntries
]

export function getEntryById(id: string): HistoryEntry | undefined {
  return allHistoryEntries.find(entry => entry.id === id)
}

export function getEntriesByType(type: string): HistoryEntry[] {
  if (!type || type === 'all') return allHistoryEntries
  return allHistoryEntries.filter(entry => entry.type === type)
}

/** 按朝代取词条（唐/宋/明专题数据切片） */
export function getEntriesByDynasty(dynastyId: string): HistoryEntry[] {
  return allHistoryEntries.filter(entry => {
    const hanzi = dynastyId === 'tang' ? '唐' : dynastyId === 'song' ? '宋' : dynastyId === 'ming' ? '明' : ''
    return hanzi !== '' && entry.dynasty.startsWith(hanzi)
  })
}
