import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSemver,
  compareSemver,
  isNewerVersion,
} from '../src/utils/semver.js';

test('parseSemver: parses standard, v-prefixed, and pre-release versions', () => {
  assert.deepEqual(parseSemver('2.0.0'), {
    major: 2,
    minor: 0,
    patch: 0,
    prerelease: [],
  });

  assert.deepEqual(parseSemver('v2.1.3-beta.1+build42'), {
    major: 2,
    minor: 1,
    patch: 3,
    prerelease: ['beta', '1'],
  });

  assert.equal(parseSemver(''), null);
  assert.equal(parseSemver(null), null);
  assert.equal(parseSemver('invalid.version'), null);
  assert.equal(parseSemver('01.2.3'), null);
});

test('compareSemver: respects major, minor, patch, and pre-release precedence', () => {
  assert.equal(compareSemver('2.0.0', '1.9.9'), 1);
  assert.equal(compareSemver('2.0.0', 'v2.0.0'), 0);
  assert.equal(compareSemver('2.0.1', '2.0.0'), 1);
  assert.equal(compareSemver('2.1.0', '2.0.9'), 1);
  assert.equal(compareSemver('2.0.0', '2.0.0-rc.1'), 1);
  assert.equal(compareSemver('2.0.0-alpha.2', '2.0.0-alpha.10'), -1);
});

test('isNewerVersion: accurately flags newer candidates and rejects downgrades/invalid', () => {
  assert.equal(isNewerVersion('1.0.0', '2.0.0'), true);
  assert.equal(isNewerVersion('2.0.0', '2.0.1'), true);
  assert.equal(isNewerVersion('2.0.0-beta.1', '2.0.0'), true);
  assert.equal(isNewerVersion('2.0.0', '2.0.0'), false);
  assert.equal(isNewerVersion('2.1.0', '2.0.9'), false);
  assert.equal(isNewerVersion('2.0.0', null), false);
  assert.equal(isNewerVersion(undefined, '2.0.1'), false);
});

