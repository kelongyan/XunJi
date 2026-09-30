import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import Search from '../pages/Search.vue'
import EntryDetail from '../pages/EntryDetail.vue'
import Timeline from '../pages/Timeline.vue'
import Compare from '../pages/Compare.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/search', name: 'Search', component: Search },
  { path: '/entry/:id', name: 'EntryDetail', component: EntryDetail, props: true },
  { path: '/timeline', name: 'Timeline', component: Timeline },
  { path: '/compare', name: 'Compare', component: Compare },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})
