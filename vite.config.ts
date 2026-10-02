import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

/** 生图母版 PNG（约 589MB，仅本地保留、git 不入库）不得混入部署产物：构建后从 dist 剔除 */
function excludeMasterPngs(): Plugin {
  return {
    name: 'exclude-master-pngs',
    closeBundle() {
      const dir = path.resolve(import.meta.dirname, 'dist/images/entries')
      if (!fs.existsSync(dir)) return
      let removed = 0
      const walk = (d: string) => {
        for (const name of fs.readdirSync(d)) {
          const p = path.join(d, name)
          if (fs.statSync(p).isDirectory()) walk(p)
          else if (name.endsWith('.png')) {
            fs.rmSync(p)
            removed++
          }
        }
      }
      walk(dir)
      if (removed) console.log(`[exclude-master-pngs] removed ${removed} master PNGs from dist`)
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    excludeMasterPngs()
  ]
})
