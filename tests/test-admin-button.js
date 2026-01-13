const puppeteer = require('puppeteer');

const PRODUCTION_URL = 'https://maozedong254.vercel.app';

async function testAdminButton() {
    console.log('🔧 Testing admin button change on production...\n');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    try {
        console.log('📱 Loading production homepage...');
        await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        // Check the admin button text/icon
        console.log('\n=== Checking Admin Button ===');
        const adminButton = await page.$('nav button[title="Admin Panel"]');

        if (!adminButton) {
            console.log('❌ Admin button not found');
            return;
        }

        const buttonText = await page.evaluate(btn => btn.textContent.trim(), adminButton);
        const buttonTitle = await page.evaluate(btn => btn.getAttribute('title'), adminButton);

        console.log(`Button text: "${buttonText}"`);
        console.log(`Button title: "${buttonTitle}"`);

        if (buttonText === '⚙️' && buttonTitle === 'Admin Panel') {
            console.log('✅ PASS: Admin button displays gear icon (⚙️) with correct title');
        } else {
            console.log('❌ FAIL: Admin button does not display gear icon');
            console.log(`Expected: "⚙️" with title "Admin Panel"`);
            console.log(`Found: "${buttonText}" with title "${buttonTitle}"`);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testAdminButton().catch(console.error);
