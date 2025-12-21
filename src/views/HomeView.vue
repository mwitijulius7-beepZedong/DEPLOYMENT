<template>
  <div class="min-h-screen" :style="{ backgroundColor: themeStore.theme?.background || '#ffffff', color: themeStore.theme?.text || '#000000' }">
    <!-- Header -->
    <header class="py-4 px-6" :style="{ backgroundColor: themeStore.theme?.header?.background || '#f8f9fa', color: themeStore.theme?.header?.text || '#000000' }">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <!-- Logo -->
        <div class="flex items-center">
          <img v-if="branding.logo" :src="branding.logo" alt="Logo" class="h-8 w-auto mr-4" />
          <span v-else class="text-xl font-bold">Scribe</span>
        </div>

        <!-- Navigation -->
        <nav class="hidden md:flex space-x-8">
          <router-link
            v-for="link in navigationLinks"
            :key="link.label"
            :to="link.target"
            class="text-sm font-medium hover:text-gray-600 transition-colors"
            :style="{ color: themeStore.theme?.text || '#000000' }"
          >
            {{ link.label }}
          </router-link>
        </nav>

        <!-- Actions -->
        <div class="flex items-center space-x-4">
          <router-link to="/about" class="text-sm font-medium hover:text-gray-600 transition-colors">About</router-link>
          <button
            @click="subscribe"
            class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            :style="{
              backgroundColor: themeStore.theme?.buttons?.primary?.background || '#007bff',
              color: themeStore.theme?.buttons?.primary?.text || '#ffffff'
            }"
          >
            Subscribe
          </button>
        </div>
      </div>
    </header>

    <!-- Hero -->
    <section class="py-20 px-6 text-center" :style="{ backgroundColor: themeStore.theme?.background || '#ffffff' }">
      <div class="max-w-4xl mx-auto">
        <h1
          class="text-4xl md:text-6xl font-bold mb-6"
          :style="{
            fontFamily: themeStore.theme?.fonts?.heading || 'serif',
            color: themeStore.theme?.text?.heading || '#000000'
          }"
        >
          Welcome to Scribe, we write about technology, people and culture
        </h1>
        <div
          class="w-24 h-1 mx-auto"
          :style="{ backgroundColor: themeStore.theme?.divider || '#cccccc' }"
        ></div>
      </div>
    </section>

    <!-- Content Section -->
    <section class="py-16 px-6">
      <div class="max-w-7xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-10 gap-8">
          <!-- Featured (60%) -->
          <div class="lg:col-span-6">
            <h2 class="text-2xl font-bold mb-6" :style="{ color: themeStore.theme?.text?.heading || '#000000' }">Featured</h2>
            <div v-if="featuredPost" class="bg-white rounded-lg shadow-md overflow-hidden">
              <img v-if="featuredPost.image" :src="featuredPost.image" :alt="featuredPost.title" class="w-full h-64 object-cover" />
              <div class="p-6">
                <span class="inline-block px-3 py-1 text-sm font-medium bg-gray-100 text-gray-800 rounded-full mb-2">{{ featuredPost.category }}</span>
                <p class="text-sm text-gray-600 mb-2">{{ formatDate(featuredPost.date) }}</p>
                <h3 class="text-xl font-bold mb-2">{{ featuredPost.title }}</h3>
                <p class="text-gray-700">{{ featuredPost.description }}</p>
              </div>
            </div>
            <div v-else class="text-center py-12">
              <p class="text-gray-500">No featured post available</p>
            </div>
          </div>

          <!-- Recent (40%) -->
          <div class="lg:col-span-4">
            <h2 class="text-2xl font-bold mb-6" :style="{ color: themeStore.theme?.text?.heading || '#000000' }">Recent</h2>
            <div class="space-y-6">
              <div v-for="post in recentPosts" :key="post.id" class="bg-white rounded-lg shadow-md overflow-hidden">
                <img v-if="post.image" :src="post.image" :alt="post.title" class="w-full h-32 object-cover" />
                <div class="p-4">
                  <span class="inline-block px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full mb-1">{{ post.category }}</span>
                  <p class="text-xs text-gray-600 mb-1">{{ formatDate(post.date) }}</p>
                  <h4 class="text-sm font-bold mb-1">{{ post.title }}</h4>
                  <p class="text-xs text-gray-700 line-clamp-2">{{ post.description }}</p>
                </div>
              </div>
              <div v-if="recentPosts.length === 0" class="text-center py-6">
                <p class="text-gray-500 text-sm">No recent posts available</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Content Grid -->
    <section class="py-16 px-6 bg-gray-50">
      <div class="max-w-7xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div v-for="post in gridPosts" :key="post.id" class="bg-white rounded-lg shadow-md overflow-hidden">
            <img v-if="post.image" :src="post.image" :alt="post.title" class="w-full h-48 object-cover" />
            <div class="p-6">
              <span class="inline-block px-3 py-1 text-sm font-medium bg-gray-100 text-gray-800 rounded-full mb-2">{{ post.category }}</span>
              <p class="text-sm text-gray-600 mb-2">{{ formatDate(post.date) }}</p>
              <h3 class="text-xl font-bold mb-2">{{ post.title }}</h3>
              <p class="text-gray-700">{{ post.description }}</p>
            </div>
          </div>
          <div v-if="gridPosts.length === 0" class="col-span-full text-center py-12">
            <p class="text-gray-500">No additional posts available</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePostsStore } from '../stores/posts'
import { useThemeStore } from '../stores/theme'

const postsStore = usePostsStore()
const themeStore = useThemeStore()

// Branding and navigation data
const branding = ref({ logo: '' })
const navigationLinks = [
  { label: 'All articles', target: '/articles' },
  { label: 'Culture', target: '/culture' },
  { label: 'Lifestyle', target: '/lifestyle' },
  { label: 'People', target: '/people' },
  { label: 'Technology', target: '/technology' }
]

// Computed properties for content
const featuredPost = computed(() => postsStore.posts.length > 0 ? postsStore.posts[0] : null)
const recentPosts = computed(() => postsStore.posts.slice(1, 3))
const gridPosts = computed(() => postsStore.posts.slice(3, 5))

// Subscribe functionality
const subscribe = async () => {
  // Placeholder for subscribe logic - can be implemented later
  alert('Subscribe functionality to be implemented')
}

// Date formatting utility
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

onMounted(async () => {
  themeStore.initTheme()
  await postsStore.loadPosts()
  await postsStore.loadCategories()

  // Load branding settings if available
  try {
    const brandingRes = await fetch('/api/settings/branding')
    if (brandingRes.ok) {
      const brandingData = await brandingRes.json()
      branding.value = brandingData
    }
  } catch (error) {
    console.log('Failed to load branding:', error)
  }
})
</script>

<style scoped>
/* fade-in utility for potential future use */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in { animation: fadeIn 1s ease-out; }
</style>
