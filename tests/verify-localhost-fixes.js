const puppeteer = require('puppeteer');

async function verifyAdminResponsiveness() {
    console.log('🚀 Starting Admin Responsiveness Verification on Localhost...');

    const browser = await puppeteer.launch({
        headless: false, // Visible browser to "show" the changes
        defaultViewport: { width: 1280, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Capture console logs to debug client-side issues
    page.on('console', msg => {
        if (msg.type() === 'error') console.log(`[Browser Error]: ${msg.text()}`);
    });

    try {
        // 1. Login
        console.log('🔐 Logging in...');
        await page.goto('http://localhost:3000/login.html');
        await page.waitForSelector('#username');
        await page.type('#username', 'admin');
        await page.type('#password', 'Mwitijulius7@Jm');
        await page.click('#loginBtn');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        // 2. Verify Dashboard is visible initially
        console.log('📊 Verifying Dashboard initial state...');
        try {
            await page.waitForSelector('#dashboard', { visible: true, timeout: 5000 });
            console.log('✅ Dashboard is visible');
        } catch (e) {
            console.log('⚠️ Dashboard not immediately visible, checking if redirected...');
        }

        // Helper to check function availability
        const checkFunction = async (funcName) => {
            const exists = await page.evaluate((name) => typeof window[name] === 'function', funcName);
            console.log(`   Function ${funcName} exists: ${exists ? '✅' : '❌'}`);
            return exists;
        };

        // 3. Test "Manage Posts" button
        console.log('\n📝 Testing "Manage Posts" functionality...');
        await checkFunction('showPostsSection');
        
        // Try to find the button by class, then by onclick, then by text
        let managePostsBtn = await page.$('.action-posts');
        if (!managePostsBtn) {
            console.log('   .action-posts not found, trying onclick...');
            managePostsBtn = await page.$('button[onclick*="showPostsSection"]');
        }
        if (!managePostsBtn) {
            console.log('   onclick button not found, trying text content...');
            const buttons = await page.$$('button');
            for (const btn of buttons) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text.includes('Manage Posts') || text.includes('View Posts')) {
                    managePostsBtn = btn;
                    break;
                }
            }
        }

        if (!managePostsBtn) {
            console.error('❌ Manage Posts button not found via any selector');
        } else {
            console.log('   Clicking Manage Posts button...');
            await managePostsBtn.click();
            
            // Wait for transition
            await new Promise(r => setTimeout(r, 1000));

            // Check if Posts section is visible
            const postsVisible = await page.evaluate(() => {
                const el = document.getElementById('posts-section');
                return el && el.style.display !== 'none';
            });
            
            if (postsVisible) {
                console.log('✅ "Manage Posts" works: Posts section shown');
                
                // Verify content loading
                const contentLoaded = await page.evaluate(() => {
                    const list = document.getElementById('posts-list');
                    return list && (list.children.length > 0 || list.innerText.includes('Loading') || list.innerText.includes('No posts'));
                });
                
                if (contentLoaded) console.log('   ✅ Posts content is loading/loaded');
                else console.error('   ❌ Posts list is empty (loadAndRenderPosts might not have run)');
            } else {
                console.error('❌ Posts section NOT visible after click');
                // Try calling function directly as fallback fix verification
                console.log('   Attempting to call showPostsSection() directly...');
                await page.evaluate(() => window.showPostsSection && window.showPostsSection());
                await new Promise(r => setTimeout(r, 1000));
                const forcedVisible = await page.evaluate(() => {
                    const el = document.getElementById('posts-section');
                    return el && el.style.display !== 'none';
                });
                if (forcedVisible) console.log('   ✅ Direct function call worked (Button might be broken)');
                else console.error('   ❌ Direct function call also failed');
            }
        }

        // 4. Return to Dashboard via Sidebar
        console.log('\n🔙 Returning to Dashboard...');
        // Try to find dashboard link
        const dashboardLink = await page.$('a[href="#dashboard"]') || await page.$('li[onclick*="showDashboard"]');
        if (dashboardLink) {
            await dashboardLink.click();
            await new Promise(r => setTimeout(r, 1000));
        } else {
            // Reload page as fallback
            await page.goto('http://localhost:3000/admin.html');
            await page.waitForSelector('#dashboard');
        }

        // 5. Test "View Stats" (Analytics)
        console.log('\n📈 Testing "View Stats" functionality...');
        await checkFunction('showAnalyticsSection');
        
        let statsBtn = await page.$('.action-stats');
        if (!statsBtn) statsBtn = await page.$('button[onclick*="showAnalyticsSection"]');
        
        if (statsBtn) {
            await statsBtn.click();
            await new Promise(r => setTimeout(r, 1000));
            const analyticsVisible = await page.evaluate(() => {
                const el = document.getElementById('analytics-section');
                return el && el.style.display !== 'none';
            });
            console.log(`   Analytics section visible: ${analyticsVisible ? '✅' : '❌'}`);
        } else {
            console.log('   ⚠️ View Stats button not found');
        }

        // Return to Dashboard
        if (dashboardLink) await dashboardLink.click();
        else await page.goto('http://localhost:3000/admin.html');
        await new Promise(r => setTimeout(r, 1000));

        // 6. Test "Blog Settings" button
        console.log('\n⚙️ Testing "Blog Settings" button...');
        await checkFunction('showSettingsSection');
        
        let settingsBtn = await page.$('.action-settings');
        if (!settingsBtn) settingsBtn = await page.$('button[onclick*="showSettingsSection"]');

        if (settingsBtn) {
            await settingsBtn.click();
            await new Promise(r => setTimeout(r, 1000));
            const settingsVisible = await page.evaluate(() => {
                const el = document.getElementById('settings-section');
                return el && el.style.display !== 'none';
            });
            console.log(`   Settings section visible: ${settingsVisible ? '✅' : '❌'}`);
        } else {
            console.log('   ⚠️ Settings button not found');
        }

        // 7. Test Side Menu Navigation
        console.log('\nSidebar Navigation Testing...');
        const sections = [
            { name: 'Create Post', selector: 'a[href="#create-post"]', targetId: 'create-post-section' },
            { name: 'Analytics', selector: 'a[href="#analytics"]', targetId: 'analytics-section' },
            { name: 'Settings', selector: 'a[href="#settings"]', targetId: 'settings-section' }
        ];

        for (const section of sections) {
            console.log(`   Testing sidebar link: ${section.name}...`);
            const link = await page.$(section.selector);
            if (link) {
                await link.click();
                await new Promise(r => setTimeout(r, 800));
                const isVisible = await page.evaluate((id) => {
                    const el = document.getElementById(id);
                    return el && el.style.display !== 'none';
                }, section.targetId);
                
                if (isVisible) console.log(`   ✅ ${section.name} section visible`);
                else console.error(`   ❌ ${section.name} section NOT visible`);
            } else {
                console.log(`   ⚠️ Sidebar link for ${section.name} not found`);
            }
        }

        // 8. Test "Create Post" Quick Action
        console.log('\n✏️ Testing "Create Post" Quick Action...');
        // Go back to dashboard first
        await page.evaluate(() => window.showDashboard());
        await new Promise(r => setTimeout(r, 500));

        const createPostBtn = await page.$('button[onclick*="createNewPost"]') || await page.$('button[onclick*="showCreatePostSection"]');
        if (createPostBtn) {
            await createPostBtn.click();
            await new Promise(r => setTimeout(r, 1000));
            const createVisible = await page.evaluate(() => {
                const el = document.getElementById('create-post-section');
                return el && el.style.display !== 'none';
            });
            console.log(`   Create Post section visible: ${createVisible ? '✅' : '❌'}`);
        } else {
            console.log('   ⚠️ Create Post button not found in quick actions');
        }

        console.log('\n🎉 Verification Completed!');

    } catch (error) {
        console.error('❌ Verification Failed:', error.message);
    } finally {
        await browser.close();
    }
}

verifyAdminResponsiveness();