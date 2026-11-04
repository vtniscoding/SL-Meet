import { useEffect, useRef, useState } from 'react';
import { MicVAD } from '@ricky0123/vad-web';
import {
  getWhisperWorker,
  getWhisperStatus,
  subscribeWhisperWorker,
} from '../services/whisperWorkerManager';
import { STT_CONFIG } from '../config/sttConfig';
import { createMixedStream } from '../services/audioMix';
import { startAdaptiveEnergyVad } from './legacyEnergyVad';

/**
 * Custom Hook: useSpeechToText
 * Robust Speech-to-Text pipeline powered by:
 * - Silero neural VAD for human voice activity detection (discards fan/ambient noise)
 * - Multi-track audio mixing for WebRTC peer audio streams
 * - Adaptive energy VAD fallback if WASM/worklet fails
 * - Background Whisper Worker for offline zero-latency transcription
 * 
 * Signature preserved: useSpeechToText({ stream, enabled, onCaption })
 */
export function useSpeechToText({ stream, enabled = false, onCaption }) {
  const [status, setStatus] = useState(() => getWhisperStatus().status); // 'idle' | 'loading' | 'ready' | 'listening' | 'error'
  const [loadProgress, setLoadProgress] = useState(null);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState(null);

  const workerRef = useRef(null);
  const segmentIdRef = useRef(0);
  const onCaptionRef = useRef(onCaption);

  useEffect(() => {
    onCaptionRef.current = onCaption;
  }, [onCaption]);

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

  // Neural Voice Activity Detection (Silero VAD) Pipeline with Audio Mixing and Fallback
  useEffect(() => {
    let cancelled = false;
    let vad = null;
    let fallbackVad = null;
    let mixed = null;

    if (!enabled || !stream) {
      setInterimText('');
      return;
    }

    const tracks = stream.getAudioTracks().filter((t) => t.readyState === 'live');
    if (tracks.length === 0) {
      return;
    }

    (async () => {
      try {
        mixed = createMixedStream(tracks);

        vad = await MicVAD.new({
          getStream: async () => mixed.stream,
          pauseStream: async () => {}, // Guard: never allow VAD to stop the stream
          resumeStream: async (s) => s,
          positiveSpeechThreshold: STT_CONFIG.VAD_POSITIVE_SPEECH_THRESHOLD || 0.6,
          negativeSpeechThreshold: STT_CONFIG.VAD_NEGATIVE_SPEECH_THRESHOLD || 0.4,
          minSpeechMs: Math.round(STT_CONFIG.MIN_UTTERANCE_SEC * 1000),
          redemptionMs: 450,
          preSpeechPadMs: 200,
          baseAssetPath: './vad/',
          onnxWASMBasePath: './vad/',
          model: 'legacy',
          onSpeechEnd: (audio) => {
            const durationSec = audio.length / 16000;
            if (durationSec < STT_CONFIG.MIN_UTTERANCE_SEC) return;

            // Cap utterance length to prevent memory bloat if someone speaks continuously
            let processAudio = audio;
            if (durationSec > STT_CONFIG.MAX_UTTERANCE_SEC) {
              const maxSamples = Math.round(16000 * STT_CONFIG.MAX_UTTERANCE_SEC);
              processAudio = audio.slice(0, maxSamples);
            }

            segmentIdRef.current += 1;
            if (STT_CONFIG.DEBUG) {
              console.log(`[useSpeechToText] Silero VAD speech segment #${segmentIdRef.current}: ${durationSec.toFixed(2)}s (${processAudio.length} samples)`);
            }

            workerRef.current?.postMessage(
              {
                type: 'transcribe',
                audio: processAudio,
                isFinal: true,
                segmentId: segmentIdRef.current,
              },
              [processAudio.buffer] // Zero-copy transfer
            );
          },
        });

        if (cancelled) {
          try {
            vad.destroy();
          } catch {}
          mixed.dispose();
          return;
        }

        await vad.start();
        setStatus('listening');
      } catch (vadErr) {
        if (cancelled) return;
        console.warn('[useSpeechToText] Silero VAD init failed, engaging Adaptive Energy VAD fallback:', vadErr);

        try {
          fallbackVad = startAdaptiveEnergyVad({
            stream: mixed.stream,
            minSpeechSec: STT_CONFIG.MIN_UTTERANCE_SEC,
            maxSpeechSec: STT_CONFIG.MAX_UTTERANCE_SEC,
            debug: STT_CONFIG.DEBUG,
            onSpeechEnd: (audio) => {
              segmentIdRef.current += 1;
              workerRef.current?.postMessage(
                {
                  type: 'transcribe',
                  audio,
                  isFinal: true,
                  segmentId: segmentIdRef.current,
                },
                [audio.buffer]
              );
            },
          });
          setStatus('listening');
        } catch (fallbackErr) {
          console.error('[useSpeechToText] Both Silero VAD and Adaptive VAD failed:', fallbackErr);
          setError(fallbackErr.message);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        vad?.destroy?.();
      } catch {}
      try {
        fallbackVad?.destroy?.();
      } catch {}
      mixed?.dispose();
      setInterimText('');
    };
  }, [enabled, stream]);

  return {
    status,
    loadProgress,
    interimText,
    error,
    isListening: status === 'listening',
  };
}
