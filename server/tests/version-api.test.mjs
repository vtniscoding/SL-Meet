import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

test('Monorepo manifests are synchronized to uniform SemVer version', () => {
  const manifestPaths = [
    'package.json',
    'client/package.json',
    'admin/package.json',
    'server/package.json',
    'packages/shared/package.json',
  ];

  const versions = manifestPaths.map((relPath) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8')
    );
    assert.match(pkg.version, /^\d+\.\d+\.\d+/, `${relPath} must use SemVer`);
    return pkg.version;
  });

  const uniqueVersions = new Set(versions);
  assert.equal(
    uniqueVersions.size,
    1,
    `Expected all workspace package.json versions to match, got: ${versions.join(', ')}`
  );
});

test('server.js exposes /api/version with no-store Cache-Control and server_info socket emit', () => {
  const serverSource = fs.readFileSync(
    path.join(ROOT_DIR, 'server/server.js'),
    'utf8'
  );

  assert.match(serverSource, /app\.get\('\/api\/version'/);
  assert.match(serverSource, /no-store,\s*no-cache,\s*must-revalidate/);
  assert.match(serverSource, /socket\.emit\('server_info',\s*\{\s*version:\s*SERVER_VERSION\s*\}\)/);
});

