import fs from 'node:fs'

const files = ['emperors', 'figures', 'events', 'classics-systems', 'tang', 'song', 'han', 'qing']
let total = 0

for (const f of files) {
  const s = fs.readFileSync(`src/data/${f}.ts`, 'utf8')
  const items = [
    ...s.matchAll(/id:\s*["']([^"']+)["'][\s\S]{0,220}?type:\s*["']([^"']+)["'][\s\S]{0,220}?name:\s*["']([^"']+)["']/g)
  ]
  const byType = {}
  for (const m of items) byType[m[2]] = (byType[m[2]] || 0) + 1
  total += items.length
  console.log(`\n=== ${f}.ts  (${items.length} 条) ===`)
  console.log('  类型: ' + Object.entries(byType).map(([k, v]) => `${k}:${v}`).join('  '))
  console.log('  ' + items.map(m => `${m[3]}[${m[1]}]`).join('、'))
}

console.log(`\n>>> 全部词条合计: ${total}`)
