import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { trackEvent } from './utils/analytics'
import './styles/theme.css'

router.afterEach((to) => {
  trackEvent('route_view', {
    route_name: String(to.name ?? 'unknown'),
    page_path: to.fullPath,
  })
})

createApp(App).use(createPinia()).use(router).mount('#app')
