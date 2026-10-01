import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import { vReveal } from './directives/reveal'
import { vCountUp } from './directives/countUp'
import './style.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('reveal', vReveal)
app.directive('count-up', vCountUp)
app.mount('#app')
