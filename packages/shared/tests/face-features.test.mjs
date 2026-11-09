import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FEATURE_FLAGS,
  setFeatureFace,
  setFaceWeight,
} from '../src/constants/featureFlags.js';

import {
  computeFaceCoordinateSystem,
  projectPointToFaceFrame,
  classifyAnatomicalZone,
  extractHandFaceFeatures,
  ANATOMICAL_ZONES,
  FaceTracker,
} from '../src/services/faceTracker.js';

import {
  computeDTWDistance,
  computeDTWBreakdown,
  buildDynamicSequence,
} from '../src/services/dtwClassifier.js';

import {
  computeStaticPoseDistance,
  checkDatasetConflict,
  loadCustomDataset,
} from '../src/services/gestureClassifier.js';

import {
  smoothMultiHandLandmarks,
} from '../src/services/landmarkSmoother.js';

test('FEATURE_FLAGS: defaults to false and supports dynamic setters', () => {
  // Ensure default flag behavior
  setFeatureFace(false);
  assert.equal(FEATURE_FLAGS.FEATURE_FACE, false);

  setFeatureFace(true);
  assert.equal(FEATURE_FLAGS.FEATURE_FACE, true);

  setFaceWeight(1.25);
  assert.equal(FEATURE_FLAGS.FACE_WEIGHT, 1.25);

  // Reset to default false
  setFeatureFace(false);
  setFaceWeight(1.0);
  assert.equal(FEATURE_FLAGS.FEATURE_FACE, false);
});

test('computeFaceCoordinateSystem: produces head-tilt compensated orthonormal frame', () => {
  // Upright face landmarks in 640x480 pixels
  // Right eye at (280, 200), Left eye at (360, 200) -> inter-ocular distance = 80px
  // Nose at (320, 230), Mouth at (320, 280) -> down vector = (0, 50) => ey = (0, 1), ex = (1, 0)
  const uprightLandmarks = [
    { x: 280, y: 200 }, // 0: Right eye
    { x: 360, y: 200 }, // 1: Left eye
    { x: 320, y: 230 }, // 2: Nose tip
    { x: 320, y: 280 }, // 3: Mouth center
    { x: 230, y: 220 }, // 4: Right ear
    { x: 410, y: 220 }, // 5: Left ear
  ];

  const frame = computeFaceCoordinateSystem(uprightLandmarks);
  assert.ok(frame, 'Frame should be computed successfully');
  assert.equal(frame.eyeDist, 80);
  assert.equal(frame.origin.x, 320);
  assert.equal(frame.origin.y, 230);
  assert.equal(frame.ey.x, 0);
  assert.equal(frame.ey.y, 1);
  assert.equal(frame.ex.x, 1);
  assert.equal(frame.ex.y, 0);

  // Test point on forehead: 80px above nose (y = 150)
  const foreheadPixel = { x: 320, y: 150 };
  const projForehead = projectPointToFaceFrame(foreheadPixel, frame);
  assert.equal(projForehead.u, 0);
  assert.equal(projForehead.v, -1.0); // 80px above nose / 80px eyeDist = -1.0
  assert.equal(classifyAnatomicalZone(projForehead.v), ANATOMICAL_ZONES.FOREHEAD);

  // Test point on chin: 88px below nose (y = 318)
  const chinPixel = { x: 320, y: 318 };
  const projChin = projectPointToFaceFrame(chinPixel, frame);
  assert.equal(projChin.u, 0);
  assert.equal(projChin.v, 1.1); // 88px below nose / 80px eyeDist = 1.1
  assert.equal(classifyAnatomicalZone(projChin.v), ANATOMICAL_ZONES.CHIN);

  // Test point on chest: 160px below nose (y = 390)
  const chestPixel = { x: 320, y: 390 };
  const projChest = projectPointToFaceFrame(chestPixel, frame);
  assert.equal(projChest.u, 0);
  assert.equal(projChest.v, 2.0); // 160px below nose / 80px eyeDist = 2.0
  assert.equal(classifyAnatomicalZone(projChest.v), ANATOMICAL_ZONES.CHEST);
});

test('computeFaceCoordinateSystem: head tilt roll invariance', () => {
  // Simulate 30 degree head tilt clockwise
  const rad = (30 * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotate = (ox, oy, x, y) => ({
    x: ox + (x - ox) * cos - (y - oy) * sin,
    y: oy + (x - ox) * sin + (y - oy) * cos,
  });

  const noseX = 320;
  const noseY = 230;

  // Upright keypoints rotated 30 degrees around nose
  const tiltedLandmarks = [
    rotate(noseX, noseY, 280, 200),
    rotate(noseX, noseY, 360, 200),
    { x: noseX, y: noseY },
    rotate(noseX, noseY, 320, 280),
    rotate(noseX, noseY, 230, 220),
    rotate(noseX, noseY, 410, 220),
  ];

  const tiltedFrame = computeFaceCoordinateSystem(tiltedLandmarks);
  assert.ok(tiltedFrame);

  // A hand positioned at user's forehead in rotated frame
  const tiltedForehead = rotate(noseX, noseY, 320, 150);
  const projTilted = projectPointToFaceFrame(tiltedForehead, tiltedFrame);

  assert.ok(Math.abs(projTilted.u) < 0.05, `u should remain ~0, got ${projTilted.u}`);
  assert.ok(Math.abs(projTilted.v - (-1.0)) < 0.05, `v should remain ~ -1.0, got ${projTilted.v}`);
  assert.equal(classifyAnatomicalZone(projTilted.v), ANATOMICAL_ZONES.FOREHEAD);
});

test('classifyAnatomicalZone: maps vertical coordinates to correct anatomical levels', () => {
  assert.equal(classifyAnatomicalZone(-1.2), ANATOMICAL_ZONES.FOREHEAD);
  assert.equal(classifyAnatomicalZone(-0.5), ANATOMICAL_ZONES.EYES);
  assert.equal(classifyAnatomicalZone(0.0), ANATOMICAL_ZONES.NOSE);
  assert.equal(classifyAnatomicalZone(0.5), ANATOMICAL_ZONES.MOUTH);
  assert.equal(classifyAnatomicalZone(1.0), ANATOMICAL_ZONES.CHIN);
  assert.equal(classifyAnatomicalZone(2.0), ANATOMICAL_ZONES.CHEST);
});

test('FaceTracker: 500ms occlusion memory buffer retains reliable frame', () => {
  const tracker = new FaceTracker({ occlusionHoldMs: 500, detectIntervalFrames: 1 });
  const mockVideo = { videoWidth: 640, videoHeight: 480 };

  const uprightLm = [
    { x: 280 / 640, y: 200 / 480 },
    { x: 360 / 640, y: 200 / 480 },
    { x: 320 / 640, y: 230 / 480 },
    { x: 320 / 640, y: 280 / 480 },
    { x: 230 / 640, y: 220 / 480 },
    { x: 410 / 640, y: 220 / 480 },
  ];

  // Feed detection
  tracker.handleResults({ detections: [{ score: [0.95], landmarks: uprightLm }] });
  const activeFrame = tracker.getActiveFaceFrame(mockVideo);
  assert.ok(activeFrame, 'Should obtain active face frame');

  // Clear detection (simulating hand occluding face)
  tracker.latestRawDetection = null;

  // Immediately query within 500ms
  const heldFrame = tracker.getActiveFaceFrame(mockVideo);
  assert.ok(heldFrame, 'Should retain reliable face frame during occlusion buffer');
  assert.equal(heldFrame.origin.x, activeFrame.origin.x);

  // Expire occlusion buffer by faking lastReliableTime
  tracker.lastReliableTime = Date.now() - 600;
  const expiredFrame = tracker.getActiveFaceFrame(mockVideo);
  assert.equal(expiredFrame, null, 'Should return null after occlusion buffer expires');
});

test('DTW Distance: FEATURE_FACE separates signs at different locations without breaking legacy', () => {
  // Generate synthetic dynamic sequence of 24 frames
  const createSeq = (wristU, wristV, indexU, indexV, withFace = true) => {
    const seq = [];
    for (let k = 0; k < 24; k++) {
      const pose = new Array(63).fill(0.1);
      const traj = [0.1, 0.1, 0.05, 0.2, 0.2, 0.0, 0.0];
      const face = withFace ? [wristU, wristV, Math.hypot(wristU, wristV), indexU, indexV, Math.hypot(indexU, indexV)] : [];
      seq.push([...pose, ...traj, ...face]);
    }
    return seq;
  };

  // Sign A: Touching Chin (u: 0.0, v: 1.1)
  const chinSeq = createSeq(0.0, 1.1, 0.0, 1.05, true);
  // Sign B: Touching Chin variation (slight shift u: 0.05, v: 1.12)
  const chinVariationSeq = createSeq(0.05, 1.12, 0.04, 1.07, true);
  // Sign C: Touching Chest with exact same handshape & trajectory (u: 0.0, v: 2.1)
  const chestSeq = createSeq(0.0, 2.1, 0.0, 2.05, true);
  // Sign D: Legacy v1 sequence (70D, no face features)
  const legacySeq = createSeq(0.0, 0.0, 0.0, 0.0, false);

  // 1. When FEATURE_FACE is FALSE (default)
  setFeatureFace(false);
  const distChinVsChestOff = computeDTWDistance(chinSeq, chestSeq);
  const distChinVsChinOff = computeDTWDistance(chinSeq, chinVariationSeq);
  const distLegacyOff = computeDTWDistance(legacySeq, chinSeq);

  // Chin and Chest have identical handshape and trajectory, so with flag OFF distance is ~0
  assert.ok(distChinVsChestOff < 0.10, `Off dist should be near zero, got ${distChinVsChestOff}`);
  assert.ok(Number.isFinite(distLegacyOff), 'Legacy comparison should succeed cleanly');

  // 2. When FEATURE_FACE is TRUE
  setFeatureFace(true);
  const distChinVsChestOn = computeDTWDistance(chinSeq, chestSeq);
  const distChinVsChinOn = computeDTWDistance(chinSeq, chinVariationSeq);

  // Same location (chin vs chin) stays very close
  assert.ok(distChinVsChinOn < 0.15, `Same location should have low distance, got ${distChinVsChinOn}`);
  // Different location (chin vs chest) gets a massive penalty from spatial face separation!
  assert.ok(distChinVsChestOn > 0.40, `Different location should have significant distance, got ${distChinVsChestOn}`);
  assert.ok(
    distChinVsChestOn > distChinVsChinOn * 2.5,
    `Chest should be well separated from Chin: on=${distChinVsChestOn} vs same=${distChinVsChinOn}`
  );

  // 3. Graceful fallback when one sequence lacks face features (v1 vs v2)
  const distV1VsV2On = computeDTWDistance(legacySeq, chinSeq);
  assert.ok(Number.isFinite(distV1VsV2On), 'v1 vs v2 comparison should gracefully compute pose+trajectory without throwing');
  // B1: v1 sample receives FALLBACK_MISSING_FACE_COST penalty so it does not beat an exact-zone v2 sample
  assert.ok(
    distV1VsV2On > distChinVsChinOn,
    `Legacy v1 (dist=${distV1VsV2On}) should not beat matching-zone v2 (dist=${distChinVsChinOn})`
  );

  // Reset flag
  setFeatureFace(false);
});

test('Part B2 & B3: buildDynamicSequence extracts faceCoveragePct, dominantZone, and meanIndexUV', () => {
  setFeatureFace(true);

  const rawFrames = [];
  for (let i = 0; i < 12; i++) {
    const step = i * 0.03;
    rawFrames.push({
      handCount: 1,
      pose: new Array(63).fill(0.1),
      wrists: [{ x: 0.4 + step, y: 0.6, z: 0 }],
      indexTips: [{ x: 0.42 + step, y: 0.55, z: 0 }],
      palmScale: 0.1,
      // Chin zone: u = 0.05, v = 1.05
      faceFeatures: [0.05, 1.25, 1.25, 0.05, 1.05, 1.05],
    });
  }

  const built = buildDynamicSequence(rawFrames, 24);
  assert.ok(built, 'Should build dynamic sequence');
  assert.equal(built.featureVersion, 2);
  assert.equal(built.faceCoveragePct, 100);
  assert.equal(built.dominantZone, ANATOMICAL_ZONES.CHIN);
  assert.ok(built.meanIndexUV, 'meanIndexUV should be present');
  assert.ok(Math.abs(built.meanIndexUV.v - 1.05) < 0.02);

  setFeatureFace(false);
});

test('Part B4: checkDatasetConflict distinguishes full_conflict vs zone_separated', () => {
  setFeatureFace(true);

  const createStrokeSeq = (indexV) => {
    const seq = [];
    for (let k = 0; k < 24; k++) {
      const progress = k / 23;
      const pose = new Array(63).fill(0.12);
      const traj = [
        progress * 0.8,
        progress * 0.4,
        0,
        progress * 0.9,
        progress * 0.5,
        0.5,
        0.3,
      ];
      const face = [0.0, indexV + 0.15, Math.abs(indexV + 0.15), 0.0, indexV, Math.abs(indexV)];
      seq.push([...pose, ...traj, ...face]);
    }
    return seq;
  };

  const chinSeq = createStrokeSeq(1.05); // Chin
  const foreheadSeq = createStrokeSeq(-1.05); // Forehead (same handshape & trajectory, different face zone)
  const chinNearSeq = createStrokeSeq(1.08); // Also Chin

  loadCustomDataset([
    { name: 'ChinSign', vector: chinSeq },
  ]);

  // 1. Candidate at Chin -> Full Conflict with ChinSign
  const fullConflict = checkDatasetConflict(chinNearSeq, 'NewLabel', 'dynamic');
  assert.ok(fullConflict?.hasConflict, 'Should detect conflict for same zone');
  assert.equal(fullConflict.conflictType, 'full_conflict');
  assert.equal(fullConflict.conflictingLabel, 'ChinSign');

  // 2. Candidate at Forehead -> Zone Separated from ChinSign
  const zoneSeparated = checkDatasetConflict(foreheadSeq, 'ForeheadSign', 'dynamic');
  assert.ok(zoneSeparated?.hasConflict, 'Should surface informational zone_separated notice');
  assert.equal(zoneSeparated.conflictType, 'zone_separated');
  assert.equal(zoneSeparated.conflictingLabel, 'ChinSign');
  assert.ok(zoneSeparated.faceDistance >= 0.35);

  setFeatureFace(false);
});

test('Part B5: computeStaticPoseDistance increases separation on crossed fingertips (R vs U) and smoothMultiHandLandmarks holds occluded 2nd hand', () => {
  // Base 63D vector
  const basePose = new Array(63).fill(0);
  // U pose: Index tip (8) at x = -0.10, Middle tip (12) at x = +0.10 (parallel uncrossed)
  const poseU = [...basePose];
  poseU[8 * 3] = -0.10;
  poseU[8 * 3 + 1] = -0.85;
  poseU[12 * 3] = 0.10;
  poseU[12 * 3 + 1] = -0.85;

  // R pose: Index tip (8) crosses over Middle tip (12) -> Index x = +0.08, Middle x = -0.06
  const poseR = [...basePose];
  poseR[8 * 3] = 0.08;
  poseR[8 * 3 + 1] = -0.85;
  poseR[12 * 3] = -0.06;
  poseR[12 * 3 + 1] = -0.85;

  // Plain Euclidean distance between poseU and poseR
  let plainSq = 0;
  for (let i = 0; i < 63; i++) {
    const d = poseU[i] - poseR[i];
    plainSq += d * d;
  }
  const plainDist = Math.sqrt(plainSq);
  const enhancedDist = computeStaticPoseDistance(poseU, poseR);

  assert.ok(
    enhancedDist > plainDist * 1.25,
    `Enhanced fingertip + relational distance (${enhancedDist}) should exceed plain Euclidean (${plainDist}) by >25%`
  );

  // Test 2-hand brief self-occlusion slot hold
  const makeHand = (wx, wy) =>
    Array.from({ length: 21 }, (_, idx) => ({
      x: wx + idx * 0.002,
      y: wy - idx * 0.003,
      z: 0,
    }));

  // Frame 1: 2 hands close together (wrist distance = 0.12 < 0.25)
  const twoHands = [makeHand(0.42, 0.55), makeHand(0.54, 0.55)];
  const step1 = smoothMultiHandLandmarks(twoHands);
  assert.equal(step1.smoothedMultiHandLandmarks.length, 2);

  // Frame 2: Right hand momentarily occluded behind Left hand (only 1 hand returned by MediaPipe)
  const oneHandOnly = [makeHand(0.43, 0.55)];
  const step2 = smoothMultiHandLandmarks(oneHandOnly);
  assert.equal(
    step2.smoothedMultiHandLandmarks.length,
    2,
    'Should hold occluded second hand during brief 1-frame hand-over-hand crossing'
  );
  assert.equal(step2.isOcclusionHeld, true);

  // Reset smoother
  smoothMultiHandLandmarks([]);
});
