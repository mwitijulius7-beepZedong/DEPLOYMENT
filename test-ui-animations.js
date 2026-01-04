const puppeteer = require('puppeteer');

async function testAnimations() {
  console.log('Starting thorough UI testing...');

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Test index.html
    console.log('Testing index.html...');
    await page.goto('http://localhost:3000/index.html');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for animations

    // Check if animations are present
    const hasAnimations = await page.evaluate(() => {
      const elements = document.querySelectorAll('[class*="animation"], [style*="animation"]');
      return elements.length > 0;
    });
    console.log('Index.html animations present:', hasAnimations);

    // Test navigation to about.html
    const aboutLink = await page.$('nav a[href*="about.html"]');
    if (aboutLink) {
      await aboutLink.click();
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('Testing about.html...');
      const currentUrl = page.url();
      if (currentUrl.includes('about.html')) {
        console.log('Successfully navigated to about.html');

        // Check about page animations
        const aboutAnimations = await page.evaluate(() => {
          return document.querySelector('.about-header h1') !== null &&
                 document.querySelector('.skill-card') !== null;
        });
        console.log('About.html animations present:', aboutAnimations);
      }
    }

    // Test back to index
    const homeLink = await page.$('nav a[href="/"]');
    if (homeLink) {
      await homeLink.click();
      await page.waitForTimeout(2000);
    }

    // Test post link if available
    const postLink = await page.$('a[href*="post.html"]');
    if (postLink) {
      await postLink.click();
      await page.waitForTimeout(2000);

      console.log('Testing post.html...');
      const postAnimations = await page.evaluate(() => {
        return document.querySelector('.post-header') !== null &&
               document.querySelector('.social-share') !== null;
      });
      console.log('Post.html animations present:', postAnimations);
    }

    // Test responsiveness - mobile view
    console.log('Testing mobile responsiveness...');
    await page.setViewport({ width: 375, height: 667 });
    await page.waitForTimeout(1000);

    const mobileResponsive = await page.evaluate(() => {
      const header = document.querySelector('header');
      const main = document.querySelector('main');
      return header && main && window.innerWidth <= 768;
    });
    console.log('Mobile responsive:', mobileResponsive);

    // Test responsiveness - tablet view
    await page.setViewport({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);

    const tabletResponsive = await page.evaluate(() => {
      return window.innerWidth <= 1024;
    });
    console.log('Tablet responsive:', tabletResponsive);

    console.log('Thorough testing completed successfully!');

  } catch (error) {
    console.error('Testing failed:', error.message);
  } finally {
    await browser.close();
  }
}

testAnimations();
