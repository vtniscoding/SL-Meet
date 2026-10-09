import defaultDataset from '../data/asl_dataset.json';
import { SOCKET_URL } from './socket';

// Active dataset stored in memory (Initialized with pre-loaded Kaggle/Colab ASL dataset)
let activeDataset = defaultDataset.gestures || [];

/**
 * Normalizes 21 3D MediaPipe hand landmarks to be position-invariant (wrist origin)
 * and scale-invariant (divided by palm length between Wrist #0 and Middle MCP #9).
 * @param {Array} landmarks - Array of 21 landmark objects {x, y, z}
 * @returns {Array|null} Array of 63 normalized coordinates [x0, y0, z0, ..., x20, y20, z20]
 */
export function normalizeHandLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  // Scale factor based on palm length (Wrist -> Middle Finger MCP Joint)
  const scale = Math.hypot(
    middleMcp.x - wrist.x,
    middleMcp.y - wrist.y,
    (middleMcp.z || 0) - (wrist.z || 0)
  ) || 1.0;

  const normalized = [];
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    normalized.push((p.x - wrist.x) / scale);
    normalized.push((p.y - wrist.y) / scale);
    normalized.push(((p.z || 0) - (wrist.z || 0)) / scale);
  }

  return normalized;
}

/**
 * Normalizes multi-hand landmarks for 1 or 2 hands.
 * - 1 Hand -> 63 coordinates [x0, y0, z0, ..., x20, y20, z20]
 * - 2 Hands -> 126 coordinates [Left Hand 63 coords + Right Hand 63 coords]
 * 
 * @param {Array} multiHandLandmarks - List of landmark arrays for detected hands
 * @param {Array} multiHandedness - List of handedness objects from MediaPipe
 * @returns {Array|null} Normalized coordinate array
 */
export function normalizeMultiHandLandmarks(multiHandLandmarks, multiHandedness) {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) return null;

  if (multiHandLandmarks.length === 1) {
    return normalizeHandLandmarks(multiHandLandmarks[0]);
  }

  // 2 hands detected: Sort Left and Right hands cleanly
  let leftHand = null;
  let rightHand = null;

  multiHandLandmarks.forEach((hand, idx) => {
    const label = multiHandedness?.[idx]?.label || (idx === 0 ? 'Right' : 'Left');
    if (label === 'Left') {
      leftHand = hand;
    } else {
      rightHand = hand;
    }
  });

  if (!leftHand) leftHand = multiHandLandmarks[0];
  if (!rightHand) rightHand = multiHandLandmarks[1] || multiHandLandmarks[0];

  const leftNorm = normalizeHandLandmarks(leftHand);
  const rightNorm = normalizeHandLandmarks(rightHand);

  if (!leftNorm || !rightNorm) return leftNorm || rightNorm;

  return [...leftNorm, ...rightNorm];
}

/**
 * Dynamic Training Data Loader for Kaggle / Colab JSON Datasets
 * Allows replacing or extending the active dataset at runtime.
 * @param {Object|Array} jsonDataset - Raw dataset object or array of gesture samples
 * @returns {Object} Result summary { success, count, message }
 */
export function loadCustomDataset(jsonDataset) {
  try {
    let newGestures = null;
    if (Array.isArray(jsonDataset)) {
      newGestures = jsonDataset;
    } else if (jsonDataset && Array.isArray(jsonDataset.gestures)) {
      newGestures = jsonDataset.gestures;
    } else if (jsonDataset && jsonDataset.dataset && Array.isArray(jsonDataset.dataset.gestures)) {
      newGestures = jsonDataset.dataset.gestures;
    }

    if (newGestures && Array.isArray(newGestures)) {
      activeDataset = newGestures;
      console.log(`[GestureClassifier] Successfully loaded ${newGestures.length} dataset samples.`);
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
 * Auto-fetches active ASL dataset from backend Server API
 * @param {String} serverUrl - Custom backend URL or default socket endpoint
 * @returns {Promise<Boolean>} Success status
 */
export async function fetchDatasetFromServer(serverUrl) {
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
 * Gets the current active dataset summary info
 * @returns {Object} Summary metadata
 */
export function getDatasetSummary() {
  return {
    totalSamples: activeDataset.length,
    gestures: activeDataset.map((g) => g.name),
  };
}

/**
 * Exports current dataset to JSON string for backup or sharing
 * @returns {String} Formatted JSON string
 */
export function exportCurrentDataset() {
  return JSON.stringify(
    {
      name: 'Exported ASL Dataset',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      gestures: activeDataset,
    },
    null,
    2
  );
}

/**
 * Classifies hand gesture using k-NN Euclidean distance matching against active dataset.
 * Handles both 1-hand (63 features) and 2-hand (126 features) detection seamlessly.
 * 
 * @param {Array} multiHandLandmarks - List of landmark arrays for all detected hands
 * @param {Array} multiHandedness - List of handedness classifications (Left/Right)
 * @returns {Object} Result { gesture, confidence, distance, closestGesture }
 */
export function classifyLandmarksWithDataset(multiHandLandmarks, multiHandedness) {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
    return { gesture: '', confidence: 0, distance: null, closestGesture: null };
  }

  const inputVector = normalizeMultiHandLandmarks(multiHandLandmarks, multiHandedness);
  if (!inputVector) {
    return { gesture: '', confidence: 0, distance: null, closestGesture: null };
  }

  let minDistance = Infinity;
  let bestMatch = null;

  for (const sample of activeDataset) {
    if (!sample.vector) continue;

    // Vector comparison logic
    let compareVector = inputVector;
    if (sample.vector.length === 63 && inputVector.length === 126) {
      // If dataset sample is 1-hand (63) and input is 2-hand (126), compare primary hand
      compareVector = inputVector.slice(0, 63);
    } else if (sample.vector.length !== inputVector.length) {
      continue;
    }

    let sumSquare = 0;
    for (let i = 0; i < sample.vector.length; i++) {
      const diff = compareVector[i] - sample.vector[i];
      sumSquare += diff * diff;
    }
    let distance = Math.sqrt(sumSquare);

    // --- Dynamic Orientation Penalty ---
    // Solves misclassification between similar hand shapes (e.g. "B" vs "Hello", "Face" vs "Thank You")
    // By strongly penalizing Euclidean distance if the hand rotation (angle of Middle Finger MCP) differs.
    if (sample.vector.length >= 63) {
      // Primary Hand Angle (Wrist to Middle MCP: indices 27 for X, 28 for Y)
      const a1Sample = Math.atan2(sample.vector[28], sample.vector[27]);
      const a1Input = Math.atan2(compareVector[28], compareVector[27]);
      let diff1 = Math.abs(a1Sample - a1Input);
      if (diff1 > Math.PI) diff1 = 2 * Math.PI - diff1;
      
      // Add significant distance penalty for rotation mismatches (1 rad diff adds ~1.5 to distance)
      distance += (diff1 * 1.5);
    }

    if (sample.vector.length === 126 && compareVector.length === 126) {
      // Secondary Hand Angle (Indices 90 for X, 91 for Y)
      const a2Sample = Math.atan2(sample.vector[91], sample.vector[90]);
      const a2Input = Math.atan2(compareVector[91], compareVector[90]);
      let diff2 = Math.abs(a2Sample - a2Input);
      if (diff2 > Math.PI) diff2 = 2 * Math.PI - diff2;
      
      distance += (diff2 * 1.5);
    }

    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = sample;
    }
  }

  // Matching threshold for gesture classification (allows user recorded samples to match)
  const normThreshold = bestMatch?.vector?.length === 126 ? 1.75 : 1.45;

  if (bestMatch && minDistance < normThreshold) {
    const scaleFactor = bestMatch.vector.length === 126 ? 0.35 : 0.45;
    const confidence = parseFloat(Math.max(0.70, 1.0 - minDistance * scaleFactor).toFixed(2));
    return {
      gesture: bestMatch.name,
      confidence,
      distance: parseFloat(minDistance.toFixed(2)),
      closestGesture: bestMatch.name,
    };
  }

  return {
    gesture: 'Signing...',
    confidence: 0.65,
    distance: bestMatch ? parseFloat(minDistance.toFixed(2)) : null,
    closestGesture: bestMatch ? bestMatch.name : null,
  };
}

