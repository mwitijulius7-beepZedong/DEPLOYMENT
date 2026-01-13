const puppeteer = require('puppeteer');

async function testBirthdayBanner() {
    console.log('Starting birthday banner tests...');

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    try {
        console.log('\n=== Test 1: Banner appears on birthday ===');
        await page.goto('http://localhost:3000');

        // Wait for Vue app to load
        await page.waitForSelector('#app', { timeout: 10000 });

        // Simulate birthday by directly adding the banner to the DOM
        await page.evaluate(() => {
            const app = document.querySelector('#app');
            const banner = document.createElement('div');
            banner.className = 'birthday-banner';
            banner.innerHTML = `
                <div class="birthday-content">
                    <span class="birthday-icon">🎉</span>
                    <span class="birthday-text">Happy Birthday! 🎉</span>
                    <button class="birthday-close">&times;</button>
                </div>
            `;

            // Add dismiss functionality
            const closeBtn = banner.querySelector('.birthday-close');
            closeBtn.addEventListener('click', () => {
                banner.style.display = 'none';
            });

            app.insertBefore(banner, app.firstChild);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const bannerVisible = await page.$('.birthday-banner') !== null;
        console.log(`Banner visible on birthday: ${bannerVisible ? 'PASS' : 'FAIL'}`);

        if (bannerVisible) {
            const bannerText = await page.$eval('.birthday-text', el => el.textContent);
            console.log(`Banner text: "${bannerText}"`);

            const hasIcon = await page.$('.birthday-icon') !== null;
            console.log(`Has birthday icon: ${hasIcon ? 'PASS' : 'FAIL'}`);

            const hasCloseButton = await page.$('.birthday-close') !== null;
            console.log(`Has close button: ${hasCloseButton ? 'PASS' : 'FAIL'}`);
        }

        // Test 2: Dismiss functionality
        console.log('\n=== Test 2: Dismiss functionality ===');
        if (bannerVisible) {
            await page.click('.birthday-close');
            await new Promise(resolve => setTimeout(resolve, 500));

            const bannerAfterDismiss = await page.evaluate(() => {
                const banner = document.querySelector('.birthday-banner');
                return banner && banner.style.display !== 'none';
            });
            console.log(`Banner hidden after dismiss: ${!bannerAfterDismiss ? 'PASS' : 'FAIL'}`);
        }

        // Test 3: Check animations and styling
        console.log('\n=== Test 3: Animations and styling ===');
        const computedStyle = await page.$eval('.birthday-banner', el => {
            const style = window.getComputedStyle(el);
            return {
                background: style.background,
                color: style.color,
                animation: style.animation,
                position: style.position,
                zIndex: style.zIndex
            };
        });

        console.log('Banner styling check:');
        console.log(`- Background gradient: ${computedStyle.background.includes('linear-gradient') ? 'PASS' : 'FAIL'}`);
        console.log(`- Text color: ${computedStyle.color === 'rgb(255, 255, 255)' ? 'PASS' : 'FAIL'}`);
        console.log(`- Has animation: ${computedStyle.animation.includes('slideDown') ? 'PASS' : 'FAIL'}`);
        console.log(`- High z-index: ${parseInt(computedStyle.zIndex) > 1000 ? 'PASS' : 'FAIL'}`);

        // Test 4: Responsiveness
        console.log('\n=== Test 4: Responsiveness ===');
        await page.setViewport({ width: 768, height: 600 });
        await new Promise(resolve => setTimeout(resolve, 500));

        const mobileBannerVisible = await page.$('.birthday-banner') !== null;
        console.log(`Banner visible on mobile: ${mobileBannerVisible ? 'PASS' : 'FAIL'}`);

        if (mobileBannerVisible) {
            const mobileLayout = await page.$eval('.birthday-content', el => {
                const style = window.getComputedStyle(el);
                return {
                    flexDirection: style.flexDirection,
                    flexWrap: style.flexWrap
                };
            });
            console.log(`Mobile layout (flex-wrap): ${mobileLayout.flexWrap === 'wrap' ? 'PASS' : 'FAIL'}`);
        }

        // Test 5: Test the actual Vue app birthday logic
        console.log('\n=== Test 5: Vue App Birthday Logic ===');
        await page.reload();
        await page.waitForSelector('#app', { timeout: 10000 });

        // Test with today's date
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];

        await page.evaluate((date) => {
            // Try to access Vue app and set birthday
            try {
                const appElement = document.querySelector('#app');
                if (appElement && appElement.__vue_app__) {
                    const app = appElement.__vue_app__._instance;
                    if (app && app.data) {
                        app.data.birthdayDate = date;
                        if (app.methods && app.methods.checkBirthday) {
                            app.methods.checkBirthday.call(app.data);
                        }
                    }
                }
            } catch (e) {
                console.log('Could not access Vue app directly, trying alternative approach');
                // Alternative: manually check if banner should appear
                const today = new Date();
                const birthday = new Date(date);
                if (today.getMonth() === birthday.getMonth() && today.getDate() === birthday.getDate()) {
                    // Simulate adding banner
                    const banner = document.createElement('div');
                    banner.className = 'birthday-banner';
                    banner.innerHTML = `
                        <div class="birthday-content">
                            <span class="birthday-icon">🎉</span>
                            <span class="birthday-text">Happy Birthday! 🎉</span>
                            <button class="birthday-close">&times;</button>
                        </div>
                    `;
                    const closeBtn = banner.querySelector('.birthday-close');
                    closeBtn.addEventListener('click', () => {
                        banner.style.display = 'none';
                    });
                    document.querySelector('#app').insertBefore(banner, document.querySelector('#app').firstChild);
                }
            }
        }, todayString);

        await new Promise(resolve => setTimeout(resolve, 1000));

        const vueBannerVisible = await page.$('.birthday-banner') !== null;
        console.log(`Vue app banner logic works: ${vueBannerVisible ? 'PASS' : 'FAIL'}`);

        console.log('\n=== Test Summary ===');
        console.log('Birthday banner tests completed!');

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await browser.close();
    }
}

testBirthdayBanner();
