import { watch, onBeforeUnmount } from 'vue'
import { dynastyIdFromHanzi, defaultDynasty } from '../data/dynastyThemes'

/**
 * 一朝一色：页面声明自己的朝代（数据 hanzi 或朝代 id 均可），随来源变化染上
 * `html[data-dynasty]`，卸载复位为默认朝代。原先同构逻辑散布 4 处（EntryDetail /
 * Timeline / Compare / Graph），此处收口。
 */
export function useDynastyTint(resolve: () => string | undefined) {
  watch(
    resolve,
    v => {
      document.documentElement.dataset.dynasty = dynastyIdFromHanzi(v)
    },
    { immediate: true }
  )
  onBeforeUnmount(() => {
    document.documentElement.dataset.dynasty = defaultDynasty.id
  })
}
