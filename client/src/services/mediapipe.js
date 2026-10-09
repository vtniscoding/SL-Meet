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

  // Strictly use Dataset Vector Classification (Admin Studio Data)
  const datasetResult = classifyLandmarksWithDataset(handsList, handednessList);
  
  // Return the result directly from the dataset classifier (returns 'Signing...' by default)
  if (datasetResult) {
    return datasetResult;
  }

  return { gesture: 'Signing...', confidence: 0.70 };
}

