import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: {
      title: 'Alberta AI Academy — Home',
      description: 'Open-access AI literacy training for the Government of Alberta and all Albertans.'
    }
  },
  {
    path: '/level/:levelId',
    name: 'level',
    component: () => import('@/views/LevelView.vue'),
    props: true,
    meta: {
      title: 'Alberta AI Academy — Learning Level',
      description: 'Explore AI learning resources for this level.'
    }
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/views/ChatView.vue'),
    meta: {
      title: 'AI Chat — Alberta AI Academy',
      description: 'Chat with AI about the Alberta AI Academy curriculum.'
    }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: {
      title: 'Page Not Found — Alberta AI Academy',
      description: 'The page you requested could not be found.'
    }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0, behavior: 'smooth' }
  }
})

router.afterEach((to) => {
  const title = to.meta?.title ?? 'Alberta AI Academy'
  const description = to.meta?.description ?? ''
  document.title = title
  const metaDesc = document.querySelector('meta[name="description"]')
  if (metaDesc) {
    metaDesc.setAttribute('content', description)
  }
})

export default router
