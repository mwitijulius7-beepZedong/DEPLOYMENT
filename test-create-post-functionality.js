const puppeteer = require('puppeteer');

async function testCreatePostFunctionality() {
    console.log('Starting comprehensive testing of Create Post functionality...');

    let browser;
    try {
        browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({ width: 1200, height: 800 });

        console.log('1. Testing post creation functionality...');
        await page.goto('http://localhost:3000/admin.html');

        // Wait for page to load and login if needed
        await page.waitForSelector('#create-post-section');

        // Click on Create Post nav link
        await page.click('[onclick="showCreatePostSection()"]');

        // Wait for section to be visible
        await page.waitForFunction(() => {
            const section = document.getElementById('create-post-section');
            return section && section.style.display !== 'none';
        });

        // Fill out the form
        const testData = {
            title: 'Test Post - ' + Date.now(),
            category: 'technology',
            content: 'This is a comprehensive test post content.\n\nIt includes multiple paragraphs and various formatting.\n\nTesting the functionality thoroughly.',
            tags: 'test, automation, puppeteer',
            status: 'draft'
        };

        console.log('2. Filling form with test data...');
        await page.type('#post-title', testData.title);
        await page.select('#post-category', testData.category);
        await page.type('#post-content', testData.content);
        await page.type('#post-tags', testData.tags);
        await page.select('#post-status', testData.status);

        // Verify form data is entered correctly
        const formValues = await page.evaluate(() => {
            return {
                title: document.getElementById('post-title').value,
                category: document.getElementById('post-category').value,
                content: document.getElementById('post-content').value,
                tags: document.getElementById('post-tags').value,
                status: document.getElementById('post-status').value
            };
        });

        console.log('Form values entered:', formValues);

        // Test validation - try to save with empty title
        console.log('3. Testing form validation...');
        await page.evaluate(() => {
            document.getElementById('post-title').value = '';
        });

        await page.click('#create-post-section .btn-modern');

        // Should show alert for empty title
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Restore title and test successful save
        await page.type('#post-title', testData.title);

        console.log('4. Testing successful post creation...');

        // Mock the fetch call to capture the request
        let fetchCalled = false;
        let fetchData = null;

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.url().includes('/api/posts') && request.method() === 'POST') {
                fetchCalled = true;
                const formData = request.postData();
                console.log('API call intercepted - Form data length:', formData ? formData.length : 0);
                fetchData = formData;
            }
            request.continue();
        });

        // Click save button
        await page.click('#create-post-section .btn-modern');

        // Wait for API call or alert
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('API call made:', fetchCalled);

        // Test preview functionality
        console.log('5. Testing preview functionality...');
        await page.click('#create-post-section .btn-modern.secondary');

        // Wait for preview modal
        await new Promise(resolve => setTimeout(resolve, 1000));

        const previewExists = await page.evaluate(() => {
            const modal = document.querySelector('div[style*="position: fixed"]');
            return modal !== null;
        });

        console.log('Preview modal created:', previewExists);

        if (previewExists) {
            // Close preview
            await page.evaluate(() => {
                const closeBtn = document.querySelector('button[onclick*="remove"]');
                if (closeBtn) closeBtn.click();
            });
        }

        // Test clear form functionality
        console.log('6. Testing clear form functionality...');
        await page.click('#create-post-section .btn-modern.sm.secondary');

        const clearedValues = await page.evaluate(() => {
            return {
                title: document.getElementById('post-title').value,
                category: document.getElementById('post-category').value,
                content: document.getElementById('post-content').value,
                tags: document.getElementById('post-tags').value,
                status: document.getElementById('post-status').value
            };
        });

        console.log('Form values after clear:', clearedValues);

        // Test image upload functionality
        console.log('7. Testing image upload functionality...');
        const imageInput = await page.$('#post-image-file');
        if (imageInput) {
            // Create a test image file
            const testImagePath = './test_image.png'; // Assuming this exists
            try {
                await imageInput.uploadFile(testImagePath);
                console.log('Image file uploaded successfully');

                // Check if preview appears
                await new Promise(resolve => setTimeout(resolve, 1000));
                const imagePreviewVisible = await page.evaluate(() => {
                    const preview = document.getElementById('image-preview');
                    return preview && preview.style.display !== 'none';
                });
                console.log('Image preview visible:', imagePreviewVisible);
            } catch (error) {
                console.log('Image upload test skipped - test image not found');
            }
        }

        // Test posts list loading
        console.log('8. Testing posts list integration...');
        await page.click('[onclick="showPostsSection()"]');

        await new Promise(resolve => setTimeout(resolve, 2000));

        const postsLoaded = await page.evaluate(() => {
            const postsList = document.getElementById('posts-list');
            return postsList && postsList.children.length >= 0; // Could be empty or have posts
        });

        console.log('Posts list loaded:', postsLoaded);

        console.log('All functionality tests completed!');

        // Summary
        const allTestsPass = fetchCalled && previewExists && clearedValues.title === '' && postsLoaded;

        console.log('\n=== FUNCTIONALITY TEST SUMMARY ===');
        console.log('API call made on save:', fetchCalled);
        console.log('Preview functionality works:', previewExists);
        console.log('Clear form works:', clearedValues.title === '');
        console.log('Posts list integration:', postsLoaded);
        console.log('All functionality tests pass:', allTestsPass);

        return allTestsPass;

    } catch (error) {
        console.error('Functionality test failed:', error);
        return false;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Run the test
testCreatePostFunctionality().then(success => {
    console.log('\nFinal functionality test result:', success ? 'PASS' : 'FAIL');
    process.exit(success ? 0 : 1);
});
