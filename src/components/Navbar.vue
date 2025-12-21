<template>
  <header class="sticky top-0 z-50 shadow-sm">
    <div class="bg-indigo-600 w-full" :style="{ backgroundColor: themeColor }">
      <div class="w-full px-4 lg:px-6">
        <div class="h-16 flex items-center justify-between gap-2 sm:gap-4">
          <!-- Logo / Title -->
          <router-link to="/" class="flex items-center gap-3 text-white hover:opacity-90 transition-opacity flex-shrink-0">
            <img
              :src="profilePicture"
              alt="Profile picture"
              class="w-10 h-10 rounded-full border border-white/60 object-cover"
              width="40"
              height="40"
            >
            <h1 class="text-lg sm:text-xl font-semibold whitespace-nowrap">{{ blogTitle }}</h1>
          </router-link>

          <!-- Navigation -->
          <nav class="hidden md:flex items-center gap-2 lg:gap-4 whitespace-nowrap flex-1 overflow-hidden">
            <router-link to="/" class="text-white hover:bg-white/20 px-2 lg:px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-1 text-sm lg:text-base flex-shrink-0">
              <span>🏠</span>
              <span class="hidden lg:inline">Home</span>
            </router-link>
            <router-link to="/" class="text-white hover:bg-white/20 px-2 lg:px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-1 text-sm lg:text-base flex-shrink-0">
              <span>📝</span>
              <span class="hidden lg:inline">Blog</span>
            </router-link>
            <router-link to="/about" class="text-white hover:bg-white/20 px-2 lg:px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-1 text-sm lg:text-base flex-shrink-0">
              <span>ℹ️</span>
              <span class="hidden lg:inline">About</span>
            </router-link>

            <!-- Newsletter input -->
            <input
              v-model="email"
              type="email"
              placeholder="Subscribe to newsletter"
              class="px-3 py-2 rounded-lg border border-white/20 bg-white/10 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all w-40 lg:w-56 flex-shrink-0"
              @keypress.enter="subscribe"
            >

            <!-- Search button -->
            <button
              @click="openSearch"
              class="text-white hover:bg-white/20 px-2 lg:px-3 py-2 rounded-lg transition-all duration-200 flex-shrink-0"
            >
              <span class="hidden lg:inline">🔍 Search</span>
              <span class="lg:hidden">🔍</span>
            </button>

            <!-- Admin button -->
            <button
              @click="openAdminModal"
              class="bg-white/10 hover:bg-white/20 text-white border border-white/30 px-2 lg:px-3 py-2 rounded-lg transition-all duration-200 text-xs lg:text-sm flex-shrink-0"
            >
              <span class="hidden lg:inline">🔒 Admin</span>
              <span class="lg:hidden">🔒</span>
            </button>
          </nav>

          <!-- Theme toggle -->
          <button
            @click="themeStore.toggleTheme"
            class="text-white hover:bg-white/20 p-2 rounded-lg transition-all duration-200 flex-shrink-0"
            :title="themeStore.isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <svg v-if="themeStore.isDark" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd" />
            </svg>
            <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Search Modal -->
  <div v-if="showSearch" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click="closeSearch">
    <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4" @click.stop>
      <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Search Posts</h3>
      <input
        v-model="searchInput"
        type="text"
        placeholder="Enter search terms..."
        class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 dark:bg-gray-700 dark:text-white"
        @keypress.enter="performSearch"
        ref="searchInputRef"
      >
      <div class="flex justify-end space-x-2 mt-4">
        <button @click="closeSearch" class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          Cancel
        </button>
        <button @click="performSearch" class="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors">
          Search
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useThemeStore } from '../stores/theme'
import { usePostsStore } from '../stores/posts'

const router = useRouter()
const themeStore = useThemeStore()
const postsStore = usePostsStore()

const email = ref('')
const showSearch = ref(false)
const searchInput = ref('')
const searchInputRef = ref(null)
// Default to uploaded image; falls back to Dicebear if settings override not found
const profilePicture = ref('/uploads/1760955634211__DSC1067.jpg')
const themeColor = ref('#667eea')
const blogTitle = ref('My Personal Blog')

const subscribe = async () => {
  if (!email.value.trim()) {
    alert('Please enter your email address')
    return
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.value)) {
    alert('Please enter a valid email address')
    return
  }

  try {
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.value })
    })

    const result = await response.json()

    if (result.success) {
      alert('Thank you for subscribing!')
      email.value = ''
    } else {
      alert(result.error || 'Subscription failed. Please try again.')
    }
  } catch (error) {
    console.error('Subscription error:', error)
    alert('An error occurred. Please try again.')
  }
}

const openSearch = () => {
  showSearch.value = true
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

const closeSearch = () => {
  showSearch.value = false
  searchInput.value = ''
}

const performSearch = () => {
  if (searchInput.value.trim()) {
    postsStore.setSearchQuery(searchInput.value.trim())
    router.push('/')
    closeSearch()
  }
}

const openAdminModal = () => {
  router.push('/login')
}

onMounted(async () => {
  // Load blog settings
  try {
    const [themeRes, authorRes, blogRes] = await Promise.all([
      fetch('/api/settings/theme'),
      fetch('/api/settings/author'),
      fetch('/api/settings/blog-info')
    ])
    
    if (themeRes.ok) {
      const themeData = await themeRes.json()
      if (themeData.theme?.primaryColor) {
        themeColor.value = themeData.theme.primaryColor
      }
    }
    
    if (authorRes.ok) {
      const authorData = await authorRes.json()
      if (authorData.author?.profilePicture) {
        profilePicture.value = authorData.author.profilePicture
      } else {
        // if not provided keep default
      }
    }
    
    if (blogRes.ok) {
      const blogData = await blogRes.json()
      if (blogData.blogInfo?.title) {
        blogTitle.value = blogData.blogInfo.title
      }
    }
  } catch (error) {
    console.log('Failed to load settings:', error)
  }
})
</script>
