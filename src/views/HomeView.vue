<template>
  <div class="min-h-screen">
    <!-- Hero Section -->
    <section class="text-white py-20" :style="{ backgroundColor: primaryColor, backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 class="text-4xl md:text-6xl font-bold mb-6 animate-fade-in">
          {{ blogTitle }}
        </h1>
        <p class="text-xl md:text-2xl mb-8 opacity-90 max-w-3xl mx-auto">
          {{ blogDescription }}
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <router-link
            to="/about"
            class="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105"
          >
            Learn More About Me
          </router-link>
          <a
            href="#posts"
            class="bg-white hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105"
            :style="{ color: primaryColor }"
          >
            Read My Posts
          </a>
        </div>
      </div>
    </section>

    <!-- Posts Section -->
    <section id="posts" class="py-16 bg-gray-50 dark:bg-gray-900">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Section Header -->
        <div class="text-center mb-12">
          <h2 class="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Latest Posts
          </h2>
          <p class="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Explore my thoughts, tutorials, and insights on various topics in technology and development.
          </p>
        </div>

        <!-- Loading State -->
        <div v-if="postsStore.loading" class="flex justify-center items-center py-20">
          <div class="loading-spinner w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full"></div>
        </div>

        <!-- Error State -->
        <div v-else-if="postsStore.error" class="text-center py-20">
          <div class="text-red-500 text-lg mb-4">⚠️ {{ postsStore.error }}</div>
          <button
            @click="postsStore.loadPosts()"
            class="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 transition-colors"
          >
            Try Again
          </button>
        </div>

        <!-- Posts Grid -->
        <div v-else>
          <CategoryFilter />

          <!-- No posts found -->
          <div v-if="postsStore.filteredPosts.length === 0" class="text-center py-20">
            <div class="text-gray-500 dark:text-gray-400 text-lg mb-4">
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
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <BlogCard
              v-for="post in postsStore.filteredPosts"
              :key="post.id"
              :post="post"
              class="fade-in"
            />
          </div>

          <!-- Load More Button (if needed in future) -->
          <div v-if="postsStore.filteredPosts.length > 0 && postsStore.filteredPosts.length === postsStore.posts.length" class="text-center mt-12">
            <p class="text-gray-500 dark:text-gray-400">
              You've reached the end of the posts.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Newsletter Section -->
    <section class="py-16 bg-white dark:bg-gray-800">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Stay Updated
        </h2>
        <p class="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Subscribe to my newsletter for the latest posts and updates.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
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
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fadeIn 1s ease-out;
}

.fade-in {
  animation: fadeIn 0.6s ease-out;
}
</style>
