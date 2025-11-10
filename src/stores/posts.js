import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePostsStore = defineStore('posts', () => {
  const posts = ref([])
  const categories = ref([])
  const loading = ref(false)
  const error = ref(null)
  const currentFilter = ref('all')
  const searchQuery = ref('')

  const filteredPosts = computed(() => {
    let filtered = posts.value

    // Apply category filter
    if (currentFilter.value !== 'all') {
      filtered = filtered.filter(post => post.categoryId == currentFilter.value)
    }

    // Apply search filter
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      filtered = filtered.filter(post =>
        post.title.toLowerCase().includes(query) ||
        post.content.toLowerCase().includes(query) ||
        post.tags?.some(tag => tag.toLowerCase().includes(query)) ||
        post.author?.toLowerCase().includes(query)
      )
    }

    return filtered
  })

  const loadPosts = async () => {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/posts')
      const data = await response.json()
      posts.value = data.posts || []
    } catch (err) {
      error.value = 'Failed to load posts'
      console.error('Load posts error:', err)
    } finally {
      loading.value = false
    }
  }

  const loadCategories = async () => {
    try {
      const response = await fetch('/api/categories')
      const data = await response.json()
      categories.value = data.categories || []
    } catch (err) {
      console.error('Load categories error:', err)
    }
  }

  const getPostById = async (id) => {
    try {
      const response = await fetch(`/api/posts/${id}`)
      if (!response.ok) throw new Error('Post not found')
      const data = await response.json()
      return data.post
    } catch (err) {
      console.error('Get post error:', err)
      throw err
    }
  }

  const setFilter = (filter) => {
    currentFilter.value = filter
  }

  const setSearchQuery = (query) => {
    searchQuery.value = query
  }

  const clearSearch = () => {
    searchQuery.value = ''
    currentFilter.value = 'all'
  }

  return {
    posts,
    categories,
    loading,
    error,
    currentFilter,
    searchQuery,
    filteredPosts,
    loadPosts,
    loadCategories,
    getPostById,
    setFilter,
    setSearchQuery,
    clearSearch
  }
})
