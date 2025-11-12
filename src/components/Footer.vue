<template>
  <footer class="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <!-- About -->
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">About</h3>
          <p class="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
            Passionate developer sharing knowledge through code and creativity.
            Exploring modern web technologies and building meaningful digital experiences.
          </p>
        </div>

        <!-- Quick Links -->
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Links</h3>
          <ul class="space-y-2">
            <li>
              <router-link to="/" class="text-gray-600 dark:text-gray-300 hover:text-pink-500 dark:hover:text-pink-400 transition-colors text-sm">
                🏠 Home
              </router-link>
            </li>
            <li>
              <router-link to="/" class="text-gray-600 dark:text-gray-300 hover:text-pink-500 dark:hover:text-pink-400 transition-colors text-sm">
                📝 Blog
              </router-link>
            </li>
            <li>
              <router-link to="/about" class="text-gray-600 dark:text-gray-300 hover:text-pink-500 dark:hover:text-pink-400 transition-colors text-sm">
                ℹ️ About
              </router-link>
            </li>
          </ul>
        </div>

        <!-- Social Links -->
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Connect</h3>
          <div class="flex space-x-4">
            <a
              v-if="author.social?.twitter"
              :href="`https://twitter.com/${author.social.twitter}`"
              target="_blank"
              class="text-gray-600 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              title="Twitter"
            >
              🐦
            </a>
            <a
              v-if="author.social?.linkedin"
              :href="`https://linkedin.com/in/${author.social.linkedin}`"
              target="_blank"
              class="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-500 transition-colors"
              title="LinkedIn"
            >
              💼
            </a>
            <a
              v-if="author.social?.github"
              :href="`https://github.com/${author.social.github}`"
              target="_blank"
              class="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              title="GitHub"
            >
              📖
            </a>
            <a
              v-if="author.social?.website"
              :href="author.social.website"
              target="_blank"
              class="text-gray-600 dark:text-gray-300 hover:text-teal-500 dark:hover:text-teal-400 transition-colors"
              title="Website"
            >
              🌐
            </a>
          </div>
          <p class="text-gray-600 dark:text-gray-300 text-sm mt-4">
            © {{ currentYear }} zedong254ke. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const author = ref({
  social: {
    twitter: 'zedong254ke',
    linkedin: 'zedong254ke',
    github: 'zedong254ke',
    website: ''
  }
})

const currentYear = ref(new Date().getFullYear())

onMounted(async () => {
  // Load author settings
  try {
    const response = await fetch('/api/settings/author')
    const data = await response.json()
    if (data.author) {
      author.value = data.author
    }
  } catch (error) {
    console.log('Failed to load author settings:', error)
  }
})
</script>
