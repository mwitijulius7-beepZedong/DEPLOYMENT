import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import PostView from '../views/PostView.vue'
import AboutView from '../views/AboutView.vue'
import LoginView from '../views/LoginView.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView
  },
  {
    path: '/articles',
    name: 'Articles',
    component: HomeView // Using HomeView for now, can create separate component later
  },
  {
    path: '/culture',
    name: 'Culture',
    component: HomeView
  },
  {
    path: '/lifestyle',
    name: 'Lifestyle',
    component: HomeView
  },
  {
    path: '/people',
    name: 'People',
    component: HomeView
  },
  {
    path: '/technology',
    name: 'Technology',
    component: HomeView
  },
  {
    path: '/post/:id',
    name: 'Post',
    component: PostView,
    props: true
  },
  {
    path: '/about',
    name: 'About',
    component: AboutView
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
