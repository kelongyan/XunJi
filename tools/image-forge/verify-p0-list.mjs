import fs from 'node:fs'
import path from 'node:path'

const p0Ids = [
  'zhu-yuanzhang', 'zhu-di', 'zhu-zhanji', 'zhu-houcong', 'zhu-youjian',
  'tang-gaozu-liyuan', 'tang-taizong-lishimin', 'wuzetian', 'tang-xuanzong-lilongji',
  'song-taizu-zhaokuangyin', 'song-renzong-zhaozhen', 'song-huizong-zhaoji',
  'liubang', 'liu-heng', 'liuqi', 'liu-che', 'liu-xiu',
  'nuerhaci', 'xuanye', 'hongli',
  'jingnan-zhiyi', 'zhenghe-xiaxiyang', 'tumu-zhi-bian', 'beijing-baoweizhan', 'jiashan-zhi-bian',
  'xuanwumen-zhibian', 'zhenguan-zhizhi', 'kaiyuan-shengshi', 'anshi-zhiluan', 'wencheng-gongzhu-rucang',
  'chenqiao-bingbian', 'beijiu-shibingquan', 'chanyuan-zhimeng', 'jingkang-zhibian',
  'chu-han-zhizheng', 'zhangqian-tongxiyu', 'kunyang-zhizhan',
  'qingjun-ruguan', 'pingding-zhungaer', 'xinhai-geming',
  'zhang-juzheng', 'wang-yangming',
  'libai', 'dufu',
  'sushi', 'yuefei',
  'sima', 'huo-qubing',
  'lin-zexu', 'zeng-guofan'
]

const files = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']
const allEntries = new Map()

for (const f of files) {
  const c = fs.readFileSync(path.join('src/data', f), 'utf8')
  const blocks = c.split(/\n\s*\{\s*\n/)
  for (const b of blocks) {
    const idM = b.match(/id:\s*["']([^"']+)["']/)
    const nameM = b.match(/name:\s*["']([^"']+)["']/)
    const dynastyM = b.match(/dynasty:\s*["']([^"']+)["']/)
    const typeM = b.match(/type:\s*["']([^"']+)["']/)
    const summaryM = b.match(/summary:\s*["']([^"']+)["']/)
    const eraM = b.match(/era:\s*["']([^"']+)["']/)
    if (idM && nameM) {
      allEntries.set(idM[1], {
        id: idM[1],
        name: nameM[1],
        dynasty: dynastyM?.[1] ?? '',
        type: typeM?.[1] ?? '',
        era: eraM?.[1] ?? '',
        summary: summaryM?.[1] ?? '',
        file: f
      })
    }
  }
}

const missing = p0Ids.filter(id => !allEntries.has(id))
console.log(`P0 候选词条数: ${p0Ids.length} | 库中匹配成功: ${p0Ids.length - missing.length}`)
if (missing.length) {
  console.log('缺失词条:', missing)
} else {
  console.log('✓ 50 个词条全部精准命中！详情示例：')
  for (const id of p0Ids.slice(0, 5)) {
    const e = allEntries.get(id)
    console.log(`  - [${e.dynasty}] ${e.name} (${e.id}) [${e.type}] in ${e.file}`)
  }
}
