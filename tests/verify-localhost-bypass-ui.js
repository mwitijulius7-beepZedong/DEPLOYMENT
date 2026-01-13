const puppeteer = require('puppeteer');

async function verifyBypassUI() {
    console.log('🚀 Verifying Admin Key Bypass UI...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // 1. Login
        console.log('1. Logging in...');
        await page.goto('http://localhost:3000/login.html');
        await page.type('#username', 'admin');
        await page.type('#password', 'Mwitijulius7@Jm');
        await page.click('#loginBtn');
        await page.waitForNavigation();

        // 2. Check for modal visibility
        console.log('2. Checking for security modal...');
        // Wait a moment for any potential modal animation
        await new Promise(r => setTimeout(r, 1000));
        
        const modalDisplay = await page.evaluate(() => {
            const modal = document.getElementById('admin-key-modal');
            return modal ? window.getComputedStyle(modal).display : 'none';
        });

        if (modalDisplay === 'none') {
            console.log('✅ SUCCESS: Admin key modal is hidden.');
        } else {
            console.error(`❌ FAILURE: Admin key modal is visible (display: ${modalDisplay}).`);
        }

    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await browser.close();
    }
}

verifyBypassUI();