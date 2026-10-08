import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

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
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (results.multiHandLandmarks && results.multiHandedness) {
    for (let index = 0; index < results.multiHandLandmarks.length; index++) {
      const landmarks = results.multiHandLandmarks[index];
      const classification = results.multiHandedness[index];
      const isRightHand = classification.label === 'Right';

      // Draw connections with gradient styling
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
        color: isRightHand ? '#06B6D4' : '#8B5CF6',
        lineWidth: 3,
      });

      // Draw key landmark points
      drawLandmarks(ctx, landmarks, {
        color: '#FFFFFF',
        fillColor: isRightHand ? '#0891B2' : '#7C3AED',
        lineWidth: 1,
        radius: 4,
      });
    }
  }
  ctx.restore();
}

/**
 * Simple Rule-Based Gesture Classifier for Sign Language / Hand Signals
 * @param {Array} landmarks - 21 hand 3D landmarks
 * @returns {Object} Recognized gesture info { gesture, confidence }
 */
export function classifyGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return { gesture: 'None', confidence: 0 };

  // Helper to calculate distance between two points
  const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

  // Tip indices: Thumb=4, Index=8, Middle=12, Ring=16, Pinky=20
  // MCP indices: Index=5, Middle=9, Ring=13, Pinky=17
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];

  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const ringMcp = landmarks[13];
  const pinkyMcp = landmarks[17];

  const isIndexExtended = indexTip.y < indexMcp.y;
  const isMiddleExtended = middleTip.y < middleMcp.y;
  const isRingExtended = ringTip.y < ringMcp.y;
  const isPinkyExtended = pinkyTip.y < pinkyMcp.y;

  // Thumbs Up check
  if (thumbTip.y < landmarks[3].y && !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Thumbs Up 👍', confidence: 0.95 };
  }

  // Open Palm / Wave check
  if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) {
    return { gesture: 'Open Palm 🖐️ (Xin Chào)', confidence: 0.92 };
  }

  // Peace / V-Sign check
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Victory / Peace ✌️', confidence: 0.94 };
  }

  // OK Sign check
  const thumbIndexDist = dist(thumbTip, indexTip);
  if (thumbIndexDist < 0.05 && isMiddleExtended && isRingExtended && isPinkyExtended) {
    return { gesture: 'OK Sign 👌 (Đồng Ý)', confidence: 0.91 };
  }

  // Pointing Up check
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Point Up ☝️', confidence: 0.89 };
  }

  // Love / Rock-On check
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && isPinkyExtended) {
    return { gesture: 'I Love You 🤟', confidence: 0.93 };
  }

  // Closed Fist check
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Fist ✊ (Tạm Dừng)', confidence: 0.88 };
  }

  return { gesture: 'Tracking Hands...', confidence: 0.70 };
}
