const puppeteer = require('puppeteer');

async function verifyAdminResponsiveness() {
    console.log('🚀 Starting Admin Responsiveness Verification on Localhost...');

    const browser = await puppeteer.launch({
        headless: false, // Visible browser to "show" the changes
        defaultViewport: { width: 1280, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        // 1. Login
        console.log('🔐 Logging in...');
        await page.goto('http://localhost:3000/login.html');
        await page.type('#username', 'admin');
        await page.type('#password', 'Mwitijulius7@Jm');
        await page.click('#loginBtn');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        // 2. Verify Dashboard is visible initially
        console.log('📊 Verifying Dashboard initial state...');
        const dashboardVisible = await page.$eval('#dashboard', el => el.style.display !== 'none');
        if (!dashboardVisible) throw new Error('Dashboard should be visible initially');
        console.log('✅ Dashboard is visible');

        // 3. Test "Manage Posts" button
        console.log('📝 Testing "Manage Posts" button...');
        // Find the button in the quick actions grid
        const managePostsBtn = await page.$('.action-posts');
        if (!managePostsBtn) throw new Error('Manage Posts button not found');
        await managePostsBtn.click();
        
        // Wait for transition
        await new Promise(r => setTimeout(r, 500));

        // Check if Posts section is visible and Dashboard is hidden
        const postsVisible = await page.$eval('#posts-section', el => el.style.display === 'block');
        const dashboardHidden = await page.$eval('#dashboard', el => el.style.display === 'none');
        
        if (postsVisible && dashboardHidden) console.log('✅ "Manage Posts" works: Posts section shown, Dashboard hidden');
        else throw new Error(`Failed: Posts visible=${postsVisible}, Dashboard hidden=${dashboardHidden}`);

        // 4. Return to Dashboard via Sidebar
        console.log('🔙 Returning to Dashboard...');
        await page.click('a[href="#dashboard"]');
        await new Promise(r => setTimeout(r, 500));
        
        const dashboardRestored = await page.$eval('#dashboard', el => el.style.display === 'block');
        if (dashboardRestored) console.log('✅ Returned to Dashboard');
        else throw new Error('Failed to return to Dashboard');

        // 5. Test "Blog Settings" button
        console.log('⚙️ Testing "Blog Settings" button...');
        const settingsBtn = await page.$('.action-settings');
        await settingsBtn.click();
        await new Promise(r => setTimeout(r, 500));

        const settingsVisible = await page.$eval('#settings-section', el => el.style.display === 'block');
        if (settingsVisible) console.log('✅ "Blog Settings" works');
        else throw new Error('Failed to show Settings');

        console.log('\n🎉 Verification Successful! The admin panel is responsive.');

    } catch (error) {
        console.error('❌ Verification Failed:', error.message);
    } finally {
        await browser.close();
    }
}

verifyAdminResponsiveness();