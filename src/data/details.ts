import { getEntryById as getCatalogEntryById } from './index'
import type { DetailSource, HistoryEntry } from '../types/history'

type DetailModule = { [key: string]: HistoryEntry[] }

const loaders: Record<DetailSource, () => Promise<DetailModule>> = {
  emperors: () => import('./emperors'),
  figures: () => import('./figures'),
  events: () => import('./events'),
  'classics-systems': () => import('./classics-systems'),
  tang: () => import('./tang'),
  song: () => import('./song'),
  han: () => import('./han'),
  qing: () => import('./qing')
}

const exportNames: Record<DetailSource, string> = {
  emperors: 'emperors',
  figures: 'figures',
  events: 'events',
  'classics-systems': 'classicsAndSystems',
  tang: 'tangEntries',
  song: 'songEntries',
  han: 'hanEntries',
  qing: 'qingEntries'
}

const loadedEntries = new Map<string, HistoryEntry>()
const loadingSources = new Map<DetailSource, Promise<void>>()

async function loadSource(source: DetailSource): Promise<void> {
  if (loadingSources.has(source)) return loadingSources.get(source)!
  const promise = loaders[source]().then(module => {
    for (const entry of module[exportNames[source]] ?? []) loadedEntries.set(entry.id, entry)
  })
  loadingSources.set(source, promise)
  return promise
}

/** Preload the full source module for one catalog entry. */
export async function preloadEntryById(id: string): Promise<HistoryEntry | undefined> {
  const catalogEntry = getCatalogEntryById(id)
  if (!catalogEntry) return undefined
  await loadSource(catalogEntry.detailSource)
  return loadedEntries.get(id)
}

/** Preload several entries that may come from different source modules. */
export async function preloadEntries(ids: string[]): Promise<void> {
  await Promise.all(ids.map(id => preloadEntryById(id)))
}

/** Synchronous lookup after the route/component has preloaded its source. */
export function getEntryById(id: string): HistoryEntry | undefined {
  return loadedEntries.get(id)
}
