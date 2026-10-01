import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const files = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']

const dynastyEnglish = {
  '明': 'Ming',
  '唐': 'Tang',
  '宋': 'Song',
  '汉': 'Han',
  '清': 'Qing'
}

const dynastyDir = {
  '明': 'ming',
  '唐': 'tang',
  '宋': 'song',
  '汉': 'han',
  '清': 'qing'
}

const p1Tasks = []

for (const f of files) {
  const content = fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')
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
    const rolesM = block.match(/roles:\s*\[([\s\S]*?)\]/)
    const imageM = block.match(/image:\s*\{[\s\S]*?src:\s*["']([^"']+)["']/)

    const imageSrc = imageM ? imageM[1] : null
    const hasWebp = Boolean(imageSrc && imageSrc.endsWith('.webp'))

    const type = typeM ? typeM[1] : ''
    const dynasty = dynastyM ? dynastyM[1] : ''
    const name = nameM ? nameM[1] : id
    const era = eraM ? eraM[1] : ''

    // 只选取未配图的 figure 和 emperor
    if (!hasWebp && (type === 'figure' || type === 'emperor')) {
      const dEn = dynastyEnglish[dynasty] || dynasty
      const dFolder = dynastyDir[dynasty] || 'misc'
      let prompt = ''

      if (type === 'emperor') {
        prompt = `Authentic ancient Chinese woodblock print portrait of Emperor ${name} of ${dEn} Dynasty (${era}), seated majestically on a classical carved dragon throne wearing formal imperial royal robes (衮服冕旒). Ten Bamboo Studio letter paper style (十竹斋笺谱), delicate traditional ink line art with subtle water-based woodblock printing colors (饾版套色), antique book illustration aesthetic. Warm tea-toned aged paper texture, mineral cinnabar red and muted gold accents. Dignified solemn expression, museum artifact quality. Avoid modern anime style, no 3D digital CG look, no western oil painting, no watermark, no modern text.`
      } else {
        const roles = rolesM ? rolesM[1].replace(/["'\s]/g, '') : 'historical figure'
        prompt = `Authentic traditional Chinese woodblock portrait of historical figure ${name} of ${dEn} Dynasty (${era}, ${roles}). Elegant scholar-official robe or traditional military armor, historical Wanxiao Tang book illustration style (晚笑堂画传). Delicate ink brushwork and fine carved woodblock contours, subtle mineral pigment wash. Three-quarter view waist-up portrait surrounded by poetic negative space on antique fibrous rice paper. Dignified, scholarly and atmospheric. Avoid modern anime style, no 3D digital CG look, no western oil painting, no watermark, no modern text.`
      }

      p1Tasks.push({
        id,
        name,
        dynasty,
        dynastyFolder: dFolder,
        type,
        era,
        size: '1024x1536',
        outPath: `public/images/entries/${dFolder}/${type}-${id}.png`,
        prompt
      })
    }
  }
}

fs.writeFileSync(path.join(ROOT, 'tools/image-forge/p1-tasks.json'), JSON.stringify(p1Tasks, null, 2), 'utf8')
console.log(`✔ 成功生成 P1 人物大观任务清单: 共 ${p1Tasks.length} 篇`)

const byDynasty = {}
for (const t of p1Tasks) byDynasty[t.dynasty] = (byDynasty[t.dynasty] || 0) + 1
console.log('\n按朝代分布:')
for (const [k, v] of Object.entries(byDynasty)) console.log(`  - ${k}朝: ${v} 篇`)
