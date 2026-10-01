/**
 * 藏书票生成器（Canvas 程序合成，零依赖）
 *
 * 钤印入藏后可"拓"一枚藏书票：方形票面 = 宣纸底 + 文武双线框 +
 * 竖排词条名 + 朝代印章 + 一句 gist + 寻迹版记，可下载 PNG 分享。
 * 全部取自词条真实数据，不编造内容。
 */
import { dynastyIdFromHanzi, dynastyThemes } from './dynastyThemes'
import type { HistoryEntry } from '../types/history'

const TICK = '· 寻迹藏书票 ·'

/** 下载一张 640×800 藏书票 PNG */
export function downloadExLibris(entry: HistoryEntry) {
  const W = 640
  const H = 800
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const accent = dynastyThemes.find(t => t.id === dynastyIdFromHanzi(entry.dynasty))?.accent ?? '#A8352A'

  // 宣纸底 + 轻噪点
  ctx.fillStyle = '#F2EDDC'
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 0.05
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = i % 3 ? '#8a8070' : '#c14a35'
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4)
  }
  ctx.globalAlpha = 1

  // 文武双线框（外粗内细）
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.75)'
  ctx.lineWidth = 5
  ctx.strokeRect(18, 18, W - 36, H - 36)
  ctx.strokeStyle = 'rgba(61, 55, 47, 0.35)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(30, 30, W - 60, H - 60)

  // 顶部小字（版记）
  ctx.fillStyle = 'rgba(61, 55, 47, 0.6)'
  ctx.font = '400 17px "Kaiti SC", "KaiTi", "STKaiti", serif'
  ctx.textAlign = 'center'
  ctx.fillText(TICK, W / 2, 66)

  // 主题色题头线
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(W / 2 - 60, 84)
  ctx.lineTo(W / 2 + 60, 84)
  ctx.stroke()

  // 竖排词条名（居中，大字）
  const name = entry.name
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '700 64px "Songti SC", "STSong", "SimSun", serif'
  ctx.fillStyle = '#2B2620'
  const nameChars = [...name].slice(0, 8)
  const startY = 150
  nameChars.forEach((ch, i) => {
    ctx.fillText(ch, W / 2, startY + i * 74)
  })

  // 朝代小印（词条名末尾后随）
  const sealY = startY + nameChars.length * 74 + 8
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  ctx.strokeRect(W / 2 - 26, sealY, 52, 52)
  ctx.fillStyle = accent
  ctx.font = '700 26px "Kaiti SC", "KaiTi", "STKaiti", serif'
  ctx.fillText(entry.dynasty.replace(/朝代?$/, ''), W / 2, sealY + 27)

  // 一句 gist（横排截断，两行内）
  const gist = entry.summary.length > 46 ? entry.summary.slice(0, 46) + '……' : entry.summary
  ctx.fillStyle = 'rgba(43, 38, 32, 0.78)'
  ctx.font = '400 19px "Kaiti SC", "KaiTi", "STKaiti", serif'
  wrapText(ctx, gist, W / 2, sealY + 100, W - 150, 30)

  // 底部版记：年代 + 收藏印
  const footY = H - 96
  ctx.fillStyle = 'rgba(61, 55, 47, 0.55)'
  ctx.font = '400 15px "Songti SC", "STSong", "SimSun", serif'
  const span = entry.lifespan ? `公元 ${entry.lifespan.birth}—${entry.lifespan.death} 年` : entry.dynasty
  ctx.fillText(span, W / 2, footY)

  // 藏书朱印（右下）
  ctx.save()
  ctx.translate(W - 108, H - 92)
  ctx.rotate(-0.06)
  ctx.strokeStyle = '#A8352A'
  ctx.lineWidth = 3
  ctx.strokeRect(-30, -30, 60, 60)
  ctx.fillStyle = '#A8352A'
  ctx.font = '700 22px "Kaiti SC", "KaiTi", "STKaiti", serif'
  ctx.fillText('藏', 0, 1)
  ctx.fillText('者', 0, 24)
  ctx.restore()

  // 左下落款
  ctx.save()
  ctx.translate(96, H - 78)
  ctx.rotate(-0.04)
  ctx.fillStyle = 'rgba(61, 55, 47, 0.65)'
  ctx.font = '400 16px "Kaiti SC", "KaiTi", "STKaiti", serif'
  ctx.fillText('寻迹典藏', 0, 0)
  ctx.restore()

  // 下载
  const link = document.createElement('a')
  link.download = `寻迹藏书票-${entry.name}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/** 横排自动换行（中文逐字断行） */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  let line = ''
  let curY = y
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, x, curY)
      line = ch
      curY += lineH
    } else {
      line += ch
    }
  }
  if (line) ctx.fillText(line, x, curY)
}
