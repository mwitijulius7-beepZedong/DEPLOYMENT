const crypto = require('crypto');

/**
 * Get encryption key derived from session secret
 * @param {string} secret - The session secret to derive the key from
 * @returns {Buffer} - 32-byte encryption key
 */
function getEncKey(secret) {
  const secretKey = secret || process.env.SESSION_SECRET || 'dev-secret';
  return crypto.createHash('sha256').update(secretKey).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param {string} plain - The plaintext to encrypt
 * @param {string} secret - Optional session secret override
 * @returns {string} - Base64 encoded encrypted string, or empty string on error
 */
function encryptText(plain, secret) {
  try {
    const key = getEncKey(secret);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  } catch (e) {
    return '';
  }
}

/**
 * Decrypt encrypted string using AES-256-GCM
 * @param {string} encStr - Base64 encoded encrypted string
 * @param {string} secret - Optional session secret override
 * @returns {string} - Decrypted plaintext, or empty string on error
 */
function decryptText(encStr, secret) {
  try {
    if (!encStr) return '';
    const buf = Buffer.from(encStr, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const key = getEncKey(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    return '';
  }
}

/**
 * Check if localhost based on IP and host
 * @param {string} ip - The client IP address
 * @param {string} host - The host header value
 * @returns {boolean} - True if localhost
 */
function isLocalhost(ip, host) {
  const ipAddr = ip || '';
  const hostAddr = host || '';
  return ipAddr.includes('127.0.0.1') || 
         ipAddr === '::1' || 
         hostAddr.includes('localhost') || 
         hostAddr.includes('127.0.0.1') || 
         hostAddr.includes('::1');
}

/**
 * Validate email format
 * @param {string} email - The email to validate
 * @returns {boolean} - True if valid email format
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize string for safe output (basic XSS prevention)
 * @param {string} str - The string to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate a unique ID
 * @returns {string} - Unique ID string
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

module.exports = {
  getEncKey,
  encryptText,
  decryptText,
  isLocalhost,
  isValidEmail,
  sanitizeString,
  generateId
};
