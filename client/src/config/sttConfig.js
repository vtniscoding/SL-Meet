/**
 * Centralized Speech-to-Text (STT) configuration.
 * Consolidates all VAD, Whisper model, audio thresholds, and debugging flags.
 */
export const STT_CONFIG = {
  // Verbose debug logging in development mode; automatically disabled in production
  DEBUG: import.meta.env.DEV,

  // Dedicated English Whisper model
  MODEL_NAME: 'onnx-community/whisper-base.en',

  // Language setting: null for dedicated English (.en) models
  LANGUAGE: null,

  // Subtitle presentation mode: false forces clean Final-only captions with zero text flickering
  ENABLE_INTERIM: false,

  // Minimum duration of audio segment (in seconds) to be considered speech (filters out clicks/taps)
  MIN_UTTERANCE_SEC: 0.4,

  // Maximum continuous utterance duration (in seconds) before forcing an utterance boundary
  MAX_UTTERANCE_SEC: 8.0,

  // Silero VAD sensitivity thresholds
  VAD_POSITIVE_SPEECH_THRESHOLD: 0.6,
  VAD_NEGATIVE_SPEECH_THRESHOLD: 0.4,
};
