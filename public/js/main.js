// Main application entry point
import { initIdleTracking, resetIdleTimer } from '../idle-timeout.js';
import { checkAuth, logout } from './auth.js';
import { loadDashboardStats, showDashboard } from './dashboard.js';
import { showPostsSection, togglePostsList, loadPostsList, createNewPost, editPost, deletePost, viewPostStats, toggleSelectAllPosts, updateSelectedCount, deleteSelectedPosts } from './posts.js';
import { showAnalyticsSection, refreshAnalytics, viewEngagementDetails, exportAnalytics, loadTimeAnalytics } from './analytics.js';
import { showSettingsSection, toggleCategoriesList, loadCategories, addCategory, editCategory, deleteCategory, toggleSelectAllCategories, updateSelectedCategoriesCount, deleteSelectedCategories, saveAuthorInfo, saveSecuritySettings, viewCurrentKey, clearKey, saveNotificationSettings, saveContentSettings, handleProfilePictureUpload } from './settings.js';
import { showCustomizeSection, showPrimaryOkButton, showAccentOkButton, confirmPrimaryColor, confirmAccentColor, saveThemeSettings, saveBlogInfo, handleBackgroundUpload, saveBackgroundSettings, previewChanges, applyChanges, previewColorBackground, applyColorBackground, selectPattern } from './customize.js';
import { initializeCharts } from './charts.js';

// Make functions globally available for onclick handlers
window.logout = logout;
window.showDashboard = showDashboard;
window.showPostsSection = showPostsSection;
window.showSettingsSection = showSettingsSection;
window.showAnalyticsSection = showAnalyticsSection;
window.showCustomizeSection = showCustomizeSection;
window.togglePostsList = togglePostsList;
window.loadPostsList = loadPostsList;
window.createNewPost = createNewPost;
window.editPost = editPost;
window.deletePost = deletePost;
window.viewPostStats = viewPostStats;
window.toggleSelectAllPosts = toggleSelectAllPosts;
window.updateSelectedCount = updateSelectedCount;
window.deleteSelectedPosts = deleteSelectedPosts;
window.refreshAnalytics = refreshAnalytics;
window.viewEngagementDetails = viewEngagementDetails;
window.exportAnalytics = exportAnalytics;
window.loadTimeAnalytics = loadTimeAnalytics;
window.toggleCategoriesList = toggleCategoriesList;
window.loadCategories = loadCategories;
window.addCategory = addCategory;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.toggleSelectAllCategories = toggleSelectAllCategories;
window.updateSelectedCategoriesCount = updateSelectedCategoriesCount;
window.deleteSelectedCategories = deleteSelectedCategories;
window.saveAuthorInfo = saveAuthorInfo;
window.saveSecuritySettings = saveSecuritySettings;
window.viewCurrentKey = viewCurrentKey;
window.clearKey = clearKey;
window.saveNotificationSettings = saveNotificationSettings;
window.saveContentSettings = saveContentSettings;
window.handleProfilePictureUpload = handleProfilePictureUpload;
window.showPrimaryOkButton = showPrimaryOkButton;
window.showAccentOkButton = showAccentOkButton;
window.confirmPrimaryColor = confirmPrimaryColor;
window.confirmAccentColor = confirmAccentColor;
window.saveThemeSettings = saveThemeSettings;
window.saveBlogInfo = saveBlogInfo;
window.handleBackgroundUpload = handleBackgroundUpload;
window.saveBackgroundSettings = saveBackgroundSettings;
window.previewChanges = previewChanges;
window.applyChanges = applyChanges;
window.previewColorBackground = previewColorBackground;
window.applyColorBackground = applyColorBackground;
window.selectPattern = selectPattern;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Activity events to reset idle timer
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
        document.addEventListener(event, resetIdleTimer, true);
    });

    // Check authentication on page load
    checkAuth();
});
