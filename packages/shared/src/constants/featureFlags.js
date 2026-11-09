/**
 * Global Feature Flags for SL-Meet ASL Recognition Engine
 * 
 * Default state: FEATURE_FACE is FALSE.
 * When disabled, the system runs 100% on legacy handshape & trajectory kinematics.
 */

const getInitialFeatureFace = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem('SL_MEET_FEATURE_FACE');
    if (stored !== null) {
      return stored === 'true' || stored === '1';
    }
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.FEATURE_FACE) {
    return process.env.FEATURE_FACE === 'true' || process.env.FEATURE_FACE === '1';
  }
  return false;
};

export const FEATURE_FLAGS = {
  FEATURE_FACE: getInitialFeatureFace(),
  FACE_WEIGHT: 1.0, // Configurable relative weight for face-relative features
  FACE_FEATURE_VERSION: 2,
};

/**
 * Programmatic toggle for FEATURE_FACE
 * @param {boolean} enabled 
 */
export function setFeatureFace(enabled) {
  FEATURE_FLAGS.FEATURE_FACE = Boolean(enabled);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('SL_MEET_FEATURE_FACE', enabled ? 'true' : 'false');
    } catch {
      // Ignore localStorage write error
    }
  }
  return FEATURE_FLAGS.FEATURE_FACE;
}

/**
 * Programmatic setter for FACE_WEIGHT
 * @param {number} weight 
 */
export function setFaceWeight(weight) {
  if (typeof weight === 'number' && !isNaN(weight) && weight >= 0) {
    FEATURE_FLAGS.FACE_WEIGHT = weight;
  }
  return FEATURE_FLAGS.FACE_WEIGHT;
}

