const crypto = require('crypto');
const fs = require('fs');

// Read settings
const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));

// Get encryption key (same as server.js)
function getEncKey() {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

// Decrypt function (same as server.js)
function decryptText(encStr) {
  try {
    if (!encStr) return '';
    const buf = Buffer.from(encStr, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const key = getEncKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    return '';
  }
}

// Get the encrypted key from settings
const encryptedKey = settings.security?.adminEntryKeyEnc;
if (encryptedKey) {
  const decryptedKey = decryptText(encryptedKey);
  console.log('Admin Entry Key:', decryptedKey);
} else {
  console.log('No admin entry key found in settings');
}
