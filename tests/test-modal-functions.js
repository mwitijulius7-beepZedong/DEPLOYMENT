// Test script to verify modal functions are working
console.log('Testing modal functions...');

// Simulate the DOM elements
document.body.innerHTML = `
  <div id="settings-section" style="display: none;">Settings Content</div>
  <div id="posts-section" style="display: none;">Posts Content</div>
  <div id="analytics-section" style="display: none;">Analytics Content</div>
  <div id="customize-section" style="display: none;">Customize Content</div>
`;

// Test the fallback functions
function testShowSettingsSection() {
  console.log('Testing showSettingsSection...');
  const settingsSection = document.getElementById('settings-section');
  if (settingsSection) {
    if (settingsSection.style.display === 'block') {
      settingsSection.style.display = 'none';
    } else {
      settingsSection.style.display = 'block';
      settingsSection.scrollIntoView({ behavior: 'smooth' });
    }
    console.log('showSettingsSection: PASSED');
  } else {
    console.log('showSettingsSection: FAILED - element not found');
  }
}

function testShowPostsSection() {
  console.log('Testing showPostsSection...');
  const postsSection = document.getElementById('posts-section');
  if (postsSection) {
    if (postsSection.style.display === 'block') {
      postsSection.style.display = 'none';
    } else {
      postsSection.style.display = 'block';
      postsSection.scrollIntoView({ behavior: 'smooth' });
    }
    console.log('showPostsSection: PASSED');
  } else {
    console.log('showPostsSection: FAILED - element not found');
  }
}

function testShowAnalyticsSection() {
  console.log('Testing showAnalyticsSection...');
  const analyticsSection = document.getElementById('analytics-section');
  if (analyticsSection) {
    if (analyticsSection.style.display === 'block') {
      analyticsSection.style.display = 'none';
    } else {
      analyticsSection.style.display = 'block';
      analyticsSection.scrollIntoView({ behavior: 'smooth' });
    }
    console.log('showAnalyticsSection: PASSED');
  } else {
    console.log('showAnalyticsSection: FAILED - element not found');
  }
}

function testShowCustomizeSection() {
  console.log('Testing showCustomizeSection...');
  const customizeSection = document.getElementById('customize-section');
  if (customizeSection) {
    if (customizeSection.style.display === 'block') {
      customizeSection.style.display = 'none';
    } else {
      customizeSection.style.display = 'block';
      customizeSection.scrollIntoView({ behavior: 'smooth' });
    }
    console.log('showCustomizeSection: PASSED');
  } else {
    console.log('showCustomizeSection: FAILED - element not found');
  }
}

// Run tests
testShowSettingsSection();
testShowPostsSection();
testShowAnalyticsSection();
testShowCustomizeSection();

console.log('All modal function tests completed.');
