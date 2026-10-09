import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import {
  classifyLandmarksWithDataset,
  loadCustomDataset,
  getDatasetSummary,
  exportCurrentDataset,
} from './gestureClassifier';

export { loadCustomDataset, getDatasetSummary, exportCurrentDataset };

/**
 * Initializes and configures MediaPipe Hands solution instance
 * @param {Function} onResultsCallback - Handler for landmark results
 * @returns {Hands} Configured MediaPipe Hands instance
 */
export function createMediaPipeHandsInstance(onResultsCallback) {
  const hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    },
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });

  hands.onResults(onResultsCallback);
  return hands;
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
      const isRightHand = classification.label === 'Right';

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

  // 1. Try dataset vector classification (Kaggle/Colab data matching)
  const datasetResult = classifyLandmarksWithDataset(handsList, handednessList);
  if (datasetResult && datasetResult.gesture && datasetResult.gesture !== 'Signing...') {
    return datasetResult;
  }

  // 2. Fallback to Geometric Heuristic Rules
  const primaryHand = landmarks || handsList[0];
  if (!primaryHand || primaryHand.length < 21) return { gesture: '', confidence: 0 };

  // Helper to calculate distance between two points
  const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

  // Tip indices: Thumb=4, Index=8, Middle=12, Ring=16, Pinky=20
  // MCP indices: Index=5, Middle=9, Ring=13, Pinky=17
  const thumbTip = primaryHand[4];
  const indexTip = primaryHand[8];
  const middleTip = primaryHand[12];
  const ringTip = primaryHand[16];
  const pinkyTip = primaryHand[20];

  const indexMcp = primaryHand[5];
  const middleMcp = primaryHand[9];
  const ringMcp = primaryHand[13];
  const pinkyMcp = primaryHand[17];

  const isIndexExtended = indexTip.y < indexMcp.y;
  const isMiddleExtended = middleTip.y < middleMcp.y;
  const isRingExtended = ringTip.y < ringMcp.y;
  const isPinkyExtended = pinkyTip.y < pinkyMcp.y;

  // Thumbs Up check
  if (thumbTip.y < primaryHand[3].y && !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Good / Thumbs Up', confidence: 0.95 };
  }

  // Open Palm / Wave check
  if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) {
    return { gesture: 'Hello', confidence: 0.92 };
  }

  // Peace / V-Sign check
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Victory / Peace', confidence: 0.94 };
  }

  // OK Sign check
  const thumbIndexDist = dist(thumbTip, indexTip);
  if (thumbIndexDist < 0.05 && isMiddleExtended && isRingExtended && isPinkyExtended) {
    return { gesture: 'Agreed / OK', confidence: 0.91 };
  }

  // Pointing Up check
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Attention / Pointing', confidence: 0.89 };
  }

  // Love / Rock-On check
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) {
    return { gesture: 'I Love You', confidence: 0.93 };
  }

  // Closed Fist check
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Wait / Fist', confidence: 0.88 };
  }

  return { gesture: 'Signing...', confidence: 0.70 };
}

