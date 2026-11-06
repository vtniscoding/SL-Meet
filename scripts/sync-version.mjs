#!/usr/bin/env node
/**
 * Synchronizes the Semantic Version across all SL-Meet monorepo workspaces.
 * Usage: node scripts/sync-version.mjs <major.minor.patch[-prerelease]>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const rawArg = process.argv[2]?.trim().replace(/^v/i, '');

if (!rawArg || !SEMVER_REGEX.test(rawArg)) {
  console.error(
    'Usage: npm run version:sync -- <X.Y.Z>\nExample: npm run version:sync -- 2.0.0'
  );
  process.exit(1);
}

const TARGET_MANIFESTS = [
  'package.json',
  'client/package.json',
  'admin/package.json',
  'server/package.json',
  'packages/shared/package.json',
];

for (const relPath of TARGET_MANIFESTS) {
  const absPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`[Skip] Manifest not found: ${relPath}`);
    continue;
  }
  const raw = fs.readFileSync(absPath, 'utf8');
  const pkg = JSON.parse(raw);
  const prevVersion = pkg.version;
  pkg.version = rawArg;
  fs.writeFileSync(absPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log(`[Synced] ${relPath}: ${prevVersion} -> ${rawArg}`);
}

