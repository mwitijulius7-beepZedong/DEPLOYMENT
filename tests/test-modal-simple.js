// Simple test for modal functions - check if buttons exist and can be clicked
const puppeteer = require('puppeteer');

async function testModalButtons() {
    console.log('Starting simple modal button tests...');

    let browser;
    try {
        browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        // Navigate to admin page
        await page.goto('http://localhost:3000/admin.html');
        await page.waitForSelector('body');

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if the main sections exist
        const sections = ['#settings-section', '#posts-section', '#analytics-section', '#customize-section'];
        for (const selector of sections) {
            const exists = await page.evaluate((sel) => {
                return !!document.querySelector(sel);
            }, selector);
            console.log(`Section ${selector} exists: ${exists}`);
        }

        // Look for buttons that might trigger navigation
        const buttons = await page.evaluate(() => {
            const allButtons = Array.from(document.querySelectorAll('button'));
            return allButtons.map(btn => ({
                text: btn.textContent.trim(),
                onclick: btn.getAttribute('onclick'),
                id: btn.id,
                className: btn.className
            })).filter(btn => btn.text || btn.onclick);
        });

        console.log('\nFound buttons:');
        buttons.forEach((btn, i) => {
            console.log(`${i + 1}. Text: "${btn.text}", OnClick: "${btn.onclick}", ID: "${btn.id}", Class: "${btn.className}"`);
        });

        // Look for links that might trigger navigation
        const links = await page.evaluate(() => {
            const allLinks = Array.from(document.querySelectorAll('a'));
            return allLinks.map(link => ({
                text: link.textContent.trim(),
                href: link.getAttribute('href'),
                onclick: link.getAttribute('onclick'),
                id: link.id,
                className: link.className
            })).filter(link => link.text || link.onclick);
        });

        console.log('\nFound links:');
        links.forEach((link, i) => {
            console.log(`${i + 1}. Text: "${link.text}", Href: "${link.href}", OnClick: "${link.onclick}", ID: "${link.id}", Class: "${link.className}"`);
        });

        // Test specific buttons that might be "Go to Settings"
        const goToSettingsButtons = buttons.filter(btn =>
            btn.text.toLowerCase().includes('settings') ||
            btn.onclick && btn.onclick.includes('showSettingsSection')
        );

        console.log(`\nFound ${goToSettingsButtons.length} potential "Go to Settings" buttons`);

        for (const btn of goToSettingsButtons) {
            console.log(`Testing button: "${btn.text}"`);
            try {
                // Find and click the button
                const buttonElement = await page.$(`button[onclick*="${btn.onclick}"]`);
                if (buttonElement) {
                    await buttonElement.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Check if settings section is visible
                    const settingsVisible = await page.evaluate(() => {
                        const section = document.getElementById('settings-section');
                        return section && (section.style.display === 'block' || section.style.display === '');
                    });

                    console.log(`  Settings section visible after click: ${settingsVisible}`);
                    if (settingsVisible) {
                        console.log(`  ✅ "Go to Settings" button works!`);
                    } else {
                        console.log(`  ❌ "Go to Settings" button did not show settings section`);
                    }
                }
            } catch (error) {
                console.log(`  Error testing button: ${error.message}`);
            }
        }

        console.log('\n✅ Simple modal button testing completed');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Run the test
testModalButtons().catch(console.error);
