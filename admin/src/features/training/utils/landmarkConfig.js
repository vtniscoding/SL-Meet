/**
 * MediaPipe 21 Hand Landmark Configuration, Colors & Topology
 */

export const LANDMARK_NAMES = [
  'Wrist', // 0
  'Thumb CMC', // 1
  'Thumb MCP', // 2
  'Thumb IP', // 3
  'Thumb Tip', // 4
  'Index MCP', // 5
  'Index PIP', // 6
  'Index DIP', // 7
  'Index Tip', // 8
  'Middle MCP', // 9
  'Middle PIP', // 10
  'Middle DIP', // 11
  'Middle Tip', // 12
  'Ring MCP', // 13
  'Ring PIP', // 14
  'Ring DIP', // 15
  'Ring Tip', // 16
  'Pinky MCP', // 17
  'Pinky PIP', // 18
  'Pinky DIP', // 19
  'Pinky Tip', // 20
];

export const FINGER_COLORS = {
  wrist: '#5CA0F2', // Sky Blue
  thumb: '#F59E0B', // Amber
  index: '#06B6D4', // Cyan
  middle: '#10B981', // Emerald
  ring: '#8B5CF6', // Purple
  pinky: '#EC4899', // Pink
};

export const HAND_CONNECTIONS = [
  // Palm
  [0, 1], [0, 5], [5, 9], [9, 13], [13, 17], [0, 17],
  // Thumb
  [1, 2], [2, 3], [3, 4],
  // Index
  [5, 6], [6, 7], [7, 8],
  // Middle
  [9, 10], [10, 11], [11, 12],
  // Ring
  [13, 14], [14, 15], [15, 16],
  // Pinky
  [17, 18], [18, 19], [19, 20],
];

export function getLandmarkColor(idx) {
  if (idx === 0) return FINGER_COLORS.wrist;
  if (idx <= 4) return FINGER_COLORS.thumb;
  if (idx <= 8) return FINGER_COLORS.index;
  if (idx <= 12) return FINGER_COLORS.middle;
  if (idx <= 16) return FINGER_COLORS.ring;
  return FINGER_COLORS.pinky;
}

/**
 * Calculates Euclidean distance between two 3D points
 */
export function dist3D(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));
}

/**
 * Calculates 3D joint angle in degrees formed by (A - B - C) at vertex B
 */
export function calculateJointAngle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.hypot(v1.x, v1.y, v1.z);
  const mag2 = Math.hypot(v2.x, v2.y, v2.z);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

