const fetch = require('node-fetch');

async function testSettingsPersistence() {
    console.log('Testing settings persistence...');

    try {
        // Test the author settings endpoint
        console.log('1. Testing /api/settings/author endpoint...');
        const authorResponse = await fetch('http://localhost:3000/api/settings/author');
        const authorData = await authorResponse.json();

        console.log('Author settings response:', authorData);

        // Check if phone number is present
        const phoneNumber = authorData.author?.phone;
        console.log('Phone number from API:', phoneNumber);

        if (phoneNumber === '254729206894') {
            console.log('✓ Phone number correctly loaded from settings.json');
        } else {
            console.log('✗ Phone number not loaded correctly. Expected: 254729206894, Got:', phoneNumber);
        }

        // Test blog info endpoint
        console.log('2. Testing /api/settings/blog-info endpoint...');
        const blogResponse = await fetch('http://localhost:3000/api/settings/blog-info');
        const blogData = await blogResponse.json();

        console.log('Blog info response:', blogData);

        const blogTitle = blogData.blogInfo?.title;
        if (blogTitle === 'zedong254ke') {
            console.log('✓ Blog title correctly loaded');
        } else {
            console.log('✗ Blog title not loaded correctly. Expected: zedong254ke, Got:', blogTitle);
        }

        // Test that settings are consistent
        console.log('3. Testing settings consistency...');
        const authorResponse2 = await fetch('http://localhost:3000/api/settings/author');
        const authorData2 = await authorResponse2.json();

        if (JSON.stringify(authorData) === JSON.stringify(authorData2)) {
            console.log('✓ Settings are consistent across multiple requests');
        } else {
            console.log('✗ Settings are inconsistent between requests');
        }

        console.log('\n=== SETTINGS PERSISTENCE TEST SUMMARY ===');
        const phoneCorrect = phoneNumber === '254729206894';
        const titleCorrect = blogTitle === 'zedong254ke';
        const consistent = JSON.stringify(authorData) === JSON.stringify(authorData2);

        console.log('Phone number persistence:', phoneCorrect ? 'PASS' : 'FAIL');
        console.log('Blog title persistence:', titleCorrect ? 'PASS' : 'FAIL');
        console.log('Settings consistency:', consistent ? 'PASS' : 'FAIL');

        const allPass = phoneCorrect && titleCorrect && consistent;
        console.log('Overall settings persistence test:', allPass ? 'PASS' : 'FAIL');

        return allPass;

    } catch (error) {
        console.error('Settings persistence test failed:', error);
        return false;
    }
}

// Run the test
testSettingsPersistence().then(success => {
    console.log('\nFinal settings persistence test result:', success ? 'PASS' : 'FAIL');
    process.exit(success ? 0 : 1);
});
