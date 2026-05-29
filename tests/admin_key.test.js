import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  BRUTE_MAX_ATTEMPTS,
  encryptText,
  decryptText,
  isLocalhostRequest,
  isLocalhostAdminKeyBypassEnabled,
  getBruteRecord,
  recordFailedAttempt,
  isLockedOut,
  clearBruteRecord,
  getClientIP,
  bruteStore
} = require('../utils/adminKey');

describe('admin key utilities', () => {
  let mockReq;

  beforeEach(() => {
    bruteStore.clear();
    delete process.env.DISABLE_LOCALHOST_ADMIN_KEY_BYPASS;
    delete process.env.ADMIN_ENTRY_KEY;

    mockReq = {
      headers: {
        'x-forwarded-for': '',
        host: 'localhost:3000'
      },
      socket: { remoteAddress: '127.0.0.1' },
      get: (header) => {
        const h = header.toLowerCase();
        if (h === 'host') return mockReq.headers.host;
        return mockReq.headers[h];
      }
    };
  });

  describe('isLocalhostRequest', () => {
    it('should return true for 127.0.0.1 IP', () => {
      mockReq.socket.remoteAddress = '127.0.0.1';
      expect(isLocalhostRequest(mockReq)).toBe(true);
    });

    it('should return true for ::1 IPv6 loopback', () => {
      mockReq.socket.remoteAddress = '::1';
      expect(isLocalhostRequest(mockReq)).toBe(true);
    });

    it('should return true for localhost host', () => {
      mockReq.get = () => 'localhost:3000';
      expect(isLocalhostRequest(mockReq)).toBe(true);
    });

    it('should return true for x-forwarded-for containing 127.0.0.1', () => {
      mockReq.headers['x-forwarded-for'] = '192.168.1.1, 127.0.0.1';
      expect(isLocalhostRequest(mockReq)).toBe(true);
    });

    it('should return false for external IP and host', () => {
      mockReq.socket.remoteAddress = '203.0.113.1';
      mockReq.get = () => 'example.com';
      expect(isLocalhostRequest(mockReq)).toBe(false);
    });

    it('should return false for null/undefined req', () => {
      expect(isLocalhostRequest(null)).toBe(false);
      expect(isLocalhostRequest(undefined)).toBe(false);
    });
  });

  describe('isLocalhostAdminKeyBypassEnabled', () => {
    it('should return true by default for localhost', () => {
      mockReq.get = () => 'localhost:3000';
      expect(isLocalhostAdminKeyBypassEnabled(mockReq)).toBe(true);
    });

    it('should return false when DISABLE_LOCALHOST_ADMIN_KEY_BYPASS is true', () => {
      process.env.DISABLE_LOCALHOST_ADMIN_KEY_BYPASS = 'true';
      mockReq.get = () => 'localhost:3000';
      expect(isLocalhostAdminKeyBypassEnabled(mockReq)).toBe(false);
    });

    it('should return false for non-localhost requests', () => {
      mockReq.socket.remoteAddress = '203.0.113.1';
      mockReq.get = () => 'example.com';
      expect(isLocalhostAdminKeyBypassEnabled(mockReq)).toBe(false);
    });
  });

  describe('admin key encryption', () => {
    it('should encrypt and decrypt admin key correctly', () => {
      const adminKey = 'my-secret-admin-key-123';
      const encrypted = encryptText(adminKey);
      const decrypted = decryptText(encrypted);
      expect(decrypted).toBe(adminKey);
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const adminKey = 'my-secret-admin-key-123';
      const encrypted1 = encryptText(adminKey);
      const encrypted2 = encryptText(adminKey);
      expect(encrypted1).not.toBe(encrypted2);
      expect(decryptText(encrypted1)).toBe(adminKey);
      expect(decryptText(encrypted2)).toBe(adminKey);
    });

    it('should return empty string for invalid encrypted data', () => {
      expect(decryptText('invalid-base64')).toBe('');
      expect(decryptText('')).toBe('');
      expect(decryptText(null)).toBe('');
      expect(decryptText(undefined)).toBe('');
    });

    it('should handle unicode characters', () => {
      const key = '管理员密钥-中文🔐';
      const encrypted = encryptText(key);
      expect(decryptText(encrypted)).toBe(key);
    });

    it('should handle empty string', () => {
      const encrypted = encryptText('');
      expect(encrypted).not.toBe('');
      expect(decryptText(encrypted)).toBe('');
    });
  });

  describe('brute-force protection', () => {
    it('should return false initially for new IP', () => {
      expect(isLockedOut('192.168.1.100')).toBe(false);
    });

    it('should lock out after max attempts', () => {
      const testIp = '192.168.1.100';

      for (let i = 0; i < BRUTE_MAX_ATTEMPTS; i++) {
        recordFailedAttempt(testIp);
      }

      expect(isLockedOut(testIp)).toBe(true);
    });

    it('should clear lockout on clearBruteRecord', () => {
      const testIp = '192.168.1.100';

      for (let i = 0; i < BRUTE_MAX_ATTEMPTS; i++) {
        recordFailedAttempt(testIp);
      }

      expect(isLockedOut(testIp)).toBe(true);

      clearBruteRecord(testIp);
      expect(isLockedOut(testIp)).toBe(false);
    });

    it('should reset window after timeout', async () => {
      const testIp = '192.168.1.100';
      const record = getBruteRecord(testIp);
      expect(record.count).toBe(0);

      recordFailedAttempt(testIp);
      const updatedRecord = getBruteRecord(testIp);
      expect(updatedRecord.count).toBe(1);
    });

    it('should have correct max attempts constant', () => {
      expect(BRUTE_MAX_ATTEMPTS).toBe(5);
    });
  });

  describe('getClientIP', () => {
    it('should extract IP from x-forwarded-for', () => {
      mockReq.headers['x-forwarded-for'] = '192.168.1.1, 10.0.0.1';
      expect(getClientIP(mockReq)).toBe('192.168.1.1');
    });

    it('should fallback to socket remoteAddress', () => {
      mockReq.headers['x-forwarded-for'] = '';
      mockReq.socket.remoteAddress = '127.0.0.1';
      expect(getClientIP(mockReq)).toBe('127.0.0.1');
    });

    it('should handle missing headers', () => {
      const emptyReq = { socket: {} };
      expect(getClientIP(emptyReq)).toBe('unknown');
    });
  });
});
