const puppeteer = require('puppeteer');

async function testIdleTimeout() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Block external scripts that might cause timeouts
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('googleapis.com') || request.url().includes('gstatic.com')) {
      request.abort();
    } else {
      request.continue();
    }
  });

  try {
    // Navigate to login page
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login.html', { timeout: 60000, waitUntil: 'domcontentloaded' });
    console.log('Login page loaded, waiting for elements...');
    await page.waitForSelector('#username', { timeout: 10000 });
    console.log('Username field found');

    // Type username
    await page.type('#username', 'Mwitijulius7');

    // Type password
    await page.type('#password', 'Mwitijulius7@Jm');

    // Click login button
    await page.click('#loginBtn');

    // Wait for redirect to admin.html
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    console.log('Logged in successfully, now on admin.html');

    // Set up dialog handler for the prompt
    let promptAppeared = false;
    page.on('dialog', async dialog => {
      console.log('Dialog appeared:', dialog.message());
      if (dialog.message().includes('Your session has expired due to inactivity')) {
        promptAppeared = true;
        // For testing, enter a dummy key or cancel
        await dialog.dismiss(); // Or dialog.accept('somekey') if you want to test acceptance
        console.log('Prompt dismissed');
      } else {
        await dialog.dismiss();
      }
    });

    // Wait 10 seconds without activity
    console.log('Waiting 10 seconds for idle timeout...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    if (promptAppeared) {
      console.log('SUCCESS: Idle timeout prompt appeared as expected');
    } else {
      console.log('FAILURE: Idle timeout prompt did not appear');
    }

    // Test resetting timer with activity (simulate mouse move)
    console.log('Simulating user activity (mouse move) to reset timer...');
    await page.mouse.move(100, 100);
    await page.mouse.move(200, 200);

    // Reset flag
    promptAppeared = false;

    // Wait another 10 seconds
    console.log('Waiting another 10 seconds after activity...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    if (!promptAppeared) {
      console.log('SUCCESS: Timer was reset by activity, no prompt appeared');
    } else {
      console.log('FAILURE: Timer was not reset, prompt appeared again');
    }

    // Check console logs for errors
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    // Wait a bit more to capture any errors
    await new Promise(resolve => setTimeout(resolve, 2000));

    const errors = logs.filter(log => log.includes('error') || log.includes('Error'));
    if (errors.length > 0) {
      console.log('Console errors found:', errors);
    } else {
      console.log('No console errors detected');
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

testIdleTimeout();
