const puppeteer = require('puppeteer');

async function verifyLoginModernization() {
    console.log('🚀 Starting Login Page Modernization Verification...');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        // 1. Load Login Page
        console.log('📄 Loading login page...');
        await page.goto('http://localhost:3000/login.html');

        // 2. Check CSS Variables (Modern Theme)
        console.log('🎨 Checking for modern theme colors...');
        const primaryColor = await page.evaluate(() => {
            return getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
        });

        if (primaryColor === '#6366f1') {
            console.log('✅ Modern primary color (#6366f1) detected.');
        } else {
            console.error(`❌ Expected #6366f1, found ${primaryColor}`);
        }

        // 3. Check UI Elements
        const title = await page.$eval('.login-header h1', el => el.textContent);
        if (title === 'Welcome Back') {
            console.log('✅ Modern header text "Welcome Back" found.');
        } else {
            console.warn(`⚠️ Header text is "${title}", expected "Welcome Back"`);
        }

        // 4. Verify Forgot Password Endpoint
        console.log('🔗 Verifying Forgot Password API endpoint...');
        
        // Mock the fetch to intercept the request URL
        await page.setRequestInterception(true);
        let forgotRequestUrl = null;

        page.on('request', request => {
            if (request.url().includes('/auth/forgot')) {
                forgotRequestUrl = request.url();
                request.respond({ status: 200, body: JSON.stringify({ success: true }) });
            } else {
                request.continue();
            }
        });

        // Trigger forgot password flow
        // We need to override the prompt since Puppeteer can't handle it easily in headless without dialog listener
        await page.evaluate(() => {
            window.prompt = () => 'test@example.com';
        });

        // Click the link
        await page.click('#forgotPasswordLink');
        
        // Wait a moment for the fetch to trigger
        await new Promise(r => setTimeout(r, 1000));

        if (forgotRequestUrl && forgotRequestUrl.endsWith('/auth/forgot')) {
            console.log('✅ Correct endpoint called: /auth/forgot');
        } else if (forgotRequestUrl && forgotRequestUrl.includes('forgot-password')) {
            console.error('❌ Incorrect endpoint called: /auth/forgot-password (Old endpoint)');
        } else {
            console.log('ℹ️ No request intercepted or different URL. (Check if prompt handling worked)');
        }

    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        await browser.close();
    }
}

verifyLoginModernization();