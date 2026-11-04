import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_ROLES,
  ROLES,
  ROLE_META,
  isValidRole,
  sanitizeRole,
  DEFAULT_PORTS,
  DTW_CONFIG,
} from '../src/constants/roles.js';

test('Roles: APP_ROLES provides signer and speaker constants', () => {
  assert.equal(APP_ROLES.SIGNER, 'signer');
  assert.equal(APP_ROLES.SPEAKER, 'speaker');
});

test('Roles: ROLES provides immutable SIGNER and NON_SIGNER definitions', () => {
  assert.equal(ROLES.SIGNER, 'signer');
  assert.equal(ROLES.NON_SIGNER, 'non_signer');
  assert.ok(Object.isFrozen(ROLES), 'ROLES object must be frozen');
});

test('Roles: ROLE_META correctly defines capabilities for Signer and Non-Signer', () => {
  const signerMeta = ROLE_META[ROLES.SIGNER];
  assert.ok(signerMeta, 'Signer metadata must exist');
  assert.equal(signerMeta.canSign, true);
  assert.equal(signerMeta.canSpeechToText, true);

  const nonSignerMeta = ROLE_META[ROLES.NON_SIGNER];
  assert.ok(nonSignerMeta, 'Non-signer metadata must exist');
  assert.equal(nonSignerMeta.canSign, false);
  assert.equal(nonSignerMeta.canSpeechToText, true);
});

test('Roles: isValidRole accurately validates participant roles', () => {
  assert.equal(isValidRole(ROLES.SIGNER), true);
  assert.equal(isValidRole(ROLES.NON_SIGNER), true);
  assert.equal(isValidRole('invalid_role'), false);
  assert.equal(isValidRole(null), false);
  assert.equal(isValidRole(undefined), false);
});

test('Roles: sanitizeRole defaults to fallback on invalid role input', () => {
  assert.equal(sanitizeRole(ROLES.SIGNER), ROLES.SIGNER);
  assert.equal(sanitizeRole('unknown_role'), ROLES.NON_SIGNER);
  assert.equal(sanitizeRole(null, ROLES.SIGNER), ROLES.SIGNER);
});

test('Network: DEFAULT_PORTS defines correct ports for client, admin, and server', () => {
  assert.equal(DEFAULT_PORTS.CLIENT, 5173);
  assert.equal(DEFAULT_PORTS.ADMIN, 5174);
  assert.equal(DEFAULT_PORTS.SERVER, 4000);
});

test('DTW: DTW_CONFIG specifies keyframes and band radius parameters', () => {
  assert.equal(DTW_CONFIG.KEYFRAMES, 24);
  assert.equal(DTW_CONFIG.BAND_RADIUS, 7);
  assert.ok(DTW_CONFIG.MATCH_THRESHOLD > 0);
});

