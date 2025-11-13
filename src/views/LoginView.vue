<template>
  <div class="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-teal-500 flex items-center justify-center px-4">
    <div class="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Admin Login</h1>
        <p class="text-gray-600 dark:text-gray-300">Access the blog administration panel</p>
      </div>

      <!-- Login Form -->
      <form @submit.prevent="handleLogin" class="space-y-6">
        <!-- Username -->
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Username
          </label>
          <input
            id="username"
            v-model="credentials.username"
            type="text"
            required
            class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 dark:bg-gray-700 dark:text-white transition-colors"
            placeholder="Enter your username"
          >
        </div>

        <!-- Password -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Password
          </label>
          <input
            id="password"
            v-model="credentials.password"
            type="password"
            required
            class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 dark:bg-gray-700 dark:text-white transition-colors"
            placeholder="Enter your password"
          >
        </div>

        <!-- Error Message -->
        <div v-if="error" class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <p class="text-red-800 dark:text-red-200 text-sm">{{ error }}</p>
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-pink-500 text-white py-3 px-4 rounded-lg hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {{ loading ? 'Signing In...' : 'Sign In' }}
        </button>
      </form>

      <!-- Google Login Option -->
      <div class="mt-6">
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Or continue with</span>
          </div>
        </div>

        <button
          @click="handleGoogleLogin"
          :disabled="googleLoading"
          class="mt-4 w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-3 px-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {{ googleLoading ? 'Signing In...' : 'Continue with Google' }}
        </button>
      </div>

      <!-- Forgot Password Link -->
      <div class="mt-6 text-center">
        <button
          @click="showForgotPassword = true"
          class="text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 text-sm transition-colors"
        >
          Forgot your password?
        </button>
      </div>

      <!-- Back to Blog Link -->
      <div class="mt-6 text-center">
        <router-link
          to="/"
          class="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm transition-colors"
        >
          ← Back to Blog
        </router-link>
      </div>
    </div>

    <!-- Forgot Password Modal -->
    <div v-if="showForgotPassword" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click="showForgotPassword = false">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Reset Password</h3>
        <p class="text-gray-600 dark:text-gray-300 text-sm mb-4">
          Enter your email address and we'll send you a link to reset your password.
        </p>
        <input
          v-model="resetEmail"
          type="email"
          placeholder="Enter your email"
          class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 dark:bg-gray-700 dark:text-white mb-4"
        >
        <div class="flex justify-end space-x-2">
          <button @click="showForgotPassword = false" class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button @click="handlePasswordReset" class="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors">
            Send Reset Link
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const credentials = ref({
  username: '',
  password: ''
})

const loading = ref(false)
const googleLoading = ref(false)
const error = ref('')
const showForgotPassword = ref(false)
const resetEmail = ref('')

const handleLogin = async () => {
  loading.value = true
  error.value = ''

  const result = await authStore.login(credentials.value)

  if (result.success) {
    router.push('/admin') // Redirect to admin panel (to be implemented)
  } else {
    error.value = result.error
  }

  loading.value = false
}

const handleGoogleLogin = async () => {
  googleLoading.value = true
  error.value = ''

  try {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (window.google && window.google.accounts) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        callback: async (response) => {
          if (response.access_token) {
            // Send token to backend
            const backendResponse = await fetch('/auth/google', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ id_token: response.id_token }),
              credentials: 'include'
            })

            const result = await backendResponse.json()

            if (result.success) {
              await authStore.checkAuth()
              router.push('/admin') // Redirect to admin panel
            } else {
              error.value = result.error
            }
          }
        }
      })

      client.requestAccessToken()
    } else {
      error.value = 'Google Sign-In not available'
    }
  } catch (err) {
    console.error('Google login error:', err)
    error.value = 'Failed to initialize Google Sign-In'
  }

  googleLoading.value = false
}

const handlePasswordReset = async () => {
  if (!resetEmail.value.trim()) {
    alert('Please enter your email address')
    return
  }

  try {
    const response = await fetch('/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: resetEmail.value })
    })

    const result = await response.json()

    if (result.success) {
      alert('Password reset email sent! Check your inbox.')
      showForgotPassword.value = false
      resetEmail.value = ''
    } else {
      alert(result.error || 'Failed to send reset email')
    }
  } catch (error) {
    console.error('Password reset error:', error)
    alert('An error occurred. Please try again.')
  }
}

// Load Google Sign-In script
const loadGoogleScript = () => {
  if (!document.querySelector('script[src*="accounts.google.com"]')) {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  }
}

loadGoogleScript()
</script>
