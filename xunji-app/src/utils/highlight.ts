/** 命中词高亮：把文本按 query 切成分段（hit 标记命中） */
export interface HighlightSegment {
  text: string
  hit: boolean
}

export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const q = query.trim()
  if (!q) return [{ text, hit: false }]
  const lowerText = text.toLowerCase()
  const lowerQ = q.toLowerCase()
  const segments: HighlightSegment[] = []
  let i = 0
  for (;;) {
    const idx = lowerText.indexOf(lowerQ, i)
    if (idx === -1) {
      segments.push({ text: text.slice(i), hit: false })
      break
    }
    if (idx > i) segments.push({ text: text.slice(i, idx), hit: false })
    segments.push({ text: text.slice(idx, idx + q.length), hit: true })
    i = idx + q.length
  }
  return segments.filter(s => s.text.length > 0)
}
