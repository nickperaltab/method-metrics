import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/method-metrics/builder/',
  build: {
    outDir: 'dist',
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
  },
});
