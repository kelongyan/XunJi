/**
 * 寻迹 · 内容锻造炉（content-forge）
 *
 * 读选题清单 → 调大模型（OpenAI 兼容接口）按 HistoryEntry schema 生成词条 → 校验 → 落盘 JSON。
 * 生成结果需人工复核后再合入 src/data/。
 *
 * 用法：
 *   node tools/content-forge/forge.mjs --topics=tools/content-forge/topics/ming-events.json [--out=dir] [--concurrency=2] [--limit=3]
 *
 * 凭据：优先读环境变量 LLM_KEY，其次读 tools/content-forge/.env（该文件不入库）。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')

function loadEnvFile() {
  const p = path.join(ROOT, 'tools/content-forge/.env')
  if (!fs.existsSync(p)) return {}
  const out = {}
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const fileEnv = loadEnvFile()
const BASE = process.env.LLM_BASE ?? fileEnv.LLM_BASE ?? ''
const KEY = process.env.LLM_KEY ?? fileEnv.LLM_KEY ?? ''
const MODEL = process.env.LLM_MODEL ?? fileEnv.LLM_MODEL ?? 'your-model-name'

if (!KEY) {
  console.error('✗ 缺少凭据：请设置环境变量 LLM_KEY，或创建 tools/content-forge/.env')
  process.exit(1)
}

const opts = {}
for (const a of process.argv.slice(2)) {
  const [k, ...rest] = a.replace(/^--/, '').split('=')
  opts[k] = rest.join('=')
}
if (!opts.topics) {
  console.error('用法: node tools/content-forge/forge.mjs --topics=<清单文件> [--out=dir] [--concurrency=2] [--limit=N]')
  process.exit(1)
}

const topicsFile = path.resolve(ROOT, opts.topics)
const outDir = path.resolve(ROOT, opts.out ?? 'tools/content-forge/out')
const concurrency = Number(opts.concurrency ?? 2)
const limit = opts.limit ? Number(opts.limit) : Infinity

fs.mkdirSync(outDir, { recursive: true })

/** 词条数据文件：relations.targetId 只允许指向这些文件里的真实词条 id */
const ENTRY_FILES = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']

/** 已收录词条 id：既用于去重，也作为 relations.targetId 的白名单 */
function collectExistingIds() {
  const ids = []
  for (const f of ENTRY_FILES) {
    const p = path.join(ROOT, 'src/data', f)
    if (!fs.existsSync(p)) continue
    const s = fs.readFileSync(p, 'utf8')
    for (const m of s.matchAll(/id:\s*["']([^"']+)["']/g)) ids.push(m[1])
  }
  return [...new Set(ids)]
}

const existingIds = collectExistingIds()

const SYSTEM = `你是「寻迹」中国历史知识库的专职史官撰稿人，为面向大众的中国历史学习网站撰写正式词条。

【写作要求】
1. 读者是想了解中国历史的普通人，不是考生、不是专业研究者。要把「发生了什么、为什么会发生、留下了什么影响」讲透。
2. 语言雅正凝练，以现代汉语为主，可带少量史书韵味；不堆砌文言，不故作高深，不写空话套话。
3. 严禁教材栏目腔与空洞评语：「研读」「一手史料」「延伸思考」「历史纵横」「考点」「知识点」「标志性意义」「具有重大历史意义」「值得我们深思」等一律不得出现。
4. 史实以正史为准。年份、人名、地名、官职、数字必须准确无误。
5. 若史实存在学术争议，客观陈述主流观点，不武断下结论。
6. 每个段落都要有具体的人、事、时间、地点、制度、数字，拒绝泛泛而谈。
7. 全部使用简体中文。`

function buildUser(topic) {
  return `请为下列词条撰写完整内容。

【词条信息】
名称：${topic.name}
朝代：${topic.dynasty}
类型：${topic.type}（event=历史事件 / figure=人物 / emperor=帝王 / classic=典籍 / system=典章制度）
年代：${topic.era ?? ''}${topic.year ? `（${topic.year} 年）` : ''}
核心要点：${topic.hint}

【输出结构（严格 JSON，字段全部保留）】
{
  "id": "小写拼音连字符，如 duomen-zhibian",
  "type": "${topic.type}",
  "name": "${topic.name}",
  "pinyin": "全拼小写，不含连字符与空格，如 kongyinan",
  "aliases": ["别名别称，没有就空数组"],
  "dynasty": "${topic.dynasty}",
  "era": "年号纪年，如「景泰八年」",
  "year": { "start": ${topic.year ?? 0} },
  "summary": "概述，160-220 字，一段，讲清事件本身与历史地位",
  "background": "时代背景与起因，220-320 字",
  "chapters": [
    { "heading": "小标题，4-10 字，有文采", "paragraphs": ["正文段落", "正文段落"] }
  ],
  "interpretation": "史学解读，180-260 字，讲透深层逻辑与长远影响，不说空话",
  "timeline": [{ "year": 数字或年号字符串, "event": "事件节点" }],
  "relations": [{ "targetId": "白名单中的 id", "name": "词条名", "type": "关系类型", "note": "一句话说明关系" }],
  "quotes": [{ "text": "正史原文", "source": "《明史·某某传》" }],
  "sources": ["参考正史 2-4 部"],
  "tags": ["标签 4-6 个"]
}

【硬性要求】
- chapters 至少 3 节，每节 2-3 段，每段 130-260 字，正文总字数不少于 1300 字。
- timeline 至少 5 个节点，按时间先后排列；若事件集中于同一年，用月份或情节推进加以区分。
- relations 写 2-4 条，targetId 必须从下面这份已收录 id 白名单中挑选真实相关者（不得杜撰 id）：
${existingIds.join('、')}
- quotes 写 1-3 条，必须是正史中真实存在的原文。**若你不确定原文，请直接返回空数组 []，绝对不要编造。**
- 时间信息优先用公元年份给你参考，但行文中年号纪年与公元并存，符合中国史书写习惯。
- **JSON 字符串内部禁止出现英文双引号（"）**：需要引用时一律用中文引号「」或书名号《》，否则 JSON 会解析失败。

只输出 JSON 本体：不要 markdown 代码块标记，不要任何解释性文字。`
}

function extractJson(raw) {
  let t = String(raw ?? '').trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('响应中未找到 JSON 对象')
  return JSON.parse(t.slice(start, end + 1))
}

/** 带重试的生成：模型偶发输出非法 JSON（多为字符串内英文引号未转义），重试通常可成功 */
async function generateWithRetry(topic, attempts = 3) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      const raw = await callApi(topic)
      return extractJson(raw)
    } catch (e) {
      lastErr = e
      if (i < attempts) await new Promise(r => setTimeout(r, 1200))
    }
  }
  throw lastErr
}

function validate(entry) {
  const errs = []
  if (!entry?.id || !/^[a-z0-9-]+$/.test(entry.id)) errs.push('id 缺失或格式非法')
  if (existingIds.includes(entry.id)) errs.push(`id 与已收录词条重复：${entry.id}`)
  if (!entry?.name) errs.push('name 缺失')
  if (!entry?.summary || entry.summary.length < 80) errs.push('summary 过短')
  if (!Array.isArray(entry?.chapters) || entry.chapters.length < 3) errs.push('chapters 少于 3 节')
  const bodyLen = (entry?.chapters ?? [])
    .flatMap(c => c?.paragraphs ?? [])
    .join('')
    .length
  if (bodyLen < 900) errs.push(`正文过短（${bodyLen} 字）`)
  if (!Array.isArray(entry?.sources) || entry.sources.length < 1) errs.push('缺少 sources')
  const badRel = (entry?.relations ?? []).filter(r => !existingIds.includes(r?.targetId))
  if (badRel.length) errs.push(`relations 含未收录 id：${badRel.map(r => r.targetId).join(',')}`)
  return { errs, bodyLen }
}

async function callApi(topic) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUser(topic) }
      ],
      temperature: 0.8,
      max_tokens: 32000
    })
  })
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300)
    throw new Error(`HTTP ${res.status} — ${body}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

async function main() {
  let topics = JSON.parse(fs.readFileSync(topicsFile, 'utf8'))
  if (opts.only) {
    const names = String(opts.only)
      .split(/[,，]/)
      .map(s => s.trim())
      .filter(Boolean)
    topics = topics.filter(t => names.includes(t.name))
  }
  topics = topics.slice(0, limit)
  console.log(`选题：${path.basename(topicsFile)}｜待生成 ${topics.length} 条｜并发 ${concurrency}｜模型 ${MODEL}`)
  console.log(`已收录 id 白名单：${existingIds.length} 个\n`)

  let done = 0
  const queue = [...topics]
  const stats = { ok: 0, warn: 0, fail: 0 }

  const worker = async () => {
    while (queue.length) {
      const topic = queue.shift()
      const tag = `[${String(++done).padStart(2)}/${topics.length}] ${topic.name}`
      try {
        const entry = await generateWithRetry(topic)
        if (typeof entry?.pinyin === 'string') {
          entry.pinyin = entry.pinyin.replace(/[-\s·]/g, '').toLowerCase()
        }
        const { errs, bodyLen } = validate(entry)
        fs.writeFileSync(path.join(outDir, `${entry.id}.json`), JSON.stringify(entry, null, 2), 'utf8')
        if (errs.length) {
          stats.warn++
          console.log(`${tag} ⚠ ${entry.id}｜正文 ${bodyLen} 字｜${errs.join('；')}`)
        } else {
          stats.ok++
          console.log(`${tag} ✓ ${entry.id}｜正文 ${bodyLen} 字`)
        }
      } catch (e) {
        stats.fail++
        console.log(`${tag} ✗ ${e.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  console.log(`\n完成 → ${path.relative(ROOT, outDir)}｜成功 ${stats.ok}｜告警 ${stats.warn}｜失败 ${stats.fail}`)
}

main()
