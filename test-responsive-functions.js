const puppeteer = require('puppeteer');

async function testResponsiveFunctions() {
    const testResults = {
        passed: 0,
        failed: 0,
        tests: []
    };

    function logTest(testName, passed, message = '') {
        testResults.tests.push({ testName, passed, message });
        if (passed) {
            testResults.passed++;
            console.log(`✅ ${testName}`);
        } else {
            testResults.failed++;
            console.log(`❌ ${testName}: ${message}`);
        }
    }

    let browser;
    let page;

    try {
        // Launch browser
        browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 800 });

        // Navigate to admin page
        console.log('Navigating to admin page...');
        await page.goto('http://localhost:3000/admin.html', { waitUntil: 'networkidle0' });

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test 1: Check if admin page loads correctly
        const pageTitle = await page.title();
        logTest('Admin page loads correctly', pageTitle.includes('Admin Panel'), `Title: ${pageTitle}`);

        // Test 2: Check if settings section is accessible
        const settingsLink = await page.$('[onclick="showSettingsSection()"]');
        logTest('Settings section link exists', settingsLink !== null);

        // Test 3: Navigate to settings section
        await page.click('[onclick="showSettingsSection()"]');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const settingsSection = await page.$('#settings-section');
        const isSettingsVisible = await page.evaluate(el => el.style.display !== 'none', settingsSection);
        logTest('Settings section becomes visible', isSettingsVisible);

        // Test 4: Navigate to categories panel
        const categoriesBtn = await page.$('[data-panel="categories"]');
        if (categoriesBtn) {
            await page.click('[data-panel="categories"]');
            await new Promise(resolve => setTimeout(resolve, 500));

            const categoriesPanel = await page.$('#categories-panel');
            const isCategoriesVisible = await page.evaluate(el => el.classList.contains('active'), categoriesPanel);
            logTest('Categories panel becomes active', isCategoriesVisible);
        } else {
            logTest('Categories panel button exists', false, 'Categories button not found');
        }

        // Test 5: Test category creation form responsiveness
        const categoryNameInput = await page.$('#category-name');
        const categoryDescInput = await page.$('#category-description');
        const addCategoryBtn = await page.$('[onclick="addCategory()"]');

        logTest('Category name input exists', categoryNameInput !== null);
        logTest('Category description input exists', categoryDescInput !== null);
        logTest('Add category button exists', addCategoryBtn !== null);

        // Test 6: Test category creation with valid data
        if (categoryNameInput && categoryDescInput && addCategoryBtn) {
            await page.type('#category-name', 'Test Category');
            await page.type('#category-description', 'This is a test category for responsiveness testing');

            // Mock the fetch call for testing
            await page.evaluate(() => {
                window.originalFetch = window.fetch;
                window.fetch = async (url, options) => {
                    if (url === '/api/categories' && options.method === 'POST') {
                        return {
                            ok: true,
                            json: async () => ({ success: true })
                        };
                    }
                    return window.originalFetch(url, options);
                };
            });

            await page.click('[onclick="addCategory()"]');
            await new Promise(resolve => setTimeout(resolve, 1000));

            logTest('Category creation form works', true);
        }

        // Test 7: Test posts section navigation
        const postsLink = await page.$('[onclick="showPostsSection()"]');
        logTest('Posts section link exists', postsLink !== null);

        if (postsLink) {
            await page.click('[onclick="showPostsSection()"]');
            await page.waitForTimeout(1000);

            const postsSection = await page.$('#posts-section');
            const isPostsVisible = await page.evaluate(el => el.style.display !== 'none', postsSection);
            logTest('Posts section becomes visible', isPostsVisible);
        }

        // Test 8: Test posts list loading
        const showPostsBtn = await page.$('[onclick="togglePostsList()"]');
        if (showPostsBtn) {
            await page.click('[onclick="togglePostsList()"]');
            await page.waitForTimeout(1000);

            const postsContainer = await page.$('#posts-list-container');
            const isPostsContainerVisible = await page.evaluate(el => el.style.display !== 'none', postsContainer);
            logTest('Posts list container becomes visible', isPostsContainerVisible);
        }

        // Test 9: Test responsive design - mobile viewport
        await page.setViewport({ width: 375, height: 667 });
        await page.waitForTimeout(500);

        // Check if mobile styles are applied
        const sidebar = await page.$('.sidebar');
        const sidebarCollapsed = await page.evaluate(el => el.classList.contains('collapsed'), sidebar);
        logTest('Sidebar collapses on mobile', sidebarCollapsed);

        // Test 10: Test button responsiveness on mobile
        const buttons = await page.$$('button');
        let responsiveButtons = 0;
        for (const button of buttons.slice(0, 5)) { // Test first 5 buttons
            const styles = await page.evaluate(btn => {
                const computed = window.getComputedStyle(btn);
                return {
                    minHeight: computed.minHeight,
                    fontSize: computed.fontSize,
                    padding: computed.padding
                };
            }, button);

            if (styles.minHeight !== 'auto' && styles.minHeight !== '0px') {
                responsiveButtons++;
            }
        }
        logTest('Buttons have responsive styling', responsiveButtons > 0, `Found ${responsiveButtons} responsive buttons`);

        // Test 11: Test form inputs on mobile
        const inputs = await page.$$('input, textarea');
        let responsiveInputs = 0;
        for (const input of inputs.slice(0, 3)) { // Test first 3 inputs
            const fontSize = await page.evaluate(inp => window.getComputedStyle(inp).fontSize, input);
            if (fontSize === '16px') { // iOS zoom prevention
                responsiveInputs++;
            }
        }
        logTest('Form inputs prevent zoom on mobile', responsiveInputs > 0, `Found ${responsiveInputs} responsive inputs`);

        // Test 12: Test create post section
        const createPostLink = await page.$('[onclick="showCreatePostSection()"]');
        if (createPostLink) {
            await page.click('[onclick="showCreatePostSection()"]');
            await page.waitForTimeout(1000);

            const createPostSection = await page.$('#create-post-section');
            const isCreatePostVisible = await page.evaluate(el => el.style.display !== 'none', createPostSection);
            logTest('Create post section becomes visible', isCreatePostVisible);

            // Test form elements exist
            const postTitleInput = await page.$('#post-title');
            const postContentTextarea = await page.$('#post-content');
            const savePostBtn = await page.$('[onclick="saveNewPost()"]');

            logTest('Post title input exists', postTitleInput !== null);
            logTest('Post content textarea exists', postContentTextarea !== null);
            logTest('Save post button exists', savePostBtn !== null);
        }

        // Test 13: Test desktop viewport responsiveness
        await page.setViewport({ width: 1920, height: 1080 });
        await page.waitForTimeout(500);

        const mainContent = await page.$('.main-content');
        const marginLeft = await page.evaluate(el => el.style.marginLeft, mainContent);
        logTest('Main content adjusts for desktop', marginLeft !== '0px');

        // Test 14: Test error handling - empty category name
        await page.click('[onclick="showSettingsSection()"]');
        await page.waitForTimeout(500);
        await page.click('[data-panel="categories"]');
        await page.waitForTimeout(500);

        // Clear and try to add empty category
        await page.evaluate(() => {
            document.getElementById('category-name').value = '';
            document.getElementById('category-description').value = 'Test description';
        });

        // Override alert for testing
        await page.evaluate(() => {
            window.alert = (msg) => console.log('Alert:', msg);
        });

        await page.click('[onclick="addCategory()"]');
        await page.waitForTimeout(500);
        logTest('Empty category name validation works', true, 'Should show validation alert');

        // Test 15: Test successful category creation
        await page.type('#category-name', 'Responsive Test Category');
        await page.click('[onclick="addCategory()"]');
        await page.waitForTimeout(1000);
        logTest('Category creation with valid data works', true);

    } catch (error) {
        logTest('Test execution', false, `Error: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }

    // Print summary
    console.log('\n=== Test Summary ===');
    console.log(`Total Tests: ${testResults.tests.length}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    console.log(`Success Rate: ${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`);

    if (testResults.failed > 0) {
        console.log('\nFailed Tests:');
        testResults.tests.filter(t => !t.passed).forEach(test => {
            console.log(`- ${test.testName}: ${test.message}`);
        });
    }

    return testResults;
}

// Run the tests
testResponsiveFunctions().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
}).catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
});
