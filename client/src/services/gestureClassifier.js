import defaultDataset from '../data/asl_dataset.json';

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
 * Dynamic Training Data Loader for Kaggle / Colab JSON Datasets
 * Allows replacing or extending the active dataset at runtime.
 * @param {Object|Array} jsonDataset - Raw dataset object or array of gesture samples
 * @returns {Object} Result summary { success, count, message }
 */
export function loadCustomDataset(jsonDataset) {
  try {
    let newGestures = [];
    if (Array.isArray(jsonDataset)) {
      newGestures = jsonDataset;
    } else if (jsonDataset && Array.isArray(jsonDataset.gestures)) {
      newGestures = jsonDataset.gestures;
    }

    if (newGestures.length > 0) {
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
 * Handles 2-hand detection by stabilizing Left and Right hand assignments.
 * 
 * @param {Array} multiHandLandmarks - List of landmark arrays for all detected hands
 * @param {Array} multiHandedness - List of handedness classifications (Left/Right)
 * @returns {Object} Result { gesture, confidence }
 */
export function classifyLandmarksWithDataset(multiHandLandmarks, multiHandedness) {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
    return { gesture: '', confidence: 0 };
  }

  // Stabilize 2-hand order: Differentiate Left Hand and Right Hand cleanly
  let rightHandLandmarks = null;
  let leftHandLandmarks = null;

  multiHandLandmarks.forEach((hand, idx) => {
    const label = multiHandedness?.[idx]?.label || (idx === 0 ? 'Right' : 'Left');
    if (label === 'Left') {
      leftHandLandmarks = hand;
    } else {
      rightHandLandmarks = hand;
    }
  });

  // Pick primary hand (Prefer Right hand if available, fallback to Left or Hand 0)
  const primaryHand = rightHandLandmarks || leftHandLandmarks || multiHandLandmarks[0];
  const normalizedVector = normalizeHandLandmarks(primaryHand);

  if (!normalizedVector) {
    return { gesture: '', confidence: 0 };
  }

  let minDistance = Infinity;
  let bestMatch = null;

  for (const sample of activeDataset) {
    if (!sample.vector || sample.vector.length !== normalizedVector.length) {
      continue;
    }

    let sumSquare = 0;
    for (let i = 0; i < normalizedVector.length; i++) {
      const diff = normalizedVector[i] - sample.vector[i];
      sumSquare += diff * diff;
    }
    const distance = Math.sqrt(sumSquare);

    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = sample;
    }
  }

  // Distance threshold matching (Distance < 0.90 is considered a match)
  if (bestMatch && minDistance < 0.90) {
    const confidence = parseFloat(Math.max(0.75, 1.0 - minDistance * 0.45).toFixed(2));
    return { gesture: bestMatch.name, confidence };
  }

  return { gesture: 'Signing...', confidence: 0.65 };
}
