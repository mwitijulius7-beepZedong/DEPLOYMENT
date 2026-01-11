const puppeteer = require('puppeteer');

async function testSettingsSimple() {
    console.log('Testing settings section visibility...');

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Go directly to admin page (assuming authentication is bypassed for testing)
        await page.goto('http://localhost:3000/admin');

        // Wait for page to load
        await page.waitForSelector('#sidebar', { timeout: 15000 });
        console.log('✅ Admin page loaded');

        // Check if settings section exists
        const settingsSection = await page.$('#settings-section');
        if (!settingsSection) {
            console.log('❌ Settings section not found');
            return;
        }
        console.log('✅ Settings section element found');

        // Check initial state (should be hidden)
        const initialDisplay = await page.evaluate(el => el.style.display, settingsSection);
        console.log(`Initial display state: ${initialDisplay || 'block'}`);

        // Try to call showSettingsSection function
        await page.evaluate(() => {
            if (typeof showSettingsSection === 'function') {
                showSettingsSection();
                return true;
            }
            return false;
        });

        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if it's now visible
        const newDisplay = await page.evaluate(el => el.style.display, settingsSection);
        console.log(`After showSettingsSection: ${newDisplay}`);

        if (newDisplay !== 'none') {
            console.log('✅ Settings section is now visible');

            // Check if navigation tabs exist
            const navTabs = await page.$$('.settings-nav-btn');
            console.log(`Found ${navTabs.length} navigation tabs`);

            if (navTabs.length > 0) {
                // Try clicking the first tab
                await navTabs[0].click();
                await new Promise(resolve => setTimeout(resolve, 500));

                const activePanels = await page.$$('.settings-panel.active');
                console.log(`Found ${activePanels.length} active panels`);

                if (activePanels.length > 0) {
                    console.log('✅ Settings navigation is working');
                } else {
                    console.log('❌ Settings navigation not working');
                }
            }

        } else {
            console.log('❌ Settings section is still hidden');
        }

    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testSettingsSimple().catch(console.error);
