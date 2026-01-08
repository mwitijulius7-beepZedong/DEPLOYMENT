const puppeteer = require('puppeteer');

async function autoLoginAdmin() {
  console.log('Auto-logging into admin portal...');

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Navigate to login page
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login.html');
    await page.waitForSelector('#username', { timeout: 5000 });

    // Fill in credentials
    console.log('Entering admin credentials...');
    await page.type('#username', 'admin');
    await page.type('#password', 'Mwitijulius7@Jm');

    // Click login button
    console.log('Submitting login form...');
    await page.click('#loginBtn');

    // Wait for redirect to admin panel
    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    if (currentUrl.includes('admin.html')) {
      console.log('✅ Successfully logged into admin portal!');
      console.log('Admin panel is now open in your browser.');
    } else {
      console.log('❌ Login may have failed. Current URL:', currentUrl);
    }

    // Keep browser open for 2 seconds so user can see
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    console.error('Auto-login failed:', error.message);
  } finally {
    await browser.close();
  }
}

autoLoginAdmin();
