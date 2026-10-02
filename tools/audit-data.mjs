/**
 * 统一数据引用审计：重复 ID、目录字段、跨模块引用和派生数据坏链。
 * 用法：node tools/audit-data.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'src/data')
const entryFiles = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']
const textOf = file => fs.readFileSync(path.join(DATA, file), 'utf8').replace(/\r\n/g, '\n')

const ids = new Set()
const duplicates = []
for (const file of entryFiles) {
  for (const match of textOf(file).matchAll(/\bid:\s*["']([^"']+)["']/g)) {
    if (ids.has(match[1])) duplicates.push(`${file} -> ${match[1]}`)
    ids.add(match[1])
  }
}

const bad = []
function checkRefs(file, pattern, label) {
  const source = textOf(file)
  for (const match of source.matchAll(pattern)) {
    if (!ids.has(match[1])) bad.push(`${label}: ${file} -> ${match[1]}`)
  }
}

checkRefs('timelines.ts', /entryId:\s*["']([^"']+)["']/g, 'timeline')
checkRefs('comparisons.ts', /[ab]EntryId:\s*["']([^"']+)["']/g, 'comparison')
checkRefs('counterfactuals.ts', /seedEntryId:\s*["']([^"']+)["']/g, 'counterfactual')
checkRefs('glossary.ts', /entryId:\s*["']([^"']+)["']/g, 'glossary')

const catalog = textOf('catalog.ts')
const catalogIds = [...catalog.matchAll(/"id":\s*"([^"]+)"/g)].map(m => m[1])
const catalogSources = [...catalog.matchAll(/"detailSource":\s*"([^"]+)"/g)].map(m => m[1])
const expectedSources = new Set(entryFiles.map(file => file.replace(/\.ts$/, '')))
const badCatalogSources = catalogSources.filter(source => !expectedSources.has(source))

// 派生文件：史册残页池的 entryId 不得指向不存在的词条
const chronicleBad = []
const chronicleMatch = textOf('chronicle.ts').match(/chroniclePool[^=]*=\s*(\[[\s\S]*\])/)
if (chronicleMatch) {
  for (const node of JSON.parse(chronicleMatch[1])) {
    if (!ids.has(node.entryId)) chronicleBad.push(`chronicle -> ${node.entryId}`)
  }
}

console.log(`词条 ID：${ids.size}｜目录 ID：${catalogIds.length}｜重复 ID：${duplicates.length}`)
console.log(`跨模块坏链：${bad.length}｜目录来源异常：${badCatalogSources.length}｜残页池坏链：${chronicleBad.length}`)
for (const item of duplicates) console.log(`  ✗ duplicate ${item}`)
for (const item of bad) console.log(`  ✗ ${item}`)
for (const item of badCatalogSources) console.log(`  ✗ catalog source ${item}`)
for (const item of chronicleBad) console.log(`  ✗ ${item}`)

if (duplicates.length || bad.length || badCatalogSources.length || chronicleBad.length || catalogIds.length !== ids.size) {
  process.exitCode = 1
} else {
  console.log('✔ 数据 ID、跨模块引用、目录来源与残页池均正常')
}
