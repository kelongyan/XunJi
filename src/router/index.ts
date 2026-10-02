import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'Home', component: () => import('../pages/Home.vue') },
  { path: '/search', name: 'Search', component: () => import('../pages/Search.vue') },
  {
    path: '/entry/:id',
    name: 'EntryDetail',
    component: () => import('../pages/EntryDetail.vue'),
    props: true
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

// 详情页预加载统一收口在全局 beforeEach：beforeEnter 在仅 :id 变化、组件复用的
// 导航中不会重跑（vue-router 4 只对 enteringRecords 执行），单独守它必漏参数切换。
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
