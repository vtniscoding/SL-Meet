import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getWhisperWorker,
  getWhisperStatus,
  subscribeWhisperWorker,
} from '../services/whisperWorkerManager';

const RMS_SPEECH_THRESHOLD = 0.016;
const SILENCE_TIMEOUT_MS = 380;
const MIN_UTTERANCE_DURATION_SEC = 0.35;
const MAX_UTTERANCE_DURATION_SEC = 10;
const INTERIM_INTERVAL_MS = 1400;
const MAX_PRE_ROLL_CHUNKS = 8;

export function useSpeechToText({ stream, enabled = false, onCaption }) {
  const [status, setStatus] = useState(() => getWhisperStatus().status); // 'idle' | 'loading' | 'ready' | 'listening' | 'error'
  const [loadProgress, setLoadProgress] = useState(null);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState(null);

  const workerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const clonedTrackRef = useRef(null);
  const chunksRef = useRef([]);
  const preRollChunksRef = useRef([]);
  const smoothedRmsRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const lastSpeechTimeRef = useRef(0);
  const lastInterimTimeRef = useRef(0);
  const segmentIdRef = useRef(0);
  const silenceTimerRef = useRef(null);
  const onCaptionRef = useRef(onCaption);

  useEffect(() => {
    onCaptionRef.current = onCaption;
  }, [onCaption]);

  // Merge accumulated Float32Array chunks into single continuous buffer
  const mergeChunks = useCallback((chunks) => {
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }, []);

  const commitUtterance = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (chunksRef.current.length > 0 && workerRef.current) {
      const merged = mergeChunks(chunksRef.current);
      // Require at least 0.35s of audio to discard isolated clicks/taps
      if (merged.length >= 16000 * MIN_UTTERANCE_DURATION_SEC) {
        segmentIdRef.current += 1;
        workerRef.current.postMessage({
          type: 'transcribe',
          audio: merged,
          isFinal: true,
          segmentId: segmentIdRef.current,
        });
      }
    }

    chunksRef.current = [];
    isSpeakingRef.current = false;
    smoothedRmsRef.current = 0;
  }, [mergeChunks]);

  // Subscribe to background Whisper worker singleton
  useEffect(() => {
    const worker = getWhisperWorker();
    workerRef.current = worker;

    const current = getWhisperStatus();
    if (current.isReady) {
      setStatus('ready');
    }

    const unsubscribe = subscribeWhisperWorker((data) => {
      if (data.type === 'status') {
        setStatus(data.status);
      } else if (data.type === 'progress') {
        setLoadProgress(data.info);
      } else if (data.type === 'error') {
        setStatus('error');
        setError(data.error);
      } else if (data.type === 'result') {
        if (data.text) {
          setInterimText(data.isFinal ? '' : data.text);
          if (onCaptionRef.current) {
            onCaptionRef.current({
              text: data.text,
              isFinal: !!data.isFinal,
              segmentId: data.segmentId,
            });
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Audio capture & VAD pipeline when enabled
  useEffect(() => {
    let isCancelled = false;

    const stopAudioPipeline = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (clonedTrackRef.current) {
        clonedTrackRef.current.stop();
        clonedTrackRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      chunksRef.current = [];
      isSpeakingRef.current = false;
      setInterimText('');
    };

    if (!enabled || !stream) {
      stopAudioPipeline();
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack || audioTrack.readyState !== 'live') {
      stopAudioPipeline();
      return;
    }

    const startAudioPipeline = async () => {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
        });
        audioCtxRef.current = audioCtx;

        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        const workletCode = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData && channelData.length > 0) {
        const copy = new Float32Array(channelData.length);
        copy.set(channelData);
        this.port.postMessage(copy, [copy.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletBlobUrl = URL.createObjectURL(blob);
        await audioCtx.audioWorklet.addModule(workletBlobUrl);
        URL.revokeObjectURL(workletBlobUrl);

        if (isCancelled) {
          audioCtx.close().catch(() => {});
          return;
        }

        const source = audioCtx.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioCtx, 'pcm-capture-processor');

        // Route worklet into a silent MediaStreamDestination to keep the audio graph active
        // WITHOUT connecting to audioCtx.destination (which routes to physical speakers/earphones)
        const dummyDest = audioCtx.createMediaStreamDestination();
        source.connect(workletNode);
        workletNode.connect(dummyDest);

        setStatus('listening');

        workletNode.port.onmessage = (event) => {
          const chunk = event.data;
          if (!chunk || !(chunk instanceof Float32Array)) return;

          // Calculate RMS energy of current audio quantum
          let sum = 0;
          for (let i = 0; i < chunk.length; i++) {
            sum += chunk[i] * chunk[i];
          }
          const chunkRms = Math.sqrt(sum / chunk.length);
          // Smoothed exponential moving average to filter out brief clicks/transients
          smoothedRmsRef.current = smoothedRmsRef.current * 0.7 + chunkRms * 0.3;
          const isVocalEnergy = smoothedRmsRef.current > RMS_SPEECH_THRESHOLD;
          const now = Date.now();

          if (isVocalEnergy) {
            if (!isSpeakingRef.current) {
              isSpeakingRef.current = true;
              // Prepend pre-roll buffer so the initial consonant is preserved
              if (preRollChunksRef.current.length > 0) {
                chunksRef.current.push(...preRollChunksRef.current);
                preRollChunksRef.current = [];
              }
            }

            lastSpeechTimeRef.current = now;
            chunksRef.current.push(chunk);

            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }

            // Periodic interim transcription only for extended speech (> 1.4s)
            const totalSamples = chunksRef.current.reduce((acc, c) => acc + c.length, 0);
            if (
              now - lastInterimTimeRef.current >= INTERIM_INTERVAL_MS &&
              totalSamples >= 16000 * 1.0 &&
              workerRef.current
            ) {
              lastInterimTimeRef.current = now;
              const snapshot = mergeChunks(chunksRef.current);
              workerRef.current.postMessage({
                type: 'transcribe',
                audio: snapshot,
                isFinal: false,
                segmentId: segmentIdRef.current,
              });
            }

            // Cap continuous utterance length to prevent memory bloat
            if (totalSamples >= 16000 * MAX_UTTERANCE_DURATION_SEC) {
              commitUtterance();
            }
          } else {
            // Below speech threshold
            if (isSpeakingRef.current) {
              // During trailing pause, continue capturing so word endings are preserved
              chunksRef.current.push(chunk);

              if (!silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                  commitUtterance();
                }, SILENCE_TIMEOUT_MS);
              }
            } else {
              // Idle background: maintain circular pre-roll buffer (~64ms)
              preRollChunksRef.current.push(chunk);
              if (preRollChunksRef.current.length > MAX_PRE_ROLL_CHUNKS) {
                preRollChunksRef.current.shift();
              }
            }
          }
        };
      } catch (err) {
        console.error('[useSpeechToText] Failed to initialize audio pipeline:', err);
        setError(err.message);
        setStatus('error');
      }
    };

    startAudioPipeline();

    return () => {
      isCancelled = true;
      stopAudioPipeline();
    };
  }, [enabled, stream, commitUtterance, mergeChunks]);

  return {
    status,
    loadProgress,
    interimText,
    error,
    isListening: status === 'listening',
  };
}
