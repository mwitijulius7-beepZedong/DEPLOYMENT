#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const viteBin = resolve(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');

const child = spawn('node', [viteBin, 'build'], {
  cwd: __dirname,
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code);
});
