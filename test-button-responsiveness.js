// Test script to check button responsiveness
console.log('Testing button responsiveness...');

// Check if main functions are available
console.log('showPostsSection available:', typeof window.showPostsSection);
console.log('showSettingsSection available:', typeof window.showSettingsSection);
console.log('showAnalyticsSection available:', typeof window.showAnalyticsSection);
console.log('createNewPost available:', typeof window.createNewPost);

// Check if buttons exist and have event listeners
const buttons = document.querySelectorAll('button');
console.log('Total buttons found:', buttons.length);

buttons.forEach((button, index) => {
    const onclick = button.getAttribute('onclick');
    const hasOnclick = !!onclick;
    const isVisible = button.offsetWidth > 0 && button.offsetHeight > 0;
    const isClickable = !button.disabled && button.style.pointerEvents !== 'none';

    console.log(`Button ${index + 1}:`, {
        text: button.textContent.trim().substring(0, 30) + '...',
        hasOnclick,
        onclick: onclick ? onclick.substring(0, 50) + '...' : null,
        isVisible,
        isClickable,
        display: window.getComputedStyle(button).display,
        position: window.getComputedStyle(button).position
    });

    // Test click if possible
    if (hasOnclick && isVisible && isClickable) {
        try {
            button.click();
            console.log(`Button ${index + 1} clicked successfully`);
        } catch (error) {
            console.error(`Button ${index + 1} click failed:`, error);
        }
    }
});

// Check for any overlapping elements that might block clicks
const testElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
console.log('Element at center of screen:', testElement ? testElement.tagName + (testElement.id ? '#' + testElement.id : '') : 'none');

console.log('Button responsiveness test complete.');
