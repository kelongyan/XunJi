import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const files = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']

let refs = 0
const missing = []
const byDynasty = {}

for (const f of files) {
  const c = fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')
  for (const m of c.matchAll(/src:\s*["'](\/images\/entries\/[^"']+)["']/g)) {
    refs++
    const rel = m[1]
    const abs = path.join(ROOT, 'public', rel)
    const dynasty = rel.split('/')[3] || 'unknown'
    byDynasty[dynasty] = (byDynasty[dynasty] || 0) + 1
    if (!fs.existsSync(abs)) {
      missing.push(`${f} -> ${rel}`)
    } else if (fs.statSync(abs).size < 1000) {
      missing.push(`${f} -> ${rel} (文件过小)`)
    }
  }
}

console.log('======================================')
console.log(`数据中图片引用总数: ${refs}`)
console.log(`缺失/异常文件数: ${missing.length}`)
console.log('各朝代分布:', JSON.stringify(byDynasty))
console.log('======================================')
for (const x of missing) console.log('  ✗ ' + x)
if (!missing.length) console.log('✔ 全部图片引用均指向真实有效的文件')
if (missing.length) process.exitCode = 1

// 统计磁盘上的资产
const entriesDir = path.join(ROOT, 'public/images/entries')
let pngCount = 0
let webpCount = 0
let webpBytes = 0
for (const d of fs.readdirSync(entriesDir)) {
  const dp = path.join(entriesDir, d)
  if (!fs.statSync(dp).isDirectory()) continue
  for (const f of fs.readdirSync(dp)) {
    if (f.endsWith('.png')) pngCount++
    if (f.endsWith('.webp')) {
      webpCount++
      webpBytes += fs.statSync(path.join(dp, f)).size
    }
  }
}
console.log(`磁盘资产: PNG ${pngCount} 张 | WebP ${webpCount} 张 | WebP 合计 ${(webpBytes / 1024 / 1024).toFixed(1)} MB`)
