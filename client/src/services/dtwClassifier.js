/**
 * Dynamic Time Warping (DTW) Sequence Engine for Continuous Motion Sign Recognition
 *
 * - Captures both normalized handshape articulation (63D / 126D) AND palm-scaled
 *   spatial wrist + index-tip trajectories so arm sweeps and wrist-pivoted waves
 *   are accurately distinguished regardless of execution speed.
 * - Coexists 100% non-destructively alongside static 1D k-NN vectors in `asl_gestures`.
 */

export const DTW_KEYFRAMES = 24;
export const DTW_BAND_RADIUS = 5;
export const DTW_MATCH_THRESHOLD = 1.18;
export const MIN_DYNAMIC_MOTION_AMPLITUDE = 0.30;

const W_WRIST_XY = 1.5;
const W_WRIST_Z = 0.8;
const W_INDEX_XY = 1.3;
const W_VEL_XY = 1.1;

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Checks whether a dataset sample row stores a 2D Dynamic DTW sequence (`number[][]`)
 * as opposed to a 1D Static k-NN pose vector (`number[]`).
 */
export function isDynamicSample(sample) {
  return Boolean(
    sample &&
      Array.isArray(sample.vector) &&
      sample.vector.length >= 6 &&
      Array.isArray(sample.vector[0])
  );
}

/**
 * Extracts raw per-frame ingredients from smoothed MediaPipe landmarks (1 or 2 hands)
 *
 * @param {Array} smoothedHands - 1 or 2 hand landmark arrays (each 21 {x, y, z})
 * @param {Function} normalizePoseFn - normalizeMultiHandLandmarks function
 * @returns {Object|null} Raw frame item ready for temporal resampling
 */
export function extractDynamicFrame(smoothedHands, normalizePoseFn) {
  if (!smoothedHands || smoothedHands.length === 0) return null;

  const validHands = smoothedHands.filter((h) => Array.isArray(h) && h.length >= 21);
  if (validHands.length === 0) return null;

  const pose = normalizePoseFn(validHands);
  if (!pose) return null;

  // Sort spatially left-to-right by wrist X to match normalizeMultiHandLandmarks
  const ordered =
    validHands.length >= 2
      ? validHands[0][0].x <= validHands[1][0].x
        ? [validHands[0], validHands[1]]
        : [validHands[1], validHands[0]]
      : [validHands[0]];

  const handCount = ordered.length;
  const wrists = [];
  const indexTips = [];
  let scaleSum = 0;

  for (const h of ordered) {
    const w = h[0];
    const mcp9 = h[9];
    const idx8 = h[8];
    const palmLen =
      Math.hypot(mcp9.x - w.x, mcp9.y - w.y, (mcp9.z || 0) - (w.z || 0)) || 0.08;
    scaleSum += palmLen;
    wrists.push({ x: w.x, y: w.y, z: w.z || 0 });
    indexTips.push({ x: idx8.x, y: idx8.y, z: idx8.z || 0 });
  }

  const palmScale = Math.max(scaleSum / handCount, 0.05);

  return {
    handCount,
    pose,
    wrists,
    indexTips,
    palmScale,
    timestamp: Date.now(),
  };
}

/**
 * Computes normalized step motion speed between two consecutive dynamic frames (in palm units)
 */
export function computeFrameStepSpeed(prevFrame, curFrame) {
  if (!prevFrame || !curFrame || prevFrame.handCount !== curFrame.handCount) {
    return 0;
  }

  const scale = Math.max((prevFrame.palmScale + curFrame.palmScale) / 2, 0.05);
  let spatialDisp = 0;

  for (let h = 0; h < curFrame.handCount; h++) {
    const dw = Math.hypot(
      curFrame.wrists[h].x - prevFrame.wrists[h].x,
      curFrame.wrists[h].y - prevFrame.wrists[h].y
    );
    const di = Math.hypot(
      curFrame.indexTips[h].x - prevFrame.indexTips[h].x,
      curFrame.indexTips[h].y - prevFrame.indexTips[h].y
    );
    spatialDisp += (dw + di) * 0.5;
  }
  spatialDisp /= curFrame.handCount * scale;

  // Include subtle finger articulation speed for in-place finger dynamic signs
  let poseDiffSum = 0;
  const len = Math.min(prevFrame.pose.length, curFrame.pose.length);
  for (let i = 0; i < len; i++) {
    poseDiffSum += Math.abs(curFrame.pose[i] - prevFrame.pose[i]);
  }
  const poseDisp = len > 0 ? (poseDiffSum / len) * 0.6 : 0;

  return spatialDisp + poseDisp;
}

/**
 * Trims idle stillness, resamples to `targetLen` (24) uniform keyframes, and builds
 * 70D (1-hand) or 140D (2-hand) pose + start-anchored trajectory descriptors.
 *
 * @param {Array} rawFrames - List of objects from extractDynamicFrame
 * @param {number} targetLen - Resampled keyframe count (default 24)
 * @returns {Object|null} { sequence, handCount, featureDim, keptFrames, motionAmplitude, qualityScore }
 */
export function buildDynamicSequence(rawFrames, targetLen = DTW_KEYFRAMES) {
  if (!Array.isArray(rawFrames) || rawFrames.length < 7) return null;

  // 1. Keep frames matching the dominant hand count (1 or 2 hands)
  const counts = { 1: 0, 2: 0 };
  for (const f of rawFrames) {
    if (f && (f.handCount === 1 || f.handCount === 2)) {
      counts[f.handCount] += 1;
    }
  }
  const dominantHandCount = counts[2] >= counts[1] && counts[2] >= 6 ? 2 : 1;
  const consistentFrames = rawFrames.filter(
    (f) => f && f.handCount === dominantHandCount
  );

  if (consistentFrames.length < 7) return null;

  // 2. Compute per-step speed and auto-trim leading/trailing dead stillness
  const speeds = [0];
  let peakSpeed = 0;
  for (let i = 1; i < consistentFrames.length; i++) {
    const sp = computeFrameStepSpeed(consistentFrames[i - 1], consistentFrames[i]);
    speeds.push(sp);
    if (sp > peakSpeed) peakSpeed = sp;
  }

  const onsetThresh = Math.max(0.03, peakSpeed * 0.18);
  let firstActive = 0;
  let lastActive = consistentFrames.length - 1;

  while (firstActive < consistentFrames.length - 1 && speeds[firstActive] < onsetThresh) {
    firstActive += 1;
  }
  while (lastActive > firstActive && speeds[lastActive] < onsetThresh) {
    lastActive -= 1;
  }

  // Keep 2 anchor frames before onset and after settle to preserve start/end handshapes
  let startIdx = Math.max(0, firstActive - 2);
  let endIdx = Math.min(consistentFrames.length - 1, lastActive + 2);

  if (endIdx - startIdx + 1 < 8) {
    const mid = Math.floor((startIdx + endIdx) / 2);
    startIdx = Math.max(0, mid - 4);
    endIdx = Math.min(consistentFrames.length - 1, startIdx + 8);
  }

  const trimmed = consistentFrames.slice(startIdx, endIdx + 1);
  if (trimmed.length < 6) return null;

  // 3. Linear temporal resampling to exact `targetLen` (24) keyframes
  const resampled = [];
  const srcMax = trimmed.length - 1;

  for (let k = 0; k < targetLen; k++) {
    const pos = (k / (targetLen - 1)) * srcMax;
    const i0 = Math.floor(pos);
    const i1 = Math.min(srcMax, i0 + 1);
    const t = pos - i0;

    const f0 = trimmed[i0];
    const f1 = trimmed[i1];

    const pose = f0.pose.map((v, idx) => lerp(v, f1.pose[idx], t));
    const wrists = f0.wrists.map((w, h) => ({
      x: lerp(w.x, f1.wrists[h].x, t),
      y: lerp(w.y, f1.wrists[h].y, t),
      z: lerp(w.z, f1.wrists[h].z, t),
    }));
    const indexTips = f0.indexTips.map((pt, h) => ({
      x: lerp(pt.x, f1.indexTips[h].x, t),
      y: lerp(pt.y, f1.indexTips[h].y, t),
      z: lerp(pt.z, f1.indexTips[h].z, t),
    }));
    const palmScale = lerp(f0.palmScale, f1.palmScale, t);

    resampled.push({ pose, wrists, indexTips, palmScale });
  }

  // 4. Build origin-anchored trajectory features scaled by mean palm dimension
  const avgScale = Math.max(
    resampled.reduce((acc, f) => acc + f.palmScale, 0) / targetLen,
    0.05
  );
  const originWrists = resampled[0].wrists;
  const originIndexTips = resampled[0].indexTips;

  let motionAmplitude = 0;
  const sequence = [];

  for (let k = 0; k < targetLen; k++) {
    const cur = resampled[k];
    const prev = k > 0 ? resampled[k - 1] : cur;
    const trajFeatures = [];

    for (let h = 0; h < dominantHandCount; h++) {
      const wDx = (cur.wrists[h].x - originWrists[h].x) / avgScale;
      const wDy = (cur.wrists[h].y - originWrists[h].y) / avgScale;
      const wDz = (cur.wrists[h].z - originWrists[h].z) / avgScale;

      const iDx = (cur.indexTips[h].x - originIndexTips[h].x) / avgScale;
      const iDy = (cur.indexTips[h].y - originIndexTips[h].y) / avgScale;

      const curMidX = (cur.wrists[h].x + cur.indexTips[h].x) * 0.5;
      const curMidY = (cur.wrists[h].y + cur.indexTips[h].y) * 0.5;
      const prevMidX = (prev.wrists[h].x + prev.indexTips[h].x) * 0.5;
      const prevMidY = (prev.wrists[h].y + prev.indexTips[h].y) * 0.5;

      const midVx = ((curMidX - prevMidX) / avgScale) * 2.5;
      const midVy = ((curMidY - prevMidY) / avgScale) * 2.5;

      if (k > 0) {
        motionAmplitude +=
          Math.hypot(
            cur.wrists[h].x - prev.wrists[h].x,
            cur.wrists[h].y - prev.wrists[h].y
          ) /
            avgScale +
          Math.hypot(
            cur.indexTips[h].x - prev.indexTips[h].x,
            cur.indexTips[h].y - prev.indexTips[h].y
          ) /
            avgScale;
      }

      trajFeatures.push(
        parseFloat((wDx * W_WRIST_XY).toFixed(4)),
        parseFloat((wDy * W_WRIST_XY).toFixed(4)),
        parseFloat((wDz * W_WRIST_Z).toFixed(4)),
        parseFloat((iDx * W_INDEX_XY).toFixed(4)),
        parseFloat((iDy * W_INDEX_XY).toFixed(4)),
        parseFloat((midVx * W_VEL_XY).toFixed(4)),
        parseFloat((midVy * W_VEL_XY).toFixed(4))
      );
    }

    const roundedPose = cur.pose.map((v) => parseFloat(v.toFixed(4)));
    sequence.push([...roundedPose, ...trajFeatures]);
  }

  motionAmplitude = parseFloat((motionAmplitude / dominantHandCount).toFixed(3));

  const frameCoverageScore = clamp((trimmed.length / 18) * 50, 15, 50);
  const amplitudeScore = clamp((motionAmplitude / 0.85) * 50, 10, 50);
  const qualityScore = Math.round(clamp(frameCoverageScore + amplitudeScore, 25, 99));

  return {
    sequence,
    handCount: dominantHandCount,
    featureDim: sequence[0]?.length || 0,
    keptFrames: trimmed.length,
    motionAmplitude,
    qualityScore,
  };
}

/**
 * Computes Sakoe-Chiba banded DTW distance between two 2D keyframe sequences.
 * Normalized by path weight and sqrt(dim / 70) so 1-hand (70D) and 2-hand (140D)
 * share a single calibrated distance scale (~0.20 identical .. 1.18 threshold).
 */
export function computeDTWDistance(seqA, seqB, bandRadius = DTW_BAND_RADIUS) {
  if (!Array.isArray(seqA) || !Array.isArray(seqB) || seqA.length === 0 || seqB.length === 0) {
    return Infinity;
  }

  const dimA = seqA[0]?.length || 0;
  const dimB = seqB[0]?.length || 0;
  if (dimA === 0 || Math.abs(dimA - dimB) > 6) {
    return Infinity;
  }

  const compareDim = Math.min(dimA, dimB);
  const dimScale = Math.sqrt(compareDim / 70);
  const n = seqA.length;
  const m = seqB.length;
  const band = Math.max(bandRadius, Math.abs(n - m) + 2);

  const dp = Array.from({ length: n }, () => new Float64Array(m).fill(Infinity));
  const steps = Array.from({ length: n }, () => new Float64Array(m).fill(1));

  const frameCost = (i, j) => {
    const a = seqA[i];
    const b = seqB[j];
    let sumSq = 0;
    for (let d = 0; d < compareDim; d++) {
      const diff = a[d] - b[d];
      sumSq += diff * diff;
    }
    let dist = Math.sqrt(sumSq) / dimScale;
    // Emphasize start & end anchor handshapes
    if (i === 0 && j === 0) dist *= 1.35;
    else if (i === n - 1 && j === m - 1) dist *= 1.45;
    return dist;
  };

  for (let i = 0; i < n; i++) {
    const jStart = Math.max(0, i - band);
    const jEnd = Math.min(m - 1, i + band);

    for (let j = jStart; j <= jEnd; j++) {
      const cost = frameCost(i, j);
      if (i === 0 && j === 0) {
        dp[0][0] = cost * 1.35;
        steps[0][0] = 1.35;
        continue;
      }

      let prevCost = Infinity;
      let prevWeight = 1;

      if (i > 0 && dp[i - 1][j] < prevCost) {
        prevCost = dp[i - 1][j];
        prevWeight = steps[i - 1][j];
      }
      if (j > 0 && dp[i][j - 1] < prevCost) {
        prevCost = dp[i][j - 1];
        prevWeight = steps[i][j - 1];
      }
      if (i > 0 && j > 0 && dp[i - 1][j - 1] <= prevCost) {
        prevCost = dp[i - 1][j - 1];
        prevWeight = steps[i - 1][j - 1];
      }

      if (prevCost < Infinity) {
        const w = i === n - 1 && j === m - 1 ? 1.45 : 1.0;
        dp[i][j] = prevCost + cost;
        steps[i][j] = prevWeight + w;
      }
    }
  }

  const finalCost = dp[n - 1][m - 1];
  const finalSteps = steps[n - 1][m - 1] || n + m;
  return finalCost < Infinity ? finalCost / finalSteps : Infinity;
}

/**
 * Matches a candidate 24-keyframe dynamic sequence against all dynamic samples in dataset
 */
export function matchDynamicSequence(candidateSeq, dynamicSamples) {
  if (!candidateSeq || !Array.isArray(dynamicSamples) || dynamicSamples.length === 0) {
    return null;
  }

  const bestByClass = new Map();

  for (const sample of dynamicSamples) {
    if (!isDynamicSample(sample)) continue;
    const dist = computeDTWDistance(candidateSeq, sample.vector);
    if (!Number.isFinite(dist)) continue;

    const prev = bestByClass.get(sample.name);
    if (prev === undefined || dist < prev.distance) {
      bestByClass.set(sample.name, { name: sample.name, distance: dist, sample });
    }
  }

  const ranked = Array.from(bestByClass.values()).sort((a, b) => a.distance - b.distance);
  if (ranked.length === 0) return null;

  const topCandidates = ranked.slice(0, 3).map((item) => {
    const sim = clamp(1 - item.distance / (DTW_MATCH_THRESHOLD * 1.45), 0.05, 0.99);
    return {
      name: item.name,
      distance: parseFloat(item.distance.toFixed(2)),
      confidence: parseFloat(sim.toFixed(2)),
      mode: 'dynamic',
    };
  });

  const best = ranked[0];
  const second = ranked[1];
  const margin =
    second && Number.isFinite(second.distance)
      ? (second.distance - best.distance) / Math.max(best.distance, 0.05)
      : 1.0;

  if (best.distance < DTW_MATCH_THRESHOLD && margin >= 0.10) {
    const distRatio = best.distance / DTW_MATCH_THRESHOLD;
    const baseConf = Math.max(0.72, 1.0 - distRatio * 0.28);
    const marginBonus = Math.min(0.08, margin * 0.15);
    const confidence = parseFloat(Math.min(0.98, baseConf + marginBonus).toFixed(2));

    return {
      matched: true,
      gesture: best.name,
      confidence,
      distance: parseFloat(best.distance.toFixed(2)),
      closestGesture: best.name,
      margin: parseFloat(margin.toFixed(2)),
      mode: 'dynamic',
      topCandidates,
    };
  }

  return {
    matched: false,
    closestGesture: best.name,
    distance: parseFloat(best.distance.toFixed(2)),
    topCandidates,
  };
}

/**
 * Stateful sliding-window recognizer for live camera feeds (Studio & Meeting Rooms)
 */
export class LiveDynamicMotionRecognizer {
  constructor() {
    this.buffer = [];
    this.maxBufferSize = 42;
    this.inMotionArc = false;
    this.arcFrameCount = 0;
    this.framesSinceLastEval = 0;
    this.lastSeenAt = 0;

    // 8-frame output latch so useAslAggregator & Socket.io confirm dynamic signs cleanly
    this.latchRemaining = 0;
    this.latchedOutput = null;
    this.cooldownUntil = 0;
    this.latestTopDynamic = [];
  }

  reset() {
    this.buffer = [];
    this.inMotionArc = false;
    this.arcFrameCount = 0;
    this.framesSinceLastEval = 0;
    this.latchRemaining = 0;
    this.latchedOutput = null;
  }

  /**
   * Processes one live frame and returns a latched dynamic match if recognized
   */
  step(smoothedHands, normalizePoseFn, dynamicSamples) {
    const now = Date.now();

    // Emit latched dynamic detection burst first
    if (this.latchRemaining > 0 && this.latchedOutput) {
      this.latchRemaining -= 1;
      return this.latchedOutput;
    }

    if (!Array.isArray(dynamicSamples) || dynamicSamples.length === 0) {
      this.latestTopDynamic = [];
      return null;
    }

    if (!smoothedHands || smoothedHands.length === 0) {
      if (now - this.lastSeenAt > 220) {
        this.buffer = [];
        this.inMotionArc = false;
        this.arcFrameCount = 0;
      }
      return null;
    }

    if (now - this.lastSeenAt > 320) {
      this.buffer = [];
      this.inMotionArc = false;
      this.arcFrameCount = 0;
    }
    this.lastSeenAt = now;

    const frameItem = extractDynamicFrame(smoothedHands, normalizePoseFn);
    if (!frameItem) return null;

    const prevFrame = this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
    if (prevFrame && prevFrame.handCount !== frameItem.handCount) {
      // Hand count switched (1H <-> 2H): start fresh trajectory segment
      this.buffer = [frameItem];
      this.inMotionArc = false;
      this.arcFrameCount = 0;
      return null;
    }

    const stepSpeed = prevFrame ? computeFrameStepSpeed(prevFrame, frameItem) : 0;
    this.buffer.push(frameItem);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    if (stepSpeed >= 0.052) {
      this.inMotionArc = true;
      this.arcFrameCount += 1;
    } else if (this.inMotionArc) {
      this.arcFrameCount += 1;
    }

    this.framesSinceLastEval += 1;

    if (now < this.cooldownUntil || this.buffer.length < 9) {
      return null;
    }

    const didJustSettle = this.inMotionArc && this.arcFrameCount >= 7 && stepSpeed < 0.042;
    const isSustainedWaveCheck =
      this.inMotionArc && this.arcFrameCount >= 18 && this.framesSinceLastEval >= 6;

    if (!didJustSettle && !isSustainedWaveCheck) {
      return null;
    }

    this.framesSinceLastEval = 0;
    const windowFrames = this.buffer.slice(-32);
    const built = buildDynamicSequence(windowFrames, DTW_KEYFRAMES);

    if (didJustSettle) {
      this.inMotionArc = false;
      this.arcFrameCount = 0;
    }

    if (!built || built.motionAmplitude < MIN_DYNAMIC_MOTION_AMPLITUDE) {
      return null;
    }

    const evalRes = matchDynamicSequence(built.sequence, dynamicSamples);
    if (!evalRes) return null;

    this.latestTopDynamic = evalRes.topCandidates || [];

    if (evalRes.matched) {
      this.latchedOutput = evalRes;
      this.latchRemaining = 7; // Current frame + 7 more = 8 frames total burst
      this.cooldownUntil = now + 880;
      this.buffer = [];
      this.inMotionArc = false;
      this.arcFrameCount = 0;
      return evalRes;
    }

    return null;
  }
}

