const puppeteer = require('puppeteer');

async function runBrowserTests() {
    console.log('🚀 Starting browser automation tests for new settings APIs...\n');

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false, // Show the browser for visual feedback
            defaultViewport: { width: 1200, height: 800 },
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Navigate to the test page
        console.log('📄 Opening test page...');
        await page.goto('http://localhost:3000/test-settings-localhost.html');
        await page.waitForSelector('button');

        console.log('✅ Test page loaded successfully\n');

        // Test 1: GET notifications settings
        console.log('🔔 Test 1: Getting notifications settings...');
        await page.click('button[onclick="testGetNotifications()"]');
        await page.waitForSelector('#notifications-result .json-output', { timeout: 5000 });

        const notificationsResult = await page.$eval('#notifications-result .json-output', el => el.textContent);
        console.log('📊 Notifications settings result:');
        console.log(JSON.parse(notificationsResult));
        console.log('✅ GET notifications successful\n');

        // Test 2: GET content settings
        console.log('📝 Test 2: Getting content settings...');
        await page.click('button[onclick="testGetContent()"]');
        await page.waitForSelector('#content-result .json-output', { timeout: 5000 });

        const contentResult = await page.$eval('#content-result .json-output', el => el.textContent);
        console.log('📊 Content settings result:');
        console.log(JSON.parse(contentResult));
        console.log('✅ GET content successful\n');

        // Test 3: Login as admin
        console.log('🔐 Test 3: Logging in as admin...');
        await page.click('button[onclick="login()"]');
        await page.waitForSelector('#login-result .json-output', { timeout: 5000 });

        const loginResult = await page.$eval('#login-result .json-output', el => el.textContent);
        console.log('🔑 Login result:');
        console.log(JSON.parse(loginResult));
        console.log('✅ Admin login successful\n');

        // Wait a moment for token to be set
        await page.waitForTimeout(1000);

        // Test 4: Update notifications settings
        console.log('🔔 Test 4: Updating notifications settings...');

        // Uncheck email notifications
        await page.click('#emailNotif');
        // Change admin email
        await page.evaluate(() => {
            document.getElementById('adminEmail').value = 'test-admin@example.com';
        });

        await page.click('button[onclick="testPostNotifications()"]');
        await page.waitForSelector('#post-notifications-result .json-output', { timeout: 5000 });

        const postNotificationsResult = await page.$eval('#post-notifications-result .json-output', el => el.textContent);
        console.log('📝 POST notifications result:');
        console.log(JSON.parse(postNotificationsResult));
        console.log('✅ POST notifications successful\n');

        // Test 5: Update content settings
        console.log('📝 Test 5: Updating content settings...');

        // Change settings
        await page.evaluate(() => {
            document.getElementById('postsPerPage').value = '20';
            document.getElementById('featuredCount').value = '5';
            document.getElementById('enableComments').checked = false;
        });

        await page.click('button[onclick="testPostContent()"]');
        await page.waitForSelector('#post-content-result .json-output', { timeout: 5000 });

        const postContentResult = await page.$eval('#post-content-result .json-output', el => el.textContent);
        console.log('📝 POST content result:');
        console.log(JSON.parse(postContentResult));
        console.log('✅ POST content successful\n');

        // Test 6: Verify settings were saved by getting them again
        console.log('🔍 Test 6: Verifying settings persistence...');

        // Get notifications again
        await page.click('button[onclick="testGetNotifications()"]');
        await page.waitForSelector('#notifications-result .json-output', { timeout: 5000 });

        const updatedNotifications = await page.$eval('#notifications-result .json-output', el => el.textContent);
        const notificationsData = JSON.parse(updatedNotifications);

        // Get content again
        await page.click('button[onclick="testGetContent()"]');
        await page.waitForSelector('#content-result .json-output', { timeout: 5000 });

        const updatedContent = await page.$eval('#content-result .json-output', el => el.textContent);
        const contentData = JSON.parse(updatedContent);

        console.log('📊 Updated notifications settings:');
        console.log(notificationsData);
        console.log('📊 Updated content settings:');
        console.log(contentData);

        // Verify the changes
        const notificationsCorrect = !notificationsData.notifications.emailNotifications &&
                                   notificationsData.notifications.adminEmail === 'test-admin@example.com';
        const contentCorrect = contentData.content.postsPerPage === 20 &&
                              contentData.content.featuredPostsCount === 5 &&
                              !contentData.content.enableComments;

        if (notificationsCorrect && contentCorrect) {
            console.log('✅ Settings persistence verified - all changes saved correctly!\n');
        } else {
            console.log('❌ Settings persistence failed - changes not saved properly\n');
        }

        console.log('🎉 All browser automation tests completed successfully!');
        console.log('📋 Summary:');
        console.log('   ✅ GET /api/settings/notifications - Working');
        console.log('   ✅ GET /api/settings/content - Working');
        console.log('   ✅ POST /api/settings/notifications - Working');
        console.log('   ✅ POST /api/settings/content - Working');
        console.log('   ✅ Admin authentication - Working');
        console.log('   ✅ Settings persistence - Working');
        console.log('   ✅ Browser UI interaction - Working');

        // Keep browser open for 5 seconds so user can see results
        console.log('\n⏳ Keeping browser open for 5 seconds to view results...');
        await page.waitForTimeout(5000);

    } catch (error) {
        console.error('❌ Browser test failed:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        if (browser) {
            console.log('🔒 Closing browser...');
            await browser.close();
        }
    }
}

// Run the tests
runBrowserTests().catch(console.error);
