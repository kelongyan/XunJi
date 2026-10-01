import fs from 'node:fs'
import path from 'node:path'

const p0Ids = [
  // 明朝 (12)
  'zhu-yuanzhang', 'zhu-di', 'zhu-zhanji', 'zhu-houcong', 'zhu-youjian',
  'zhang-juzheng', 'wang-yangming',
  'jingnan-zhiyi', 'zhenghe-xiaxiyang', 'tumu-zhi-bian', 'beijing-baoweizhan', 'jiashan-zhi-bian',
  // 唐朝 (11)
  'tang-gaozu-liyuan', 'tang-taizong-lishimin', 'wuzetian', 'tang-xuanzong-lilongji',
  'libai', 'dufu',
  'xuanwumen-zhibian', 'zhenguan-zhizhi', 'kaiyuan-shengshi', 'anshi-zhiluan', 'wencheng-gongzhu-rucang',
  // 宋朝 (9)
  'song-taizu-zhaokuangyin', 'song-renzong-zhaozhen', 'song-huizong-zhaoji',
  'sushi', 'yuefei',
  'chenqiao-bingbian', 'beijiu-shibingquan', 'chanyuan-zhimeng', 'jingkang-zhibian',
  // 汉朝 (10)
  'liubang', 'liu-heng', 'liuqi', 'liu-che', 'liu-xiu',
  'sima', 'huo-qubing',
  'chu-han-zhizheng', 'zhangqian-tongxiyu', 'kunyang-zhizhan',
  // 清朝 (8)
  'nuerhaci', 'xuanye', 'hongli',
  'lin-zexu', 'zeng-guofan',
  'qingjun-ruguan', 'pingding-zhungaer', 'xinhai-geming'
]

const files = ['emperors.ts', 'figures.ts', 'events.ts', 'classics-systems.ts', 'tang.ts', 'song.ts', 'han.ts', 'qing.ts']
const entryMap = new Map()

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
      entryMap.set(idM[1], {
        id: idM[1],
        name: nameM[1],
        dynasty: dynastyM?.[1] ?? '',
        type: typeM?.[1] ?? '',
        era: eraM?.[1] ?? '',
        summary: summaryM?.[1] ?? ''
      })
    }
  }
}

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

const tasks = []

for (const id of p0Ids) {
  const e = entryMap.get(id)
  if (!e) continue

  const dEn = dynastyEnglish[e.dynasty] || e.dynasty
  const dFolder = dynastyDir[e.dynasty] || 'misc'
  let size = '1024x1536' // 默认竖版
  let prompt = ''

  if (e.type === 'emperor') {
    size = '1024x1536'
    prompt = `Authentic ancient Chinese woodblock print portrait of Emperor ${e.name} of ${dEn} Dynasty, seated majestically on a classical dragon throne wearing imperial royal robes (衮服冕旒). Ten Bamboo Studio letter paper style (十竹斋笺谱), delicate traditional ink line art with subtle water-based woodblock printing colors (饾版套色), antique book illustration aesthetic. Warm tea-toned aged paper texture, mineral cinnabar red and muted gold accents. Dignified solemn expression, museum artifact quality. Avoid modern anime style, no 3D digital CG look, no western oil painting, no watermark, no modern text.`
  } else if (e.type === 'figure') {
    size = '1024x1536'
    prompt = `Authentic traditional Chinese woodblock portrait of historical figure ${e.name} of ${dEn} Dynasty (${e.era}). Elegant scholar-official attire or warrior armor, historical Wanxiao Tang book illustration style (晚笑堂画传). Delicate ink brushwork and fine carved woodblock contours, subtle mineral pigment wash. Three-quarter view waist-up portrait surrounded by poetic negative space on antique fibrous rice paper. Dignified, scholarly and atmospheric. Avoid modern anime style, no 3D digital CG look, no western oil painting, no watermark, no modern text.`
  } else if (e.type === 'event') {
    size = '1536x1024' // 事件用横版
    prompt = `Authentic ancient Chinese woodblock panorama illustration depicting the historical event ${e.name} during ${dEn} Dynasty (${e.era}). Grand historical narrative composition, bird's-eye perspective (界画散点透视), traditional military campaign or court assembly scene with figures, architecture, mountains and swirling cloud elements. Traditional block-printed book illustration style, delicate ink lines with light watercolor wash (浅绛/青绿山水色). Antique fibrous paper texture. Historic drama and classical elegance. Avoid modern anime style, no 3D digital CG look, no western oil painting, no photorealistic blur, no watermark, no modern text.`
  } else {
    size = '1024x1024'
    prompt = `Classical Chinese woodblock carved manuscript illustration representing ${e.name} of ${dEn} Dynasty, antique book layout, traditional ink and cinnabar on aged mulberry paper. Museum quality artifact aesthetic. No modern text, no watermark.`
  }

  tasks.push({
    id: e.id,
    name: e.name,
    dynasty: e.dynasty,
    dynastyFolder: dFolder,
    type: e.type,
    size: size,
    outPath: `public/images/entries/${dFolder}/${e.type}-${e.id}.png`,
    prompt: prompt
  })
}

fs.writeFileSync('tools/image-forge/p0-tasks.json', JSON.stringify(tasks, null, 2), 'utf8')
console.log(`✓ 成功生成 P0 任务清单: ${tasks.length} 条 -> tools/image-forge/p0-tasks.json`)
