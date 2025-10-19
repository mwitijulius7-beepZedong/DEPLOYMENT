<template>
  <div id="app">
    <div class="animated-background">
      <div class="bg-image" :style="{ backgroundImage: backgroundImage ? 'url(' + backgroundImage + ')' : '' }"></div>
    </div>
    
    <Header 
      :blog-title="blogTitle"
      :current-view="currentView"
      :is-logged-in="isLoggedIn"
      :is-dark-mode="isDarkMode"
      :profile-photo="profilePhoto"
      :show-settings-menu="showSettingsMenu"
      @blog-click="handleBlogClick"
      @create-post="createNewPost"
      @toggle-analytics="toggleAnalytics"
      @toggle-theme="toggleTheme"
      @open-settings="openSettings"
      @open-categories="openCategories"
      @logout="logout"
      @show-profile-upload="showProfileUpload = true"
    />
    
    <!-- Content overlay WITHOUT header inside -->
    <div class="content-overlay">
      <div class="container">
        <!-- Main content goes here -->
        <router-view />
      </div>
    </div>
  </div>
</template>

<script>
import Header from './components/Header.vue'

export default {
  name: 'App',
  components: {
    Header
  },
  data() {
    return {
      blogTitle: 'zedong254ke',
      currentView: 'blog',
      isLoggedIn: false,
      isDarkMode: false,
      profilePhoto: '',
      showSettingsMenu: false,
      showProfileUpload: false,
      backgroundImage: ''
    }
  },
  methods: {
    handleBlogClick() {
      if (this.isLoggedIn) {
        window.open(window.location.origin + window.location.pathname, '_blank');
      } else {
        this.currentView = 'blog';
      }
    },
    createNewPost() {
      this.resetAdminView();
      this.showNewPostForm = true;
      this.dashboardView = 'posts';
    },
    toggleAnalytics() {
      this.showAnalytics = !this.showAnalytics;
      this.currentView = 'admin';
    },
    toggleTheme() {
      this.isDarkMode = !this.isDarkMode;
      localStorage.setItem('darkMode', this.isDarkMode);
      this.applyTheme();
    },
    openSettings(tab) {
      this.activeSettingsTab = tab;
      this.dashboardView = 'posts';
      this.currentView = 'admin';
      this.showAnalytics = false;
      this.showNewPostForm = false;
      this.editingPost = null;
      this.showSettingsMenu = false;
    },
    openCategories() {
      this.activeSettingsTab = null;
      this.showCategoryManagement = true;
      this.showSettingsMenu = false;
    },
    logout() {
      fetch('/auth/logout', { method: 'POST', credentials: 'include' })
        .then(() => {
          this.isLoggedIn = false;
          this.showNewPostForm = false;
          this.editingPost = null;
        })
        .catch(() => {
          this.isLoggedIn = false;
          this.showNewPostForm = false;
          this.editingPost = null;
        });
      this.showSettingsMenu = false;
    },
    applyTheme() {
      document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');
    },
    resetAdminView() {
      this.showNewPostForm = false;
      this.editingPost = null;
      this.showAnalytics = false;
      this.activeSettingsTab = null;
      this.showSettingsMenu = false;
    }
  }
}
</script>

<style>
@import './styles/header.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  width: 100%;
  min-height: 100vh;
}

.animated-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.bg-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.content-overlay {
  /* No position property - let it be static */
  min-height: 100vh;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 120px 2rem 2rem 2rem; /* Top padding for fixed header */
  overflow: visible;
  position: relative;
  z-index: 1;
}

@media (max-width: 900px) {
  .container {
    padding-top: 160px;
  }
}
</style>