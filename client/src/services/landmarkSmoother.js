/**
 * Adaptive Landmark Smoother & Hand Motion Settle Detector
 * 
 * - Eliminates MediaPipe high-frequency micro-jitter using an Adaptive Exponential Moving Average (EMA).
 * - Tracks fingertip motion velocity to detect when hands are transitioning between gestures vs holding steadily.
 */

export class LandmarkSmoother {
  constructor(alphaBase = 0.55, velocityThreshold = 0.022) {
    this.alphaBase = alphaBase; // Base smoothing factor (0 = full smooth, 1 = no smoothing)
    this.velocityThreshold = velocityThreshold; // Threshold above which hand is considered moving/transitioning
    this.prevLandmarks = null;
    this.lastTimestamp = 0;
    this.currentVelocity = 0;
  }

  /**
   * Smooths an array of 21 landmark objects {x, y, z}
   * @param {Array} landmarks - 21 MediaPipe landmark points
   * @param {number} timestamp - Current frame timestamp (ms)
   * @returns {Object} { smoothedLandmarks, isTransitioning, velocity }
   */
  smooth(landmarks, timestamp = Date.now()) {
    if (!landmarks || landmarks.length < 21) {
      this.prevLandmarks = null;
      this.currentVelocity = 0;
      return { smoothedLandmarks: landmarks, isTransitioning: false, velocity: 0 };
    }

    if (!this.prevLandmarks || this.prevLandmarks.length !== landmarks.length) {
      this.prevLandmarks = landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
      this.lastTimestamp = timestamp;
      this.currentVelocity = 0;
      return { smoothedLandmarks: landmarks, isTransitioning: false, velocity: 0 };
    }

    const dt = Math.max(1, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;

    // 1. Calculate fingertip & wrist motion velocity
    // Focus on key points: Wrist (0), Thumb Tip (4), Index Tip (8), Middle Tip (12), Ring Tip (16), Pinky Tip (20)
    const keyIndices = [0, 4, 8, 12, 16, 20];
    let totalDisp = 0;

    for (const idx of keyIndices) {
      const cur = landmarks[idx];
      const prev = this.prevLandmarks[idx];
      if (cur && prev) {
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        const dz = (cur.z || 0) - (prev.z || 0);
        totalDisp += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }

    const frameVelocity = totalDisp / keyIndices.length;
    // Low-pass filter the velocity metric
    this.currentVelocity = 0.6 * this.currentVelocity + 0.4 * frameVelocity;

    const isTransitioning = this.currentVelocity > this.velocityThreshold;

    // 2. Adaptive Alpha: smooth more aggressively when steady (low velocity),
    // and track more responsively when moving quickly (high velocity)
    const adaptiveAlpha = Math.min(
      0.85,
      Math.max(0.35, this.alphaBase + this.currentVelocity * 4.0)
    );

    // 3. Apply Exponential Moving Average (EMA) to all landmarks
    const smoothed = [];
    for (let i = 0; i < landmarks.length; i++) {
      const cur = landmarks[i];
      const prev = this.prevLandmarks[i];

      const sx = prev.x + adaptiveAlpha * (cur.x - prev.x);
      const sy = prev.y + adaptiveAlpha * (cur.y - prev.y);
      const sz = (prev.z || 0) + adaptiveAlpha * ((cur.z || 0) - (prev.z || 0));

      const pt = { x: sx, y: sy, z: sz };
      smoothed.push(pt);
      this.prevLandmarks[i] = pt;
    }

    return {
      smoothedLandmarks: smoothed,
      isTransitioning,
      velocity: parseFloat(this.currentVelocity.toFixed(4)),
    };
  }

  /**
   * Resets smoothing history (e.g. when hand disappears from view)
   */
  reset() {
    this.prevLandmarks = null;
    this.currentVelocity = 0;
  }
}

// Global smoother instances for Hand 1 and Hand 2
const hand1Smoother = new LandmarkSmoother();
const hand2Smoother = new LandmarkSmoother();

/**
 * Smooths all detected hands in multiHandLandmarks array
 * @param {Array} multiHandLandmarks - Array of landmark arrays
 * @returns {Object} { smoothedMultiHandLandmarks, isHandMoving }
 */
export function smoothMultiHandLandmarks(multiHandLandmarks) {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
    hand1Smoother.reset();
    hand2Smoother.reset();
    return { smoothedMultiHandLandmarks: [], isHandMoving: false };
  }

  const now = Date.now();
  const smoothedList = [];
  let isAnyHandMoving = false;

  // Smooth Hand 1
  if (multiHandLandmarks[0]) {
    const res1 = hand1Smoother.smooth(multiHandLandmarks[0], now);
    smoothedList.push(res1.smoothedLandmarks);
    if (res1.isTransitioning) isAnyHandMoving = true;
  }

  // Smooth Hand 2
  if (multiHandLandmarks[1]) {
    const res2 = hand2Smoother.smooth(multiHandLandmarks[1], now);
    smoothedList.push(res2.smoothedLandmarks);
    if (res2.isTransitioning) isAnyHandMoving = true;
  } else {
    hand2Smoother.reset();
  }

  return {
    smoothedMultiHandLandmarks: smoothedList,
    isHandMoving: isAnyHandMoving,
  };
}
