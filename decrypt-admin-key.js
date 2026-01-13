const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

// The old createCipher prepends IV to the encrypted data
function decryptOld(encryptedHex) {
  try {
    const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
    const iv = encryptedBuffer.slice(0, 16); // First 16 bytes are IV
    const encrypted = encryptedBuffer.slice(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    console.error('Decryption failed:', e.message);
    return null;
  }
}

// The encrypted key from settings.json
const encrypted = 'MaDGm7LyJbiFCIZeA7QmoeqFg2g7Nf1c3uEhJuetcNTEPmCNURnebg==';

try {
  // Decode base64 to hex
  const decodedHex = Buffer.from(encrypted, 'base64').toString('hex');
  console.log('Base64 decoded to hex:', decodedHex);

  const decrypted = decryptOld(decodedHex);
  console.log('Decrypted key:', decrypted);
} catch (e) {
  console.error('Decryption error:', e.message);
}
