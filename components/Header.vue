<template>
  <header class="header">
    <div class="header-content">
      <div class="header-left">
        <div class="profile-photo" :style="{ backgroundImage: profilePhoto ? `url('${profilePhoto}')` : '' }" @click="handleProfileClick" :title="profileTitle">
          <div v-if="!profilePhoto" class="profile-placeholder">👤</div>
        </div>
        <div class="logo">{{ blogTitle }}</div>
      </div>
      <nav class="nav">
        <button type="button" @click="handleBlogClick" :class="{ active: currentView === 'blog' }">Blog</button>
        <template v-if="currentView === 'admin' && isLoggedIn">
          <button type="button" @click="createNewPost">+ New Post</button>
          <button type="button" @click="toggleAnalytics">Analytics</button>
        </template>
        <button type="button" class="theme-toggle" @click="toggleTheme" :title="themeTitle">
          {{ isDarkMode ? '☀️' : '🌙' }}
        </button>
        <template v-if="currentView === 'admin' && isLoggedIn">
          <div class="settings-dropdown">
            <button type="button" @click="toggleSettingsMenu">Settings ▼</button>
            <div v-if="showSettingsMenu" class="dropdown-menu" @click.stop>
              <button type="button" @click="openSettings('general')">General</button>
              <button type="button" @click="openSettings('background')">Background</button>
              <button type="button" @click="openSettings('social')">Social Links</button>
              <button type="button" @click="openSettings('email')">Email Config</button>
              <button type="button" @click="openCategories">Categories</button>
              <button type="button" @click="openSettings('profile')">Profile Photo</button>
              <button type="button" @click="logout" class="logout-btn">Logout</button>
            </div>
          </div>
        </template>
      </nav>
    </div>
  </header>
</template>

<script>
export default {
  name: 'Header',
  props: {
    blogTitle: String,  // camelCase
    currentView: String,
    isLoggedIn: Boolean,
    isDarkMode: Boolean,
    profilePhoto: String,
    showSettingsMenu: Boolean
  },

  computed: {
    profileTitle() {
      return this.currentView === 'admin' && this.isLoggedIn ? 'Click to change photo' : '';
    },
    themeTitle() {
      return this.isDarkMode ? 'Switch to light mode' : 'Switch to dark mode';
    }
  },
  methods: {
    handleProfileClick() {
      if (this.currentView === 'admin' && this.isLoggedIn) {
        this.$emit('show-profile-upload');
      }
    },
    handleBlogClick() {
      this.$emit('blog-click');
    },
    createNewPost() {
      this.$emit('create-post');
    },
    toggleAnalytics() {
      this.$emit('toggle-analytics');
    },
    toggleTheme() {
      this.$emit('toggle-theme');
    },
    toggleSettingsMenu() {
      this.$emit('toggle-settings-menu');
    },
    openSettings(tab) {
      this.$emit('open-settings', tab);
    },
    openCategories() {
      this.$emit('open-categories');
    },
    logout() {
      this.$emit('logout');
    }
  }
}
</script>