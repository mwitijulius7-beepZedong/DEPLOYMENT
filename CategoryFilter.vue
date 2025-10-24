<template>
  <div>
    <div class="category-filter">
      <button
          v-for="category in allCategories"
          :key="category.id"
          @click="toggleCategory(category.id)"
          :class="{ active: selectedCategory === category.id || (selectedCategory === '' && category.id === 'all') }"
      >
          {{ category.name }}
      </button>
    </div>

    <!-- Filtered posts display -->
    <div v-if="filteredPosts.length === 0" class="empty-state">
      <h3>No posts match the selected category</h3>
      <p>Try selecting a different category.</p>
    </div>
    <div v-else class="posts-grid">
      <div v-for="post in filteredPosts" :key="post.id" class="post-card" @click="viewPost(post)">
        <h2 class="post-title">{{ post.title }}</h2>
        <div class="post-meta">{{ formatDate(post.date) }} · {{ post.author }}</div>
        <p class="post-excerpt">{{ getExcerpt(post.content) }}</p>
        <div class="post-tags">
          <span v-for="tag in post.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CategoryFilter',
  data() {
    return {
      selectedCategory: '', // Default to 'all' (empty string)
      categories: [
        { id: 'tech', name: 'Technology' },
        { id: 'lifestyle', name: 'Lifestyle' },
        { id: 'travel', name: 'Travel' },
        { id: 'food', name: 'Food' }
      ], // Example categories; replace with your actual categories
      posts: [
        // Example posts; replace with your actual posts data
        {
          id: 1,
          title: 'Tech Post',
          author: 'Author1',
          date: '2023-10-01',
          content: 'This is a tech post content...',
          categoryId: 'tech',
          tags: ['tech', 'coding']
        },
        {
          id: 2,
          title: 'Lifestyle Post',
          author: 'Author2',
          date: '2023-10-02',
          content: 'This is a lifestyle post content...',
          categoryId: 'lifestyle',
          tags: ['lifestyle', 'health']
        },
        {
          id: 3,
          title: 'Travel Post',
          author: 'Author3',
          date: '2023-10-03',
          content: 'This is a travel post content...',
          categoryId: 'travel',
          tags: ['travel', 'adventure']
        }
      ]
    };
  },
  computed: {
    allCategories() {
      return [
        { id: 'all', name: 'All' },
        ...this.categories
      ];
    },
    filteredPosts() {
      if (this.selectedCategory === '' || this.selectedCategory === 'all') {
        return this.posts; // Show all posts
      }
      return this.posts.filter(post => post.categoryId === this.selectedCategory);
    }
  },
  methods: {
    toggleCategory(categoryId) {
      if (categoryId === 'all') {
        this.selectedCategory = '';
      } else {
        this.selectedCategory = categoryId;
      }
    },
    viewPost(post) {
      // Handle viewing the post (e.g., navigate to post detail)
      console.log('Viewing post:', post);
      // You can emit an event or use router here
    },
    formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    },
    getExcerpt(content) {
      return content.length > 150 ? content.substring(0, 150) + '...' : content;
    }
  }
};
</script>

<style scoped>
.category-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1rem 0;
}

.category-filter button {
  padding: 0.5rem 1rem;
  border: 2px solid #e5e7eb;
  background: white;
  color: #374151;
  border-radius: 9999px; /* Pill shape */
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.category-filter button:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.category-filter button.active {
  background: #06b6d4; /* Cyan background */
  color: white;
  border-color: #06b6d4;
  box-shadow: 0 4px 6px -1px rgba(6, 182, 212, 0.1);
}

.posts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
}

.post-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.3s, box-shadow 0.3s;
  cursor: pointer;
}

.post-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

.post-title {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #06b6d4;
}

.post-meta {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.post-excerpt {
  color: #555;
  line-height: 1.8;
}

.post-tags {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag {
  background: #e0f2fe;
  color: #06b6d4;
  padding: 0.25rem 0.75rem;
  border-radius: 15px;
  font-size: 0.85rem;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #9ca3af;
}

.empty-state h3 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
</style>
