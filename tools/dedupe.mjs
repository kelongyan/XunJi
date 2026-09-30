/**
 * 数据文件去重 + 键名规范化。
 *
 * 用途：清理合入过程可能造成的重复词条，并把 JSON 风格的 "key": 统一成项目风格的 key:
 *
 * 用法：
 *   node tools/dedupe.mjs --dry src/data/events.ts
 *   node tools/dedupe.mjs src/data/events.ts
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const files = args.filter(a => !a.startsWith('--'))

if (!files.length) {
  console.error('用法: node tools/dedupe.mjs [--dry] <数据文件...>')
  process.exit(1)
}

for (const rel of files) {
  const p = path.isAbsolute(rel) ? rel : path.join(ROOT, rel)
  const text = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

  const open = text.indexOf('= [')
  const close = text.lastIndexOf('\n]')
  if (open === -1 || close === -1) {
    console.log(`✗ ${rel}：未识别数组结构`)
    continue
  }

  const head = text.slice(0, open + 3)
  const body = text.slice(open + 3, close)
  const tail = text.slice(close)

  // 保留条目原有的 2 空格缩进（不可 trim，否则会破坏缩进层级）
  const blocks = [...body.matchAll(/\n  \{[\s\S]*?\n  \}/g)].map(m => m[0].replace(/^\n/, ''))
  if (!blocks.length) {
    console.log(`✗ ${rel}：未解析到条目`)
    continue
  }

  const seen = new Set()
  const kept = []
  let removed = 0

  for (const raw of blocks) {
    const normalized = raw.replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, '$1$2:')
    const m = normalized.match(/\bid\s*:\s*["']([^"']+)["']/)
    const id = m ? m[1] : null
    if (id && seen.has(id)) {
      removed++
      continue
    }
    if (id) seen.add(id)
    kept.push(normalized)
  }

  const out = head + '\n' + kept.join(',\n') + tail
  console.log(`${rel}：${blocks.length} → ${kept.length} 条（去重 ${removed}）${dry ? ' [预览]' : ''}`)
  if (!dry) fs.writeFileSync(p, out, 'utf8')
}
