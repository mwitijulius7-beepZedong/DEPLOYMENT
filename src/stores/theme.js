import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(false)

  // Theme object matching JSON structure
  const theme = ref({
    background: '#ffffff',
    text: '#000000',
    header: {
      background: '#f8f9fa',
      text: '#000000'
    },
    fonts: {
      heading: 'serif',
      body: 'sans-serif'
    },
    text: {
      heading: '#000000'
    },
    divider: '#cccccc',
    buttons: {
      primary: {
        background: '#007bff',
        text: '#ffffff'
      }
    }
  })

  // Initialize theme from localStorage or system preference
  const initTheme = () => {
    const saved = localStorage.getItem('theme')
    if (saved) {
      isDark.value = saved === 'dark'
    } else {
      // Check system preference
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    applyTheme()
  }

  const toggleTheme = () => {
    isDark.value = !isDark.value
    applyTheme()
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add('dark')
      // Update theme for dark mode
      theme.value = {
        background: '#1a1a1a',
        text: '#ffffff',
        header: {
          background: '#2d2d2d',
          text: '#ffffff'
        },
        fonts: {
          heading: 'serif',
          body: 'sans-serif'
        },
        text: {
          heading: '#ffffff'
        },
        divider: '#555555',
        buttons: {
          primary: {
            background: '#0056b3',
            text: '#ffffff'
          }
        }
      }
    } else {
      document.documentElement.classList.remove('dark')
      // Update theme for light mode
      theme.value = {
        background: '#ffffff',
        text: '#000000',
        header: {
          background: '#f8f9fa',
          text: '#000000'
        },
        fonts: {
          heading: 'serif',
          body: 'sans-serif'
        },
        text: {
          heading: '#000000'
        },
        divider: '#cccccc',
        buttons: {
          primary: {
            background: '#007bff',
            text: '#ffffff'
          }
        }
      }
    }
  }

  // Watch for changes and apply theme
  watch(isDark, applyTheme)

  return {
    isDark,
    theme,
    toggleTheme,
    initTheme
  }
})
