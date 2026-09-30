/**
 * 修正 out/ 中非法 id 与文件名。
 *
 * 用途：模型按中文标题直译拼音时可能产出 `tui'enling` 这类含撇号、空格、大写的 id，
 * 会写坏 TS 数据文件。本脚本统一清洗为合法 slug（小写字母数字与连字符）。
 *
 * 用法：node tools/content-forge/fix-ids.mjs [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve(import.meta.dirname, 'out')
const dry = process.argv.includes('--dry')

let fixed = 0
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json')) continue
  const p = path.join(dir, f)
  let obj
  try {
    obj = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    console.log(`✗ ${f}：JSON 解析失败，跳过`)
    continue
  }
  const current = String(obj.id ?? '')
  const clean = current.toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!clean) {
    console.log(`✗ ${f}：id 为空且无法清洗`)
    continue
  }
  if (clean === current && f === clean + '.json') continue

  obj.id = clean
  if (obj.pinyin) obj.pinyin = clean

  console.log(`${f}  →  ${clean}.json`)
  fixed++
  if (!dry) {
    fs.writeFileSync(path.join(dir, clean + '.json'), JSON.stringify(obj, null, 2), 'utf8')
    if (f !== clean + '.json') fs.unlinkSync(p)
  }
}

console.log(`\n${dry ? '[预览] ' : ''}共修正 ${fixed} 个文件`)
