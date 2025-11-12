<template>
  <div class="mb-8">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <!-- Filter Buttons -->
      <div class="flex flex-wrap gap-2">
        <button
          @click="setFilter('all')"
          :class="[
            'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
            currentFilter === 'all'
              ? 'bg-pink-500 text-white shadow-md'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          ]"
        >
          All Posts
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          @click="setFilter(category.id)"
          :class="[
            'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
            currentFilter == category.id
              ? 'bg-teal-500 text-white shadow-md'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          ]"
        >
          {{ category.name }}
        </button>
      </div>

      <!-- Search Bar -->
      <div class="relative flex-1 max-w-md">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search posts..."
          class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 dark:bg-gray-700 dark:text-white transition-colors"
          @input="onSearchInput"
        >
        <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
        </svg>
        <button
          v-if="searchQuery"
          @click="clearSearch"
          class="absolute right-3 top-2.5 w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <svg fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Results Summary -->
    <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
      <span>
        Showing {{ filteredPosts.length }} of {{ posts.length }} posts
        <span v-if="currentFilter !== 'all'"> in {{ currentCategoryName }}</span>
        <span v-if="searchQuery"> matching "{{ searchQuery }}"</span>
      </span>
      <button
        v-if="currentFilter !== 'all' || searchQuery"
        @click="clearAllFilters"
        class="text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 font-medium transition-colors"
      >
        Clear filters
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { usePostsStore } from '../stores/posts'

const postsStore = usePostsStore()

const searchQuery = ref('')
const currentFilter = computed(() => postsStore.currentFilter)
const categories = computed(() => postsStore.categories)
const posts = computed(() => postsStore.posts)
const filteredPosts = computed(() => postsStore.filteredPosts)

const currentCategoryName = computed(() => {
  if (currentFilter.value === 'all') return ''
  const category = categories.value.find(cat => cat.id == currentFilter.value)
  return category?.name || ''
})

const setFilter = (filter) => {
  postsStore.setFilter(filter)
}

const onSearchInput = () => {
  postsStore.setSearchQuery(searchQuery.value)
}

const clearSearch = () => {
  searchQuery.value = ''
  postsStore.setSearchQuery('')
}

const clearAllFilters = () => {
  postsStore.clearSearch()
  searchQuery.value = ''
}

// Sync local search query with store
watch(() => postsStore.searchQuery, (newQuery) => {
  searchQuery.value = newQuery
})
</script>
