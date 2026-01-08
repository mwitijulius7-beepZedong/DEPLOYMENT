// Test script for sidebar menu functions
console.log('Testing Sidebar Menu Functions...');

// Test 1: Check if sidebar buttons exist
const navButtons = document.querySelectorAll('.settings-nav-btn');
console.log(`Found ${navButtons.length} sidebar navigation buttons`);

// Test 2: Check if panels exist
const panels = document.querySelectorAll('.settings-panel');
console.log(`Found ${panels.length} settings panels`);

// Test 3: Test panel switching functionality
function testPanelSwitching() {
    console.log('Testing panel switching...');

    // Click each button and verify panel switching
    navButtons.forEach((button, index) => {
        const targetPanel = button.getAttribute('data-panel');
        console.log(`Testing button ${index + 1}: ${targetPanel}`);

        // Simulate click
        button.click();

        // Check if button has active class
        const isButtonActive = button.classList.contains('active');
        console.log(`  Button active: ${isButtonActive}`);

        // Check if corresponding panel is active
        const panel = document.getElementById(`${targetPanel}-panel`);
        const isPanelActive = panel && panel.classList.contains('active');
        console.log(`  Panel active: ${isPanelActive}`);

        // Check if other panels are inactive
        const otherPanelsActive = Array.from(panels).filter(p => p !== panel && p.classList.contains('active'));
        console.log(`  Other panels inactive: ${otherPanelsActive.length === 0}`);

        if (!isButtonActive || !isPanelActive || otherPanelsActive.length > 0) {
            console.error(`❌ Panel switching failed for ${targetPanel}`);
        } else {
            console.log(`✅ Panel switching works for ${targetPanel}`);
        }
    });
}

// Test 4: Test responsive behavior
function testResponsiveBehavior() {
    console.log('Testing responsive behavior...');

    const sidebar = document.querySelector('.settings-sidebar');
    const container = document.querySelector('.settings-container');

    // Test tablet breakpoint (1024px)
    container.style.maxWidth = '1024px';
    const tabletFlexDirection = getComputedStyle(container).flexDirection;
    console.log(`Tablet layout (1024px): flex-direction = ${tabletFlexDirection}`);

    // Test mobile breakpoint (768px)
    container.style.maxWidth = '768px';
    const mobileFlexDirection = getComputedStyle(container).flexDirection;
    console.log(`Mobile layout (768px): flex-direction = ${mobileFlexDirection}`);

    // Reset
    container.style.maxWidth = '';
}

// Test 5: Test initial state
function testInitialState() {
    console.log('Testing initial state...');

    // Check if first button is active
    const firstButton = navButtons[0];
    const isFirstButtonActive = firstButton.classList.contains('active');
    console.log(`First button active: ${isFirstButtonActive}`);

    // Check if first panel is active
    const firstPanel = panels[0];
    const isFirstPanelActive = firstPanel.classList.contains('active');
    console.log(`First panel active: ${isFirstPanelActive}`);

    if (!isFirstButtonActive || !isFirstPanelActive) {
        console.error('❌ Initial state incorrect');
    } else {
        console.log('✅ Initial state correct');
    }
}

// Run all tests
function runTests() {
    console.log('='.repeat(50));
    console.log('SIDEBAR MENU FUNCTION TESTS');
    console.log('='.repeat(50));

    testInitialState();
    testPanelSwitching();
    testResponsiveBehavior();

    console.log('='.repeat(50));
    console.log('TESTS COMPLETED');
    console.log('='.repeat(50));
}

// Initialize settings navigation first
initSettingsNavigation();
initPasswordToggle();

// Wait a bit for initialization, then run tests
setTimeout(runTests, 100);
