import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const files = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']
const allEntries = []

for (const f of files) {
  const content = fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')
  // 用精准正则提取所有顶层 entry 块
  const idMatches = [...content.matchAll(/\n  \{\s*\n\s*id:\s*["']([^"']+)["']/g)]
  for (let i = 0; i < idMatches.length; i++) {
    const startIdx = idMatches[i].index
    const endIdx = i + 1 < idMatches.length ? idMatches[i + 1].index : content.lastIndexOf('\n]')
    const block = content.slice(startIdx, endIdx)

    const id = idMatches[i][1]
    const nameM = block.match(/name:\s*["']([^"']+)["']/)
    const dynastyM = block.match(/dynasty:\s*["']([^"']+)["']/)
    const typeM = block.match(/type:\s*["']([^"']+)["']/)
    const eraM = block.match(/era:\s*["']([^"']+)["']/)
    const imageM = block.match(/image:\s*\{[\s\S]*?src:\s*["']([^"']+)["']/)

    const imageSrc = imageM ? imageM[1] : null
    const hasWebp = Boolean(imageSrc && imageSrc.endsWith('.webp'))
    const hasSvg = Boolean(imageSrc && imageSrc.endsWith('.svg'))

    allEntries.push({
      id,
      name: nameM ? nameM[1] : id,
      dynasty: dynastyM ? dynastyM[1] : '',
      type: typeM ? typeM[1] : '',
      era: eraM ? eraM[1] : '',
      file: f,
      hasWebp,
      hasSvg,
      imageSrc
    })
  }
}

const doneList = allEntries.filter(e => e.hasWebp)
const pendingList = allEntries.filter(e => !e.hasWebp)

console.log('====================================================')
console.log(`全站总词条数: ${allEntries.length}`)
console.log(`已完成高保真木刻版画 (WebP): ${doneList.length} (占比 ${(doneList.length / allEntries.length * 100).toFixed(1)}%)`)
console.log(`待生成/待配图: ${pendingList.length} 篇`)
console.log('====================================================')

const doneByDynasty = {}
for (const e of doneList) doneByDynasty[e.dynasty] = (doneByDynasty[e.dynasty] || 0) + 1
console.log('\n✔ 已完成 50 篇分布:')
for (const [k, v] of Object.entries(doneByDynasty)) console.log(`  - ${k}朝: ${v} 篇`)

const pendingByDynasty = {}
const pendingByType = {}
for (const e of pendingList) {
  pendingByDynasty[e.dynasty] = (pendingByDynasty[e.dynasty] || 0) + 1
  pendingByType[e.type] = (pendingByType[e.type] || 0) + 1
}

console.log('\n⏳ 剩余 289 篇待配图按朝代分布:')
for (const [k, v] of Object.entries(pendingByDynasty)) {
  console.log(`  - ${k}朝: 剩余 ${v} 篇 (已完成 ${doneByDynasty[k] || 0} 篇，总数 ${(doneByDynasty[k] || 0) + v} 篇)`)
}

console.log('\n⏳ 剩余 289 篇待配图按类型分布:')
const typeNames = { emperor: '帝王', figure: '历史人物', event: '重大事件', classic: '典籍文献', system: '典章制度' }
for (const [k, v] of Object.entries(pendingByType)) {
  const doneCount = doneList.filter(e => e.type === k).length
  console.log(`  - ${typeNames[k] || k} (${k}): 剩余 ${v} 篇 (已完成 ${doneCount} 篇，总数 ${doneCount + v} 篇)`)
}

console.log('\n====================================================')
console.log('后续建议分批实施规划 (P1 / P2 / P3):')
console.log('====================================================')

// P1 规划：历史人物肖像画卷全覆盖（人物 104 篇 + 剩余帝王 18 篇 = 122 篇）
const p1Figures = pendingList.filter(e => e.type === 'figure' || e.type === 'emperor')
console.log(`\n▶ 【建议下一批 P1: 人物大观】剩余共 ${p1Figures.length} 篇 (人物 ${pendingList.filter(e => e.type === 'figure').length} + 帝王 ${pendingList.filter(e => e.type === 'emperor').length})`)
console.log('  代表性未配图人物/帝王抽样：')
for (const d of ['明', '唐', '宋', '汉', '清']) {
  const sample = p1Figures.filter(e => e.dynasty === d).slice(0, 6).map(e => e.name).join('、')
  console.log(`    [${d}朝]: ${sample}...`)
}

// P2 规划：历史大事件纪事长卷（事件 111 篇）
const p2Events = pendingList.filter(e => e.type === 'event')
console.log(`\n▶ 【建议下下批 P2: 纪事长卷】剩余重大历史事件共 ${p2Events.length} 篇`)
console.log('  代表性未配图事件抽样：')
for (const d of ['明', '唐', '宋', '汉', '清']) {
  const sample = p2Events.filter(e => e.dynasty === d).slice(0, 6).map(e => e.name).join('、')
  console.log(`    [${d}朝]: ${sample}...`)
}

// P3 规划：传世典籍与典章制度（典籍 34 篇 + 制度 29 篇 = 63 篇）
const p3ClassicsSystems = pendingList.filter(e => e.type === 'classic' || e.type === 'system')
console.log(`\n▶ 【建议收官批 P3: 典籍与制度】剩余共 ${p3ClassicsSystems.length} 篇 (典籍 34 + 制度 29)`)
console.log('  代表性未配图典籍/制度抽样：')
console.log('    典籍：《四库全书》《红楼梦》《梦溪笔谈》《汉书》《全唐诗》《大唐西域记》...')
console.log('    制度：科举制、三省六部制、一条鞭法、摊丁入亩、均田制、察举制、军机处...')
