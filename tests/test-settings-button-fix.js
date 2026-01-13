const puppeteer = require('puppeteer');

async function testSettingsButton() {
    console.log('Testing settings button functionality...');

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // First, go to login page and authenticate
        await page.goto('http://localhost:3000/login');
        await page.waitForSelector('#username', { timeout: 10000 });

        // Fill login form
        await page.type('#username', 'admin');
        await page.type('#password', 'admin123');

        // Click login button
        const loginButton = await page.$('button[type="submit"]');
        await loginButton.click();

        // Wait for redirect to admin
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        // Check if we're on admin page
        const currentUrl = page.url();
        if (!currentUrl.includes('/admin')) {
            console.log('❌ Not redirected to admin page');
            return;
        }

        // Wait for sidebar to load
        await page.waitForSelector('#sidebar', { timeout: 10000 });
        console.log('✅ Admin page loaded successfully');

        // Check if settings nav link exists
        const settingsLink = await page.$('[onclick="showSettingsSection()"]');
        if (!settingsLink) {
            console.log('❌ Settings nav link not found');
            return;
        }
        console.log('✅ Settings nav link found');

        // Click the settings link
        await settingsLink.click();

        // Wait a bit for the section to show
        await page.waitForTimeout(1000);

        // Check if settings section is visible
        const settingsSection = await page.$('#settings-section');
        const isVisible = await page.evaluate(el => {
            return el && el.style.display !== 'none';
        }, settingsSection);

        if (isVisible) {
            console.log('✅ Settings section is visible');

            // Check if navigation tabs are working
            const generalTab = await page.$('[data-panel="general"]');
            if (generalTab) {
                await generalTab.click();
                await page.waitForTimeout(500);

                const generalPanel = await page.$('#general-panel');
                const generalVisible = await page.evaluate(el => {
                    return el && el.classList.contains('active');
                }, generalPanel);

                if (generalVisible) {
                    console.log('✅ General settings panel is active');
                } else {
                    console.log('❌ General settings panel not active');
                }
            }

        } else {
            console.log('❌ Settings section is not visible');
        }

    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testSettingsButton().catch(console.error);
