import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['middleware/**/*.js', 'utils/**/*.js', 'server.js'],
      exclude: ['tests/**', 'node_modules/**', 'uploads/**']
    }
  }
});
