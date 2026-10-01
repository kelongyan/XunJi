/**
 * 殿试三题 · 出题器
 *
 * 题目从编年长卷数据（timelines.ts）自动生成：
 * - 题干 = 某事件的 gist（史事要义）+ 年份提示，问"此事为何"
 * - 正确项 = 该事件 title；干扰项 = 同朝代其他事件 title（按长度/独特性过滤，防"一眼假"）
 * - 同一题干随机洗牌选项；全流程纯本地、可复现（seed 控制）。
 *
 * 数据诚信：全部题目与答案均来自站内静态数据，不含任何编造史实。
 */
import { dynastyTimelines, type TimelineEventItem } from '../data/timelines'

export interface ExamQuestion {
  /** 题干（gist + 年份提示） */
  stem: string
  /** 年份原文（显示用） */
  year: string
  /** 朝代 id（主题色联动） */
  dynastyId: string
  /** 四个选项（已洗牌） */
  options: string[]
  /** 正确项在 options 中的下标 */
  answer: number
  /** 解析（事件 title + desc 截断） */
  note: string
  /** 关联词条（答后"展开此卷"跳转） */
  entryId?: string
}

export interface ExamPaper {
  questions: ExamQuestion[]
  /** 试卷标识（当日种子，刷新重考可换题） */
  seed: number
}

/** 朝代 id 列表（与 Timeline availableIds 一致） */
const DYNASTY_IDS = ['han', 'tang', 'song', 'ming', 'qing'] as const

/** 确定性伪随机（mulberry32）：同 seed 同题序，便于测试与"再考一卷"换题 */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 洗牌（Fisher-Yates，带随机源） */
function shuffled<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * gist 可出题性过滤：太短（信息量不足）或与 title 高度重合（题干泄底）的跳过。
 * 阈值按现有数据调校：gist ≥ 22 字且与 title 的公共子串不过长。
 */
function isQuizable(item: TimelineEventItem): boolean {
  if (item.gist.length < 22) return false
  // title 里的关键短语若在 gist 中原样出现，题干就泄底了——排除
  const t = item.title.replace(/[·\s]/g, '')
  const g = item.gist.replace(/[「」·\s]/g, '')
  if (g.includes(t)) return false
  // title 前 4 字出现在 gist 开头也算泄底（如"文景之治"）
  if (g.startsWith(t.slice(0, 4))) return false
  return true
}

/** 生成一份殿试试卷：三题，跨朝代抽题（每题不同朝代优先） */
export function generateExamPaper(seed = Date.now()): ExamPaper {
  const rnd = mulberry32(seed)
  const questions: ExamQuestion[] = []

  // 各朝代可出题池
  const pools = DYNASTY_IDS
    .map(id => ({ id, items: (dynastyTimelines[id] ?? []).filter(isQuizable) }))
    .filter(p => p.items.length >= 2) // 至少 2 条才能凑出干扰项

  // 抽题顺序：朝代洗牌，尽量三题异朝；不足则同朝补位
  const dynastyOrder = shuffled(pools.map(p => p.id), rnd)
  const chosen: Array<{ dynastyId: string; item: TimelineEventItem }> = []
  const usedTitles = new Set<string>()

  for (const dynId of dynastyOrder) {
    if (chosen.length >= 3) break
    const pool = pools.find(p => p.id === dynId)!
    const candidates = shuffled(pool.items, rnd).filter(it => !usedTitles.has(it.title))
    const pick = candidates[0]
    if (!pick) continue
    usedTitles.add(pick.title)
    chosen.push({ dynastyId: dynId, item: pick })
  }
  // 三题不满（数据异常兜底）：允许同朝代再抽
  if (chosen.length < 3) {
    for (const pool of pools) {
      if (chosen.length >= 3) break
      for (const it of shuffled(pool.items, rnd)) {
        if (usedTitles.has(it.title)) continue
        usedTitles.add(it.title)
        chosen.push({ dynastyId: pool.id, item: it })
        break
      }
    }
  }

  for (const { dynastyId, item } of chosen) {
    // 干扰项：同朝代其余 title，按长度接近度排序取优（长度接近更迷惑）
    const pool = dynastyTimelines[dynastyId] ?? []
    const distractors = pool
      .filter(it => it.title !== item.title && it.gist.length >= 18)
      .map(it => ({ it, d: Math.abs(it.title.length - item.title.length) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .map(x => x.it.title)
    const picked = distractors.slice(0, 3)
    if (picked.length < 3) continue // 干扰项不足，放弃此题（数据量足够时不会发生）

    const options = shuffled([item.title, ...picked], rnd)
    questions.push({
      stem: item.gist,
      year: item.year,
      dynastyId,
      options,
      answer: options.indexOf(item.title),
      note: `${item.title} —— ${item.desc.length > 72 ? item.desc.slice(0, 72) + '……' : item.desc}`,
      entryId: item.entryId
    })
  }

  return { questions, seed }
}

/* ── 功名评定 ── */

export interface RankResult {
  rank: string
  /** 印章文字（2 字） */
  seal: string
  /** 评语（史官腔） */
  comment: string
}

/** 0=落第 1=秀才 2=举人 3=进士 4=状元（三题全对） */
const RANKS: RankResult[] = [
  { rank: '落第', seal: '再读', comment: '此卷尚生，长河漫漫，且再展读几卷，来科再试。' },
  { rank: '秀才', seal: '秀才', comment: '初入门径，已识长河流向。功名尚远，志学可期。' },
  { rank: '举人', seal: '举人', comment: '颇有史识，脉络分明。再进一步，可望甲科。' },
  { rank: '进士', seal: '进士', comment: '通晓五朝大务，答问有条不紊。金榜题名，实至名归。' },
  { rank: '状元', seal: '状元', comment: '三问皆中，才思如长河奔涌。殿试头名，天下扬名！' }
]

export function rankOf(correct: number): RankResult {
  return RANKS[Math.max(0, Math.min(4, correct))]
}

/** localStorage：历史最高功名（0-4） */
const RANK_KEY = 'xunji-exam-best'

export function readBestRank(): number {
  try {
    const v = localStorage.getItem(RANK_KEY)
    const n = v ? Number(v) : -1
    return Number.isInteger(n) ? n : -1
  } catch {
    return -1
  }
}

export function saveBestRank(correct: number): number {
  const best = Math.max(readBestRank(), correct)
  try {
    localStorage.setItem(RANK_KEY, String(best))
  } catch { /* 隐私模式等场景静默 */ }
  return best
}
