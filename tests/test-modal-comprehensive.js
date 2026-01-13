const puppeteer = require('puppeteer');

async function testModalFunctions() {
    console.log('🚀 Starting comprehensive modal function test...');

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1200, height: 800 }
        });

        const page = await browser.newPage();

        // Listen for console messages
        page.on('console', msg => {
            if (msg.text().includes('show') || msg.text().includes('fallback')) {
                console.log('📝 Console:', msg.text());
            }
        });

        // Navigate to admin page
        console.log('📍 Navigating to admin page...');
        await page.goto('http://localhost:3000/admin.html', { waitUntil: 'networkidle2' });

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test each modal function
        const sections = [
            { name: 'Settings', buttonSelector: '[onclick*="showSettingsSection"]', sectionId: 'settings-section' },
            { name: 'Posts', buttonSelector: '[onclick*="showPostsSection"]', sectionId: 'posts-section' },
            { name: 'Analytics', buttonSelector: '[onclick*="showAnalyticsSection"]', sectionId: 'analytics-section' },
            { name: 'Customize', buttonSelector: '[onclick*="showCustomizeSection"]', sectionId: 'customize-section' }
        ];

        for (const section of sections) {
            console.log(`\n🧪 Testing ${section.name} section...`);

            // Check if button exists
            const buttonExists = await page.$(section.buttonSelector) !== null;
            console.log(`   Button exists: ${buttonExists ? '✅' : '❌'}`);

            if (buttonExists) {
                // Click the button
                await page.click(section.buttonSelector);
                await page.waitForTimeout(500);

                // Check if section is visible
                const isVisible = await page.evaluate((sectionId) => {
                    const element = document.getElementById(sectionId);
                    return element && element.style.display === 'block';
                }, section.sectionId);

                console.log(`   Section visible: ${isVisible ? '✅' : '❌'}`);

                // Check if other sections are hidden
                const otherSections = sections.filter(s => s.sectionId !== section.sectionId);
                let otherSectionsHidden = true;

                for (const otherSection of otherSections) {
                    const otherVisible = await page.evaluate((sectionId) => {
                        const element = document.getElementById(sectionId);
                        return element && element.style.display === 'block';
                    }, otherSection.sectionId);

                    if (otherVisible) {
                        otherSectionsHidden = false;
                        console.log(`   ❌ Other section ${otherSection.name} is still visible`);
                    }
                }

                if (otherSectionsHidden) {
                    console.log(`   Other sections hidden: ✅`);
                }

                // Test navigation link if it exists
                const navLinkSelector = `a[onclick="show${section.name}Section()"]`;
                const navLinkExists = await page.$(navLinkSelector) !== null;

                if (navLinkExists) {
                    console.log(`   Testing navigation link...`);
                    await page.click(navLinkSelector);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    const navLinkVisible = await page.evaluate((sectionId) => {
                        const element = document.getElementById(sectionId);
                        return element && element.style.display === 'block';
                    }, section.sectionId);

                    console.log(`   Nav link works: ${navLinkVisible ? '✅' : '❌'}`);
                }
            }
        }

        // Test function availability in console
        console.log('\n🔍 Testing function availability...');
        const functionsAvailable = await page.evaluate(() => {
            return {
                showSettingsSection: typeof window.showSettingsSection === 'function',
                showPostsSection: typeof window.showPostsSection === 'function',
                showAnalyticsSection: typeof window.showAnalyticsSection === 'function',
                showCustomizeSection: typeof window.showCustomizeSection === 'function'
            };
        });

        console.log('Function availability:', functionsAvailable);

        console.log('\n✅ Modal function test completed!');
        console.log('🎯 All modal functions should now work correctly with proper section switching.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Run the test
testModalFunctions().catch(console.error);
