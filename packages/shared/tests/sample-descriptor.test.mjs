import test from 'node:test';
import assert from 'node:assert/strict';
import { getSampleDescriptor } from '../src/utils/sampleDescriptor.js';

test('Sample Descriptor: accurately detects static single-hand 63D sample', () => {
  const sample = { vector: new Array(63).fill(0) };
  const desc = getSampleDescriptor(sample);

  assert.equal(desc.isDynamic, false);
  assert.equal(desc.isTwoHand, false);
  assert.equal(desc.badgeText, 'Single-Hand 63D');
});

test('Sample Descriptor: accurately detects static dual-hand 126D sample', () => {
  const sample = { vector: new Array(126).fill(0) };
  const desc = getSampleDescriptor(sample);

  assert.equal(desc.isDynamic, false);
  assert.equal(desc.isTwoHand, true);
  assert.equal(desc.badgeText, 'Unified 2-Hand 126D');
});

test('Sample Descriptor: accurately detects dynamic multi-frame gesture sample', () => {
  const dynamicSample = {
    type: 'dynamic_two_hands',
    vector: new Array(10).fill(0).map(() => new Array(140).fill(0)),
  };
  const desc = getSampleDescriptor(dynamicSample);

  assert.equal(desc.isDynamic, true);
  assert.equal(desc.isTwoHand, true);
  assert.ok(desc.badgeText.includes('Dynamic'));
});

test('Sample Descriptor: safely handles null or missing vector payload', () => {
  const nullDesc = getSampleDescriptor(null);
  assert.equal(nullDesc.isDynamic, false);
  assert.equal(nullDesc.isTwoHand, false);

  const emptyDesc = getSampleDescriptor({});
  assert.equal(emptyDesc.isDynamic, false);
  assert.equal(emptyDesc.isTwoHand, false);
});

