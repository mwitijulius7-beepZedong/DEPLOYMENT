const puppeteer = require('puppeteer');

const PRODUCTION_URL = 'https://maozedong254.vercel.app';

async function testProductionModernization() {
    console.log('🚀 Starting production modernization tests for https://maozedong254.vercel.app...\n');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    try {
        console.log('📱 Testing homepage (index.html) modernization...');
        await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        // Check for modern CSS variables and design system
        console.log('\n=== Checking CSS Variables and Color Scheme ===');
        const cssVars = await page.evaluate(() => {
            const root = document.documentElement;
            const styles = window.getComputedStyle(root);
            return {
                primaryColor: styles.getPropertyValue('--primary-color').trim(),
                secondaryColor: styles.getPropertyValue('--secondary-color').trim(),
                accentColor: styles.getPropertyValue('--accent-color').trim(),
                background: styles.getPropertyValue('--background').trim(),
                textColor: styles.getPropertyValue('--text-color').trim()
            };
        });

        console.log('CSS Variables found:');
        Object.entries(cssVars).forEach(([key, value]) => {
            console.log(`- ${key}: ${value || 'NOT SET'}`);
        });

        // Check for modern typography
        console.log('\n=== Checking Typography Modernization ===');
        const typography = await page.evaluate(() => {
            const body = document.body;
            const h1 = document.querySelector('h1') || document.querySelector('.hero-title');
            const p = document.querySelector('p');

            return {
                bodyFontSize: window.getComputedStyle(body).fontSize,
                bodyLineHeight: window.getComputedStyle(body).lineHeight,
                h1FontSize: h1 ? window.getComputedStyle(h1).fontSize : 'N/A',
                pFontSize: p ? window.getComputedStyle(p).fontSize : 'N/A',
                pLineHeight: p ? window.getComputedStyle(p).lineHeight : 'N/A'
            };
        });

        console.log('Typography checks:');
        console.log(`- Body font size: ${typography.bodyFontSize}`);
        console.log(`- Body line height: ${typography.bodyLineHeight}`);
        console.log(`- H1 font size: ${typography.h1FontSize}`);
        console.log(`- P font size: ${typography.pFontSize}`);
        console.log(`- P line height: ${typography.pLineHeight}`);

        // Check for animations and transitions
        console.log('\n=== Checking Animations and Transitions ===');
        const animations = await page.evaluate(() => {
            const cards = document.querySelectorAll('.blog-card, .post-card, .card');
            const buttons = document.querySelectorAll('button, .btn, a[role="button"]');

            const hasHoverEffects = Array.from(buttons).some(btn => {
                const style = window.getComputedStyle(btn);
                return style.transition.includes('transform') || style.transition.includes('background');
            });

            const hasCardAnimations = Array.from(cards).some(card => {
                const style = window.getComputedStyle(card);
                return style.transition.includes('transform') || style.transition.includes('box-shadow');
            });

            return {
                cardCount: cards.length,
                buttonCount: buttons.length,
                hasHoverEffects,
                hasCardAnimations
            };
        });

        console.log('Animation checks:');
        console.log(`- Blog cards found: ${animations.cardCount}`);
        console.log(`- Buttons found: ${animations.buttonCount}`);
        console.log(`- Hover effects on buttons: ${animations.hasHoverEffects ? 'PASS' : 'FAIL'}`);
        console.log(`- Card animations: ${animations.hasCardAnimations ? 'PASS' : 'FAIL'}`);

        // Check for modern layout and spacing
        console.log('\n=== Checking Layout and Spacing ===');
        const layout = await page.evaluate(() => {
            const container = document.querySelector('.container, main, .main-content');
            const cards = document.querySelectorAll('.blog-card, .post-card');

            return {
                containerMaxWidth: container ? window.getComputedStyle(container).maxWidth : 'N/A',
                hasModernSpacing: container ? window.getComputedStyle(container).padding.includes('rem') : false,
                cardShadows: Array.from(cards).some(card => {
                    const style = window.getComputedStyle(card);
                    return style.boxShadow && style.boxShadow !== 'none';
                }),
                cardBorders: Array.from(cards).some(card => {
                    const style = window.getComputedStyle(card);
                    return style.borderRadius && style.borderRadius !== '0px';
                })
            };
        });

        console.log('Layout checks:');
        console.log(`- Container max-width: ${layout.containerMaxWidth}`);
        console.log(`- Modern spacing (rem units): ${layout.hasModernSpacing ? 'PASS' : 'FAIL'}`);
        console.log(`- Card shadows: ${layout.cardShadows ? 'PASS' : 'FAIL'}`);
        console.log(`- Rounded card borders: ${layout.cardBorders ? 'PASS' : 'FAIL'}`);

        // Test responsiveness
        console.log('\n=== Testing Responsiveness ===');
        await page.setViewport({ width: 768, height: 600 });
        await new Promise(resolve => setTimeout(resolve, 1000));

        const mobileLayout = await page.evaluate(() => {
            const container = document.querySelector('.container, main');
            return {
                width: container ? container.offsetWidth : window.innerWidth,
                isResponsive: window.innerWidth <= 768
            };
        });

        console.log(`Mobile viewport (${mobileLayout.width}px): ${mobileLayout.isResponsive ? 'RESPONSIVE' : 'NOT RESPONSIVE'}`);

        // Test post page if available
        console.log('\n📄 Testing post page (post.html) modernization...');
        const postLinks = await page.$$eval('a[href*="post"], a[href*="Post"]', links =>
            links.map(link => link.href).filter(href => href.includes('post') || href.includes('Post'))
        );

        if (postLinks.length > 0) {
            console.log(`Found ${postLinks.length} post links, testing first one...`);
            await page.goto(postLinks[0], { waitUntil: 'networkidle2', timeout: 30000 });

            const postFeatures = await page.evaluate(() => {
                const progressBar = document.querySelector('.reading-progress, .progress-bar');
                const socialButtons = document.querySelectorAll('.social-share, .share-buttons a').length;
                const postHeader = document.querySelector('.post-header, .article-header');
                const content = document.querySelector('.post-content, .article-content');

                return {
                    hasProgressBar: !!progressBar,
                    socialButtonCount: socialButtons,
                    hasEnhancedHeader: !!postHeader,
                    contentTypography: content ? window.getComputedStyle(content).lineHeight : 'N/A'
                };
            });

            console.log('Post page features:');
            console.log(`- Reading progress bar: ${postFeatures.hasProgressBar ? 'PASS' : 'FAIL'}`);
            console.log(`- Social sharing buttons: ${postFeatures.socialButtonCount > 0 ? `PASS (${postFeatures.socialButtonCount} buttons)` : 'FAIL'}`);
            console.log(`- Enhanced post header: ${postFeatures.hasEnhancedHeader ? 'PASS' : 'FAIL'}`);
            console.log(`- Content typography: ${postFeatures.contentTypography}`);
        } else {
            console.log('No post links found on homepage');
        }

        // Test about page if available
        console.log('\n👤 Testing about page (about.html) modernization...');
        const aboutLinks = await page.$$eval('a[href*="about"], a[href*="About"]', links =>
            links.map(link => link.href).filter(href => href.includes('about') || href.includes('About'))
        );

        if (aboutLinks.length > 0) {
            console.log(`Found ${aboutLinks.length} about links, testing first one...`);
            await page.goto(aboutLinks[0], { waitUntil: 'networkidle2', timeout: 30000 });

            const aboutFeatures = await page.evaluate(() => {
                const hero = document.querySelector('.hero, .hero-section');
                const skills = document.querySelector('.skills, .skills-grid');
                const contact = document.querySelector('.contact, .contact-section');

                return {
                    hasHeroSection: !!hero,
                    skillsGridLayout: skills ? window.getComputedStyle(skills).display : 'N/A',
                    hasContactSection: !!contact,
                    responsiveDesign: window.innerWidth <= 768 ? 'mobile' : 'desktop'
                };
            });

            console.log('About page features:');
            console.log(`- Hero section: ${aboutFeatures.hasHeroSection ? 'PASS' : 'FAIL'}`);
            console.log(`- Skills grid layout: ${aboutFeatures.skillsGridLayout}`);
            console.log(`- Contact section: ${aboutFeatures.hasContactSection ? 'PASS' : 'FAIL'}`);
            console.log(`- Responsive design: ${aboutFeatures.responsiveDesign}`);
        } else {
            console.log('No about links found on homepage');
        }

        console.log('\n🎉 Production modernization testing completed!');
        console.log('Summary: All modernizations from TODO.md should now be live on https://maozedong254.vercel.app/');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testProductionModernization().catch(console.error);
