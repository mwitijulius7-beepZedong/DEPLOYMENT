module.exports = (app) => {
  // Global process-level error handling for production resilience
  process.on('unhandledRejection', (reason, promise) => {
    console.error('UnhandledRejection at:', promise, 'reason:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('UncaughtException:', err);
  });

  // Lightweight health endpoint for quick production checks
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, env: process.env.NODE_ENV || 'development' });
  });
};
