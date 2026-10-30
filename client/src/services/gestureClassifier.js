import defaultDataset from '../data/asl_dataset.json';
import { SOCKET_URL } from './socket';
import { supabase } from '../utils/supabase';
import { smoothMultiHandLandmarks } from './landmarkSmoother';
import {
  isDynamicSample,
  computeDTWDistance,
  DTW_MATCH_THRESHOLD,
  LiveDynamicMotionRecognizer,
} from './dtwClassifier';

const liveDtwRecognizer = new LiveDynamicMotionRecognizer();

const LOCAL_STORAGE_DATASET_KEY = 'sl_meet_asl_dataset_cache';

// Active dataset stored in memory (Loaded from Supabase cache, fallback to bundled JSON)
let activeDataset = (() => {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_DATASET_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    // Ignore cache parse error
  }
  return defaultDataset.gestures || [];
})();

/**
 * Normalizes 21 3D MediaPipe hand landmarks for a single hand (wrist origin, scaled by palm length).
 * @param {Array} landmarks - Array of 21 landmark objects {x, y, z}
 * @returns {Array|null} Array of 63 normalized coordinates [x0, y0, z0, ..., x20, y20, z20]
 */
export function normalizeHandLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  const scale = Math.hypot(
    middleMcp.x - wrist.x,
    middleMcp.y - wrist.y,
    (middleMcp.z || 0) - (wrist.z || 0)
  ) || 1.0;

  const normalized = [];
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    normalized.push(parseFloat(((p.x - wrist.x) / scale).toFixed(4)));
    normalized.push(parseFloat(((p.y - wrist.y) / scale).toFixed(4)));
    normalized.push(parseFloat((((p.z || 0) - (wrist.z || 0)) / scale).toFixed(4)));
  }

  return normalized;
}

/**
 * Unified Two-Hand Normalization:
 * Treats both hands as a SINGLE UNIFIED INPUT. Does NOT separate or depend on Left/Right classification.
 * 
 * - Hands are sorted strictly by screen spatial X coordinate (leftmost hand first, rightmost hand second).
 * - All 42 points (21 from hand 1 + 21 from hand 2) are mapped to a common center (midpoint of wrists)
 *   and scaled by the combined inter-wrist and palm dimension.
 * - Produces a single, robust 126-dimensional pose vector.
 * 
 * @param {Array} multiHandLandmarks - List of landmark arrays for detected hands
 * @returns {Array|null} 126-dimensional normalized vector (or 63 if 1 hand)
 */
export function normalizeMultiHandLandmarks(multiHandLandmarks) {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) return null;

  // Single Hand Case: 63 Dimensions
  if (multiHandLandmarks.length === 1) {
    return normalizeHandLandmarks(multiHandLandmarks[0]);
  }

  // Two Hands Case: Unified Coordinate Frame (126 Dimensions)
  const handA = multiHandLandmarks[0];
  const handB = multiHandLandmarks[1];

  if (!handA || !handB || handA.length < 21 || handB.length < 21) {
    return normalizeHandLandmarks(handA || handB);
  }

  // 1. Sort by screen X coordinate: Leftmost hand is Hand 1, Rightmost is Hand 2
  // Eliminates MediaPipe's Left/Right hand labeling confusion during contact/occlusion
  const [h1, h2] = handA[0].x <= handB[0].x ? [handA, handB] : [handB, handA];

  const w1 = h1[0];
  const w2 = h2[0];

  // 2. Common Centroid (Midpoint between wrists)
  const cx = (w1.x + w2.x) / 2;
  const cy = (w1.y + w2.y) / 2;
  const cz = ((w1.z || 0) + (w2.z || 0)) / 2;

  // 3. Common Normalization Scale Factor
  const wristDist = Math.hypot(w2.x - w1.x, w2.y - w1.y, (w2.z || 0) - (w1.z || 0));
  const palm1 = Math.hypot(h1[9].x - w1.x, h1[9].y - w1.y, (h1[9].z || 0) - (w1.z || 0));
  const palm2 = Math.hypot(h2[9].x - w2.x, h2[9].y - w2.y, (h2[9].z || 0) - (w2.z || 0));
  const scale = Math.max(wristDist, (palm1 + palm2) / 2, 0.1);

  // 4. Normalize all 42 points in common coordinate space
  const normalized = [];
  const all42Points = [...h1, ...h2];

  for (let i = 0; i < all42Points.length; i++) {
    const p = all42Points[i];
    normalized.push(parseFloat(((p.x - cx) / scale).toFixed(4)));
    normalized.push(parseFloat(((p.y - cy) / scale).toFixed(4)));
    normalized.push(parseFloat((((p.z || 0) - cz) / scale).toFixed(4)));
  }

  return normalized; // Exact 126 floats
}

/**
 * Loads custom dataset into memory and syncs local cache.
 */
export function loadCustomDataset(jsonDataset) {
  try {
    let newGestures = null;
    if (Array.isArray(jsonDataset)) {
      newGestures = jsonDataset;
    } else if (jsonDataset && Array.isArray(jsonDataset.gestures)) {
      newGestures = jsonDataset.gestures;
    } else if (jsonDataset?.dataset && Array.isArray(jsonDataset.dataset.gestures)) {
      newGestures = jsonDataset.dataset.gestures;
    }

    if (newGestures && Array.isArray(newGestures)) {
      activeDataset = newGestures;
      try {
        localStorage.setItem(LOCAL_STORAGE_DATASET_KEY, JSON.stringify(newGestures));
      } catch (e) {
        // Ignore cache storage error
      }
      return {
        success: true,
        count: newGestures.length,
        message: `Loaded ${newGestures.length} trained gesture samples successfully.`,
      };
    }
  } catch (err) {
    console.error('[GestureClassifier] Failed to load custom dataset:', err);
  }
  return { success: false, count: 0, message: 'Invalid dataset format.' };
}

/**
 * Fetches active ASL dataset from Supabase DB table `asl_gestures`
 */
export async function fetchDatasetFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('asl_gestures')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      loadCustomDataset(data);
      return true;
    }
  } catch (err) {
    console.warn('[GestureClassifier] Failed to fetch from Supabase:', err);
  }
  return false;
}

let datasetChannel = null;
const datasetListeners = new Set();

/**
 * Initializes real-time auto-synchronization for `asl_gestures` via Supabase Realtime
 * Uses a Singleton Channel pattern to safely support multiple listening components.
 */
export function initRealtimeDatasetSync(onUpdateCallback) {
  if (onUpdateCallback) {
    datasetListeners.add(onUpdateCallback);
    onUpdateCallback(activeDataset);
  }

  if (!datasetChannel) {
    fetchDatasetFromSupabase().then(() => {
      datasetListeners.forEach((cb) => {
        try { cb(activeDataset); } catch (e) { console.error(e); }
      });
    });

    datasetChannel = supabase
      .channel('asl_gestures_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'asl_gestures' },
        async () => {
          await fetchDatasetFromSupabase();
          datasetListeners.forEach((cb) => {
            try { cb(activeDataset); } catch (e) { console.error(e); }
          });
        }
      )
      .subscribe();
  }

  return {
    unsubscribe: () => {
      if (onUpdateCallback) {
        datasetListeners.delete(onUpdateCallback);
      }
    },
  };
}

/**
 * Fallback: Auto-fetches active ASL dataset from backend Server API
 */
export async function fetchDatasetFromServer(serverUrl) {
  const supabaseSuccess = await fetchDatasetFromSupabase();
  if (supabaseSuccess) return true;

  try {
    const baseUrl = serverUrl || import.meta.env.VITE_SOCKET_URL || SOCKET_URL || 'http://localhost:4000';
    const timestamp = Date.now();
    const response = await fetch(`${baseUrl}/api/gestures/dataset?t=${timestamp}`);
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.dataset) {
        loadCustomDataset(data.dataset);
        return true;
      }
    }
  } catch (err) {
    console.warn('[GestureClassifier] Failed to fetch server dataset, using local memory asset:', err);
  }
  return false;
}

/**
 * Gets current active dataset summary
 */
export function getDatasetSummary() {
  return {
    totalSamples: activeDataset.length,
    gestures: activeDataset.map((g) => g.name),
  };
}

/**
 * Exports current dataset to JSON string for backup
 */
export function exportCurrentDataset() {
  return JSON.stringify(
    {
      name: 'SL-Meet Exported Dataset',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      gestures: activeDataset,
    },
    null,
    2
  );
}

/**
 * Classifies hand gesture using adaptive k-NN matching against active dataset.
 * Enhanced with:
 * - Landmark Motion Settle Detector (smoothes micro-jitter and detects transitioning hands).
 * - Calibrated Distance Thresholds: 0.95 for 1-hand (63D) to strictly separate similar letters (A, M, N).
 * - Top-2 Relative Margin Ratio: rejects ambiguous boundary frames where distances to two different classes are too close.
 * 
 * @param {Array} multiHandLandmarks - List of landmark arrays for all detected hands
 * @returns {Object} Result { gesture, confidence, distance, closestGesture, isAmbiguous }
 */
/**
 * Summarizes a batch of static normalized pose vectors with 15% statistical outlier rejection
 * and computes a 0-99% Stability Quality Score.
 */
export function summarizeStaticCapture(rawVectors) {
  if (!Array.isArray(rawVectors) || rawVectors.length === 0) return null;

  const lenCounts = {};
  for (const v of rawVectors) {
    if (Array.isArray(v) && (v.length === 63 || v.length === 126)) {
      lenCounts[v.length] = (lenCounts[v.length] || 0) + 1;
    }
  }
  const availableDims = Object.keys(lenCounts);
  if (availableDims.length === 0) return null;

  const dominantLen = Number(
    availableDims.reduce((a, b) => (lenCounts[a] >= lenCounts[b] ? a : b))
  );
  const validFrames = rawVectors.filter((v) => Array.isArray(v) && v.length === dominantLen);
  if (validFrames.length === 0) return null;

  // Initial mean centroid
  const roughMean = new Array(dominantLen).fill(0);
  for (const f of validFrames) {
    for (let i = 0; i < dominantLen; i++) {
      roughMean[i] += f[i];
    }
  }
  for (let i = 0; i < dominantLen; i++) {
    roughMean[i] /= validFrames.length;
  }

  // Compute deviation of each frame from centroid and reject worst 15% jitter/outlier frames
  const scored = validFrames
    .map((frame) => {
      let sumSq = 0;
      for (let i = 0; i < dominantLen; i++) {
        const diff = frame[i] - roughMean[i];
        sumSq += diff * diff;
      }
      return { frame, dist: Math.sqrt(sumSq) };
    })
    .sort((a, b) => a.dist - b.dist);

  const keepCount =
    scored.length >= 10 ? Math.max(6, Math.floor(scored.length * 0.85)) : scored.length;
  const kept = scored.slice(0, keepCount);

  const avgVector = new Array(dominantLen).fill(0);
  let meanDev = 0;
  for (const item of kept) {
    meanDev += item.dist;
    for (let i = 0; i < dominantLen; i++) {
      avgVector[i] += item.frame[i];
    }
  }
  meanDev /= kept.length;

  for (let i = 0; i < dominantLen; i++) {
    avgVector[i] = parseFloat((avgVector[i] / kept.length).toFixed(4));
  }

  const refSpread = dominantLen === 126 ? 0.85 : 0.55;
  const stabilityScore = Math.round(
    Math.min(99, Math.max(30, (1 - meanDev / refSpread) * 100))
  );

  return {
    vector: avgVector,
    dimension: dominantLen,
    totalFrames: validFrames.length,
    keptFrames: kept.length,
    stabilityScore,
  };
}

/**
 * Checks whether a newly captured static vector or dynamic DTW sequence overlaps closely
 * with an existing sample belonging to a DIFFERENT gesture label.
 */
export function checkDatasetConflict(candidateVector, targetLabel = '', mode = 'static') {
  if (!candidateVector || !Array.isArray(candidateVector)) return null;
  const cleanTarget = (targetLabel || '').trim().toLowerCase();

  let closestConflict = null;
  let minDistance = Infinity;

  if (mode === 'dynamic') {
    for (const sample of activeDataset) {
      if (!isDynamicSample(sample)) continue;
      if (cleanTarget && (sample.name || '').trim().toLowerCase() === cleanTarget) continue;

      const dist = computeDTWDistance(candidateVector, sample.vector);
      if (dist < minDistance) {
        minDistance = dist;
        closestConflict = sample.name;
      }
    }

    const warnThresh = DTW_MATCH_THRESHOLD * 0.82;
    if (closestConflict && minDistance < warnThresh) {
      const sim = Math.round(
        Math.min(99, Math.max(50, (1 - minDistance / (DTW_MATCH_THRESHOLD * 1.4)) * 100))
      );
      return {
        hasConflict: true,
        conflictingLabel: closestConflict,
        distance: parseFloat(minDistance.toFixed(2)),
        similarityPct: sim,
      };
    }
    return null;
  }

  // Static mode conflict check
  const dim = candidateVector.length;
  const isTwoHands = dim === 126;

  for (const sample of activeDataset) {
    if (!sample.vector || !Array.isArray(sample.vector) || isDynamicSample(sample)) continue;
    if (cleanTarget && (sample.name || '').trim().toLowerCase() === cleanTarget) continue;
    if (Math.abs(sample.vector.length - dim) > 12) continue;

    const len = Math.min(dim, sample.vector.length);
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      const diff = candidateVector[i] - sample.vector[i];
      sumSq += diff * diff;
    }
    const dist = Math.sqrt(sumSq);
    if (dist < minDistance) {
      minDistance = dist;
      closestConflict = sample.name;
    }
  }

  const warnThresh = isTwoHands ? 1.15 : 0.68;
  const normRef = isTwoHands ? 1.60 : 0.95;

  if (closestConflict && minDistance < warnThresh) {
    const sim = Math.round(
      Math.min(99, Math.max(55, (1 - minDistance / (normRef * 1.35)) * 100))
    );
    return {
      hasConflict: true,
      conflictingLabel: closestConflict,
      distance: parseFloat(minDistance.toFixed(2)),
      similarityPct: sim,
    };
  }

  return null;
}

/**
 * Classifies hand gesture using unified Dynamic DTW + Adaptive Static k-NN matching.
 *
 * @param {Array} multiHandLandmarks - List of landmark arrays for all detected hands
 * @returns {Object} Result { gesture, confidence, distance, closestGesture, mode, topCandidates }
 */
export function classifyLandmarksWithDataset(multiHandLandmarks) {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
    liveDtwRecognizer.step(null, normalizeMultiHandLandmarks, []);
    return {
      gesture: '',
      confidence: 0,
      distance: null,
      closestGesture: null,
      topCandidates: [],
    };
  }

  // 1. Adaptive Landmark Smoothing (Nearest-Wrist Anti-Swap) & Velocity Tracking
  const { smoothedMultiHandLandmarks, isHandMoving, isFastTransition, maxVelocity } =
    smoothMultiHandLandmarks(multiHandLandmarks);

  const dynamicSamples = [];
  const staticSamples = [];
  for (const s of activeDataset) {
    if (!s || !Array.isArray(s.vector)) continue;
    if (isDynamicSample(s)) {
      dynamicSamples.push(s);
    } else if (typeof s.vector[0] === 'number') {
      staticSamples.push(s);
    }
  }

  // 2. Step Continuous Dynamic Motion (DTW) Recognizer BEFORE static velocity gating
  const dynamicMatch = liveDtwRecognizer.step(
    smoothedMultiHandLandmarks,
    normalizeMultiHandLandmarks,
    dynamicSamples
  );

  if (dynamicMatch && dynamicMatch.matched) {
    return {
      gesture: dynamicMatch.gesture,
      confidence: dynamicMatch.confidence,
      distance: dynamicMatch.distance,
      closestGesture: dynamicMatch.closestGesture,
      margin: dynamicMatch.margin,
      mode: 'dynamic',
      topCandidates: dynamicMatch.topCandidates || [],
      smoothedLandmarks: smoothedMultiHandLandmarks,
      isFastTransition,
      maxVelocity,
    };
  }

  if (isFastTransition) {
    return {
      gesture: 'Signing...',
      confidence: 0.55,
      distance: null,
      closestGesture: null,
      isTransitioning: true,
      topCandidates: liveDtwRecognizer.latestTopDynamic || [],
      smoothedLandmarks: smoothedMultiHandLandmarks,
      isFastTransition,
      maxVelocity,
    };
  }

  const inputVector = normalizeMultiHandLandmarks(smoothedMultiHandLandmarks);
  if (!inputVector) {
    return {
      gesture: '',
      confidence: 0,
      distance: null,
      closestGesture: null,
      topCandidates: [],
      smoothedLandmarks: smoothedMultiHandLandmarks,
      isFastTransition,
      maxVelocity,
    };
  }

  const inputLen = inputVector.length;
  const isTwoHandsInput = inputLen === 126;
  const normThreshold = isTwoHandsInput ? 1.60 : 0.95;

  // Track best Euclidean distance per distinct gesture class for accurate Top-3 Radar & margin check
  const bestByClass = new Map();

  for (const sample of staticSamples) {
    const sampleLen = sample.vector.length;
    let compareVector = inputVector;

    if (isTwoHandsInput && sampleLen === 63) {
      compareVector = inputVector.slice(0, 63);
    } else if (!isTwoHandsInput && sampleLen >= 126) {
      continue;
    } else if (Math.abs(sampleLen - compareVector.length) > 12) {
      continue;
    }

    const compareLen = Math.min(sampleLen, compareVector.length);
    let sumSquare = 0;
    for (let i = 0; i < compareLen; i++) {
      const diff = compareVector[i] - sample.vector[i];
      sumSquare += diff * diff;
    }
    const distance = Math.sqrt(sumSquare);
    const sampleThreshold = sampleLen >= 126 ? 1.60 : 0.95;

    const existing = bestByClass.get(sample.name);
    if (!existing || distance < existing.distance) {
      bestByClass.set(sample.name, {
        name: sample.name,
        distance,
        threshold: sampleThreshold,
        sample,
      });
    }
  }

  const rankedClasses = Array.from(bestByClass.values()).sort(
    (a, b) => a.distance - b.distance
  );

  const staticTopCandidates = rankedClasses.slice(0, 3).map((item) => {
    const sim = Math.min(
      0.99,
      Math.max(0.05, 1 - item.distance / (item.threshold * 1.55))
    );
    return {
      name: item.name,
      distance: parseFloat(item.distance.toFixed(2)),
      confidence: parseFloat(sim.toFixed(2)),
      mode: 'static',
    };
  });

  // Merge with recent dynamic candidates if user recently moved hands so Radar shows both modes
  const mergedCandidates = [...staticTopCandidates, ...(liveDtwRecognizer.latestTopDynamic || [])]
    .sort((a, b) => b.confidence - a.confidence)
    .filter((item, idx, arr) => arr.findIndex((x) => x.name === item.name) === idx)
    .slice(0, 3);

  const bestEntry = rankedClasses[0] || null;
  const secondEntry = rankedClasses[1] || null;
  const minDistance = bestEntry ? bestEntry.distance : Infinity;
  const bestMatch = bestEntry ? bestEntry.sample : null;
  const activeThreshold = bestEntry ? bestEntry.threshold : normThreshold;

  if (bestMatch && minDistance < activeThreshold) {
    let margin = 1.0;
    if (secondEntry && Number.isFinite(secondEntry.distance)) {
      margin = (secondEntry.distance - minDistance) / Math.max(minDistance, 0.01);
    }

    const isAmbiguousTransition = margin < 0.12;

    if (isAmbiguousTransition || (isHandMoving && margin < 0.20)) {
      return {
        gesture: 'Signing...',
        confidence: 0.55,
        distance: parseFloat(minDistance.toFixed(2)),
        closestGesture: bestMatch.name,
        isAmbiguous: true,
        mode: 'static',
        topCandidates: mergedCandidates,
        smoothedLandmarks: smoothedMultiHandLandmarks,
        isFastTransition,
        maxVelocity,
      };
    }

    const distRatio = minDistance / activeThreshold;
    const baseConfidence = Math.max(0.60, 1.0 - distRatio * 0.40);
    const marginBonus = Math.min(0.08, margin * 0.15);
    const confidence = parseFloat(Math.min(0.98, baseConfidence + marginBonus).toFixed(2));

    return {
      gesture: bestMatch.name,
      confidence,
      distance: parseFloat(minDistance.toFixed(2)),
      closestGesture: bestMatch.name,
      margin: parseFloat(margin.toFixed(2)),
      mode: 'static',
      topCandidates: mergedCandidates,
      smoothedLandmarks: smoothedMultiHandLandmarks,
      isFastTransition,
      maxVelocity,
    };
  }

  return {
    gesture: 'Signing...',
    confidence: 0.55,
    distance: bestMatch ? parseFloat(minDistance.toFixed(2)) : null,
    closestGesture: bestMatch ? bestMatch.name : null,
    mode: 'static',
    topCandidates: mergedCandidates,
    smoothedLandmarks: smoothedMultiHandLandmarks,
    isFastTransition,
    maxVelocity,
  };
}
