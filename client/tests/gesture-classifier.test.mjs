import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHandLandmarks,
  normalizeMultiHandLandmarks,
  classifyLandmarksWithDataset,
  loadCustomDataset,
} from '../../packages/shared/src/services/gestureClassifier.js';
import { subscribeMediaPipeResults } from '../../packages/shared/src/services/mediapipe.js';

test('normalizeHandLandmarks: generates valid 63D vector with wrist origin', () => {
  // Mock 21 hand landmarks
  const mockLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + i * 0.01,
    y: 0.5 + i * 0.02,
    z: 0.0 + i * 0.005,
  }));

  const vec = normalizeHandLandmarks(mockLandmarks);
  assert.ok(Array.isArray(vec), 'Result must be an array');
  assert.equal(vec.length, 63, 'Single hand normalization must yield exactly 63 coordinates');

  // Wrist (landmark 0) must be translated to (0, 0, 0)
  assert.equal(vec[0], 0, 'Wrist X must be 0');
  assert.equal(vec[1], 0, 'Wrist Y must be 0');
  assert.equal(vec[2], 0, 'Wrist Z must be 0');

  // Invalid inputs must return null
  assert.equal(normalizeHandLandmarks(null), null);
  assert.equal(normalizeHandLandmarks([]), null);
  assert.equal(normalizeHandLandmarks(mockLandmarks.slice(0, 10)), null);
});

test('normalizeMultiHandLandmarks: supports 1-hand (63D) and 2-hand (126D) input', () => {
  const hand1 = Array.from({ length: 21 }, (_, i) => ({
    x: 0.4 + i * 0.01,
    y: 0.4 + i * 0.01,
    z: 0.0,
  }));
  const hand2 = Array.from({ length: 21 }, (_, i) => ({
    x: 0.6 + i * 0.01,
    y: 0.6 + i * 0.01,
    z: 0.0,
  }));

  // Single hand
  const vec1H = normalizeMultiHandLandmarks([hand1]);
  assert.equal(vec1H.length, 63, 'Single hand yields 63D vector');

  // Two hands
  const vec2H = normalizeMultiHandLandmarks([hand1, hand2]);
  assert.equal(vec2H.length, 126, 'Two hands yield 126D vector');
});

test('classifyLandmarksWithDataset: accurately matches nearest gesture sample', () => {
  const mockHand = Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + i * 0.01,
    y: 0.5 + i * 0.01,
    z: 0.0,
  }));
  const targetVector = normalizeHandLandmarks(mockHand);

  const testDataset = [
    {
      id: 'sample_hello_1',
      name: 'Hello',
      vector: targetVector,
      type: 'single_hand',
    },
    {
      id: 'sample_thumbsup_1',
      name: 'ThumbsUp',
      // Distant vector
      vector: targetVector.map((v) => v + 5.0),
      type: 'single_hand',
    },
  ];

  // Load custom dataset
  loadCustomDataset(testDataset);

  const result = classifyLandmarksWithDataset([mockHand]);
  assert.equal(result.gesture, 'Hello', 'Should identify Hello as the closest matching gesture');
  assert.ok(result.confidence > 0.8, 'Exact vector match should have high confidence');
  assert.ok(result.topCandidates.length >= 1, 'Should provide distance ranking for candidates');
  assert.equal(result.topCandidates[0].name, 'Hello');
});

test('subscribeMediaPipeResults: registers listener and allows clean unsubscribe', () => {
  let received = null;
  const listener = (res) => {
    received = res;
  };

  const unsubscribe = subscribeMediaPipeResults(listener);
  assert.equal(typeof unsubscribe, 'function', 'Must return an unsubscribe function');

  // Unsubscribe cleanly
  unsubscribe();
  assert.equal(received, null, 'Listener unsubscribed without executing errors');
});

