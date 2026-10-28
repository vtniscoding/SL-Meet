import { useState, useEffect, useRef } from 'react';

/**
 * Custom Hook: Real-Time Audio Activity Detection for WebRTC Remote Peers
 * ----------------------------------------------------------------------
 * Inspects incoming peerStreams using a shared AudioContext and AnalyserNode
 * with hangover smoothing (350ms) to detect active speakers with zero latency
 * and no flickering.
 */
export function usePeerAudioActivity(peerStreams = {}) {
  const [speakingPeers, setSpeakingPeers] = useState({});
  const activeStreamsRef = useRef({});
  const audioCtxRef = useRef(null);
  const animIdRef = useRef(null);

  useEffect(() => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioCtx();
    }
    const audioCtx = audioCtxRef.current;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const peerIds = Object.keys(peerStreams || {});
    const currentActive = activeStreamsRef.current;

    // 1. Clean up nodes for peers that disconnected or removed streams
    Object.keys(currentActive).forEach((peerId) => {
      if (!peerStreams || !peerStreams[peerId]) {
        try {
          currentActive[peerId].source.disconnect();
          currentActive[peerId].analyser.disconnect();
        } catch (e) {}
        delete currentActive[peerId];
      }
    });

    // 2. Set up AnalyserNode for each peerStream with an active audio track
    peerIds.forEach((peerId) => {
      const stream = peerStreams[peerId];
      if (!stream) return;

      const audioTrack = stream.getAudioTracks?.()[0];
      const hasAudio = audioTrack && audioTrack.enabled && audioTrack.readyState === 'live';

      if (!hasAudio) {
        if (currentActive[peerId]) {
          try {
            currentActive[peerId].source.disconnect();
            currentActive[peerId].analyser.disconnect();
          } catch (e) {}
          delete currentActive[peerId];
        }
        return;
      }

      // If stream changed or node not yet created
      if (!currentActive[peerId] || currentActive[peerId].streamId !== stream.id) {
        if (currentActive[peerId]) {
          try {
            currentActive[peerId].source.disconnect();
            currentActive[peerId].analyser.disconnect();
          } catch (e) {}
        }

        try {
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.4;
          source.connect(analyser);

          currentActive[peerId] = {
            streamId: stream.id,
            source,
            analyser,
            dataArray: new Uint8Array(analyser.frequencyBinCount),
            isSpeaking: false,
            lastSpokenTime: 0,
          };
        } catch (err) {
          console.warn(`[usePeerAudioActivity] Failed to attach audio analyser for peer ${peerId}:`, err);
        }
      }
    });

    // 3. Audio Activity Polling Loop with Hangover Smoothing
    const SILENCE_HOLD_MS = 350;
    const VOLUME_THRESHOLD = 10;

    let isRunning = true;
    const checkAudioLevels = () => {
      if (!isRunning) return;

      const now = Date.now();
      let hasStateChanges = false;
      const nextSpeaking = {};

      Object.entries(currentActive).forEach(([peerId, entry]) => {
        entry.analyser.getByteFrequencyData(entry.dataArray);
        let sum = 0;
        const len = entry.dataArray.length;
        for (let i = 0; i < len; i++) {
          sum += entry.dataArray[i];
        }
        const avg = sum / len;

        let speaking = entry.isSpeaking;
        if (avg > VOLUME_THRESHOLD) {
          entry.lastSpokenTime = now;
          if (!speaking) {
            speaking = true;
            hasStateChanges = true;
          }
        } else if (speaking && now - entry.lastSpokenTime > SILENCE_HOLD_MS) {
          speaking = false;
          hasStateChanges = true;
        }

        entry.isSpeaking = speaking;
        if (speaking) {
          nextSpeaking[peerId] = true;
        }
      });

      if (hasStateChanges) {
        setSpeakingPeers((prev) => {
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(nextSpeaking);
          if (
            prevKeys.length === nextKeys.length &&
            prevKeys.every((k) => prev[k] === nextSpeaking[k])
          ) {
            return prev;
          }
          return nextSpeaking;
        });
      }

      animIdRef.current = requestAnimationFrame(checkAudioLevels);
    };

    animIdRef.current = requestAnimationFrame(checkAudioLevels);

    return () => {
      isRunning = false;
      if (animIdRef.current) {
        cancelAnimationFrame(animIdRef.current);
      }
    };
  }, [peerStreams]);

  // Clean up entire AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return speakingPeers;
}

export default usePeerAudioActivity;

