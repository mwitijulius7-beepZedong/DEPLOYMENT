import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the module before importing
const errorHandler = require('../middleware/errorHandler');

describe('errorHandler middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    mockReq = {};
    mockRes = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.clearAllMocks();
  });

  describe('in development environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should return 500 status and error message for generic errors', () => {
      const error = new Error('Test error message');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'internal_error',
        message: 'Test error message'
      });
    });

    it('should use custom status code when provided on error object', () => {
      const error = new Error('Not found');
      error.status = 404;

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'internal_error',
        message: 'Not found'
      });
    });

    it('should return default message when error has no message', () => {
      const error = {};

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'internal_error',
        message: 'Internal Server Error'
      });
    });

    it('should handle null error gracefully', () => {
      errorHandler(null, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'internal_error',
        message: 'Internal Server Error'
      });
    });

    it('should handle undefined error gracefully', () => {
      errorHandler(undefined, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'internal_error',
        message: 'Internal Server Error'
      });
    });
  });

  describe('in production environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should return 500 status without error message', () => {
      const error = new Error('Sensitive error details');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'internal_error',
        message: undefined
      });
    });

    it('should use custom status code but hide message in production', () => {
      const error = new Error('Secret data');
      error.status = 403;

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'internal_error',
        message: undefined
      });
    });
  });

  describe('headers already sent', () => {
    it('should call next with error when headers are already sent', () => {
      mockRes.headersSent = true;
      const error = new Error('Test error');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle error with status 0', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Network error');
      error.status = 0;

      errorHandler(error, mockReq, mockRes, mockNext);

      // Status 0 is falsy, so it should default to 500
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should handle error with empty string message', () => {
      process.env.NODE_ENV = 'development';
      const error = { message: '', status: 400 };

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      // Empty string is falsy, so it defaults to 'Internal Server Error'
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'internal_error',
        message: 'Internal Server Error'
      });
    });
  });
});
