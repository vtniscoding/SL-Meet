import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf8')
);
const appVersion = pkg.version || '2.0.0';
const buildTimestamp = new Date().toISOString();

function versionManifestPlugin(version, buildTime) {
  const payload = JSON.stringify({ version, buildTime }, null, 2);

  return {
    name: 'sl-meet-version-manifest',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionManifestPlugin(appVersion, buildTimestamp)],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@sl-meet/admin': path.resolve(__dirname, '../admin/src'),
      '@sl-meet/shared/icons': path.resolve(__dirname, '../packages/shared/src/icons/icons.js'),
      '@sl-meet/shared/constants': path.resolve(__dirname, '../packages/shared/src/constants/roles.js'),
      '@sl-meet/shared/theme': path.resolve(__dirname, '../packages/shared/src/theme/colors.js'),
      '@sl-meet/shared': path.resolve(__dirname, '../packages/shared/src/index.js'),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },
});
