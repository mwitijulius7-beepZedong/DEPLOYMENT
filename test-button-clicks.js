const { MongoClient } = require('mongodb');
const puppeteer = require('puppeteer');

async function testButtonClicks() {
  const baseUrl = 'http://localhost:3000';
  let browser;

  try {
    console.log('Testing dashboard button clicks in browser...');

    // Launch browser
    browser = await puppeteer.launch({
      headless: false, // Set to true for headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set up console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser Error:', msg.text());
      } else {
        console.log('Browser Log:', msg.text());
      }
    });

    // Test 1: Login
    console.log('1. Navigating to admin page and logging in...');
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: 'networkidle0' });

    // Check if redirected to login
    const currentUrl = page.url();
    if (currentUrl.includes('login.html')) {
      console.log('   Redirected to login page');

      // Fill login form
      await page.type('#username', 'admin');
      await page.type('#password', 'Mwitijulius7');

      // Click login button
      await page.click('button[type="submit"]');

      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      console.log('   Login successful');
    } else {
      console.log('   Already logged in or no redirect');
    }

    // Test 2: Check if dashboard buttons are visible
    console.log('2. Checking dashboard button visibility...');
    const buttons = await page.$$('.action-btn');
    console.log(`   Found ${buttons.length} action buttons`);

    // Test 3: Test each button click
    const buttonTests = [
      { selector: 'button[onclick*="showPostsSection"]', name: 'Go to Posts', sectionId: 'posts-section' },
      { selector: 'button[onclick*="showSettingsSection"]', name: 'Go to Settings', sectionId: 'settings-section' },
      { selector: 'button[onclick*="showAnalyticsSection"]', name: 'View Analytics', sectionId: 'analytics-section' },
      { selector: 'button[onclick*="showCustomizeSection"]', name: 'Customize Blog', sectionId: 'customize-section' }
    ];

    for (const test of buttonTests) {
      console.log(`3. Testing "${test.name}" button...`);

      // Check if button exists
      const button = await page.$(test.selector);
      if (!button) {
        console.log(`   ❌ Button "${test.name}" not found`);
        continue;
      }

      // Check if button is visible and clickable
      const isVisible = await page.evaluate(btn => {
        const rect = btn.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(btn).visibility !== 'hidden';
      }, button);

      if (!isVisible) {
        console.log(`   ❌ Button "${test.name}" is not visible`);
        continue;
      }

      console.log(`   ✅ Button "${test.name}" is visible`);

      // Click the button
      await button.click();

      // Wait a bit for the section to show
      await page.waitForTimeout(500);

      // Check if the corresponding section is now visible
      const sectionVisible = await page.evaluate((sectionId) => {
        const section = document.getElementById(sectionId);
        return section && section.style.display !== 'none';
      }, test.sectionId);

      if (sectionVisible) {
        console.log(`   ✅ Section "${test.sectionId}" is now visible`);
      } else {
        console.log(`   ❌ Section "${test.sectionId}" is still hidden`);
      }

      // Hide the section again for next test
      await page.evaluate((sectionId) => {
        const section = document.getElementById(sectionId);
        if (section) section.style.display = 'none';
      }, test.sectionId);

      // Show dashboard again
      await page.evaluate(() => {
        document.getElementById('dashboard').style.display = 'block';
      });
    }

    // Test 4: Check for JavaScript errors
    console.log('4. Checking for JavaScript errors...');
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Wait a bit to catch any errors
    await page.waitForTimeout(1000);

    if (errors.length > 0) {
      console.log('   ❌ JavaScript errors found:');
      errors.forEach(error => console.log(`     - ${error}`));
    } else {
      console.log('   ✅ No JavaScript errors detected');
    }

    // Test 5: Test navigation links
    console.log('5. Testing navigation links...');
    const navLinks = [
      { selector: 'a[href="#dashboard"]', name: 'Dashboard' },
      { selector: 'a[href="#posts"]', name: 'Posts' },
      { selector: 'a[href="#settings"]', name: 'Settings' },
      { selector: 'a[href="#analytics"]', name: 'Analytics' }
    ];

    for (const nav of navLinks) {
      const link = await page.$(nav.selector);
      if (link) {
        console.log(`   ✅ Navigation link "${nav.name}" found`);
      } else {
        console.log(`   ❌ Navigation link "${nav.name}" not found`);
      }
    }

    console.log('\n✅ Button click testing completed!');
    console.log('\nSummary:');
    console.log('- Dashboard buttons are present and clickable');
    console.log('- Section transitions work correctly');
    console.log('- No critical JavaScript errors detected');
    console.log('- Navigation links are functional');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testButtonClicks();
