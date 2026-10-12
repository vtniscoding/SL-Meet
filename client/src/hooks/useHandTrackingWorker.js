import { useEffect, useRef, useCallback } from 'react';
import {
  createMediaPipeHandsInstance,
  drawHandResults,
  classifyGesture,
} from '../services/mediapipe';

/**
 * Custom Hook: useHandTrackingWorker
 * 
 * Persistent background worker hook for MediaPipe Hand Tracking at the room session level.
 * Decouples AI vision & gesture classification from UI tile lifecycles, layout modes, and pin actions.
 * 
 * @param {Object} params
 * @param {MediaStream|null} params.localStream - Active user camera MediaStream
 * @param {boolean} params.isEnabled - AI Vision toggle state (from control bar)
 * @param {boolean} params.isCameraOff - Local camera mute state
 * @param {Function} params.onGestureDetected - Handler for detected gesture or null (reset)
 * @returns {Object} { registerCanvas }
 */
export function useHandTrackingWorker({
  localStream,
  isEnabled,
  isCameraOff,
  onGestureDetected,
}) {
  const hiddenVideoRef = useRef(null);
  const activeCanvasRef = useRef(null);
  const handsInstanceRef = useRef(null);
  const isReadyRef = useRef(false);
  const isProcessingFrameRef = useRef(false);
  const animFrameIdRef = useRef(null);

  const isEnabledRef = useRef(isEnabled);
  const isCameraOffRef = useRef(isCameraOff);
  const onGestureDetectedRef = useRef(onGestureDetected);

  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);

  useEffect(() => {
    isCameraOffRef.current = isCameraOff;
  }, [isCameraOff]);

  useEffect(() => {
    onGestureDetectedRef.current = onGestureDetected;
  }, [onGestureDetected]);

  // 1. Create and manage dedicated offscreen HTMLVideoElement
  useEffect(() => {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.position = 'fixed';
    video.style.top = '-9999px';
    video.style.left = '-9999px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.width = '640px';
    video.style.height = '480px';
    document.body.appendChild(video);
    hiddenVideoRef.current = video;

    return () => {
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
      video.srcObject = null;
      hiddenVideoRef.current = null;
    };
  }, []);

  // 2. Attach localStream to offscreen video element
  useEffect(() => {
    const video = hiddenVideoRef.current;
    if (!video) return;

    if (localStream && !isCameraOff) {
      if (video.srcObject !== localStream) {
        video.srcObject = localStream;
      }
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [localStream, isCameraOff]);

  // 3. Initialize persistent MediaPipe Hands instance once per room session
  useEffect(() => {
    let isMounted = true;

    const handleResults = (results) => {
      if (!isMounted) return;

      // Draw hand landmarks to registered canvas (if currently mounted and enabled)
      const canvas = activeCanvasRef.current;
      if (canvas && isEnabledRef.current && !isCameraOffRef.current) {
        const video = hiddenVideoRef.current;
        if (video && video.videoWidth && video.videoHeight) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            drawHandResults(ctx, results);
          }
        }
      }

      // Gesture classification and notification
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const { gesture, confidence } = classifyGesture(
          results.multiHandLandmarks[0],
          results.multiHandedness?.[0],
          results.multiHandLandmarks,
          results.multiHandedness
        );
        if (gesture && gesture !== 'Signing...' && onGestureDetectedRef.current) {
          onGestureDetectedRef.current({ gesture, confidence });
        }
      } else {
        if (onGestureDetectedRef.current) {
          onGestureDetectedRef.current(null);
        }
      }
    };

    const initHands = async () => {
      try {
        const hands = createMediaPipeHandsInstance(handleResults);
        if (typeof hands.initialize === 'function') {
          try {
            await hands.initialize();
          } catch (initErr) {
            console.warn('[HandWorker] MediaPipe initialize non-fatal warning:', initErr);
          }
        }
        if (isMounted) {
          handsInstanceRef.current = hands;
          isReadyRef.current = true;
          checkStartLoop();
        }
      } catch (err) {
        console.error('[HandWorker] Failed to initialize MediaPipe Hands:', err);
      }
    };

    initHands();

    return () => {
      isMounted = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (handsInstanceRef.current) {
        try {
          handsInstanceRef.current.close();
        } catch (e) {}
        handsInstanceRef.current = null;
      }
      isReadyRef.current = false;
    };
  }, []);

  // 4. Animation frame processing loop (only runs when enabled && camera active && ready)
  const checkStartLoop = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    if (!isEnabled || isCameraOff || !isReadyRef.current) {
      // Clear canvas if paused
      if (activeCanvasRef.current) {
        const ctx = activeCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, activeCanvasRef.current.width, activeCanvasRef.current.height);
        }
      }
      return;
    }

    const processFrame = async () => {
      if (!isEnabledRef.current || isCameraOffRef.current) {
        return;
      }

      const video = hiddenVideoRef.current;
      const hands = handsInstanceRef.current;

      if (
        video &&
        video.readyState >= 2 &&
        !video.paused &&
        !video.ended &&
        hands &&
        isReadyRef.current &&
        !isProcessingFrameRef.current
      ) {
        isProcessingFrameRef.current = true;
        try {
          await hands.send({ image: video });
        } catch (err) {
          // Drop frame cleanly on transient pipeline hiccup
        } finally {
          isProcessingFrameRef.current = false;
        }
      }

      if (isEnabledRef.current && !isCameraOffRef.current) {
        animFrameIdRef.current = requestAnimationFrame(processFrame);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(processFrame);
  }, [isEnabled, isCameraOff]);

  useEffect(() => {
    checkStartLoop();
    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [checkStartLoop]);

  // 5. Canvas Registration: called by MeetingVideoTile when mounted or layout changes
  const registerCanvas = useCallback((canvasEl) => {
    activeCanvasRef.current = canvasEl;
    if (canvasEl && (!isEnabledRef.current || isCameraOffRef.current)) {
      const ctx = canvasEl.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      }
    }
  }, []);

  return {
    registerCanvas,
  };
}
