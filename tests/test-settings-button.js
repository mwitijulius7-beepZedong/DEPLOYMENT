// Test specifically for the settings button functionality
const puppeteer = require('puppeteer');

async function testSettingsButton() {
    console.log('Testing settings button functionality...');

    let browser;
    try {
        browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        // Navigate to admin page
        await page.goto('http://localhost:3000/admin.html');
        await page.waitForSelector('body');

        // Wait for modules to load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check initial state of settings section
        const initialDisplay = await page.evaluate(() => {
            const section = document.getElementById('settings-section');
            return section ? section.style.display : 'not found';
        });
        console.log(`Initial settings section display: ${initialDisplay}`);

        // Check if showSettingsSection function exists
        const functionExists = await page.evaluate(() => {
            return typeof window.showSettingsSection === 'function';
        });
        console.log(`showSettingsSection function exists: ${functionExists}`);

        // Try to call the function directly
        console.log('Calling showSettingsSection() directly...');
        await page.evaluate(() => {
            if (window.showSettingsSection) {
                window.showSettingsSection();
            } else {
                console.error('showSettingsSection function not found');
            }
        });

        // Wait and check if section became visible
        await new Promise(resolve => setTimeout(resolve, 1000));

        const afterDirectCallDisplay = await page.evaluate(() => {
            const section = document.getElementById('settings-section');
            return section ? section.style.display : 'not found';
        });
        console.log(`Settings section display after direct call: ${afterDirectCallDisplay}`);

        // Now try clicking the actual button
        console.log('Clicking the "Go to Settings" button...');
        const buttonClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const settingsButton = buttons.find(btn => btn.textContent.trim() === 'Go to Settings');
            if (settingsButton) {
                settingsButton.click();
                return true;
            }
            return false;
        });

        console.log(`Settings button found and clicked: ${buttonClicked}`);

        // Wait and check again
        await new Promise(resolve => setTimeout(resolve, 1000));

        const afterButtonClickDisplay = await page.evaluate(() => {
            const section = document.getElementById('settings-section');
            return section ? section.style.display : 'not found';
        });
        console.log(`Settings section display after button click: ${afterButtonClickDisplay}`);

        // Test the navigation link too
        console.log('Testing navigation link...');
        const navLinkClicked = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a.nav-link'));
            const settingsLink = links.find(link => link.textContent.trim() === 'Settings');
            if (settingsLink) {
                settingsLink.click();
                return true;
            }
            return false;
        });

        console.log(`Settings nav link found and clicked: ${navLinkClicked}`);

        // Wait and check again
        await new Promise(resolve => setTimeout(resolve, 1000));

        const afterNavLinkClickDisplay = await page.evaluate(() => {
            const section = document.getElementById('settings-section');
            return section ? section.style.display : 'not found';
        });
        console.log(`Settings section display after nav link click: ${afterNavLinkClickDisplay}`);

        console.log('\n✅ Settings button testing completed');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Run the test
testSettingsButton().catch(console.error);
