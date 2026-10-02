/**
 * 数据一致性审计：检查 relations.targetId 与 timelines.entryId 是否都指向真实词条。
 *
 * 用法：node tools/audit-relations.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'src/data')
const ENTRY_FILES = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']

const ids = new Set()
for (const f of ENTRY_FILES) {
  const s = fs.readFileSync(path.join(DATA, f), 'utf8').replace(/\r\n/g, '\n')
  for (const m of s.matchAll(/id:\s*["']([^"']+)["']/g)) ids.add(m[1])
}
console.log(`合法词条 id：${ids.size} 个\n`)

let totalRel = 0
const badRel = []

for (const f of ENTRY_FILES) {
  const s = fs.readFileSync(path.join(DATA, f), 'utf8').replace(/\r\n/g, '\n')
  const blocks = s.split(/\n  \{\n/).slice(1)
  for (const b of blocks) {
    const idm = b.match(/id:\s*["']([^"']+)["']/)
    if (!idm) continue
    const owner = idm[1]
    const nameM = b.match(/name:\s*["']([^"']+)["']/)
    for (const t of b.matchAll(/targetId:\s*["']([^"']+)["']/g)) {
      totalRel++
      if (!ids.has(t[1])) badRel.push({ file: f, ownerName: nameM?.[1] ?? owner, target: t[1] })
    }
  }
}

console.log(`relations 总数：${totalRel}｜坏链接：${badRel.length}`)
for (const b of badRel) console.log(`  ✗ ${b.file}　「${b.ownerName}」 → ${b.target}`)

const tl = fs.readFileSync(path.join(DATA, 'timelines.ts'), 'utf8')
const tlLinks = [...tl.matchAll(/entryId:\s*["']([^"']+)["']/g)]
const tlBad = tlLinks.filter(m => !ids.has(m[1]))
console.log(`\n长卷节点 entryId 总数：${tlLinks.length}｜坏链接：${tlBad.length}`)
for (const m of tlBad) console.log('  ✗ → ' + m[1])
if (badRel.length || tlBad.length) process.exitCode = 1
