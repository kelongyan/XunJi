import { defineStore } from 'pinia'

const MODE_KEY = 'xunji-reading-mode'
export type ReadingMode = 'day' | 'night'

import { playStampSound, SOUND_KEY } from '../composables/useSound'

/** 隐私模式 / 配额满时 localStorage 会抛错：读失败给默认值，写失败静默降级 */
function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 仅本会话生效 */
  }
}

/**
 * 全站 UI 状态：日读 / 夜读模式 + 沉浸模式 + 音效开关 + 水墨晕开转场。
 * 夜读通过 html.dark class 切换（token 已在 style.css 预留），
 * 3D 长河监听本 store 的 mode 做入夜联动。
 */
export const useUiStore = defineStore('ui', {
  state: () => ({
    mode: (readLocal(MODE_KEY) === 'night' ? 'night' : 'day') as ReadingMode,
    /** 首页沉浸模式：隐藏全部 UI，纯长河漫游（H 进入 / Esc 退出） */
    immersive: false,
    /** 盖印等音效开关（默认关） */
    soundOn: readLocal(SOUND_KEY) === '1',
    inkFlashActive: false,
    inkFlashText: '寻迹'
  }),
  actions: {
    initMode() {
      this.applyModeClass()
    },
    toggleMode() {
      this.mode = this.mode === 'day' ? 'night' : 'day'
      writeLocal(MODE_KEY, this.mode)
      this.applyModeClass()
    },
    applyModeClass() {
      const el = document.documentElement
      el.classList.toggle('dark', this.mode === 'night')
      el.classList.toggle('light', this.mode !== 'night')
    },
    toggleImmersive() {
      this.immersive = !this.immersive
    },
    exitImmersive() {
      this.immersive = false
    },
    toggleSound() {
      this.soundOn = !this.soundOn
      writeLocal(SOUND_KEY, this.soundOn ? '1' : '0')
    },
    /** 墨滴晕开转场：短暂遮罩后执行回调（常用于路由跳转），落印时带盖印音 */
    inkFlash(text = '寻迹', then?: () => void) {
      if (this.inkFlashActive) return
      this.inkFlashText = text
      this.inkFlashActive = true
      playStampSound()
      window.setTimeout(() => {
        then?.()
      }, 420)
      window.setTimeout(() => {
        this.inkFlashActive = false
      }, 900)
    }
  }
})
