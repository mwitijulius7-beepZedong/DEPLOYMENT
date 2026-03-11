import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const healthAndErrors = require('../middleware/health_and_errors');

describe('health_and_errors middleware', () => {
  let mockApp;
  let registeredRoutes;
  let originalEnv;
  let unhandledRejectionHandler;
  let uncaughtExceptionHandler;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    registeredRoutes = {};
    mockApp = {
      get: vi.fn((path, handler) => {
        registeredRoutes[path] = handler;
      })
    };

    // Capture the handlers registered on process
    vi.spyOn(process, 'on').mockImplementation((event, handler) => {
      if (event === 'unhandledRejection') {
        unhandledRejectionHandler = handler;
      } else if (event === 'uncaughtException') {
        uncaughtExceptionHandler = handler;
      }
    });

    // Suppress console.error during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  describe('module initialization', () => {
    it('should register global error handlers on process', () => {
      healthAndErrors(mockApp);

      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    it('should register health endpoint', () => {
      healthAndErrors(mockApp);

      expect(mockApp.get).toHaveBeenCalledWith('/api/health', expect.any(Function));
    });
  });

  describe('/api/health endpoint', () => {
    it('should return ok status and development environment', () => {
      process.env.NODE_ENV = 'development';
      healthAndErrors(mockApp);

      const mockReq = {};
      const mockRes = {
        json: vi.fn()
      };

      registeredRoutes['/api/health'](mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        env: 'development'
      });
    });

    it('should return ok status and production environment', () => {
      process.env.NODE_ENV = 'production';
      healthAndErrors(mockApp);

      const mockReq = {};
      const mockRes = {
        json: vi.fn()
      };

      registeredRoutes['/api/health'](mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        env: 'production'
      });
    });

    it('should default to development when NODE_ENV is undefined', () => {
      delete process.env.NODE_ENV;
      healthAndErrors(mockApp);

      const mockReq = {};
      const mockRes = {
        json: vi.fn()
      };

      registeredRoutes['/api/health'](mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        ok: true,
        env: 'development'
      });
    });
  });

  describe('unhandledRejection handler', () => {
    it('should log unhandled rejections', () => {
      healthAndErrors(mockApp);

      const reason = new Error('Test rejection');
      const promise = Promise.resolve();

      unhandledRejectionHandler(reason, promise);

      expect(console.error).toHaveBeenCalledWith(
        'UnhandledRejection at:',
        promise,
        'reason:',
        reason
      );
    });

    it('should handle string rejection reasons', () => {
      healthAndErrors(mockApp);

      const reason = 'Simple string rejection';
      const promise = Promise.resolve();

      unhandledRejectionHandler(reason, promise);

      expect(console.error).toHaveBeenCalledWith(
        'UnhandledRejection at:',
        promise,
        'reason:',
        reason
      );
    });
  });

  describe('uncaughtException handler', () => {
    it('should log uncaught exceptions', () => {
      healthAndErrors(mockApp);

      const error = new Error('Uncaught test error');

      uncaughtExceptionHandler(error);

      expect(console.error).toHaveBeenCalledWith('UncaughtException:', error);
    });

    it('should handle non-Error exceptions', () => {
      healthAndErrors(mockApp);

      const error = { message: 'Plain object error' };

      uncaughtExceptionHandler(error);

      expect(console.error).toHaveBeenCalledWith('UncaughtException:', error);
    });
  });
});
