import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'

const routes = [
  { path: '/', name: 'Home', component: () => import('../pages/Home.vue') },
  { path: '/search', name: 'Search', component: () => import('../pages/Search.vue') },
  {
    path: '/entry/:id',
    name: 'EntryDetail',
    component: () => import('../pages/EntryDetail.vue'),
    props: true,
    beforeEnter: async (to: RouteLocationNormalized) => {
      const id = String(to.params.id)
      try {
        const { getEntryById, preloadEntryById } = await import('../data/details')
        await preloadEntryById(id)
        return getEntryById(id) ? true : { name: 'Search', query: { q: id } }
      } catch {
        // 详情 chunk 加载失败（弱网 / 发版后旧 hash 404）：落检索页而非中断导航
        return { name: 'Search', query: { q: id } }
      }
    }
  },
  { path: '/timeline', name: 'Timeline', component: () => import('../pages/Timeline.vue') },
  { path: '/compare', name: 'Compare', component: () => import('../pages/Compare.vue') },
  { path: '/graph', name: 'Graph', component: () => import('../pages/Graph.vue') },
  { path: '/exam', name: 'Exam', component: () => import('../pages/Exam.vue') },
  { path: '/about', name: 'About', component: () => import('../pages/About.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

// 同一路由仅切换 :id 时组件可能复用，统一在导航阶段预加载新的完整词条。
router.beforeEach(async to => {
  if (to.name !== 'EntryDetail') return true
  const id = String(to.params.id)
  try {
    const { preloadEntryById } = await import('../data/details')
    return (await preloadEntryById(id)) ? true : { name: 'Search', query: { q: id } }
  } catch {
    return { name: 'Search', query: { q: id } }
  }
})
