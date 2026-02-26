const bcrypt = require('bcryptjs');
const fs = require('fs');

// Load users
const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));

console.log('Users in system:', Object.keys(users));
console.log('\nChecking password for Mwitijulius7...');

const user = users['Mwitijulius7'];
if (user) {
    console.log('User found:', user.name);
    console.log('Password hash:', user.passwordHash);
    
    // Test different passwords
    const testPasswords = [
        'Mwitijulius7',
        'Mwitijulius7@Jm',
        'password',
        'admin@123'
    ];
    
    console.log('\nTesting passwords:');
    for (const pwd of testPasswords) {
        bcrypt.compare(pwd, user.passwordHash, (err, isMatch) => {
            if (err) {
                console.log(`  ❌ Error comparing "${pwd}": ${err.message}`);
            } else {
                console.log(`  ${isMatch ? '✅' : '❌'} "${pwd}"`);
            }
        });
    }
} else {
    console.log('User not found');
}
