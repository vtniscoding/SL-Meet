/**
 * Legacy Adaptive Energy VAD Fallback.
 * Used as a fallback if neural Silero VAD initialization fails (e.g. in environments
 * where WebAssembly or AudioWorklets fail to instantiate).
 * 
 * Features an adaptive noise floor tracking mechanism (EMA of background RMS)
 * so steady fan/ambient noise automatically raises the detection threshold
 * rather than falsely triggering continuous speech hallucinations.
 */

export function startAdaptiveEnergyVad({
  stream,
  onSpeechEnd,
  minSpeechSec = 0.4,
  maxSpeechSec = 8.0,
  debug = false,
}) {
  let isCancelled = false;
  let silenceTimer = null;
  let isSpeaking = false;
  let smoothedRms = 0;
  let noiseFloor = 0.008; // Initial calm baseline
  let accumulatedChunks = [];
  const preRollChunks = [];
  const maxPreRoll = 6;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx({ sampleRate: 16000 });

  const commit = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }

    if (accumulatedChunks.length > 0) {
      const totalLen = accumulatedChunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Float32Array(totalLen);
      let offset = 0;
      for (const chunk of accumulatedChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const durationSec = merged.length / 16000;
      if (durationSec >= minSpeechSec) {
        if (debug) {
          console.log(`[AdaptiveEnergyVAD] Utterance detected: ${durationSec.toFixed(2)}s (noiseFloor: ${noiseFloor.toFixed(4)})`);
        }
        onSpeechEnd(merged);
      }
    }

    accumulatedChunks = [];
    isSpeaking = false;
    smoothedRms = 0;
  };

  const bufferSize = 2048;
  const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
  const source = audioCtx.createMediaStreamSource(stream);
  const dummyDest = audioCtx.createMediaStreamDestination();

  source.connect(processor);
  processor.connect(dummyDest); // Never connect to audioCtx.destination

  processor.onaudioprocess = (e) => {
    if (isCancelled) return;
    const input = e.inputBuffer.getChannelData(0);
    const chunk = new Float32Array(input.length);
    chunk.set(input);

    let sum = 0;
    for (let i = 0; i < chunk.length; i++) {
      sum += chunk[i] * chunk[i];
    }
    const chunkRms = Math.sqrt(sum / chunk.length);
    smoothedRms = smoothedRms * 0.7 + chunkRms * 0.3;

    // Adaptive threshold: at least 0.014, or 3x the measured noise floor
    const adaptiveThreshold = Math.max(0.014, noiseFloor * 2.8);
    const isVocalEnergy = smoothedRms > adaptiveThreshold;

    if (isVocalEnergy) {
      if (!isSpeaking) {
        isSpeaking = true;
        if (preRollChunks.length > 0) {
          accumulatedChunks.push(...preRollChunks);
          preRollChunks.length = 0;
        }
      }

      accumulatedChunks.push(chunk);

      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }

      const totalSamples = accumulatedChunks.reduce((acc, c) => acc + c.length, 0);
      if (totalSamples >= 16000 * maxSpeechSec) {
        commit();
      }
    } else {
      // Background / Silence: continuously adapt to ambient noise level
      noiseFloor = noiseFloor * 0.96 + chunkRms * 0.04;

      if (isSpeaking) {
        accumulatedChunks.push(chunk);
        if (!silenceTimer) {
          silenceTimer = setTimeout(() => {
            commit();
          }, 380);
        }
      } else {
        preRollChunks.push(chunk);
        if (preRollChunks.length > maxPreRoll) {
          preRollChunks.shift();
        }
      }
    }
  };

  return {
    destroy: () => {
      isCancelled = true;
      if (silenceTimer) clearTimeout(silenceTimer);
      try {
        processor.disconnect();
        source.disconnect();
        if (audioCtx.state !== 'closed') {
          audioCtx.close().catch(() => {});
        }
      } catch {}
    },
  };
}
