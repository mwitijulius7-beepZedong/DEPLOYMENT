const puppeteer = require('puppeteer');

async function testCreatePostLayout() {
    console.log('Starting thorough testing of Create Post page layout...');

    let browser;
    try {
        browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        // Set viewport to desktop size
        await page.setViewport({ width: 1200, height: 800 });

        console.log('1. Testing desktop layout...');
        await page.goto('http://localhost:3000/admin.html');

        // Wait for page to load
        await page.waitForSelector('#create-post-section');

        // Click on Create Post nav link
        await page.click('[onclick="showCreatePostSection()"]');

        // Wait for section to be visible
        await page.waitForFunction(() => {
            const section = document.getElementById('create-post-section');
            return section && section.style.display !== 'none';
        });

        // Check for nested scrollbars
        const scrollbars = await page.evaluate(() => {
            const sectionBody = document.querySelector('#create-post-section .section-body');
            const formContainer = document.querySelector('#create-post-section .form-container');
            const formActions = document.querySelector('#create-post-section .form-actions');

            return {
                sectionBodyOverflow: window.getComputedStyle(sectionBody).overflowY,
                formContainerFlex: window.getComputedStyle(formContainer).flex,
                formActionsPosition: window.getComputedStyle(formActions).position,
                hasNestedScrollbar: sectionBody.scrollHeight > sectionBody.clientHeight
            };
        });

        console.log('Scrollbar check results:', scrollbars);

        // Test form elements are accessible
        const formElements = await page.evaluate(() => {
            const titleInput = document.getElementById('post-title');
            const categorySelect = document.getElementById('post-category');
            const contentTextarea = document.getElementById('post-content');
            const saveButton = document.querySelector('#create-post-section .btn-modern');

            return {
                titleVisible: titleInput && titleInput.offsetHeight > 0,
                categoryVisible: categorySelect && categorySelect.offsetHeight > 0,
                contentVisible: contentTextarea && contentTextarea.offsetHeight > 0,
                saveButtonVisible: saveButton && saveButton.offsetHeight > 0
            };
        });

        console.log('Form elements visibility:', formElements);

        // Test responsive behavior
        console.log('2. Testing responsive behavior...');
        await page.setViewport({ width: 768, height: 600 });

        await page.waitForTimeout(500); // Wait for layout to adjust

        const responsiveLayout = await page.evaluate(() => {
            const sectionBody = document.querySelector('#create-post-section .section-body');
            const formContainer = document.querySelector('#create-post-section .form-container');
            const formActions = document.querySelector('#create-post-section .form-actions');

            return {
                sectionBodyFlex: window.getComputedStyle(sectionBody).display,
                formContainerFlex: window.getComputedStyle(formContainer).flex,
                formActionsFlex: window.getComputedStyle(formActions).display
            };
        });

        console.log('Responsive layout:', responsiveLayout);

        // Test form interactions
        console.log('3. Testing form interactions...');
        await page.setViewport({ width: 1200, height: 800 }); // Back to desktop

        // Fill form fields
        await page.type('#post-title', 'Test Post Title');
        await page.select('#post-category', 'technology');
        await page.type('#post-content', 'This is test content for the post.');

        // Check if values are set
        const formValues = await page.evaluate(() => {
            return {
                title: document.getElementById('post-title').value,
                category: document.getElementById('post-category').value,
                content: document.getElementById('post-content').value
            };
        });

        console.log('Form values after input:', formValues);

        // Test scrolling behavior
        console.log('4. Testing scrolling behavior...');
        const scrollTest = await page.evaluate(() => {
            const sectionBody = document.querySelector('#create-post-section .section-body');
            const originalScrollTop = sectionBody.scrollTop;

            // Scroll to bottom
            sectionBody.scrollTop = sectionBody.scrollHeight;
            const scrolledToBottom = sectionBody.scrollTop > originalScrollTop;

            // Check if action buttons are still visible
            const formActions = document.querySelector('#create-post-section .form-actions');
            const actionsRect = formActions.getBoundingClientRect();
            const actionsVisible = actionsRect.top >= 0 && actionsRect.bottom <= window.innerHeight;

            return {
                canScroll: scrolledToBottom,
                actionsAlwaysVisible: actionsVisible
            };
        });

        console.log('Scroll test results:', scrollTest);

        console.log('Testing completed successfully!');

        // Summary
        const allTestsPass = !scrollbars.hasNestedScrollbar &&
                           formElements.titleVisible &&
                           formElements.categoryVisible &&
                           formElements.contentVisible &&
                           formElements.saveButtonVisible &&
                           scrollTest.canScroll;

        console.log('\n=== TEST SUMMARY ===');
        console.log('No nested scrollbars:', !scrollbars.hasNestedScrollbar);
        console.log('Form elements visible:', formElements.titleVisible && formElements.categoryVisible && formElements.contentVisible && formElements.saveButtonVisible);
        console.log('Can scroll content:', scrollTest.canScroll);
        console.log('All tests pass:', allTestsPass);

        return allTestsPass;

    } catch (error) {
        console.error('Test failed:', error);
        return false;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Run the test
testCreatePostLayout().then(success => {
    console.log('\nFinal result:', success ? 'PASS' : 'FAIL');
    process.exit(success ? 0 : 1);
});
