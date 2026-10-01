import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const files = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']

/** 复刻 Home.vue 里的图版大观选取算法，验证会展示哪些图 */
const pool = []
for (const f of files) {
  const content = fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')
  const idMatches = [...content.matchAll(/\n  \{\s*\n\s*id:\s*["']([^"']+)["']/g)]
  for (let i = 0; i < idMatches.length; i++) {
    const startIdx = idMatches[i].index
    const endIdx = i + 1 < idMatches.length ? idMatches[i + 1].index : content.lastIndexOf('\n]')
    const block = content.slice(startIdx, endIdx)
    const nameM = block.match(/name:\s*["']([^"']+)["']/)
    const dynastyM = block.match(/dynasty:\s*["']([^"']+)["']/)
    const imgM = block.match(/image:\s*\{[\s\S]*?src:\s*["']([^"']+)["']/)
    const src = imgM ? imgM[1] : null
    if (src && src.endsWith('.webp')) {
      pool.push({ id: idMatches[i][1], name: nameM[1], dynasty: dynastyM[1], src })
    }
  }
}

console.log(`可用图版池总数: ${pool.length}`)

const d = new Date()
const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate()
const byDynasty = new Map()
for (const e of pool) {
  if (!byDynasty.has(e.dynasty)) byDynasty.set(e.dynasty, [])
  byDynasty.get(e.dynasty).push(e)
}
const lists = [...byDynasty.values()].map(list => {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (seed * 9301 + i * 49297) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
})
const picked = []
for (let round = 0; picked.length < 8; round++) {
  let added = false
  for (const l of lists) {
    if (l[round]) {
      picked.push(l[round])
      added = true
      if (picked.length >= 8) break
    }
  }
  if (!added) break
}
const order = ['汉', '唐', '宋', '明', '清']
picked.sort((a, b) => order.indexOf(a.dynasty) - order.indexOf(b.dynasty))

console.log(`\n今日首页「图版大观」将展示以下 ${picked.length} 幅：`)
for (const p of picked) {
  console.log(`  [${p.dynasty}] ${p.name.padEnd(8, '　')} -> ${p.src}`)
}
