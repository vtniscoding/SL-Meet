/**
 * Dynamic Time Warping (DTW) Sequence Engine for Continuous Motion Sign Recognition
 *
 * - Captures both normalized handshape articulation (63D / 126D) AND scale-invariant
 *   spatial wrist + index-tip trajectories with tangent velocity vectors.
 * - Canonicalizes both newly recorded and existing DB sequences (auto-trimming idle
 *   hold plateaus while preserving sharp multi-stroke corners such as ASL letter 'Z').
 * - Coexists 100% non-destructively alongside static 1D k-NN vectors in `asl_gestures`.
 */

export const DTW_KEYFRAMES = 24;
export const DTW_BAND_RADIUS = 7;
export const DTW_MATCH_THRESHOLD = 1.05;
export const MIN_DYNAMIC_MOTION_AMPLITUDE = 0.35;

// Legacy storage feature multipliers (preserved in stored JSON vectors for backward compatibility)
const W_WRIST_XY = 1.5;
const W_WRIST_Z = 0.8;
const W_INDEX_XY = 1.3;
const W_VEL_XY = 1.1;

// Balanced DTW cost weights: trajectory shape & unit stroke direction dominate,
// while handshape pose cleanly rejects wrong finger/palm configurations without motion-blur false rejections
const COST_WEIGHT_POSE = 0.22;
const COST_WEIGHT_TRAJ = 1.35;

// WeakMap cache so stored dataset sequences are canonicalized only once in O(1) on subsequent frames
const canonicalCache = new WeakMap();

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
 * Computes pure spatial wrist + index-tip step speed (in palm units) between consecutive frames.
 * Excludes finger micro-twitches so stationary end-holds trim cleanly without false motion spikes.
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
    spatialDisp += Math.max(dw, di) * 0.7 + Math.min(dw, di) * 0.3;
  }

  return spatialDisp / (curFrame.handCount * scale);
}

/**
 * Computes 3-point smoothed step speed array so 1-2 frame corner turns stay active
 * while true leading/trailing stillness plateaus drop cleanly below threshold.
 */
function smoothSpeedProfile(rawSpeeds) {
  const n = rawSpeeds.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? rawSpeeds[i - 1] : rawSpeeds[i];
    const cur = rawSpeeds[i];
    const next = i < n - 1 ? rawSpeeds[i + 1] : rawSpeeds[i];
    out[i] = (prev + 2 * cur + next) / 4;
  }
  return out;
}

/**
 * Trims leading & trailing stillness plateaus from a speed profile while keeping 1 anchor frame
 */
function findActiveTrimBounds(rawSpeeds, minLen = 6) {
  const n = rawSpeeds.length;
  if (n <= minLen) return [0, n - 1];

  const smooth = smoothSpeedProfile(rawSpeeds);
  let peak = 0;
  for (let i = 1; i < n; i++) {
    if (smooth[i] > peak) peak = smooth[i];
  }

  const thresh = Math.max(0.038, peak * 0.18);
  let first = 1;
  let last = n - 1;

  while (first < n - 1 && smooth[first] < thresh) {
    first += 1;
  }
  while (last > first && smooth[last] < thresh) {
    last -= 1;
  }

  let startIdx = Math.max(0, first - 1);
  let endIdx = Math.min(n - 1, last + 1);

  if (endIdx - startIdx + 1 < minLen) {
    const mid = Math.floor((startIdx + endIdx) / 2);
    startIdx = Math.max(0, mid - Math.floor(minLen / 2));
    endIdx = Math.min(n - 1, startIdx + minLen - 1);
  }

  return [startIdx, endIdx];
}

/**
 * Trims idle stillness, resamples to `targetLen` (24) uniform keyframes, and builds
 * 70D (1-hand) or 140D (2-hand) pose + start-anchored trajectory descriptors.
 */
export function buildDynamicSequence(rawFrames, targetLen = DTW_KEYFRAMES) {
  if (!Array.isArray(rawFrames) || rawFrames.length < 6) return null;

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

  if (consistentFrames.length < 6) return null;

  // 2. Smooth speed profile & trim leading/trailing dead holds (preserving sharp corners like 'Z')
  const rawSpeeds = [0];
  for (let i = 1; i < consistentFrames.length; i++) {
    rawSpeeds.push(computeFrameStepSpeed(consistentFrames[i - 1], consistentFrames[i]));
  }

  const [startIdx, endIdx] = findActiveTrimBounds(rawSpeeds, 6);
  const trimmed = consistentFrames.slice(startIdx, endIdx + 1);
  if (trimmed.length < 5) return null;

  // 3. Linear temporal resampling to exact `targetLen` (24) keyframes
  const resampled = [];
  const srcMax = trimmed.length - 1;

  for (let k = 0; k < targetLen; k++) {
    const pos = srcMax === 0 ? 0 : (k / (targetLen - 1)) * srcMax;
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
        const dw =
          Math.hypot(
            cur.wrists[h].x - prev.wrists[h].x,
            cur.wrists[h].y - prev.wrists[h].y
          ) / avgScale;
        const di =
          Math.hypot(
            cur.indexTips[h].x - prev.indexTips[h].x,
            cur.indexTips[h].y - prev.indexTips[h].y
          ) / avgScale;
        motionAmplitude += Math.max(dw, di);
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

  const frameCoverageScore = clamp((trimmed.length / 16) * 50, 15, 50);
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
 * Canonicalizes ANY 2D sequence (including pre-existing DB rows with trailing hold frames)
 * into a 24-keyframe Scale-Invariant Trajectory + Handshape representation.
 * Cached via WeakMap so dataset samples are canonicalized only once in memory.
 */
export function canonicalizeDynamicSequence(seq, targetLen = DTW_KEYFRAMES) {
  if (!Array.isArray(seq) || seq.length < 4 || !Array.isArray(seq[0])) return null;

  const cached = canonicalCache.get(seq);
  if (cached) return cached;

  const dim = seq[0].length;
  const handCount = dim >= 130 ? 2 : 1;
  const poseDim = handCount === 2 ? 126 : 63;
  if (dim < poseDim + handCount * 7) return null;

  // 1. Decode un-weighted trajectory points per frame
  const decoded = seq.map((row) => {
    const pose = row.slice(0, poseDim);
    const hands = [];
    for (let h = 0; h < handCount; h++) {
      const base = poseDim + h * 7;
      hands.push({
        wx: row[base + 0] / W_WRIST_XY,
        wy: row[base + 1] / W_WRIST_XY,
        wz: row[base + 2] / W_WRIST_Z,
        ix: row[base + 3] / W_INDEX_XY,
        iy: row[base + 4] / W_INDEX_XY,
      });
    }
    return { pose, hands };
  });

  // 2. Strip any leading or trailing stationary hold plateaus (e.g. holding finger still after 'Z')
  const stepSpeeds = [0];
  for (let i = 1; i < decoded.length; i++) {
    let step = 0;
    for (let h = 0; h < handCount; h++) {
      const p = decoded[i - 1].hands[h];
      const c = decoded[i].hands[h];
      const dw = Math.hypot(c.wx - p.wx, c.wy - p.wy);
      const di = Math.hypot(c.ix - p.ix, c.iy - p.iy);
      step += Math.max(dw, di);
    }
    stepSpeeds.push(step / handCount);
  }

  const [sIdx, eIdx] = findActiveTrimBounds(stepSpeeds, 6);
  const activeSlice = decoded.slice(sIdx, eIdx + 1);
  const srcMax = activeSlice.length - 1;

  // 3. Resample active stroke cleanly across `targetLen` (24) keyframes
  const resampled = [];
  for (let k = 0; k < targetLen; k++) {
    const pos = srcMax === 0 ? 0 : (k / (targetLen - 1)) * srcMax;
    const i0 = Math.floor(pos);
    const i1 = Math.min(srcMax, i0 + 1);
    const t = pos - i0;

    const a = activeSlice[i0];
    const b = activeSlice[i1];

    const pose = new Float64Array(poseDim);
    for (let d = 0; d < poseDim; d++) {
      pose[d] = lerp(a.pose[d], b.pose[d], t);
    }

    const hands = [];
    for (let h = 0; h < handCount; h++) {
      hands.push({
        wx: lerp(a.hands[h].wx, b.hands[h].wx, t),
        wy: lerp(a.hands[h].wy, b.hands[h].wy, t),
        wz: lerp(a.hands[h].wz, b.hands[h].wz, t),
        ix: lerp(a.hands[h].ix, b.hands[h].ix, t),
        iy: lerp(a.hands[h].iy, b.hands[h].iy, t),
      });
    }
    resampled.push({ pose, hands });
  }

  // 4. Re-anchor origin at keyframe 0 and compute independent wrist & fingertip spans
  // so shoulder-drawn 'Z' and wrist-pivoted 'Z' produce identical normalized fingertip curves!
  const originHands = resampled[0].hands.map((h) => ({ ...h }));
  const handSpans = Array.from({ length: handCount }, () => ({
    minWx: 0, maxWx: 0, minWy: 0, maxWy: 0,
    minIx: 0, maxIx: 0, minIy: 0, maxIy: 0,
  }));

  for (let k = 0; k < targetLen; k++) {
    for (let h = 0; h < handCount; h++) {
      const pt = resampled[k].hands[h];
      pt.wx -= originHands[h].wx;
      pt.wy -= originHands[h].wy;
      pt.wz -= originHands[h].wz;
      pt.ix -= originHands[h].ix;
      pt.iy -= originHands[h].iy;

      const sp = handSpans[h];
      sp.minWx = Math.min(sp.minWx, pt.wx);
      sp.maxWx = Math.max(sp.maxWx, pt.wx);
      sp.minWy = Math.min(sp.minWy, pt.wy);
      sp.maxWy = Math.max(sp.maxWy, pt.wy);
      sp.minIx = Math.min(sp.minIx, pt.ix);
      sp.maxIx = Math.max(sp.maxIx, pt.ix);
      sp.minIy = Math.min(sp.minIy, pt.iy);
      sp.maxIy = Math.max(sp.maxIy, pt.iy);
    }
  }

  const normFactors = handSpans.map((sp) => {
    const wSpan = Math.max(sp.maxWx - sp.minWx, sp.maxWy - sp.minWy, 0.45);
    const iSpan = Math.max(sp.maxIx - sp.minIx, sp.maxIy - sp.minIy, 0.40);
    return { wSpan, iSpan };
  });

  // 5. Build canonical frame descriptors: normalized positions + unit tangent stroke direction
  const frames = [];
  for (let k = 0; k < targetLen; k++) {
    const prevK = Math.max(0, k - 2);
    const nextK = Math.min(targetLen - 1, k + 2);

    const traj = new Float64Array(handCount * 7);
    for (let h = 0; h < handCount; h++) {
      const curH = resampled[k].hands[h];
      const prevH = resampled[prevK].hands[h];
      const nextH = resampled[nextK].hands[h];
      const { wSpan, iSpan } = normFactors[h];

      const wxN = curH.wx / wSpan;
      const wyN = curH.wy / wSpan;
      const wzN = clamp(curH.wz / Math.max(wSpan, iSpan), -1.0, 1.0);
      const ixN = curH.ix / iSpan;
      const iyN = curH.iy / iSpan;

      // Unit stroke tangent direction (separates Right -> Diag -> Right 'Z' from straight down or horizontal wave)
      const rawDx = (nextH.ix - prevH.ix) / iSpan * 0.75 + (nextH.wx - prevH.wx) / wSpan * 0.25;
      const rawDy = (nextH.iy - prevH.iy) / iSpan * 0.75 + (nextH.wy - prevH.wy) / wSpan * 0.25;
      const mag = Math.hypot(rawDx, rawDy);
      const dirScale = mag > 0.04 ? 1 / mag : mag / 0.04;
      const uVx = rawDx * dirScale;
      const uVy = rawDy * dirScale;

      const base = h * 7;
      traj[base + 0] = wxN * 0.65;
      traj[base + 1] = wyN * 0.65;
      traj[base + 2] = wzN * 0.35;
      traj[base + 3] = ixN * 1.25;
      traj[base + 4] = iyN * 1.25;
      traj[base + 5] = uVx * 0.95;
      traj[base + 6] = uVy * 0.95;
    }

    frames.push({
      pose: resampled[k].pose,
      traj,
    });
  }

  const canonical = { handCount, poseDim, frames };
  canonicalCache.set(seq, canonical);
  return canonical;
}

/**
 * Computes Sakoe-Chiba banded DTW distance between two 2D keyframe sequences
 * using balanced Handshape Pose + Scale-Invariant Trajectory costs.
 */
export function computeDTWDistance(seqA, seqB, bandRadius = DTW_BAND_RADIUS) {
  const canA = canonicalizeDynamicSequence(seqA);
  const canB = canonicalizeDynamicSequence(seqB);

  if (!canA || !canB || canA.handCount !== canB.handCount) {
    return Infinity;
  }

  const handCount = canA.handCount;
  const poseDim = canA.poseDim;
  const trajDim = handCount * 7;
  const poseScale = Math.sqrt(handCount);
  const trajScale = Math.sqrt(handCount * 2.5);

  const n = canA.frames.length;
  const m = canB.frames.length;
  const band = Math.max(bandRadius, Math.abs(n - m) + 2);

  const dp = Array.from({ length: n }, () => new Float64Array(m).fill(Infinity));
  const steps = Array.from({ length: n }, () => new Float64Array(m).fill(1));

  const frameCost = (i, j) => {
    const fA = canA.frames[i];
    const fB = canB.frames[j];

    let poseSq = 0;
    for (let d = 0; d < poseDim; d++) {
      const diff = fA.pose[d] - fB.pose[d];
      poseSq += diff * diff;
    }
    const poseDist = Math.sqrt(poseSq) / poseScale;

    let trajSq = 0;
    for (let t = 0; t < trajDim; t++) {
      const diff = fA.traj[t] - fB.traj[t];
      trajSq += diff * diff;
    }
    const trajDist = Math.sqrt(trajSq) / trajScale;

    let cost = COST_WEIGHT_POSE * poseDist + COST_WEIGHT_TRAJ * trajDist;
    if (i === 0 && j === 0) cost *= 1.25;
    else if (i === n - 1 && j === m - 1) cost *= 1.35;
    return cost;
  };

  for (let i = 0; i < n; i++) {
    const jStart = Math.max(0, i - band);
    const jEnd = Math.min(m - 1, i + band);

    for (let j = jStart; j <= jEnd; j++) {
      const cost = frameCost(i, j);
      if (i === 0 && j === 0) {
        dp[0][0] = cost * 1.25;
        steps[0][0] = 1.25;
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
        const w = i === n - 1 && j === m - 1 ? 1.35 : 1.0;
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
    const sim =
      item.distance < DTW_MATCH_THRESHOLD
        ? clamp(1.0 - (item.distance / DTW_MATCH_THRESHOLD) * 0.25, 0.75, 0.98)
        : clamp(0.74 * (1 - (item.distance - DTW_MATCH_THRESHOLD) / 1.2), 0.05, 0.74);
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
    const baseConf = Math.max(0.75, 1.0 - distRatio * 0.25);
    const marginBonus = Math.min(0.08, margin * 0.12);
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
 * Stateful multi-scale sliding-window recognizer for live camera feeds (Studio & Meeting Rooms)
 * - Resilient to 1-2 frame corner turns in multi-stroke signs ('Z', 'J').
 * - Evaluates even if user lowers hand out of frame immediately upon completing a dynamic sign.
 */
export class LiveDynamicMotionRecognizer {
  constructor() {
    this.buffer = [];
    this.maxBufferSize = 48;
    this.inMotionArc = false;
    this.arcFrames = [];
    this.lowSpeedCount = 0;
    this.emptyFrames = 0;
    this.framesSinceLastEval = 0;
    this.lastSeenAt = 0;

    // Output latch + post-match static suppression window
    this.latchRemaining = 0;
    this.latchedOutput = null;
    this.cooldownUntil = 0;
    this.postSettleGuardUntil = 0;
    this.latestTopDynamic = [];
  }

  reset() {
    this.buffer = [];
    this.inMotionArc = false;
    this.arcFrames = [];
    this.lowSpeedCount = 0;
    this.emptyFrames = 0;
    this.framesSinceLastEval = 0;
    this.latchRemaining = 0;
    this.latchedOutput = null;
    this.postSettleGuardUntil = 0;
  }

  /**
   * Returns true briefly after a dynamic gesture finishes while the hand lingers still,
   * preventing static k-NN from falsely emitting the ending finger pose (e.g. 'You' after 'Z').
   */
  isInPostMatchSettle() {
    return Date.now() < this.postSettleGuardUntil;
  }

  _evaluateCandidateWindows(dynamicSamples, now) {
    // Test exact motion arc PLUS multi-scale trailing windows (18, 30, 44 frames)
    // so prior hand-raises or slight pauses at sharp 'Z' corners never corrupt matching
    const candidateSlices = [];

    if (this.arcFrames.length >= 8) {
      candidateSlices.push(this.arcFrames);
    }
    for (const winLen of [16, 24, 34, 46]) {
      if (this.buffer.length >= Math.min(10, winLen)) {
        candidateSlices.push(this.buffer.slice(-winLen));
      }
    }

    let bestMatched = null;
    let bestOverall = null;

    for (const slice of candidateSlices) {
      const built = buildDynamicSequence(slice, DTW_KEYFRAMES);
      if (!built || built.motionAmplitude < MIN_DYNAMIC_MOTION_AMPLITUDE) continue;

      const evalRes = matchDynamicSequence(built.sequence, dynamicSamples);
      if (!evalRes) continue;

      if (!bestOverall || evalRes.distance < bestOverall.distance) {
        bestOverall = evalRes;
      }
      if (evalRes.matched && (!bestMatched || evalRes.distance < bestMatched.distance)) {
        bestMatched = evalRes;
      }
    }

    if (bestOverall?.topCandidates) {
      this.latestTopDynamic = bestOverall.topCandidates;
    }

    if (bestMatched) {
      this.latchedOutput = bestMatched;
      this.latchRemaining = 7; // Current frame + 7 more = 8 frames display & broadcast burst
      this.cooldownUntil = now + 850;
      this.postSettleGuardUntil = now + 700;
      this.buffer = [];
      this.arcFrames = [];
      this.inMotionArc = false;
      this.lowSpeedCount = 0;
      return bestMatched;
    }

    return null;
  }

  /**
   * Processes one live frame (or null when hand leaves camera view) and returns a dynamic match
   */
  step(smoothedHands, normalizePoseFn, dynamicSamples) {
    const now = Date.now();

    // 1. Drain latched dynamic detection burst even if hand just lowered out of view
    if (this.latchRemaining > 0 && this.latchedOutput) {
      this.latchRemaining -= 1;
      return this.latchedOutput;
    }

    if (!Array.isArray(dynamicSamples) || dynamicSamples.length === 0) {
      this.latestTopDynamic = [];
      return null;
    }

    // 2. Handle empty camera frame (e.g. user dropped hand immediately after finishing 'Z'!)
    if (!smoothedHands || smoothedHands.length === 0) {
      this.emptyFrames += 1;

      if (
        this.inMotionArc &&
        this.arcFrames.length >= 8 &&
        this.emptyFrames === 2 &&
        now >= this.cooldownUntil
      ) {
        const matchOnExit = this._evaluateCandidateWindows(dynamicSamples, now);
        this.inMotionArc = false;
        this.arcFrames = [];
        this.buffer = [];
        if (matchOnExit) return matchOnExit;
      }

      if (this.emptyFrames >= 5 || now - this.lastSeenAt > 260) {
        this.buffer = [];
        this.arcFrames = [];
        this.inMotionArc = false;
        this.lowSpeedCount = 0;
        this.postSettleGuardUntil = 0;
      }
      return null;
    }

    this.emptyFrames = 0;
    if (now - this.lastSeenAt > 360) {
      this.buffer = [];
      this.arcFrames = [];
      this.inMotionArc = false;
      this.lowSpeedCount = 0;
    }
    this.lastSeenAt = now;

    const frameItem = extractDynamicFrame(smoothedHands, normalizePoseFn);
    if (!frameItem) return null;

    const prevFrame = this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
    if (prevFrame && prevFrame.handCount !== frameItem.handCount) {
      this.buffer = [frameItem];
      this.arcFrames = [];
      this.inMotionArc = false;
      this.lowSpeedCount = 0;
      return null;
    }

    const stepSpeed = prevFrame ? computeFrameStepSpeed(prevFrame, frameItem) : 0;

    // Clear post-dynamic static linger guard if user begins a new intentional movement
    if (stepSpeed > 0.08 && now > this.cooldownUntil - 350) {
      this.postSettleGuardUntil = 0;
    }

    this.buffer.push(frameItem);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // 3. Track active motion arc with 3-frame corner tolerance (so 'Z' corners don't split arc!)
    if (stepSpeed >= 0.052) {
      if (!this.inMotionArc) {
        this.inMotionArc = true;
        // Include up to 2 pre-onset anchor frames
        this.arcFrames = this.buffer.slice(-3);
      } else {
        this.arcFrames.push(frameItem);
      }
      this.lowSpeedCount = 0;
    } else if (this.inMotionArc) {
      this.arcFrames.push(frameItem);
      this.lowSpeedCount += 1;
    }

    if (this.arcFrames.length > this.maxBufferSize) {
      this.arcFrames.shift();
    }

    this.framesSinceLastEval += 1;

    if (now < this.cooldownUntil || this.buffer.length < 8) {
      return null;
    }

    // Evaluate swiftly on 2+ settle frames (~66ms after stroke ends), while keeping arc alive
    // across 1-2 frame sharp corner turns ('Z', 'J') until 3+ frames of non-matching stop!
    const didPauseAfterStroke =
      this.inMotionArc &&
      this.arcFrames.length >= 8 &&
      (this.lowSpeedCount === 2 || this.lowSpeedCount === 3);

    // Also evaluate periodically during long sustained waves (>= 28 arc frames, ~0.95s+)
    const isSustainedWaveCheck =
      this.inMotionArc && this.arcFrames.length >= 28 && this.framesSinceLastEval >= 6;

    if (!didPauseAfterStroke && !isSustainedWaveCheck) {
      if (this.inMotionArc && this.lowSpeedCount >= 4) {
        this.inMotionArc = false;
        this.arcFrames = [];
        this.lowSpeedCount = 0;
      }
      return null;
    }

    this.framesSinceLastEval = 0;
    const matchRes = this._evaluateCandidateWindows(dynamicSamples, now);

    if (this.lowSpeedCount >= 3 && !matchRes) {
      this.inMotionArc = false;
      this.arcFrames = [];
      this.lowSpeedCount = 0;
    }

    return matchRes;
  }
}
