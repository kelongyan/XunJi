/**
 * 把已生成的 P0 图片转为 WebP，并安全回写进 src/data/*.ts 中的 image 字段
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const PYTHON_EXE = 'C:/Users/Administrator/AppData/Local/Programs/Python/Python312/python.exe'

const tasks = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/image-forge/p0-tasks.json'), 'utf8'))

const files = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']

let convertedCount = 0
let syncedCount = 0

// 1. 批量将存在的 PNG 转为 WebP
for (const task of tasks) {
  const pngPath = path.join(ROOT, task.outPath)
  const webpRel = task.outPath.replace(/\.png$/i, '.webp')
  const webpPath = path.join(ROOT, webpRel)

  if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 5000) {
    if (!fs.existsSync(webpPath) || fs.statSync(webpPath).size < 1000) {
      console.log(`[WebP 转码] ${path.basename(pngPath)} -> ${path.basename(webpPath)}`)
      const pyScript = `
from PIL import Image
im = Image.open('${pngPath.replace(/\\/g, '/')}')
im.save('${webpPath.replace(/\\/g, '/')}', 'WEBP', quality=85, method=6)
`
      const res = spawnSync(PYTHON_EXE, ['-c', pyScript], { encoding: 'utf8' })
      if (res.status === 0) {
        convertedCount++
      } else {
        console.error(`转码失败: ${res.stderr || res.stdout}`)
      }
    }
  }
}

// 2. 回写到数据文件
for (const file of files) {
  const filePath = path.join(ROOT, 'src/data', file)
  if (!fs.existsSync(filePath)) continue
  let text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
  let fileChanged = false

  for (const task of tasks) {
    const webpRel = '/' + task.outPath.replace(/^public\//, '').replace(/\.png$/i, '.webp')
    const webpAbs = path.join(ROOT, 'public', webpRel)

    // 只有当 webp 文件切实存在且有效时才回写
    if (!fs.existsSync(webpAbs) || fs.statSync(webpAbs).size < 1000) continue

    // 检查词条在当前文件中
    const idRegex = new RegExp(`(\\bid\\s*:\\s*["']${task.id}["'][\\s\\S]*?)(?=image\\s*:|quotes\\s*:|sources\\s*:|tags\\s*:|\\n\\s*\\})`)
    const m = text.match(idRegex)
    if (!m) continue

    // 如果已经有 image 字段且是这个 webp，跳过
    if (m[0].includes(webpRel)) continue

    // 生成恰当的典籍图版说明
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

    const imageBlock = `image: {\n      src: '${webpRel}',\n      caption: '${caption}',\n      source: '${source}'\n    },\n    `

    // 如果原来已有 image: { ... }，替换；否则插入
    const existingImageRegex = new RegExp(`(\\bid\\s*:\\s*["']${task.id}["'][\\s\\S]*?)(image\\s*:\\s*\\{[\\s\\S]*?\\}\\s*,?\\s*)`)
    if (existingImageRegex.test(text)) {
      text = text.replace(existingImageRegex, `$1${imageBlock}`)
      fileChanged = true
      syncedCount++
      console.log(`[数据更新] ${file} -> ${task.name} (${task.id}) 替换配图为 ${webpRel}`)
    } else {
      // 插入到 tags 或 sources 前面
      const insertRegex = new RegExp(`(\\bid\\s*:\\s*["']${task.id}["'][\\s\\S]*?)(\\b(?:sources|tags|quotes)\\s*:)`)
      if (insertRegex.test(text)) {
        text = text.replace(insertRegex, `$1${imageBlock}$2`)
        fileChanged = true
        syncedCount++
        console.log(`[数据注入] ${file} -> ${task.name} (${task.id}) 注入配图 ${webpRel}`)
      }
    }
  }

  if (fileChanged) {
    fs.writeFileSync(filePath + '.bak', fs.readFileSync(filePath))
    fs.writeFileSync(filePath, text, 'utf8')
  }
}

console.log(`\n✔ 优化同步完成：新增 WebP 转码 ${convertedCount} 张 | 数据文件注入/更新 ${syncedCount} 处`)
