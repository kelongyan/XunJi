/**
 * 把 content-forge 产出的 JSON 合入 src/data/*.ts
 *
 * 用法：
 *   node tools/content-forge/merge.mjs            # 合入 out/ 下全部 JSON
 *   node tools/content-forge/merge.mjs --dry      # 只预览，不写文件
 *   node tools/content-forge/merge.mjs --dir=tools/content-forge/out
 *
 * 安全策略：
 *   - 已存在同 id 的条目自动跳过（不覆盖既有内容）
 *   - 写入前把原文件备份为 .bak
 *   - 只追加到数组末尾，不改动既有条目
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const opts = {}
for (const a of process.argv.slice(2)) {
  const [k, ...r] = a.replace(/^--/, '').split('=')
  opts[k] = r.join('=') || true
}
const outDir = path.resolve(ROOT, opts.dir ?? 'tools/content-forge/out')
const dry = Boolean(opts.dry)

/** dynasty:type → 目标文件 */
const TARGETS = {
  '明:event': 'events.ts',
  '明:figure': 'figures.ts',
  '明:emperor': 'emperors.ts',
  '明:classic': 'classics-systems.ts',
  '明:system': 'classics-systems.ts',
  '唐:event': 'tang.ts',
  '唐:figure': 'tang.ts',
  '唐:emperor': 'tang.ts',
  '唐:classic': 'tang.ts',
  '唐:system': 'tang.ts',
  '宋:event': 'song.ts',
  '宋:figure': 'song.ts',
  '宋:emperor': 'song.ts',
  '宋:classic': 'song.ts',
  '宋:system': 'song.ts',
  '汉:event': 'han.ts',
  '汉:figure': 'han.ts',
  '汉:emperor': 'han.ts',
  '汉:classic': 'han.ts',
  '汉:system': 'han.ts',
  '清:event': 'qing.ts',
  '清:figure': 'qing.ts',
  '清:emperor': 'qing.ts',
  '清:classic': 'qing.ts',
  '清:system': 'qing.ts'
}

/** 读取数据文件并统一行尾（git 在工作区会转成 CRLF，正则需按 LF 处理） */
function readData(file) {
  const p = path.join(ROOT, 'src/data', file)
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
}

function existingIdsOf(file) {
  return new Set([...readData(file).matchAll(/id:\s*["']([^"']+)["']/g)].map(m => m[1]))
}

/** 全部词条 id（6 个词条文件），用于校验与修正 relations */
const ALL_ENTRY_IDS = (() => {
  const ids = new Set()
  for (const f of ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']) {
    if (!fs.existsSync(path.join(ROOT, 'src/data', f))) continue
    for (const m of readData(f).matchAll(/id:\s*["']([^"']+)["']/g)) ids.add(m[1])
  }
  return ids
})()

/**
 * 救回模型写错的 targetId：忽略连字符差异做匹配。
 * 例：模型写 jingnan-zhi-yi，真实 id 是 jingnan-zhiyi → 归正。
 * 匹配不上则返回 null（调用方剔除该条关联）。
 */
function normalizeTargetId(id) {
  if (!id) return null
  if (ALL_ENTRY_IDS.has(id)) return id
  const stripped = String(id).replace(/-/g, '')
  for (const real of ALL_ENTRY_IDS) {
    if (real.replace(/-/g, '') === stripped) return real
  }
  return null
}

/** JSON 对象 → 缩进 2 空格的 TS 字面量（键名去引号，与项目既有风格一致，也让 id 正则可匹配） */
function toTs(obj) {
  const json = JSON.stringify(obj, null, 2).replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, '$1$2:')
  return json
    .split('\n')
    .map(l => '  ' + l)
    .join('\n')
}

/** 在数组闭合前插入新条目（保留文件其余部分不动） */
function appendToArray(file, entries) {
  const p = path.join(ROOT, 'src/data', file)
  const text = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
  const closeIdx = text.lastIndexOf('\n]')
  if (closeIdx === -1) throw new Error(`${file} 未找到数组闭合标记`)

  const head = text.slice(0, closeIdx)
  const tail = text.slice(closeIdx)
  let h = head.replace(/\s+$/, '')
  // 空数组（以 [ 结尾）不能补逗号，否则会产生数组空洞（undefined 元素）
  if (!h.endsWith(',') && !h.endsWith('[')) h += ','

  const block = '\n' + entries.map(toTs).join(',\n')
  const out = h + block + tail

  if (!dry) {
    fs.writeFileSync(p + '.bak', text, 'utf8')
    fs.writeFileSync(p, out, 'utf8')
  }
  return out
}

function main() {
  if (!fs.existsSync(outDir)) {
    console.error(`✗ 目录不存在：${outDir}`)
    process.exit(1)
  }

  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.json'))
  if (!files.length) {
    console.error('✗ out/ 下没有可合入的 JSON')
    process.exit(1)
  }

  const buckets = new Map()
  const skipped = []

  for (const f of files) {
    let entry
    try {
      entry = JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8'))
    } catch (e) {
      skipped.push(`${f}（JSON 解析失败）`)
      continue
    }
    const key = `${entry.dynasty}:${entry.type}`
    const target = TARGETS[key]
    if (!target) {
      skipped.push(`${f}（无映射规则：${key}）`)
      continue
    }
    if (!buckets.has(target)) buckets.set(target, [])
    buckets.get(target).push(entry)
  }

  console.log(`待合入 ${files.length} 个文件${dry ? '（预览模式，不写盘）' : ''}\n`)

  for (const [file, entries] of buckets) {
    const exist = existingIdsOf(file)
    const bodyLen = e => (e.chapters ?? []).flatMap(c => c.paragraphs ?? []).join('').length

    // 同名保护：同一篇目可能因多次生成而出现不同 id，只保留正文较长的那版
    const byName = new Map()
    for (const e of entries) {
      if (exist.has(e.id)) {
        skipped.push(`${file} 已有同 id，跳过：${e.id}`)
        continue
      }
      const prev = byName.get(e.name)
      if (prev) {
        const keep = bodyLen(e) > bodyLen(prev) ? e : prev
        byName.set(e.name, keep)
        skipped.push(`${e.name} 存在多个版本（${prev.id} / ${e.id}），保留正文较长的 ${keep.id}`)
      } else {
        byName.set(e.name, e)
      }
    }
    const fresh = [...byName.values()]

    // 修正 relations：救回连字符差异导致的错 id，剔除确实无效的关联
    let fixedRel = 0
    let droppedRel = 0
    for (const e of fresh) {
      if (!Array.isArray(e.relations)) continue
      e.relations = e.relations
        .map(r => {
          const fixed = normalizeTargetId(r.targetId)
          if (!fixed) {
            droppedRel++
            return null
          }
          if (fixed !== r.targetId) fixedRel++
          return { ...r, targetId: fixed }
        })
        .filter(Boolean)
    }
    if (fixedRel || droppedRel) {
      console.log(`  ↳ relations 自愈：救回 ${fixedRel} 条，剔除无效 ${droppedRel} 条`)
    }

    if (!fresh.length) {
      console.log(`· ${file}: 无可新增条目`)
      continue
    }
    const chars = fresh.reduce(
      (n, e) => n + (e.chapters ?? []).flatMap(c => c.paragraphs ?? []).join('').length,
      0
    )
    appendToArray(file, fresh)
    console.log(`✓ ${file}: 新增 ${fresh.length} 条｜正文合计 ${chars} 字`)
  }

  if (skipped.length) {
    console.log('\n跳过：')
    for (const s of skipped) console.log('  - ' + s)
  }
}

main()
