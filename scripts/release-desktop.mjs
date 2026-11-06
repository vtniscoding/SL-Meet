#!/usr/bin/env node
/**
 * Automated Windows Desktop Release Publisher (`npm run release:desktop`)
 *
 * 1. Automatically loads GH_TOKEN from process.env, client/electron-builder.env,
 *    client/.env, or root .env (stripping quotes and whitespace).
 * 2. Performs a fast GitHub API preflight check to verify repository & release
 *    write permissions BEFORE spending time compiling Vite + NSIS installer.
 * 3. Runs `vite build` and `electron-builder --publish always` with GH_TOKEN injected.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');

const OWNER = 'vtniscoding';
const REPO = 'SL-Meet';

function readTokenFromEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    if (key === 'GH_TOKEN' || key === 'GITHUB_TOKEN') {
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1).trim();
      }
      if (val) return val;
    }
  }
  return null;
}

function resolveGitHubToken() {
  if (process.env.GH_TOKEN?.trim()) {
    return { token: process.env.GH_TOKEN.trim(), source: 'process.env.GH_TOKEN' };
  }
  if (process.env.GITHUB_TOKEN?.trim()) {
    return { token: process.env.GITHUB_TOKEN.trim(), source: 'process.env.GITHUB_TOKEN' };
  }

  const candidates = [
    { file: path.join(CLIENT_DIR, 'electron-builder.env'), label: 'client/electron-builder.env' },
    { file: path.join(CLIENT_DIR, '.env'), label: 'client/.env' },
    { file: path.join(ROOT_DIR, '.env'), label: '.env' },
  ];

  for (const { file, label } of candidates) {
    const token = readTokenFromEnvFile(file);
    if (token) return { token, source: label };
  }

  return { token: null, source: null };
}

async function verifyGitHubAccess(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'SL-Meet-Release-Publisher',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  console.log(`[Preflight] Verifying GitHub Releases access for ${OWNER}/${REPO}...`);

  const releasesRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=1`,
    { headers }
  );

  if (releasesRes.status === 401) {
    console.error(
      '\n[Release Error] GH_TOKEN is invalid or expired (HTTP 401 Bad credentials).\n' +
        'Please generate a valid GitHub Personal Access Token and set GH_TOKEN=... in client/electron-builder.env or client/.env.\n'
    );
    process.exit(1);
  }

  if (releasesRes.status === 403 || releasesRes.status === 404) {
    const errText = await releasesRes.text().catch(() => '');
    console.error(
      `\n[Release Error] GH_TOKEN cannot access ${OWNER}/${REPO} releases (HTTP ${releasesRes.status}).\n` +
        'Check your GitHub Token settings:\n' +
        `  1. Repository access must include "${OWNER}/${REPO}"\n` +
        '  2. Repository permissions -> "Contents" must be set to "Read and write"\n' +
        (errText ? `GitHub response: ${errText}\n` : '')
    );
    process.exit(1);
  }

  // Verify write permission via repo metadata when available
  const repoRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
    headers,
  });
  if (repoRes.ok) {
    const repoInfo = await repoRes.json();
    if (repoInfo?.permissions && repoInfo.permissions.push === false) {
      console.error(
        `\n[Release Error] GH_TOKEN only has READ access to ${OWNER}/${REPO} (Contents: Read-only).\n` +
          'Publishing a release requires WRITE permission:\n' +
          '  -> Go to GitHub Settings -> Developer settings -> Personal access tokens\n' +
          '  -> Edit your token -> Repository permissions -> Set "Contents" to "Read and write"\n'
      );
      process.exit(1);
    }
  }

  console.log('[Preflight] GitHub token verified successfully.');
}

function runStep(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: CLIENT_DIR,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  const { token, source } = resolveGitHubToken();

  if (!token) {
    console.error(
      '\n[Release Error] GH_TOKEN was not found!\n' +
        'Add the following line to client/electron-builder.env (or client/.env):\n' +
        '  GH_TOKEN=github_pat_your_token_here\n'
    );
    process.exit(1);
  }

  console.log(`[Release] Loaded GH_TOKEN from ${source}`);
  await verifyGitHubAccess(token);

  if (process.argv.includes('--check-only')) {
    console.log('[Preflight] Check-only mode complete.');
    return;
  }

  const childEnv = {
    ...process.env,
    GH_TOKEN: token,
  };

  console.log('\n[1/2] Building production web bundle (Vite)...');
  await runStep('npx', ['vite', 'build'], childEnv);

  console.log('\n[2/2] Packaging Windows NSIS installer & publishing to GitHub Releases...');
  await runStep('npx', ['electron-builder', '--publish', 'always'], childEnv);

  console.log(`\n[Success] Desktop release published to https://github.com/${OWNER}/${REPO}/releases`);
}

main().catch((err) => {
  console.error('\n[Release Failed]', err?.message || err);
  process.exit(1);
});
