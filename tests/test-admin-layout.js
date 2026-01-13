const puppeteer = require('puppeteer');

async function testAdminLayout() {
    console.log('Testing React Admin Layout...');
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    try {
        // Navigate to the admin-react.html file
        console.log('Loading admin-react.html...');
        await page.goto('http://localhost:3000/admin-react.html', { timeout: 30000, waitUntil: 'networkidle0' });

        // Wait for React to load
        console.log('Waiting for React components to load...');
        await page.waitForSelector('.w-60.bg-white', { timeout: 30000 });

        // Check if sidebar is present
        const sidebarExists = await page.$('.w-60.bg-white');
        console.log('Sidebar present:', !!sidebarExists);

        // Check if main content area exists
        const mainContentExists = await page.$('main.flex-1');
        console.log('Main content area present:', !!mainContentExists);

        // Check if navigation items are present
        const navItems = await page.$$('nav a');
        console.log('Navigation items found:', navItems.length);

        // Check if dashboard stats are present
        const statsCards = await page.$$('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4 .bg-white');
        console.log('Stats cards found:', statsCards.length);

        // Test navigation to posts page
        console.log('Testing navigation to posts page...');
        await page.click('a[href="/posts"]');
        await page.waitForSelector('h1:text("Posts")', { timeout: 5000 });
        const postsPageLoaded = await page.$('h1:text("Posts")');
        console.log('Posts page loaded:', !!postsPageLoaded);

        // Test navigation back to dashboard
        console.log('Testing navigation back to dashboard...');
        await page.click('a[href="/"]');
        await page.waitForSelector('h1:text("Dashboard")', { timeout: 5000 });
        const dashboardLoaded = await page.$('h1:text("Dashboard")');
        console.log('Dashboard loaded:', !!dashboardLoaded);

        // Check for any console errors
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        // Wait a bit to capture any errors
        await new Promise(resolve => setTimeout(resolve, 2000));

        if (errors.length > 0) {
            console.log('Console errors found:', errors);
        } else {
            console.log('No console errors detected');
        }

        // Success criteria
        const allTestsPass =
            sidebarExists &&
            mainContentExists &&
            navItems.length >= 6 &&
            statsCards.length >= 4 &&
            postsPageLoaded &&
            dashboardLoaded &&
            errors.length === 0;

        if (allTestsPass) {
            console.log('✅ SUCCESS: All admin layout tests passed!');
        } else {
            console.log('❌ FAILURE: Some tests failed. Check the output above.');
        }

    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testAdminLayout();
