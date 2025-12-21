<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center items-center min-h-screen">
      <div class="loading-spinner w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex flex-col items-center justify-center min-h-screen px-4">
      <div class="text-red-500 text-6xl mb-4">⚠️</div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Post Not Found</h1>
      <p class="text-gray-600 dark:text-gray-300 mb-6 text-center">{{ error }}</p>
      <router-link
        to="/"
        class="bg-pink-500 text-white px-6 py-3 rounded-lg hover:bg-pink-600 transition-colors"
      >
        ← Back to Home
      </router-link>
    </div>

    <!-- Post Content -->
    <article v-else-if="post" class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <!-- Back Button -->
      <div class="mb-8">
        <router-link
          to="/"
          class="inline-flex items-center text-gray-600 dark:text-gray-300 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
          </svg>
          Back to Posts
        </router-link>
      </div>

      <!-- Post Header -->
      <header class="mb-8">
        <!-- Category Badge -->
        <div v-if="categoryName" class="mb-4">
          <span class="inline-block px-3 py-1 text-sm font-medium bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 rounded-full">
            {{ categoryName }}
          </span>
        </div>

        <!-- Title -->
        <h1 class="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
          {{ post.title }}
        </h1>

        <!-- Meta Information -->
        <div class="flex flex-wrap items-center gap-6 text-sm text-gray-500 dark:text-gray-400 mb-6">
          <div class="flex items-center">
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
            </svg>
            {{ post.author || 'Admin' }}
          </div>
          <div class="flex items-center">
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" />
            </svg>
            {{ formatDate(post.date) }}
          </div>
          <div class="flex items-center">
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.414L11 9.586V6z" clip-rule="evenodd" />
            </svg>
            {{ readingTime }} min read
          </div>
        </div>

        <!-- Featured Badge -->
        <div v-if="post.featured" class="mb-6">
          <span class="inline-flex items-center px-3 py-1 text-sm font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full">
            <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Featured Post
          </span>
        </div>
      </header>

      <!-- Featured Image -->
      <div v-if="post.image" class="mb-8">
        <img
          :src="post.image"
          :alt="post.title"
          class="w-full h-64 md:h-96 object-cover rounded-xl shadow-lg"
        >
      </div>

      <!-- Post Content -->
      <div
        class="prose prose-lg dark:prose-invert max-w-none mb-8"
        v-html="post.content"
      ></div>

      <!-- Tags -->
      <div v-if="post.tags && post.tags.length > 0" class="mb-8">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tags</h3>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="tag in post.tags"
            :key="tag"
            class="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
          >
            #{{ tag }}
          </span>
        </div>
      </div>

      <!-- Share Section -->
      <div class="border-t border-gray-200 dark:border-gray-700 pt-8 mb-8">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Share this post</h3>
        <div class="flex gap-4">
          <button
            @click="shareOnTwitter"
            class="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
            </svg>
            Twitter
          </button>
          <button
            @click="shareOnLinkedIn"
            class="flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 transition-colors"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            LinkedIn
          </button>
          <button
            @click="copyLink"
            class="flex items-center gap-2 bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd" />
            </svg>
            Copy Link
          </button>
        </div>
      </div>

      <!-- Author Bio -->
      <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 mb-8">
        <div class="flex items-start gap-4">
          <img
            :src="authorProfilePicture"
            alt="Author"
            class="w-16 h-16 rounded-full object-cover border-2 border-pink-500"
          >
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Written by {{ post.author || 'Admin' }}
            </h3>
            <p class="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              Passionate developer sharing knowledge through code and creativity.
              Exploring modern web technologies and building meaningful digital experiences.
            </p>
          </div>
        </div>
      </div>

      <!-- Related Posts (placeholder for future implementation) -->
      <div class="border-t border-gray-200 dark:border-gray-700 pt-8">
        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-6">Related Posts</h3>
        <p class="text-gray-600 dark:text-gray-300">
          Related posts feature coming soon...
        </p>
      </div>
    </article>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePostsStore } from '../stores/posts'

const route = useRoute()
const postsStore = usePostsStore()

const post = ref(null)
const loading = ref(true)
const error = ref(null)
const authorProfilePicture = ref('https://api.dicebear.com/7.x/avataaars/svg?seed=zedong')

const categoryName = computed(() => {
  if (!post.value?.categoryId) return null
  const category = postsStore.categories.find(cat => cat.id == post.value.categoryId)
  return category?.name || null
})

const readingTime = computed(() => {
  if (!post.value?.content) return 1
  const words = post.value.content.replace(/<[^>]*>/g, '').split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
})

const formatDate = (dateString) => {
  if (!dateString) return 'Unknown'
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch (error) {
    return 'Unknown'
  }
}

const shareOnTwitter = () => {
  const url = encodeURIComponent(window.location.href)
  const text = encodeURIComponent(`Check out this post: ${post.value.title}`)
  window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank')
}

const shareOnLinkedIn = () => {
  const url = encodeURIComponent(window.location.href)
  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank')
}

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(window.location.href)
    alert('Link copied to clipboard!')
  } catch (err) {
    console.error('Failed to copy link:', err)
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = window.location.href
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    alert('Link copied to clipboard!')
  }
}

onMounted(async () => {
  const postId = parseInt(route.params.id)

  try {
    post.value = await postsStore.getPostById(postId)
  } catch (err) {
    error.value = err.message || 'Failed to load post'
  } finally {
    loading.value = false
  }

  // Load author settings
  try {
    const response = await fetch('/api/settings/author')
    const data = await response.json()
    if (data.author?.profilePicture) {
      authorProfilePicture.value = data.author.profilePicture
    }
  } catch (error) {
    console.log('Failed to load author settings:', error)
  }
})
</script>

<style scoped>
.prose {
  color: #374151;
}

.dark .prose {
  color: #d1d5db;
}

.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
  color: #111827;
}

.dark .prose h1, .dark .prose h2, .dark .prose h3, .dark .prose h4, .dark .prose h5, .dark .prose h6 {
  color: #f9fafb;
}

.prose a {
  color: #f472b6;
  text-decoration: none;
}

.prose a:hover {
  text-decoration: underline;
}

.prose code {
  background-color: #f3f4f6;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
}

.dark .prose code {
  background-color: #374151;
}

.prose pre {
  background-color: #f3f4f6;
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
}

.dark .prose pre {
  background-color: #1f2937;
}

.prose blockquote {
  border-left: 4px solid #f472b6;
  padding-left: 1rem;
  font-style: italic;
}
</style>
