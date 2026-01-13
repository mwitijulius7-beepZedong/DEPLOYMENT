const puppeteer = require('puppeteer');

async function verifyAdminFunctions() {
    console.log('🚀 Verifying admin functions...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // Login first to access admin page
        await page.goto('http://localhost:3000/login.html');
        await page.type('#username', 'admin');
        await page.type('#password', 'Mwitijulius7@Jm');
        await page.click('#loginBtn');
        await page.waitForNavigation();

        await page.goto('http://localhost:3000/admin.html');
        
        // Wait for modules to load
        await new Promise(r => setTimeout(r, 2000));

        const functionsToCheck = [
            'addCategory',
            'loadCategories',
            'saveAuthorInfo',
            'handleProfilePictureUpload',
            'saveNewPost',
            'refreshAnalytics',
            'logout',
            'toggleSidebar',
            'togglePostsList'
        ];

        for (const funcName of functionsToCheck) {
            const exists = await page.evaluate((name) => typeof window[name] === 'function', funcName);
            console.log(`Function ${funcName} exists: ${exists ? '✅' : '❌'}`);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

verifyAdminFunctions();
