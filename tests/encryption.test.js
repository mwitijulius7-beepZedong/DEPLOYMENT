import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const {
  getEncKey,
  encryptText,
  decryptText,
  isLocalhost,
  isValidEmail,
  sanitizeString,
  generateId
} = require('../utils/encryption');

describe('encryption utilities', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.SESSION_SECRET;
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalEnv;
  });

  describe('getEncKey', () => {
    it('should return a 32-byte buffer', () => {
      const key = getEncKey('test-secret');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should return consistent key for same secret', () => {
      const key1 = getEncKey('test-secret');
      const key2 = getEncKey('test-secret');
      expect(key1.equals(key2)).toBe(true);
    });

    it('should return different keys for different secrets', () => {
      const key1 = getEncKey('secret1');
      const key2 = getEncKey('secret2');
      expect(key1.equals(key2)).toBe(false);
    });

    it('should use SESSION_SECRET env var when no secret provided', () => {
      process.env.SESSION_SECRET = 'env-secret';
      const keyFromEnv = getEncKey();
      const keyDirect = getEncKey('env-secret');
      expect(keyFromEnv.equals(keyDirect)).toBe(true);
    });

    it('should fallback to dev-secret when no secret available', () => {
      delete process.env.SESSION_SECRET;
      const key = getEncKey();
      const devKey = getEncKey('dev-secret');
      expect(key.equals(devKey)).toBe(true);
    });
  });

  describe('encryptText and decryptText', () => {
    const testSecret = 'test-encryption-secret';

    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encryptText(plaintext, testSecret);
      const decrypted = decryptText(encrypted, testSecret);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const plaintext = 'Same text';
      const encrypted1 = encryptText(plaintext, testSecret);
      const encrypted2 = encryptText(plaintext, testSecret);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty string', () => {
      const encrypted = encryptText('', testSecret);
      const decrypted = decryptText(encrypted, testSecret);
      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', () => {
      const plaintext = 'Hello, 世界! 🌍';
      const encrypted = encryptText(plaintext, testSecret);
      const decrypted = decryptText(encrypted, testSecret);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long text', () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = encryptText(plaintext, testSecret);
      const decrypted = decryptText(encrypted, testSecret);
      expect(decrypted).toBe(plaintext);
    });

    it('should convert numbers to strings during encryption', () => {
      const encrypted = encryptText(12345, testSecret);
      const decrypted = decryptText(encrypted, testSecret);
      expect(decrypted).toBe('12345');
    });

    it('should return empty string for null/undefined encryption input', () => {
      const encryptedNull = encryptText(null, testSecret);
      const encryptedUndef = encryptText(undefined, testSecret);
      // These become "null" and "undefined" strings
      expect(decryptText(encryptedNull, testSecret)).toBe('null');
      expect(decryptText(encryptedUndef, testSecret)).toBe('undefined');
    });

    it('should return empty string when decrypting with wrong key', () => {
      const plaintext = 'Secret data';
      const encrypted = encryptText(plaintext, 'secret1');
      const decrypted = decryptText(encrypted, 'secret2');
      expect(decrypted).toBe('');
    });

    it('should return empty string for invalid encrypted data', () => {
      expect(decryptText('invalid-base64-data', testSecret)).toBe('');
      expect(decryptText('', testSecret)).toBe('');
      expect(decryptText(null, testSecret)).toBe('');
      expect(decryptText(undefined, testSecret)).toBe('');
    });

    it('should return empty string for truncated encrypted data', () => {
      const plaintext = 'Test data';
      const encrypted = encryptText(plaintext, testSecret);
      const truncated = encrypted.substring(0, 10);
      expect(decryptText(truncated, testSecret)).toBe('');
    });
  });

  describe('isLocalhost', () => {
    it('should return true for 127.0.0.1 IP', () => {
      expect(isLocalhost('127.0.0.1', '')).toBe(true);
    });

    it('should return true for ::1 IPv6 loopback', () => {
      expect(isLocalhost('::1', '')).toBe(true);
    });

    it('should return true for localhost host', () => {
      expect(isLocalhost('', 'localhost:3000')).toBe(true);
    });

    it('should return true for 127.0.0.1 in host', () => {
      expect(isLocalhost('', '127.0.0.1:3000')).toBe(true);
    });

    it('should return true for ::1 in host', () => {
      expect(isLocalhost('', '[::1]:3000')).toBe(true);
    });

    it('should return true when IP contains 127.0.0.1 (forwarded)', () => {
      expect(isLocalhost('192.168.1.1, 127.0.0.1', '')).toBe(true);
    });

    it('should return false for external IP', () => {
      expect(isLocalhost('192.168.1.100', 'example.com')).toBe(false);
    });

    it('should return false for public IP and domain', () => {
      expect(isLocalhost('8.8.8.8', 'google.com')).toBe(false);
    });

    it('should handle null/undefined gracefully', () => {
      expect(isLocalhost(null, null)).toBe(false);
      expect(isLocalhost(undefined, undefined)).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid email', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
    });

    it('should return true for email with subdomain', () => {
      expect(isValidEmail('user@mail.example.com')).toBe(true);
    });

    it('should return true for email with plus sign', () => {
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    it('should return true for email with dots in local part', () => {
      expect(isValidEmail('first.last@example.com')).toBe(true);
    });

    it('should return false for email without @', () => {
      expect(isValidEmail('invalid-email.com')).toBe(false);
    });

    it('should return false for email without domain', () => {
      expect(isValidEmail('invalid@')).toBe(false);
    });

    it('should return false for email without local part', () => {
      expect(isValidEmail('@example.com')).toBe(false);
    });

    it('should return false for email with spaces', () => {
      expect(isValidEmail('test @example.com')).toBe(false);
      expect(isValidEmail('test@ example.com')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(isValidEmail(123)).toBe(false);
      expect(isValidEmail({})).toBe(false);
      expect(isValidEmail([])).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should escape HTML special characters', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should escape ampersand', () => {
      expect(sanitizeString('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape single quotes', () => {
      expect(sanitizeString("It's working")).toBe("It&#039;s working");
    });

    it('should escape angle brackets', () => {
      expect(sanitizeString('a < b > c')).toBe('a &lt; b &gt; c');
    });

    it('should handle empty string', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });

    it('should handle non-string input', () => {
      expect(sanitizeString(123)).toBe('');
      expect(sanitizeString({})).toBe('');
    });

    it('should preserve normal text', () => {
      expect(sanitizeString('Hello World')).toBe('Hello World');
    });

    it('should handle multiple special characters', () => {
      expect(sanitizeString('<div class="test">Hello & "Goodbye"</div>')).toBe(
        '&lt;div class=&quot;test&quot;&gt;Hello &amp; &quot;Goodbye&quot;&lt;/div&gt;'
      );
    });
  });

  describe('generateId', () => {
    it('should return a non-empty string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(1000);
    });

    it('should contain only alphanumeric characters', () => {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9]+$/);
    });
  });
});
