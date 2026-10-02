/**
 * 问典 · 本地 RAG 问答
 *
 * 链路：MiniSearch 检索 top-k 词条（本地、零网络）→ 词条文本喂模型
 * 生成史官口吻回答 → 答案下挂站内引用卡（点卡直达词条，可溯源）。
 * 检索与引用全部来自站内静态数据，模型只做"转述与组织"，不凭空作答。
 */
import MiniSearch from 'minisearch'
import { allHistoryEntries, getEntryById } from '../data'
import { createChatStream, llmEnabled, MODEL_FAST } from '../services/llm'
import { askPrompt } from '../services/prompts'
import type { ChatMessage } from '../services/llm'

export interface WenPassage {
  id: string
  name: string
  dynasty: string
  /** 喂给模型的目录摘要 */
  text: string
}
/** 模块级索引（全站一份） */
let mini: MiniSearch | null = null

function ensureIndex(): MiniSearch {
  if (mini) return mini
  mini = new MiniSearch({
    fields: ['name', 'summary', 'background', 'interpretation', 'aliases', 'tags'],
    storeFields: ['id', 'name', 'dynasty', 'summary'],
    searchOptions: {
      boost: { name: 3, aliases: 2, tags: 2, summary: 1, background: 0.5 },
      prefix: true,
      fuzzy: 0.2
    }
  })
  mini.addAll(allHistoryEntries)
  return mini
}

/** 检索 top-k 卷目（中文长句做 2-gram 扩充，MiniSearch 对连续中文无空格分词召回差——实测踩坑） */
export function retrieve(question: string, k = 4): WenPassage[] {
  const trimmed = question.trim()
  if (!trimmed) return []
  const idx = ensureIndex()

  // 中文 2-gram 扩充：取问句中的关键片段，提升 BM25 命中
  const han = trimmed.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  const grams = new Set<string>()
  for (let i = 0; i + 2 <= han.length; i++) grams.add(han.slice(i, i + 2))
  const expanded = [...grams].slice(0, 12).join(' ')
  const query = han.length <= 4 ? trimmed : `${trimmed} ${expanded}`

  const hits = idx.search(query).slice(0, k)
  const out: WenPassage[] = hits.map(h => {
    const e = getEntryById(h.id)
    if (!e) return null
    return {
      id: e.id,
      name: e.name,
      dynasty: e.dynasty,
      text: e.summary.slice(0, 420)
    }
  }).filter((passage): passage is WenPassage => Boolean(passage))
  return out.filter(p => p.text.length > 40)
}

/* ── 回答模式 ── */

export interface WenAnswer {
  /** 引用卷目（渲染引用卡） */
  passages: WenPassage[]
  /** 生成方式：ai / replay / unavailable */
  source: 'ai' | 'replay' | 'unavailable'
  /** 是否服务可用（不可用时界面显示翰墨未启态） */
  available: boolean
}

/** 判断服务可用性（界面决定是否显示问典入口） */
export function wenAvailable(): boolean {
  return llmEnabled()
}

/** 生成回答（流式）。onDelta 收增量；解析所据卷目映射到引用卡。 */
export async function askWen(
  question: string,
  onDelta: (s: string) => void,
  opts: { replayText?: string; signal?: AbortSignal } = {}
): Promise<{ source: 'ai' | 'replay' }> {
  const passages = retrieve(question)
  if (!passages.length) {
    // 站内无相关卷目：直接告知，不硬答
    onDelta('卷中未载——站内现收汉、唐、宋、明、清五朝，此问所涉或尚未修入，可换个问法再试。')
    return { source: 'ai' }
  }
  const messages: ChatMessage[] = askPrompt({ question, passages })
  let full = ''
  await createChatStream(messages, d => {
    full += d
    onDelta(d)
  }, { model: MODEL_FAST, maxTokens: 900, signal: opts.signal, replayText: opts.replayText })
  return { source: opts.replayText ? 'replay' : 'ai' }
}

/** 从回答文本尾行解析「——据《A》《B》」所据卷目 → 引用卡数据 */
export function extractCitations(answer: string, passages: WenPassage[]): WenPassage[] {
  const m = answer.match(/——据(.+)$/)
  if (!m) return passages.slice(0, 3)
  const cited = passages.filter(p => m[1].includes(p.name))
  return cited.length ? cited : passages.slice(0, 3)
}
/** 测试辅助：不触发网络的结构化生成（回放文本） */
export async function askWenReplay(question: string, replayText: string, onDelta: (s: string) => void): Promise<void> {
  await askWen(question, onDelta, { replayText })
}
