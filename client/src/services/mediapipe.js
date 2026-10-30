import * as mpHands from '@mediapipe/hands';
import * as mpDrawing from '@mediapipe/drawing_utils';

const Hands = mpHands.Hands || window.Hands || mpHands.default?.Hands;
const HAND_CONNECTIONS = mpHands.HAND_CONNECTIONS || window.HAND_CONNECTIONS || mpHands.default?.HAND_CONNECTIONS;
const drawConnectors = mpDrawing.drawConnectors || window.drawConnectors || mpDrawing.default?.drawConnectors;
const drawLandmarks = mpDrawing.drawLandmarks || window.drawLandmarks || mpDrawing.default?.drawLandmarks;
import {
  classifyLandmarksWithDataset,
  loadCustomDataset,
  getDatasetSummary,
  exportCurrentDataset,
} from './gestureClassifier';

export { loadCustomDataset, getDatasetSummary, exportCurrentDataset };

// Persistent Singleton MediaPipe Instance to prevent WASM memory/lifecycle crashes on re-renders
let globalHandsInstance = null;
let currentResultsCallback = null;
let initPromise = null;

/**
 * Suppresses MediaPipe phantom double-detections on a single motion-blurred hand
 * while preserving genuine 2-hand signs (including fingertip contact and crossed wrists).
 */
export function sanitizeMediaPipeResults(results) {
  if (
    !results ||
    !Array.isArray(results.multiHandLandmarks) ||
    results.multiHandLandmarks.length < 2
  ) {
    return results;
  }

  const hands = results.multiHandLandmarks;
  const handedness = results.multiHandedness || [];
  const worldLandmarks = results.multiHandWorldLandmarks || [];

  const getHandMetrics = (lm, idx) => {
    const palmIndices = [0, 5, 9, 13, 17];
    let cx = 0;
    let cy = 0;
    for (const i of palmIndices) {
      cx += lm[i].x;
      cy += lm[i].y;
    }
    cx /= palmIndices.length;
    cy /= palmIndices.length;

    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (const p of lm) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const wristToMiddle = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
    const knuckleSpan = Math.hypot(lm[17].x - lm[5].x, lm[17].y - lm[5].y);
    const scale = Math.max(wristToMiddle, knuckleSpan, 0.04);

    // Orientation unit vector from wrist (0) to middle knuckle (9)
    const dirLen = Math.max(wristToMiddle, 1e-4);
    const dirX = (lm[9].x - lm[0].x) / dirLen;
    const dirY = (lm[9].y - lm[0].y) / dirLen;

    const score = handedness[idx]?.score ?? 0.5;
    const area = Math.max(1e-5, (maxX - minX) * (maxY - minY));

    return { lm, idx, cx, cy, minX, maxX, minY, maxY, area, scale, dirX, dirY, score };
  };

  const mA = getHandMetrics(hands[0], 0);
  const mB = getHandMetrics(hands[1], 1);
  const refScale = Math.max(mA.scale, mB.scale);

  const wristDist = Math.hypot(mA.lm[0].x - mB.lm[0].x, mA.lm[0].y - mB.lm[0].y);
  const palmDist = Math.hypot(mA.cx - mB.cx, mA.cy - mB.cy);

  let jointDistSum = 0;
  for (let i = 0; i < 21; i++) {
    jointDistSum += Math.hypot(mA.lm[i].x - mB.lm[i].x, mA.lm[i].y - mB.lm[i].y);
  }
  const meanJointDist = jointDistSum / 21;

  const interW = Math.max(0, Math.min(mA.maxX, mB.maxX) - Math.max(mA.minX, mB.minX));
  const interH = Math.max(0, Math.min(mA.maxY, mB.maxY) - Math.max(mA.minY, mB.minY));
  const interArea = interW * interH;
  const overlapSmaller = interArea / Math.min(mA.area, mB.area);

  // Cosine similarity of hand pointing direction (> 0.55 means aligned, preserving crossed-wrist 'X' signs)
  const dirCos = mA.dirX * mB.dirX + mA.dirY * mB.dirY;

  const isDuplicateSingleHand =
    dirCos > 0.55 &&
    (meanJointDist < 0.78 * refScale ||
      (palmDist < 0.78 * refScale && wristDist < 0.88 * refScale) ||
      (overlapSmaller > 0.62 && palmDist < 0.95 * refScale));

  if (!isDuplicateSingleHand) {
    return results;
  }

  // Keep the sharper, higher-confidence detection and drop the motion-blur ghost clone
  const qualityA = mA.score + 0.25 * (mA.scale / refScale);
  const qualityB = mB.score + 0.25 * (mB.scale / refScale);
  const keepIdx = qualityA >= qualityB ? 0 : 1;

  return {
    ...results,
    multiHandLandmarks: [hands[keepIdx]],
    multiHandedness: handedness[keepIdx] ? [handedness[keepIdx]] : [],
    multiHandWorldLandmarks: worldLandmarks[keepIdx] ? [worldLandmarks[keepIdx]] : [],
  };
}

/**
 * Preload and warm up MediaPipe Hands WASM compiler and graph during app startup
 */
export async function preloadMediaPipeHands() {
  if (globalHandsInstance) return globalHandsInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const hands = new Hands({
        locateFile: (file) => {
          return new URL(`./mediapipe/hands/${file}`, window.location.href).href;
        },
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });

      hands.onResults((results) => {
        if (typeof currentResultsCallback === 'function') {
          currentResultsCallback(sanitizeMediaPipeResults(results));
        }
      });

      // Warm up MediaPipe WASM and ML graph execution upfront
      if (typeof hands.initialize === 'function') {
        await hands.initialize();
      }

      globalHandsInstance = hands;
      return hands;
    } catch (err) {
      console.warn('[MediaPipe] Preload initialization warning:', err);
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Dynamically attach/detach results listener to the persistent MediaPipe singleton
 */
export function setMediaPipeResultsCallback(callback) {
  currentResultsCallback = callback;
}

/**
 * Returns the persistent MediaPipe Hands singleton, initializing if needed
 */
export function getOrCreateMediaPipeHands(onResultsCallback) {
  if (onResultsCallback) {
    currentResultsCallback = onResultsCallback;
  }

  if (!globalHandsInstance) {
    const hands = new Hands({
      locateFile: (file) => {
        return new URL(`./mediapipe/hands/${file}`, window.location.href).href;
      },
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results) => {
      if (typeof currentResultsCallback === 'function') {
        currentResultsCallback(sanitizeMediaPipeResults(results));
      }
    });

    globalHandsInstance = hands;
  }

  return globalHandsInstance;
}

/**
 * Legacy wrapper: Returns the persistent MediaPipe Hands instance
 * @param {Function} onResultsCallback - Handler for landmark results
 * @returns {Hands} Configured MediaPipe Hands instance
 */
export function createMediaPipeHandsInstance(onResultsCallback) {
  return getOrCreateMediaPipeHands(onResultsCallback);
}

/**
 * Draws hand landmarks and connections on HTML Canvas
 * @param {CanvasRenderingContext2D} ctx 
 * @param {Object} results - MediaPipe Hands output results
 */
export function drawHandResults(ctx, results) {
  if (!ctx || !ctx.canvas) return;
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let index = 0; index < results.multiHandLandmarks.length; index++) {
      const landmarks = results.multiHandLandmarks[index];
      const classification = results.multiHandedness[index];
      // Raw webcam frames are un-mirrored, so MediaPipe 'Left' corresponds to physical Right hand
      const isRightHand = classification.label === 'Left';

      // Draw connections with gradient styling
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
        color: isRightHand ? '#5CA0F2' : '#8AB4F8',
        lineWidth: 3,
      });

      // Draw key landmark points
      drawLandmarks(ctx, landmarks, {
        color: '#FFFFFF',
        fillColor: isRightHand ? '#3B82F6' : '#60A5FA',
        lineWidth: 1,
        radius: 4,
      });
    }
  }
  ctx.restore();
}

/**
 * Hybrid ASL Gesture Classifier:
 * First uses k-NN Dataset Vector Matching (Kaggle/Colab dataset loader),
 * then falls back to geometric heuristic rules if confidence is below threshold.
 * 
 * @param {Array} landmarks - 21 hand 3D landmarks for primary hand
 * @param {Object} handedness - Handedness info
 * @param {Array} multiHandLandmarks - Full list of all detected hand landmarks (1 or 2 hands)
 * @param {Array} multiHandedness - Full list of handedness objects
 * @returns {Object} Recognized gesture info { gesture, confidence }
 */
export function classifyGesture(landmarks, handedness, multiHandLandmarks, multiHandedness) {
  const handsList = multiHandLandmarks || (landmarks ? [landmarks] : []);
  const handednessList = multiHandedness || (handedness ? [handedness] : []);

  if (handsList.length === 0) return { gesture: '', confidence: 0 };

  // Strictly use Dataset Vector Classification (Admin Studio Data)
  const datasetResult = classifyLandmarksWithDataset(handsList, handednessList);
  
  // Return the result directly from the dataset classifier (returns 'Signing...' by default)
  if (datasetResult) {
    return datasetResult;
  }

  return { gesture: 'Signing...', confidence: 0.70 };
}
