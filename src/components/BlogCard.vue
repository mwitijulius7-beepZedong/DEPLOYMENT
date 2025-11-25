<template>
  <div class="bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-2xl border border-gray-200/70 dark:border-gray-700 shadow-[0_4px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_40px_rgba(0,0,0,0.12)] transition-all duration-300 overflow-hidden group cursor-pointer">
    <!-- Featured Image -->
    <div v-if="post.image" class="relative overflow-hidden px-4 pt-4">
      <img
        :src="post.image"
        :alt="post.title"
        class="w-full h-56 object-cover rounded-xl ring-1 ring-black/5 group-hover:scale-[1.02] transition-transform duration-300"
      >
      <div class="pointer-events-none absolute inset-x-4 top-4 h-56 rounded-xl bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    </div>

    <!-- Content -->
    <div class="p-6">
      <!-- Title -->
      <h3 class="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-3 line-clamp-2 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors font-serif">
        {{ post.title }}
      </h3>

      <!-- Meta Information -->
      <div class="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-4 space-x-4">
        <span class="flex items-center">
          <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
          </svg>
          {{ post.author || 'Admin' }}
        </span>
        <span class="flex items-center">
          <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" />
          </svg>
          {{ formatDate(post.date) }}
        </span>
        <span class="flex items-center">
          <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
          </svg>
          {{ readingTime }} min read
        </span>
      </div>

      <!-- Excerpt -->
      <p class="text-gray-700 dark:text-gray-300 text-sm leading-7 mb-4 line-clamp-3">
        {{ excerpt }}
      </p>

      <!-- Tags -->
      <div v-if="post.tags && post.tags.length > 0" class="flex flex-wrap gap-2 mb-2">
        <span
          v-for="tag in post.tags.slice(0, 3)"
          :key="tag"
          class="px-3 py-1 text-xs font-medium bg-pink-100 text-pink-700 rounded-full"
        >
          {{ tag }}
        </span>
        <span
          v-if="post.tags.length > 3"
          class="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
        >
          +{{ post.tags.length - 3 }} more
        </span>
      </div>

      <!-- Read More -->
      <div class="flex items-center justify-between pt-2">
        <router-link
          :to="`/post/${post.id}`"
          class="inline-flex items-center text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 font-medium transition-colors group"
        >
          Read more
          <svg class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </router-link>

        <!-- Featured Badge -->
        <span v-if="post.featured" class="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full">
          ⭐ Featured
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePostsStore } from '../stores/posts'

const props = defineProps({
  post: {
    type: Object,
    required: true
  }
})

const postsStore = usePostsStore()

const categoryName = computed(() => {
  if (!props.post.categoryId) return null
  const category = postsStore.categories.find(cat => cat.id == props.post.categoryId)
  return category?.name || null
})

const excerpt = computed(() => {
  if (!props.post.content) return ''
  const text = props.post.content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return text.length > 150 ? text.substring(0, 150) + '...' : text
})

const readingTime = computed(() => {
  if (!props.post.content) return 1
  const words = props.post.content.replace(/<[^>]*>/g, '').split(/\s+/).length
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
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
