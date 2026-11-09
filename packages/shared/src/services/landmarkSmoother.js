/**
 * Adaptive Landmark Smoother & Hand Motion Settle Detector
 * 
 * - Eliminates MediaPipe high-frequency micro-jitter using an Adaptive Exponential Moving Average (EMA).
 * - Tracks fingertip motion velocity to detect when hands are transitioning between gestures vs holding steadily.
 * - Dampens sudden distal bone-length collapse/spikes when fingers cross in front of each other.
 * - Holds second-hand slot briefly (~150ms / 4 frames) when two hands overlap/cross in front of camera.
 */

// Distal segment parent map: fingertip -> PIP/MCP anchor to detect sudden occlusion bone collapse
const DISTAL_PARENT_ANCHOR = {
  3: 2,
  4: 2,
  7: 6,
  8: 6,
  11: 10,
  12: 10,
  15: 14,
  16: 14,
  19: 18,
  20: 18,
};

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

    // Wrist displacement on this frame (to check if palm is steady while a fingertip snaps due to occlusion)
    const wristStep = Math.hypot(
      landmarks[0].x - this.prevLandmarks[0].x,
      landmarks[0].y - this.prevLandmarks[0].y
    );

    // 2. Adaptive Alpha: smooth more aggressively when steady (low velocity),
    // and track more responsively when moving quickly (high velocity)
    const adaptiveAlpha = Math.min(
      0.85,
      Math.max(0.35, this.alphaBase + this.currentVelocity * 4.0)
    );

    // 3. Apply Exponential Moving Average (EMA) to all landmarks with self-occlusion bone damping
    const smoothed = [];
    for (let i = 0; i < landmarks.length; i++) {
      const cur = landmarks[i];
      const prev = this.prevLandmarks[i];
      let pointAlpha = adaptiveAlpha;
      let zAlpha = adaptiveAlpha * 0.75; // Slightly stronger damping on noisy monocular depth z

      const parentIdx = DISTAL_PARENT_ANCHOR[i];
      if (parentIdx !== undefined && wristStep < 0.03) {
        const prevAnchor = this.prevLandmarks[parentIdx];
        const curAnchor = smoothed[parentIdx] || landmarks[parentIdx];
        const prevBoneLen = Math.hypot(prev.x - prevAnchor.x, prev.y - prevAnchor.y);
        const curBoneLen = Math.hypot(cur.x - curAnchor.x, cur.y - curAnchor.y);
        if (prevBoneLen > 0.012) {
          const ratio = curBoneLen / prevBoneLen;
          // If fingertip segment suddenly collapses (< 0.55) or spikes (> 1.55) during finger-over-finger occlusion
          if (ratio < 0.55 || ratio > 1.55) {
            pointAlpha = Math.min(pointAlpha, 0.22);
            zAlpha = 0.15;
          }
        }
      }

      const sx = prev.x + pointAlpha * (cur.x - prev.x);
      const sy = prev.y + pointAlpha * (cur.y - prev.y);
      const sz = (prev.z || 0) + zAlpha * ((cur.z || 0) - (prev.z || 0));

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
    this.lastTimestamp = 0;
  }

  /**
   * Returns Euclidean 2D wrist distance to candidate hand landmarks, or fallback distance if inactive
   */
  wristDistanceTo(landmarks, now = Date.now(), maxStaleMs = 500) {
    if (
      !this.prevLandmarks ||
      !this.prevLandmarks[0] ||
      !landmarks ||
      !landmarks[0] ||
      now - this.lastTimestamp > maxStaleMs
    ) {
      return 0.5;
    }
    const dx = landmarks[0].x - this.prevLandmarks[0].x;
    const dy = landmarks[0].y - this.prevLandmarks[0].y;
    return Math.hypot(dx, dy);
  }
}

// Persistent spatial smoother slots (matched by nearest wrist to prevent left/right swap distortion)
const handSlotA = new LandmarkSmoother();
const handSlotB = new LandmarkSmoother();
const FAST_TRANSITION_VELOCITY = 0.042;
const MAX_TWO_HAND_OCCLUSION_HOLD_FRAMES = 4;
const MAX_TWO_HAND_OCCLUSION_HOLD_MS = 160;
const INTER_HAND_PROXIMITY_THRESHOLD = 0.25;

let twoHandOcclusionHoldCount = 0;
let lastTwoHandCloseSeenAt = 0;

/**
 * Smooths all detected hands in multiHandLandmarks array using Nearest-Wrist Slot Matching
 * so MediaPipe array index swaps never blend Left and Right hand coordinates together.
 * Also holds the occluded second hand for up to 4 frames (~150ms) when one hand crosses in front of the other.
 *
 * @param {Array} multiHandLandmarks - Array of landmark arrays
 * @returns {Object} { smoothedMultiHandLandmarks, isHandMoving, isFastTransition, maxVelocity }
 */
export function smoothMultiHandLandmarks(multiHandLandmarks) {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
    handSlotA.reset();
    handSlotB.reset();
    twoHandOcclusionHoldCount = 0;
    lastTwoHandCloseSeenAt = 0;
    return {
      smoothedMultiHandLandmarks: [],
      isHandMoving: false,
      isFastTransition: false,
      maxVelocity: 0,
    };
  }

  const now = Date.now();

  // Single-hand case: match to whichever active slot was tracking this wrist
  if (multiHandLandmarks.length === 1 || !multiHandLandmarks[1]) {
    const h0 = multiHandLandmarks[0];
    if (!h0) {
      handSlotA.reset();
      handSlotB.reset();
      twoHandOcclusionHoldCount = 0;
      return {
        smoothedMultiHandLandmarks: [],
        isHandMoving: false,
        isFastTransition: false,
        maxVelocity: 0,
      };
    }

    const distA = handSlotA.wristDistanceTo(h0, now);
    const distB = handSlotB.wristDistanceTo(h0, now);
    const useSlotB =
      handSlotB.prevLandmarks && distB < distA && distB < 0.25;

    // B5.2: Check if user was just in a close 2-hand configuration and one hand momentarily occluded the other
    const canHoldOccludedSecondHand =
      handSlotA.prevLandmarks &&
      handSlotB.prevLandmarks &&
      twoHandOcclusionHoldCount < MAX_TWO_HAND_OCCLUSION_HOLD_FRAMES &&
      now - lastTwoHandCloseSeenAt <= MAX_TWO_HAND_OCCLUSION_HOLD_MS;

    const res = useSlotB ? handSlotB.smooth(h0, now) : handSlotA.smooth(h0, now);

    if (canHoldOccludedSecondHand) {
      twoHandOcclusionHoldCount += 1;
      const heldLandmarks = useSlotB
        ? handSlotA.prevLandmarks.map((p) => ({ ...p }))
        : handSlotB.prevLandmarks.map((p) => ({ ...p }));
      const maxVel = Math.max(
        res.velocity,
        useSlotB ? handSlotA.currentVelocity * 0.7 : handSlotB.currentVelocity * 0.7
      );

      return {
        smoothedMultiHandLandmarks: useSlotB
          ? [heldLandmarks, res.smoothedLandmarks]
          : [res.smoothedLandmarks, heldLandmarks],
        isHandMoving: res.isTransitioning,
        isFastTransition: maxVel > FAST_TRANSITION_VELOCITY,
        maxVelocity: parseFloat(maxVel.toFixed(4)),
        isOcclusionHeld: true,
      };
    }

    twoHandOcclusionHoldCount = 0;
    if (useSlotB) {
      handSlotA.reset();
    } else {
      handSlotB.reset();
    }

    return {
      smoothedMultiHandLandmarks: [res.smoothedLandmarks],
      isHandMoving: res.isTransitioning,
      isFastTransition: res.velocity > FAST_TRANSITION_VELOCITY,
      maxVelocity: res.velocity,
    };
  }

  // Two-hand case: solve 2x2 minimum-cost wrist assignment to prevent cross-hand blending
  twoHandOcclusionHoldCount = 0;
  let hA = multiHandLandmarks[0];
  let hB = multiHandLandmarks[1];

  const hasPrior = Boolean(handSlotA.prevLandmarks || handSlotB.prevLandmarks);
  if (hasPrior) {
    const costDirect =
      handSlotA.wristDistanceTo(hA, now) + handSlotB.wristDistanceTo(hB, now);
    const costSwapped =
      handSlotA.wristDistanceTo(hB, now) + handSlotB.wristDistanceTo(hA, now);
    if (costSwapped < costDirect) {
      [hA, hB] = [hB, hA];
    }
  } else if (hA[0] && hB[0] && hA[0].x > hB[0].x) {
    // Deterministic spatial initialization when both hands appear simultaneously
    [hA, hB] = [hB, hA];
  }

  const resA = handSlotA.smooth(hA, now);
  const resB = handSlotB.smooth(hB, now);
  const maxVelocity = Math.max(resA.velocity, resB.velocity);

  // Check if the two hands are close enough that hand-over-hand self-occlusion could occur on the next frame
  const wristProx = Math.hypot(
    resA.smoothedLandmarks[0].x - resB.smoothedLandmarks[0].x,
    resA.smoothedLandmarks[0].y - resB.smoothedLandmarks[0].y
  );
  const indexProx = Math.hypot(
    resA.smoothedLandmarks[8].x - resB.smoothedLandmarks[8].x,
    resA.smoothedLandmarks[8].y - resB.smoothedLandmarks[8].y
  );
  if (Math.min(wristProx, indexProx) < INTER_HAND_PROXIMITY_THRESHOLD) {
    lastTwoHandCloseSeenAt = now;
  }

  return {
    smoothedMultiHandLandmarks: [resA.smoothedLandmarks, resB.smoothedLandmarks],
    isHandMoving: resA.isTransitioning || resB.isTransitioning,
    isFastTransition: maxVelocity > FAST_TRANSITION_VELOCITY,
    maxVelocity: parseFloat(maxVelocity.toFixed(4)),
  };
}
