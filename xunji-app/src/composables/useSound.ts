/**
 * 盖印音效（WebAudio 现场合成，无音频素材依赖）。
 * 默认关闭；localStorage `xunji-sound` = '1' 时启用（页眉音量开关控制）。
 * 必须在用户手势后首次触发（浏览器自动播放策略），否则 ctx.resume()。
 */
let ctx: AudioContext | null = null

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function isSoundEnabled(): boolean {
  return localStorage.getItem('xunji-sound') === '1'
}

/** 盖印闷响：低频冲击 + 短噪声瞬态，约 0.2s */
export function playStampSound() {
  if (!isSoundEnabled()) return
  const ac = ensureCtx()
  if (!ac) return
  const t0 = ac.currentTime

  // 低频冲击
  const osc = ac.createOscillator()
  const oscGain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(140, t0)
  osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.14)
  oscGain.gain.setValueAtTime(0.5, t0)
  oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2)
  osc.connect(oscGain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + 0.22)

  // 印面落纸的噪声瞬态
  const len = Math.floor(ac.sampleRate * 0.07)
  const buffer = ac.createBuffer(1, len, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  }
  const noise = ac.createBufferSource()
  noise.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 900
  filter.Q.value = 0.8
  const noiseGain = ac.createGain()
  noiseGain.gain.setValueAtTime(0.22, t0)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08)
  noise.connect(filter).connect(noiseGain).connect(ac.destination)
  noise.start(t0)
}
