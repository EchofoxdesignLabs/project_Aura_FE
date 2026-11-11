import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path must be relative for Electron production builds to find assets
  base: './', 
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src/app'),
      '@core': path.resolve(__dirname, './src/core'),
      '@spatial': path.resolve(__dirname, './src/modules/spatial'),
      '@enterprise': path.resolve(__dirname, './src/modules/enterprise'),
      '@productivity': path.resolve(__dirname, './src/modules/productivity'),
      '@intelligence': path.resolve(__dirname, './src/modules/intelligence'),
      '@assets': path.resolve(__dirname, './src/assets'),
    },
  },
  server: {
    port: 51173,
    strictPort: true, // Fail if port is busy (Electron needs exact port)
  }
});