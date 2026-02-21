const fetch = require('node-fetch');

async function runComprehensiveTests() {
    console.log('=== COMPREHENSIVE API TESTING ===\n');
    
    let allTestsPassed = true;
    const results = [];

    // Test 1: Settings - Author endpoint
    console.log('Test 1: GET /api/settings/author');
    try {
        const res = await fetch('http://localhost:3000/api/settings/author');
        const data = await res.json();
        
        const phoneCorrect = data.author?.phone === '254729206894';
        const nameCorrect = data.author?.name === 'zedong254ke';
        const bioExists = !!data.author?.bio;
        
        if (phoneCorrect && nameCorrect && bioExists) {
            console.log('  ✓ PASS: Author settings loaded correctly');
            console.log('    - Phone:', data.author.phone);
            console.log('    - Name:', data.author.name);
            results.push({ test: 'Author settings', pass: true });
        } else {
            console.log('  ✗ FAIL: Author settings incorrect');
            console.log('    - Phone correct:', phoneCorrect);
            console.log('    - Name correct:', nameCorrect);
            results.push({ test: 'Author settings', pass: false });
            allTestsPassed = false;
        }
    } catch (e) {
        console.log('  ✗ FAIL:', e.message);
        results.push({ test: 'Author settings', pass: false });
        allTestsPassed = false;
    }

    // Test 2: Settings - Blog Info endpoint
    console.log('\nTest 2: GET /api/settings/blog-info');
    try {
        const res = await fetch('http://localhost:3000/api/settings/blog-info');
        const data = await res.json();
        
        const titleCorrect = data.blogInfo?.title === 'zedong254ke';
        const descExists = !!data.blogInfo?.description;
        
        if (titleCorrect && descExists) {
            console.log('  ✓ PASS: Blog info loaded correctly');
            console.log('    - Title:', data.blogInfo.title);
            results.push({ test: 'Blog info', pass: true });
        } else {
            console.log('  ✗ FAIL: Blog info incorrect');
            results.push({ test: 'Blog info', pass: false });
            allTestsPassed = false;
        }
    } catch (e) {
        console.log('  ✗ FAIL:', e.message);
        results.push({ test: 'Blog info', pass: false });
        allTestsPassed = false;
    }

    // Test 3: Categories endpoint
    console.log('\nTest 3: GET /api/categories');
    try {
        const res = await fetch('http://localhost:3000/api/categories');
        const data = await res.json();
        
        if (data.categories && Array.isArray(data.categories)) {
            console.log('  ✓ PASS: Categories endpoint works');
            console.log('    - Categories count:', data.categories.length);
            results.push({ test: 'Categories', pass: true });
        } else {
            console.log('  ✗ FAIL: Categories format incorrect');
            results.push({ test: 'Categories', pass: false });
            allTestsPassed = false;
        }
    } catch (e) {
        console.log('  ✗ FAIL:', e.message);
        results.push({ test: 'Categories', pass: false });
        allTestsPassed = false;
    }

    // Test 4: Posts endpoint
    console.log('\nTest 4: GET /api/posts');
    try {
        const res = await fetch('http://localhost:3000/api/posts');
        const data = await res.json();
        
        if (data.posts && Array.isArray(data.posts)) {
            console.log('  ✓ PASS: Posts endpoint works');
            console.log('    - Posts count:', data.posts.length);
            results.push({ test: 'Posts', pass: true });
        } else {
            console.log('  ✗ FAIL: Posts format incorrect');
            results.push({ test: 'Posts', pass: false });
            allTestsPassed = false;
        }
    } catch (e) {
        console.log('  ✗ FAIL:', e.message);
        results.push({ test: 'Posts', pass: false });
        allTestsPassed = false;
    }

    // Test 5: Settings consistency (multiple calls return same data)
    console.log('\nTest 5: Settings consistency check');
    try {
        const res1 = await fetch('http://localhost:3000/api/settings/author');
        const data1 = await res1.json();
        const res2 = await fetch('http://localhost:3000/api/settings/author');
        const data2 = await res2.json();
        
        const consistent = JSON.stringify(data1) === JSON.stringify(data2);
        
        if (consistent) {
            console.log('  ✓ PASS: Settings are consistent');
            results.push({ test: 'Settings consistency', pass: true });
        } else {
            console.log('  ✗ FAIL: Settings inconsistent');
            results.push({ test: 'Settings consistency', pass: false });
            allTestsPassed = false;
        }
    } catch (e) {
        console.log('  ✗ FAIL:', e.message);
        results.push({ test: 'Settings consistency', pass: false });
        allTestsPassed = false;
    }

    // Summary
    console.log('\n=== TEST SUMMARY ===');
    results.forEach(r => {
        console.log(`${r.pass ? '✓' : '✗'} ${r.test}`);
    });
    
    const passed = results.filter(r => r.pass).length;
    const total = results.length;
    console.log(`\nTotal: ${passed}/${total} tests passed`);
    
    return allTestsPassed;
}

runComprehensiveTests().then(success => {
    console.log('\n' + (success ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED!'));
    process.exit(success ? 0 : 1);
});
