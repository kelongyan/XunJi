import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const tasks = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/image-forge/p0-tasks.json'), 'utf8'))
const taskMap = new Map(tasks.map(t => [t.id, t]))

const files = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']

for (const file of files) {
  const filePath = path.join(ROOT, 'src/data', file)
  if (!fs.existsSync(filePath)) continue

  let text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
  let changed = 0

  // 精准找出每一个 entry 块并进行独立处理
  const entryRegex = /(\n  \{\s*\n\s*id:\s*["']([^"']+)["'][\s\S]*?\n  \}(?:,)?(?=\n  \{|\n\]))/g

  text = text.replace(entryRegex, (fullBlock, p1, entryId) => {
    const task = taskMap.get(entryId)
    if (!task) return fullBlock

    const webpRel = '/' + task.outPath.replace(/^public\//, '').replace(/\.png$/i, '.webp')
    const webpAbs = path.join(ROOT, 'public', webpRel)
    if (!fs.existsSync(webpAbs)) return fullBlock

    // 构造正确的 image 块
    let caption = `【图版】${task.name}相关历史刻本图谱摹本`
    let source = '传统古籍绣像木刻'
    if (task.type === 'emperor') {
      caption = `【图版】${task.name}御容坐像摹本 · 选自清代重摹明清历代帝王像`
      source = '南薰殿旧藏历代帝王像'
    } else if (task.type === 'figure') {
      caption = `【图版】${task.name}先生画像摹本 · 选自明清名贤画传`
      source = '《晚笑堂画传》'
    } else if (task.type === 'event') {
      caption = `【图版】${task.name}历史长卷全景图摹本`
      source = '明清纪事版画舆图'
    }

    const imageBlock = `image: {\n      src: '${webpRel}',\n      caption: '${caption}',\n      source: '${source}'\n    }`

    // 移除该块内可能已经存在的任何旧 image 字段
    let cleanedBlock = fullBlock.replace(/\n\s*image:\s*\{[\s\S]*?\},\s*/g, '\n    ')

    // 统一插入到 sources: 或 tags: 前面
    if (cleanedBlock.includes('sources:')) {
      cleanedBlock = cleanedBlock.replace(/\n(\s*)sources:/, `\n$1${imageBlock},\n$1sources:`)
    } else if (cleanedBlock.includes('tags:')) {
      cleanedBlock = cleanedBlock.replace(/\n(\s*)tags:/, `\n$1${imageBlock},\n$1tags:`)
    } else {
      cleanedBlock = cleanedBlock.replace(/\n  \}/, `,\n    ${imageBlock}\n  }`)
    }

    changed++
    return cleanedBlock
  })

  fs.writeFileSync(filePath, text, 'utf8')
  console.log(`[精准对齐] ${file}: 同步了 ${changed} 处精准配图`)
}
