import { pipeline, env } from '@huggingface/transformers';
import { indexedDbCache } from '../services/modelCache';

// Model: whisper-tiny.en is ultra-lightweight (~39MB), loads in 1-2s,
// and transcribes in ~300ms on pure CPU WASM SIMD with minimal memory footprint.
const MODEL_NAME = 'onnx-community/whisper-tiny.en';

// Configure transformers.js environment for browser / electron
env.allowLocalModels = false;

// Attach custom IndexedDB cache to handle Electron file:// storage restrictions
try {
  env.useCustomCache = true;
  env.customCache = indexedDbCache;
} catch (cacheErr) {
  console.warn('[WhisperWorker] Custom cache initialization warning:', cacheErr);
}

// Configure WASM threads for optimal CPU performance
// Completely avoid WebGPU to eliminate Electron 29 / Chromium shader incompatibilities
try {
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.proxy = false;
    const threads = Math.min(4, Math.max(1, (self.navigator?.hardwareConcurrency || 4) - 1));
    env.backends.onnx.wasm.numThreads = threads;
  }
} catch (wasmErr) {
  console.warn('[WhisperWorker] WASM thread configuration warning:', wasmErr);
}

let transcriber = null;
let isLoading = false;
let isBusy = false;
let pendingInterim = null;

function cleanTranscription(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.trim();
  // Strip bracketed and parenthesized non-speech tokens (e.g. [MUSIC], (Applause), [BLANK_AUDIO])
  cleaned = cleaned.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();

  // Normalize to check against common hallucinations triggered by noise
  const normalized = cleaned.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const hallucinations = new Set([
    'thank you',
    'thank you for watching',
    'thanks for watching',
    'thanks',
    'bye',
    'bye bye',
    'goodbye',
    'you',
    'so',
    'the',
    'a',
    'oh',
    'ah',
    'uh',
    'um',
    'subscribe',
    'subscribe to my channel',
    'subtitles by',
    'watching',
    'silence',
    'be seeing you',
    'see you next time',
  ]);

  if (hallucinations.has(normalized)) {
    return '';
  }

  // Discard isolated punctuation or 1-character outputs
  if (normalized.length <= 1) {
    return '';
  }

  return cleaned;
}

async function loadModel() {
  if (transcriber || isLoading) return;
  isLoading = true;

  self.postMessage({ type: 'status', status: 'loading' });

  try {
    console.log(`[WhisperWorker] Loading ${MODEL_NAME} using pure WASM CPU SIMD...`);
    transcriber = await pipeline('automatic-speech-recognition', MODEL_NAME, {
      device: 'wasm',
      dtype: {
        encoder_model: 'quantized',
        decoder_model_merged: 'quantized',
      },
      progress_callback: (info) => {
        self.postMessage({ type: 'progress', info });
      },
    });

    console.log('[WhisperWorker] Whisper model ready for inference.');
    self.postMessage({ type: 'status', status: 'ready' });
  } catch (err) {
    console.error('[WhisperWorker] Model loading failed:', err);
    self.postMessage({ type: 'error', error: err.message || 'Failed to load Whisper model' });
  } finally {
    isLoading = false;
  }
}

async function runInference(audio, isFinal, segmentId) {
  if (!transcriber) return;
  isBusy = true;

  try {
    const result = await transcriber(audio, {
      sampling_rate: 16000,
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });

    const rawText = result && typeof result.text === 'string' ? result.text : '';
    const cleanedText = cleanTranscription(rawText);

    if (cleanedText) {
      console.log(`[WhisperWorker] ${isFinal ? 'Final' : 'Interim'}:`, cleanedText);
      self.postMessage({
        type: 'result',
        text: cleanedText,
        isFinal: !!isFinal,
        segmentId,
      });
    }
  } catch (err) {
    console.error('[WhisperWorker] Transcription error:', err);
  } finally {
    isBusy = false;

    // Check if a newer interim segment was queued during inference
    if (pendingInterim) {
      const next = pendingInterim;
      pendingInterim = null;
      runInference(next.audio, next.isFinal, next.segmentId);
    }
  }
}

self.onmessage = async (e) => {
  const { type, audio, isFinal, segmentId } = e.data || {};

  if (type === 'load') {
    await loadModel();
  } else if (type === 'transcribe') {
    if (!transcriber) {
      await loadModel();
    }
    if (!transcriber) return;

    if (isFinal) {
      // Final utterances are always prioritized
      pendingInterim = null;
      await runInference(audio, true, segmentId);
    } else {
      if (isBusy) {
        // Discard older interim in favor of latest audio chunk
        pendingInterim = { audio, isFinal: false, segmentId };
      } else {
        await runInference(audio, false, segmentId);
      }
    }
  }
};
