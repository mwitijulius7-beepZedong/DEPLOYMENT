const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '..', 'settings.json');

console.log('🔄 Resetting Admin Entry Key for Localhost...');

try {
    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        if (!settings.security) settings.security = {};
        
        settings.security.adminEntryKeyHash = "";
        settings.security.adminEntryKeyEnc = "";
        
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log('✅ Admin entry key has been reset/cleared in settings.json');
        console.log('👉 You can now access the admin panel without a key.');
    } else {
        console.error('❌ settings.json not found');
    }
} catch (error) {
    console.error('❌ Failed to reset admin key:', error);
}