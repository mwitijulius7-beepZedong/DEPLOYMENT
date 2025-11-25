<template>
  <div class="relative min-h-screen">
    <!-- Background Layer (image from settings or theme color) -->
    <div class="absolute inset-0 -z-10">
      <div
        v-if="backgroundImageUrl"
        class="absolute inset-0"
        :style="{
          backgroundImage: `url(${backgroundImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }"
      />
      <div v-else class="absolute inset-0" :style="{ backgroundColor: primaryColor }" />
      <!-- Blur + dim to match reference look -->
      <div class="absolute inset-0 backdrop-blur-3xl bg-black/20" />
    </div>

    <!-- Content -->
    <section class="pt-14 pb-4">
      <div class="max-w-5xl mx-auto px-4">
        <h2 class="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-white font-serif">Latest Posts</h2>
      </div>
    </section>

    <section class="pb-16">
      <div class="max-w-5xl mx-auto px-4">
        <!-- Loading State -->
        <div v-if="postsStore.loading" class="flex justify-center items-center py-20">
          <div class="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
        </div>

        <!-- Error State -->
        <div v-else-if="postsStore.error" class="text-center py-12">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 text-red-600 border border-red-200 mb-4">⚠️ {{ postsStore.error }}</div>
          <div>
            <button
              @click="postsStore.loadPosts()"
              class="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>

        <!-- Content when loaded -->
        <div v-else class="space-y-6">
          <!-- Category filter as a subtle card -->
          <div class="rounded-2xl border border-white/30 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 backdrop-blur p-4">
            <CategoryFilter />
          </div>

          <!-- No posts found -->
          <div v-if="postsStore.filteredPosts.length === 0" class="text-center py-20">
            <div class="text-gray-700 dark:text-gray-300 text-lg mb-4">
              {{ postsStore.searchQuery ? 'No posts found matching your search.' : 'No posts available.' }}
            </div>
            <button
              v-if="postsStore.searchQuery"
              @click="postsStore.clearSearch()"
              class="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 transition-colors"
            >
              Clear Search
            </button>
          </div>

          <!-- Posts Grid -->
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
            <BlogCard
              v-for="post in postsStore.filteredPosts"
              :key="post.id"
              :post="post"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Newsletter (kept minimal, separate from hero) -->
    <section class="py-12">
      <div class="max-w-3xl mx-auto px-4">
        <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-2xl border border-gray-200/70 dark:border-gray-700 p-6 text-center">
          <h3 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Stay Updated</h3>
          <p class="text-gray-600 dark:text-gray-300 mb-6">Subscribe to my newsletter for the latest posts and updates.</p>
          <div class="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              v-model="newsletterEmail"
              type="email"
              placeholder="Enter your email"
              class="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 dark:bg-gray-700 dark:text-white transition-colors"
            >
            <button
              @click="subscribe"
              :disabled="!newsletterEmail.trim() || subscribing"
              class="bg-pink-500 text-white px-6 py-3 rounded-lg hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {{ subscribing ? 'Subscribing...' : 'Subscribe' }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { usePostsStore } from '../stores/posts'
import { useThemeStore } from '../stores/theme'
import BlogCard from '../components/BlogCard.vue'
import CategoryFilter from '../components/CategoryFilter.vue'

const postsStore = usePostsStore()
const themeStore = useThemeStore()

const newsletterEmail = ref('')
const subscribing = ref(false)
const primaryColor = ref('#667eea')
const blogTitle = ref('Welcome to My Blog')
const blogDescription = ref('Discover insights, tutorials, and thoughts on web development, programming, and technology.')
const backgroundImageUrl = ref('')

const subscribe = async () => {
  if (!newsletterEmail.value.trim()) return

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(newsletterEmail.value)) {
    alert('Please enter a valid email address')
    return
  }

  subscribing.value = true

  try {
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: newsletterEmail.value })
    })

    const result = await response.json()

    if (result.success) {
      alert('Thank you for subscribing!')
      newsletterEmail.value = ''
    } else {
      alert(result.error || 'Subscription failed. Please try again.')
    }
  } catch (error) {
    console.error('Subscription error:', error)
    alert('An error occurred. Please try again.')
  } finally {
    subscribing.value = false
  }
}

onMounted(async () => {
  themeStore.initTheme()
  
  // Load settings
  try {
    const [themeRes, blogRes, bgRes] = await Promise.all([
      fetch('/api/settings/theme'),
      fetch('/api/settings/blog-info'),
      fetch('/api/settings/background')
    ])
    
    if (themeRes.ok) {
      const themeData = await themeRes.json()
      if (themeData.theme?.primaryColor) {
        primaryColor.value = themeData.theme.primaryColor
      }
    }
    
    if (blogRes.ok) {
      const blogData = await blogRes.json()
      if (blogData.blogInfo?.title) {
        blogTitle.value = blogData.blogInfo.title
      }
      if (blogData.blogInfo?.description) {
        blogDescription.value = blogData.blogInfo.description
      }
    }
    
    if (bgRes.ok) {
      const bgData = await bgRes.json()
      if (bgData.backgroundUrl) {
        backgroundImageUrl.value = bgData.backgroundUrl
      } else {
        backgroundImageUrl.value = ''
      }
    }
  } catch (error) {
    console.log('Failed to load settings:', error)
  }
  
  await postsStore.loadPosts()
  await postsStore.loadCategories()
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
