import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const isAuthenticated = computed(() => !!user.value)

  const login = async (credentials) => {
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
        credentials: 'include'
      })

      const data = await response.json()

      if (data.success) {
        user.value = data
        return { success: true }
      } else {
        return { success: false, error: data.error }
      }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: 'Network error' }
    }
  }

  const logout = async () => {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
      user.value = null
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const checkAuth = async () => {
    try {
      const response = await fetch('/auth/status', {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        if (data.loggedIn) {
          user.value = data.user
        } else {
          user.value = null
        }
      }
    } catch (error) {
      console.error('Auth check error:', error)
      user.value = null
    }
  }

  return {
    user,
    isAuthenticated,
    login,
    logout,
    checkAuth
  }
})
