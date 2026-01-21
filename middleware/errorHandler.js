module.exports = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const status = err?.status || 500;
  const message = isDev ? (err?.message || 'Internal Server Error') : 'Internal Server Error';
  if (res.headersSent) return next(err);
  res.status(status).json({ error: 'internal_error', message: isDev ? message : undefined });
};
