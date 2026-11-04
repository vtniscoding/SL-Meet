import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@sl-meet/shared/icons': path.resolve(__dirname, '../packages/shared/src/icons/icons.js'),
      '@sl-meet/shared/constants': path.resolve(__dirname, '../packages/shared/src/constants/roles.js'),
      '@sl-meet/shared/theme': path.resolve(__dirname, '../packages/shared/src/theme/colors.js'),
      '@sl-meet/shared': path.resolve(__dirname, '../packages/shared/src/index.js'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },
});

