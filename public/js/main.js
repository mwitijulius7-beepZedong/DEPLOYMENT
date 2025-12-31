// Main application entry point
let initIdleTracking, resetIdleTimer, checkAuth, logout, loadDashboardStats, showDashboard;
let showPostsSection, togglePostsList, loadPostsList, createNewPost, editPost, deletePost, viewPostStats, toggleSelectAllPosts, updateSelectedCount, deleteSelectedPosts;
let showAnalyticsSection, refreshAnalytics, viewEngagementDetails, exportAnalytics, loadTimeAnalytics;
let showSettingsSection, toggleCategoriesList, loadCategories, addCategory, editCategory, deleteCategory, toggleSelectAllCategories, updateSelectedCategoriesCount, deleteSelectedCategories, saveAuthorInfo, saveSecuritySettings, viewCurrentKey, clearKey, saveNotificationSettings, saveContentSettings, handleProfilePictureUpload;
let showCustomizeSection, showPrimaryOkButton, showAccentOkButton, confirmPrimaryColor, confirmAccentColor, saveThemeSettings, saveBlogInfo, handleBackgroundUpload, saveBackgroundSettings, previewChanges, applyChanges, previewColorBackground, applyColorBackground, selectPattern;
let initializeCharts;

try {
    let idleTimeoutModule;
    try {
        idleTimeoutModule = await import('../idle-timeout.js');
    } catch (firstError) {
        console.warn('Failed to load ../idle-timeout.js, trying ./idle-timeout.js:', firstError.message);
        idleTimeoutModule = await import('./idle-timeout.js');
    }
    initIdleTracking = idleTimeoutModule.initIdleTracking;
    resetIdleTimer = idleTimeoutModule.resetIdleTimer;
} catch (error) {
    console.error('Failed to load idle-timeout.js from both paths:', error);
    initIdleTracking = () => {};
    resetIdleTimer = () => {};
}

try {
    const authModule = await import('./auth.js');
    checkAuth = authModule.checkAuth;
    logout = authModule.logout;
} catch (error) {
    console.error('Failed to load auth.js:', error);
    checkAuth = () => {};
    logout = () => {};
}

try {
    const dashboardModule = await import('./dashboard.js');
    loadDashboardStats = dashboardModule.loadDashboardStats;
    showDashboard = dashboardModule.showDashboard;
} catch (error) {
    console.error('Failed to load dashboard.js:', error);
    loadDashboardStats = () => {};
    showDashboard = () => {};
}

try {
    const postsModule = await import('./posts.js');
    showPostsSection = postsModule.showPostsSection;
    togglePostsList = postsModule.togglePostsList;
    loadPostsList = postsModule.loadPostsList;
    createNewPost = postsModule.createNewPost;
    editPost = postsModule.editPost;
    deletePost = postsModule.deletePost;
    viewPostStats = postsModule.viewPostStats;
    toggleSelectAllPosts = postsModule.toggleSelectAllPosts;
    updateSelectedCount = postsModule.updateSelectedCount;
    deleteSelectedPosts = postsModule.deleteSelectedPosts;
} catch (error) {
    console.error('Failed to load posts.js:', error);
    showPostsSection = () => {};
    togglePostsList = () => {};
    loadPostsList = () => {};
    createNewPost = () => {};
    editPost = () => {};
    deletePost = () => {};
    viewPostStats = () => {};
    toggleSelectAllPosts = () => {};
    updateSelectedCount = () => {};
    deleteSelectedPosts = () => {};
}

try {
    const analyticsModule = await import('./analytics.js');
    showAnalyticsSection = analyticsModule.showAnalyticsSection;
    refreshAnalytics = analyticsModule.refreshAnalytics;
    viewEngagementDetails = analyticsModule.viewEngagementDetails;
    exportAnalytics = analyticsModule.exportAnalytics;
    loadTimeAnalytics = analyticsModule.loadTimeAnalytics;
} catch (error) {
    console.error('Failed to load analytics.js:', error);
    showAnalyticsSection = () => {};
    refreshAnalytics = () => {};
    viewEngagementDetails = () => {};
    exportAnalytics = () => {};
    loadTimeAnalytics = () => {};
}

try {
    const settingsModule = await import('./settings.js');
    showSettingsSection = settingsModule.showSettingsSection;
    toggleCategoriesList = settingsModule.toggleCategoriesList;
    loadCategories = settingsModule.loadCategories;
    addCategory = settingsModule.addCategory;
    editCategory = settingsModule.editCategory;
    deleteCategory = settingsModule.deleteCategory;
    toggleSelectAllCategories = settingsModule.toggleSelectAllCategories;
    updateSelectedCategoriesCount = settingsModule.updateSelectedCategoriesCount;
    deleteSelectedCategories = settingsModule.deleteSelectedCategories;
    saveAuthorInfo = settingsModule.saveAuthorInfo;
    saveSecuritySettings = settingsModule.saveSecuritySettings;
    viewCurrentKey = settingsModule.viewCurrentKey;
    clearKey = settingsModule.clearKey;
    saveNotificationSettings = settingsModule.saveNotificationSettings;
    saveContentSettings = settingsModule.saveContentSettings;
    handleProfilePictureUpload = settingsModule.handleProfilePictureUpload;
} catch (error) {
    console.error('Failed to load settings.js:', error);
    showSettingsSection = () => {};
    toggleCategoriesList = () => {};
    loadCategories = () => {};
    addCategory = () => {};
    editCategory = () => {};
    deleteCategory = () => {};
    toggleSelectAllCategories = () => {};
    updateSelectedCategoriesCount = () => {};
    deleteSelectedCategories = () => {};
    saveAuthorInfo = () => {};
    saveSecuritySettings = () => {};
    viewCurrentKey = () => {};
    clearKey = () => {};
    saveNotificationSettings = () => {};
    saveContentSettings = () => {};
    handleProfilePictureUpload = () => {};
}

try {
    const customizeModule = await import('./customize.js');
    showCustomizeSection = customizeModule.showCustomizeSection;
    showPrimaryOkButton = customizeModule.showPrimaryOkButton;
    showAccentOkButton = customizeModule.showAccentOkButton;
    confirmPrimaryColor = customizeModule.confirmPrimaryColor;
    confirmAccentColor = customizeModule.confirmAccentColor;
    saveThemeSettings = customizeModule.saveThemeSettings;
    saveBlogInfo = customizeModule.saveBlogInfo;
    handleBackgroundUpload = customizeModule.handleBackgroundUpload;
    saveBackgroundSettings = customizeModule.saveBackgroundSettings;
    previewChanges = customizeModule.previewChanges;
    applyChanges = customizeModule.applyChanges;
    previewColorBackground = customizeModule.previewColorBackground;
    applyColorBackground = customizeModule.applyColorBackground;
    selectPattern = customizeModule.selectPattern;
} catch (error) {
    console.error('Failed to load customize.js:', error);
    showCustomizeSection = () => {};
    showPrimaryOkButton = () => {};
    showAccentOkButton = () => {};
    confirmPrimaryColor = () => {};
    confirmAccentColor = () => {};
    saveThemeSettings = () => {};
    saveBlogInfo = () => {};
    handleBackgroundUpload = () => {};
    saveBackgroundSettings = () => {};
    previewChanges = () => {};
    applyChanges = () => {};
    previewColorBackground = () => {};
    applyColorBackground = () => {};
    selectPattern = () => {};
}

try {
    const chartsModule = await import('./charts.js');
    initializeCharts = chartsModule.initializeCharts;
} catch (error) {
    console.error('Failed to load charts.js:', error);
    initializeCharts = () => {};
}

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

// Fallback function definitions in case module loading fails
function defineFallbackFunctions() {
    console.log('Checking for missing functions...');

    if (typeof window.showCustomizeSection === 'undefined') {
        console.log('Defining fallback showCustomizeSection');
        window.showCustomizeSection = function() {
            console.log('showCustomizeSection called (fallback)');
            const customizeSection = document.getElementById('customize-section');
            if (customizeSection) {
                if (customizeSection.style.display === 'block') {
                    customizeSection.style.display = 'none';
                } else {
                    customizeSection.style.display = 'block';
                    customizeSection.scrollIntoView({ behavior: 'smooth' });
                }
            } else {
                console.error('customize-section element not found');
            }
        };
    }

    if (typeof window.showPostsSection === 'undefined') {
        console.log('Defining fallback showPostsSection');
        window.showPostsSection = function() {
            console.log('showPostsSection called (fallback)');
            const postsSection = document.getElementById('posts-section');
            if (postsSection) {
                if (postsSection.style.display === 'block') {
                    postsSection.style.display = 'none';
                } else {
                    postsSection.style.display = 'block';
                    postsSection.scrollIntoView({ behavior: 'smooth' });
                }
            }
        };
    }

    if (typeof window.showSettingsSection === 'undefined') {
        console.log('Defining fallback showSettingsSection');
        window.showSettingsSection = function() {
            console.log('showSettingsSection called (fallback)');
            const settingsSection = document.getElementById('settings-section');
            if (settingsSection) {
                if (settingsSection.style.display === 'block') {
                    settingsSection.style.display = 'none';
                } else {
                    settingsSection.style.display = 'block';
                    settingsSection.scrollIntoView({ behavior: 'smooth' });
                }
            }
        };
    }

    if (typeof window.showAnalyticsSection === 'undefined') {
        console.log('Defining fallback showAnalyticsSection');
        window.showAnalyticsSection = function() {
            console.log('showAnalyticsSection called (fallback)');
            const analyticsSection = document.getElementById('analytics-section');
            if (analyticsSection) {
                if (analyticsSection.style.display === 'block') {
                    analyticsSection.style.display = 'none';
                } else {
                    analyticsSection.style.display = 'block';
                    analyticsSection.scrollIntoView({ behavior: 'smooth' });
                }
            }
        };
    }

    console.log('Fallback functions check complete:', {
        showCustomizeSection: typeof window.showCustomizeSection,
        showPostsSection: typeof window.showPostsSection,
        showSettingsSection: typeof window.showSettingsSection,
        showAnalyticsSection: typeof window.showAnalyticsSection
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Define fallback functions immediately
    defineFallbackFunctions();

    // Activity events to reset idle timer
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
        document.addEventListener(event, resetIdleTimer, true);
    });

    // Check authentication on page load
    checkAuth();
});
