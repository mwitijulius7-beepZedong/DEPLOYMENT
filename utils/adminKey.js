const crypto = require('crypto');

const BRUTE_MAX_ATTEMPTS = 5;
const BRUTE_WINDOW_MS = 15 * 60 * 1000;

const bruteStore = new Map();

function getEncKey(secret) {
  const secretKey = secret || process.env.SESSION_SECRET || 'dev-secret';
  return crypto.createHash('sha256').update(secretKey).digest();
}

function encryptText(plain) {
  try {
    const key = getEncKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  } catch (e) {
    return '';
  }
}

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

function isLocalhostRequest(req) {
  if (!req) return false;
  const ip = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const host = req.get?.('host') || '';
  return (
    String(ip).includes('127.0.0.1') ||
    ip === '::1' ||
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('::1')
  );
}

function isLocalhostAdminKeyBypassEnabled(req) {
  // By default, allow a convenient localhost bypass when running locally.
  // Setting DISABLE_LOCALHOST_ADMIN_KEY_BYPASS=true will disable this behavior
  // (useful for testing or stricter local environments).
  try {
    const disabled = String(process.env.DISABLE_LOCALHOST_ADMIN_KEY_BYPASS || '').toLowerCase() === 'true';
    if (disabled) return false;
    return isLocalhostRequest(req);
  } catch (e) {
    return false;
  }
}

function getBruteRecord(ip) {
  return bruteStore.get(ip) || { count: 0, firstAt: Date.now() };
}

function recordFailedAttempt(ip) {
  const rec = getBruteRecord(ip);
  const now = Date.now();
  if (now - rec.firstAt > BRUTE_WINDOW_MS) {
    bruteStore.set(ip, { count: 1, firstAt: now });
  } else {
    bruteStore.set(ip, { count: rec.count + 1, firstAt: rec.firstAt });
  }
}

function isLockedOut(ip) {
  const rec = bruteStore.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > BRUTE_WINDOW_MS) {
    bruteStore.delete(ip);
    return false;
  }
  return rec.count >= BRUTE_MAX_ATTEMPTS;
}

function clearBruteRecord(ip) {
  bruteStore.delete(ip);
}

function findUserKey(users, username) {
  if (!users || !username) return null;
  const lower = username.toLowerCase();
  return Object.keys(users).find(k => k.toLowerCase() === lower) || null;
}

function getClientIP(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const socket = req?.socket?.remoteAddress;
  return (forwarded || '').split(',')[0].trim() || socket || 'unknown';
}

module.exports = {
  BRUTE_MAX_ATTEMPTS,
  BRUTE_WINDOW_MS,
  encryptText,
  decryptText,
  isLocalhostRequest,
  isLocalhostAdminKeyBypassEnabled,
  getBruteRecord,
  recordFailedAttempt,
  isLockedOut,
  clearBruteRecord,
  findUserKey,
  getClientIP,
  bruteStore
};
