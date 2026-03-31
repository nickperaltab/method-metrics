import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  build: {
    outDir: 'dist',
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    setupFiles: ['tests/unit/setup-browser.js'],
  },
});
