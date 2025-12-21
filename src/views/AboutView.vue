<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Hero Section -->
    <section class="bg-gradient-to-br from-teal-400 via-blue-500 to-purple-600 text-white py-20">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div class="mb-8">
          <img
            :src="author.profilePicture"
            alt="Profile"
            class="w-32 h-32 rounded-full mx-auto border-4 border-white shadow-lg object-cover"
          >
        </div>
        <h1 class="text-4xl md:text-5xl font-bold mb-4">
          {{ author.name || 'zedong254ke' }}
        </h1>
        <p class="text-xl opacity-90 mb-6">
          {{ author.bio || 'Passionate developer sharing knowledge through code and creativity' }}
        </p>
        <div class="flex justify-center space-x-6">
          <a
            v-if="author.social?.twitter"
            :href="`https://twitter.com/${author.social.twitter}`"
            target="_blank"
            class="text-white hover:text-blue-200 transition-colors"
            title="Twitter"
          >
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
            </svg>
          </a>
          <a
            v-if="author.social?.linkedin"
            :href="`https://linkedin.com/in/${author.social.linkedin}`"
            target="_blank"
            class="text-white hover:text-blue-300 transition-colors"
            title="LinkedIn"
          >
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
          <a
            v-if="author.social?.github"
            :href="`https://github.com/${author.social.github}`"
            target="_blank"
            class="text-white hover:text-gray-300 transition-colors"
            title="GitHub"
          >
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          <a
            v-if="author.social?.website"
            :href="author.social.website"
            target="_blank"
            class="text-white hover:text-teal-200 transition-colors"
            title="Website"
          >
            🌐
          </a>
        </div>
      </div>
    </section>

    <!-- About Content -->
    <section class="py-16 bg-white dark:bg-gray-800">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <!-- Bio Section -->
          <div>
            <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-6">About Me</h2>
            <div class="prose prose-lg dark:prose-invert max-w-none">
              <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                Hello! I'm a passionate developer who loves creating digital experiences that make a difference.
                With a background in web development, I enjoy exploring new technologies and sharing what I learn along the way.
              </p>
              <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                When I'm not coding, you can find me exploring the latest trends in technology, contributing to open-source projects,
                or sharing my knowledge through blog posts and tutorials.
              </p>
              <p class="text-gray-600 dark:text-gray-300 leading-relaxed">
                I believe in the power of community and continuous learning. Whether it's through this blog or other platforms,
                I'm always excited to connect with fellow developers and share insights from my journey.
              </p>
            </div>
          </div>

          <!-- Skills/Interests -->
          <div>
            <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-6">What I Do</h2>
            <div class="space-y-6">
              <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">Web Development</h3>
                <p class="text-gray-600 dark:text-gray-300">
                  Building modern, responsive web applications using the latest technologies and best practices.
                </p>
              </div>

              <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">Open Source</h3>
                <p class="text-gray-600 dark:text-gray-300">
                  Contributing to open-source projects and sharing knowledge through tutorials and documentation.
                </p>
              </div>

              <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">Tech Writing</h3>
                <p class="text-gray-600 dark:text-gray-300">
                  Writing about technology, development practices, and sharing insights from real-world projects.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Contact Section -->
        <div class="mt-16 bg-gradient-to-r from-pink-50 to-teal-50 dark:from-gray-700 dark:to-gray-600 rounded-lg p-8">
          <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">Get In Touch</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div v-if="author.email" class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div class="text-3xl mb-3">📧</div>
              <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Email</h3>
              <a
                :href="`mailto:${author.email}`"
                class="text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 transition-colors"
              >
                {{ author.email }}
              </a>
            </div>

            <div v-if="author.phone" class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div class="text-3xl mb-3">📱</div>
              <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Phone</h3>
              <a
                :href="`tel:${author.phone}`"
                class="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
              >
                {{ author.phone }}
              </a>
            </div>

            <div v-if="author.social?.website" class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div class="text-3xl mb-3">🌐</div>
              <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Website</h3>
              <a
                :href="author.social.website"
                target="_blank"
                class="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
              >
                Visit Website
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const author = ref({
  name: 'zedong254ke',
  bio: 'Passionate developer sharing knowledge through code and creativity',
  email: '',
  phone: '',
  profilePicture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zedong',
  social: {
    twitter: 'zedong254ke',
    linkedin: 'zedong254ke',
    github: 'zedong254ke',
    website: ''
  }
})

onMounted(async () => {
  // Load author settings from API
  try {
    const response = await fetch('/api/settings/author')
    const data = await response.json()
    if (data.author) {
      author.value = { ...author.value, ...data.author }
    }
  } catch (error) {
    console.log('Failed to load author settings:', error)
  }
})
</script>

<style scoped>
.prose {
  color: #6b7280;
}

.dark .prose {
  color: #d1d5db;
}

.prose p {
  margin-bottom: 1rem;
  line-height: 1.75;
}
</style>
