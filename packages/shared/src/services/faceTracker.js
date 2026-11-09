/**
 * Face-Relative Spatial Coordinate & Landmark Tracker for ASL Recognition
 *
 * Implements:
 * 1. BlazeFace 6-Keypoint Face Detection (Right Eye, Left Eye, Nose, Mouth, Right Ear, Left Ear).
 * 2. Head-Tilt Compensated Orthonormal Coordinate Frame (Origin: Nose, Scale: Inter-ocular distance).
 * 3. One Euro Low-Jitter Temporal Filter (Low minCutoff for face stability).
 * 4. 500ms Occlusion Memory Buffer (Preserves reliable face frame when hands cross/touch face).
 * 5. Anatomical Zone Classification (Forehead, Eyes, Nose, Mouth, Chin, Chest).
 */

import * as mpFaceDetection from '@mediapipe/face_detection';
import { FEATURE_FLAGS } from '../constants/featureFlags.js';

const FaceDetection =
  mpFaceDetection.FaceDetection ||
  (typeof window !== 'undefined' ? window.FaceDetection : null) ||
  mpFaceDetection.default?.FaceDetection;

// Landmark indices defined by BlazeFace
export const FACE_KEYPOINTS = {
  RIGHT_EYE: 0,
  LEFT_EYE: 1,
  NOSE_TIP: 2,
  MOUTH_CENTER: 3,
  RIGHT_EAR: 4,
  LEFT_EAR: 5,
};

export const ANATOMICAL_ZONES = {
  FOREHEAD: 'forehead',
  EYES: 'eyes',
  NOSE: 'nose',
  MOUTH: 'mouth',
  CHIN: 'chin',
  CHEST: 'chest',
};

/**
 * 1 Euro Filter Implementation for 2D Coordinate Smoothing
 */
class OneEuroFilter2D {
  constructor({ minCutoff = 0.5, beta = 0.005, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(val, timestamp = Date.now()) {
    if (!val || typeof val.x !== 'number' || typeof val.y !== 'number') {
      return val;
    }

    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = { x: val.x, y: val.y };
      this.dxPrev = { x: 0, y: 0 };
      this.tPrev = timestamp;
      return val;
    }

    const dt = Math.max((timestamp - this.tPrev) / 1000, 0.001);
    this.tPrev = timestamp;

    // Filter derivative
    const dVal = {
      x: (val.x - this.xPrev.x) / dt,
      y: (val.y - this.xPrev.y) / dt,
    };
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = {
      x: this.dxPrev.x + aD * (dVal.x - this.dxPrev.x),
      y: this.dxPrev.y + aD * (dVal.y - this.dxPrev.y),
    };
    this.dxPrev = dxHat;

    // Filter value with adaptive cutoff
    const speed = Math.hypot(dxHat.x, dxHat.y);
    const cutoff = this.minCutoff + this.beta * speed;
    const a = this.alpha(cutoff, dt);

    const xHat = {
      x: this.xPrev.x + a * (val.x - this.xPrev.x),
      y: this.xPrev.y + a * (val.y - this.xPrev.y),
    };
    this.xPrev = xHat;
    return xHat;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

/**
 * Computes face-relative orthonormal coordinate system and scales.
 *
 * @param {Array<{x: number, y: number}>} landmarks6 - 6 BlazeFace keypoints in pixel units
 * @returns {Object|null} { origin, eyeDist, ex, ey, keypointsPixel }
 */
export function computeFaceCoordinateSystem(landmarks6) {
  if (!landmarks6 || landmarks6.length < 4) return null;

  const rightEye = landmarks6[FACE_KEYPOINTS.RIGHT_EYE];
  const leftEye = landmarks6[FACE_KEYPOINTS.LEFT_EYE];
  const nose = landmarks6[FACE_KEYPOINTS.NOSE_TIP];
  const mouth = landmarks6[FACE_KEYPOINTS.MOUTH_CENTER];

  if (!rightEye || !leftEye || !nose || !mouth) return null;

  // 1. Inter-ocular Euclidean distance as invariant scale metric S
  const eyeDist = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  if (eyeDist < 8.0) {
    return null; // Face too far or degenerated
  }

  // 2. Midpoint between eyes
  const midEye = {
    x: (rightEye.x + leftEye.x) / 2,
    y: (rightEye.y + leftEye.y) / 2,
  };

  // 3. Down-axis vector from mid-eye to mouth center (compensates head tilt roll)
  const downVec = {
    x: mouth.x - midEye.x,
    y: mouth.y - midEye.y,
  };
  const downLen = Math.hypot(downVec.x, downVec.y) || 1.0;
  let ey = {
    x: Math.abs(downVec.x / downLen) < 1e-7 ? 0 : downVec.x / downLen,
    y: Math.abs(downVec.y / downLen) < 1e-7 ? 0 : downVec.y / downLen,
  };

  // 4. Perpendicular X-axis pointing toward user's left (right side of un-mirrored image)
  // ey = (dy_x, dy_y) -> orthogonal vector is (-dy_y, dy_x)
  let ex = {
    x: Math.abs(-ey.y) < 1e-7 ? 0 : -ey.y,
    y: Math.abs(ey.x) < 1e-7 ? 0 : ey.x,
  };

  // Ensure ex points in the direction from right eye to left eye
  const eyeVec = {
    x: leftEye.x - rightEye.x,
    y: leftEye.y - rightEye.y,
  };
  const dot = ex.x * eyeVec.x + ex.y * eyeVec.y;
  if (dot < 0) {
    ex = { x: -ex.x, y: -ex.y };
  }

  ex = {
    x: Object.is(ex.x, -0) || Math.abs(ex.x) < 1e-7 ? 0 : ex.x,
    y: Object.is(ex.y, -0) || Math.abs(ex.y) < 1e-7 ? 0 : ex.y,
  };
  ey = {
    x: Object.is(ey.x, -0) || Math.abs(ey.x) < 1e-7 ? 0 : ey.x,
    y: Object.is(ey.y, -0) || Math.abs(ey.y) < 1e-7 ? 0 : ey.y,
  };

  return {
    origin: { x: nose.x, y: nose.y },
    eyeDist,
    ex,
    ey,
    keypointsPixel: landmarks6,
  };
}

/**
 * Transforms a hand landmark from image pixel space into the face-relative orthonormal frame.
 *
 * @param {{x: number, y: number}} pointPixel - Point in pixel coords
 * @param {Object} faceFrame - Return value from computeFaceCoordinateSystem
 * @returns {{u: number, v: number, distNose: number}}
 */
export function projectPointToFaceFrame(pointPixel, faceFrame) {
  if (!pointPixel || !faceFrame) {
    return { u: 0, v: 0, distNose: 0 };
  }

  const { origin, eyeDist, ex, ey } = faceFrame;
  const dx = pointPixel.x - origin.x;
  const dy = pointPixel.y - origin.y;

  // Project displacement onto orthonormal face axes and normalize by eye distance
  const u = (dx * ex.x + dy * ex.y) / eyeDist;
  const v = (dx * ey.x + dy * ey.y) / eyeDist;
  const distNose = Math.hypot(u, v);

  const roundedU = Math.abs(u) < 1e-6 ? 0 : parseFloat(u.toFixed(4));
  const roundedV = Math.abs(v) < 1e-6 ? 0 : parseFloat(v.toFixed(4));

  return {
    u: Object.is(roundedU, -0) ? 0 : roundedU,
    v: Object.is(roundedV, -0) ? 0 : roundedV,
    distNose: parseFloat(distNose.toFixed(4)),
  };
}

/**
 * Determines coarse anatomical face zone based on relative vertical offset v.
 *
 * @param {number} v - Relative vertical offset (v < 0 is above nose, v > 0 is below nose)
 * @returns {string} One of ANATOMICAL_ZONES
 */
export function classifyAnatomicalZone(v) {
  if (v < -0.75) return ANATOMICAL_ZONES.FOREHEAD;
  if (v < -0.25) return ANATOMICAL_ZONES.EYES;
  if (v < 0.25) return ANATOMICAL_ZONES.NOSE;
  if (v < 0.75) return ANATOMICAL_ZONES.MOUTH;
  if (v < 1.45) return ANATOMICAL_ZONES.CHIN;
  return ANATOMICAL_ZONES.CHEST;
}

/**
 * Extracts 6D relative face-hand spatial feature vector for a single hand:
 * [u_wrist, v_wrist, dist_wrist, u_index, v_index, dist_index]
 *
 * @param {{wrist: {x: number, y: number}, indexTip: {x: number, y: number}}} handPixels - In pixel units
 * @param {Object} faceFrame - Computed face frame
 * @returns {Array<number>} 6-dimensional float vector
 */
export function extractHandFaceFeatures(hand, faceFrame) {
  if (!hand || !faceFrame) {
    return [0, 0, 0, 0, 0, 0];
  }

  const w = faceFrame.width || 640;
  const h = faceFrame.height || 480;

  const wristPixel = {
    x: hand.wrist && Math.abs(hand.wrist.x) <= 1.5 ? hand.wrist.x * w : (hand.wrist?.x ?? 0),
    y: hand.wrist && Math.abs(hand.wrist.y) <= 1.5 ? hand.wrist.y * h : (hand.wrist?.y ?? 0),
  };
  const indexPixel = {
    x: hand.indexTip && Math.abs(hand.indexTip.x) <= 1.5 ? hand.indexTip.x * w : (hand.indexTip?.x ?? 0),
    y: hand.indexTip && Math.abs(hand.indexTip.y) <= 1.5 ? hand.indexTip.y * h : (hand.indexTip?.y ?? 0),
  };

  const wProj = projectPointToFaceFrame(wristPixel, faceFrame);
  const iProj = projectPointToFaceFrame(indexPixel, faceFrame);

  return [
    wProj.u,
    wProj.v,
    wProj.distNose,
    iProj.u,
    iProj.v,
    iProj.distNose,
  ];
}

/**
 * Persistent Stateful Face Tracker with Occlusion Memory Buffer
 */
export class FaceTracker {
  constructor({ occlusionHoldMs = 500, detectIntervalFrames = 3 } = {}) {
    this.occlusionHoldMs = occlusionHoldMs;
    this.detectIntervalFrames = detectIntervalFrames;

    this.faceDetectionInstance = null;
    this.isInitializing = false;
    this.isReady = false;
    this.frameCounter = 0;

    // Filters for each of the 6 keypoints
    this.filters = Array.from({ length: 6 }, () => new OneEuroFilter2D());

    this.latestFaceFrame = null;
    this.lastReliableFaceFrame = null;
    this.lastReliableTime = 0;
    this.latestRawDetection = null;
  }

  /**
   * Lazily initialize FaceDetection solution only when FEATURE_FACE is active
   */
  async initialize() {
    const FaceDetectionCtor =
      FaceDetection ||
      (typeof window !== 'undefined' ? window.FaceDetection : null) ||
      mpFaceDetection.FaceDetection ||
      mpFaceDetection.default?.FaceDetection;
    if (this.faceDetectionInstance || this.isInitializing || !FaceDetectionCtor) return;
    this.isInitializing = true;

    try {
      const detector = new FaceDetectionCtor({
        locateFile: (file) => {
          return new URL(`./mediapipe/face_detection/${file}`, window.location.href).href;
        },
      });

      detector.setOptions({
        model: 'short',
        minDetectionConfidence: 0.65,
      });

      detector.onResults((results) => {
        this.handleResults(results);
      });

      if (typeof detector.initialize === 'function') {
        await detector.initialize();
      }

      this.faceDetectionInstance = detector;
      this.isReady = true;
    } catch (err) {
      console.warn('[FaceTracker] Initialization warning:', err);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Processes an incoming video frame.
   * Runs detector every `detectIntervalFrames` (e.g. 3 frames) to keep FPS virtually unchanged,
   * while holding or dead-reckoning smoothed frame in intermediate ticks.
   *
   * @param {HTMLVideoElement} videoElement
   * @param {Array<{wrist: {x:number, y:number}, indexTip: {x:number, y:number}}>} activeHandsNormalized - Normalized coords [0, 1]
   * @returns {Promise<Object|null>} Active face frame or null
   */
  async processFrame(videoElement, activeHandsNormalized = []) {
    if (!FEATURE_FLAGS.FEATURE_FACE) {
      return null;
    }

    if (!this.isReady && !this.isInitializing) {
      await this.initialize();
    }

    this.frameCounter += 1;
    const shouldRunDetector =
      this.isReady &&
      videoElement &&
      videoElement.readyState >= 2 &&
      this.frameCounter % this.detectIntervalFrames === 0;

    if (shouldRunDetector) {
      try {
        await this.faceDetectionInstance.send({ image: videoElement });
      } catch (err) {
        // Drop transient frame errors cleanly
      }
    }

    return this.updateFaceFrame(videoElement, activeHandsNormalized);
  }

  handleResults(results) {
    if (!results || !results.detections || results.detections.length === 0) {
      this.latestRawDetection = null;
      this.latestFaceFrame = null;
      return;
    }

    // Pick detection with highest score
    const best = results.detections.reduce((prev, cur) =>
      (cur.score?.[0] || 0) > (prev.score?.[0] || 0) ? cur : prev
    );

    if (!best || !best.landmarks || best.landmarks.length < 6) {
      this.latestRawDetection = null;
      this.latestFaceFrame = null;
      return;
    }

    this.latestRawDetection = best;
  }

  updateFaceFrame(videoElement, activeHandsNormalized = []) {
    const now = Date.now();
    const width = videoElement?.videoWidth || 640;
    const height = videoElement?.videoHeight || 480;

    if (
      this.latestRawDetection &&
      Array.isArray(this.latestRawDetection.landmarks) &&
      this.latestRawDetection.landmarks.length >= 6
    ) {
      const rawLm = this.latestRawDetection.landmarks;
      const smoothed = [];

      for (let i = 0; i < 6; i++) {
        const p = rawLm[i];
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
          return this.getHeldFaceFrame(now);
        }
        const pixel = { x: p.x * width, y: p.y * height };
        const filtered = this.filters[i].filter(pixel, now);
        smoothed.push(filtered);
      }

      const currentFrame = computeFaceCoordinateSystem(smoothed);

      if (currentFrame) {
        currentFrame.width = width;
        currentFrame.height = height;
        this.latestFaceFrame = currentFrame;

        // Check if hand is occluding the nose/eyes
        let isHandOccluding = false;
        for (const h of activeHandsNormalized) {
          if (!h?.wrist || !h?.indexTip) continue;
          const hPixel = { x: h.wrist.x * width, y: h.wrist.y * height };
          const iPixel = { x: h.indexTip.x * width, y: h.indexTip.y * height };
          const dw = Math.hypot(hPixel.x - currentFrame.origin.x, hPixel.y - currentFrame.origin.y);
          const di = Math.hypot(iPixel.x - currentFrame.origin.x, iPixel.y - currentFrame.origin.y);
          if (dw < currentFrame.eyeDist * 1.1 || di < currentFrame.eyeDist * 1.0) {
            isHandOccluding = true;
            break;
          }
        }

        // Only update reliable anchor when hands are not heavily occluding face
        if (!isHandOccluding) {
          this.lastReliableFaceFrame = currentFrame;
          this.lastReliableTime = now;
        }

        return currentFrame;
      }
    }

    this.latestFaceFrame = null;
    return this.getHeldFaceFrame(now);
  }

  getHeldFaceFrame(now = Date.now()) {
    if (this.lastReliableFaceFrame && now - this.lastReliableTime <= this.occlusionHoldMs) {
      return this.lastReliableFaceFrame;
    }
    return null;
  }

  getActiveFaceFrame(videoElement, activeHandsNormalized = []) {
    if (this.latestRawDetection) {
      return this.latestFaceFrame || this.updateFaceFrame(videoElement, activeHandsNormalized);
    }
    return this.getHeldFaceFrame();
  }

  reset() {
    this.latestFaceFrame = null;
    this.lastReliableFaceFrame = null;
    this.lastReliableTime = 0;
    this.latestRawDetection = null;
    this.filters.forEach((f) => f.reset());
  }

  destroy() {
    this.reset();
    if (this.faceDetectionInstance) {
      try {
        this.faceDetectionInstance.close?.();
      } catch {}
      this.faceDetectionInstance = null;
    }
    this.isReady = false;
  }
}

// Global shared singleton face tracker instance
export const globalFaceTracker = new FaceTracker();
