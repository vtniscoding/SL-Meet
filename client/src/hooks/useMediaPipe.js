import { useEffect, useRef, useState, useCallback } from 'react';
import { createMediaPipeHandsInstance, drawHandResults, classifyGesture } from '../services/mediapipe';

export function useMediaPipe() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsInstanceRef = useRef(null);
  const animFrameIdRef = useRef(null);

  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeGesture, setActiveGesture] = useState({ gesture: 'Waiting for hands...', confidence: 0 });
  const [fps, setFps] = useState(0);
  const [detectedCount, setDetectedCount] = useState(0);
  const [handSide, setHandSide] = useState('N/A');

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  const processVideoFrame = useCallback(async () => {
    if (
      videoRef.current &&
      videoRef.current.readyState >= 2 &&
      handsInstanceRef.current &&
      isProcessing
    ) {
      try {
        await handsInstanceRef.current.send({ image: videoRef.current });
      } catch (err) {
        console.error('MediaPipe processing error:', err);
      }
    }

    if (isProcessing) {
      animFrameIdRef.current = requestAnimationFrame(processVideoFrame);
    }
  }, [isProcessing]);

  useEffect(() => {
    const onResults = (results) => {
      // Draw canvas landmarks
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          drawHandResults(ctx, results);
        }
      }

      // FPS Calculation
      frameCountRef.current += 1;
      const now = performance.now();
      if (now - lastTimeRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current)));
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      // Classification & Hand status
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setDetectedCount(results.multiHandLandmarks.length);
        
        if (results.multiHandedness && results.multiHandedness.length > 0) {
          setHandSide(results.multiHandedness.map(h => h.label).join(', '));
        }

        const primaryHand = results.multiHandLandmarks[0];
        const gestureResult = classifyGesture(primaryHand);
        setActiveGesture(gestureResult);
      } else {
        setDetectedCount(0);
        setHandSide('N/A');
        setActiveGesture({ gesture: 'No Hands Detected', confidence: 0 });
      }
    };

    const hands = createMediaPipeHandsInstance(onResults);
    handsInstanceRef.current = hands;
    setIsReady(true);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      hands.close();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setIsProcessing(true);
        };
      }
    } catch (err) {
      console.error('Failed to start camera:', err);
      alert('Camera access denied or unavailable: ' + err.message);
    }
  };

  const stopCamera = () => {
    setIsProcessing(false);
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  useEffect(() => {
    if (isProcessing) {
      animFrameIdRef.current = requestAnimationFrame(processVideoFrame);
    }
  }, [isProcessing, processVideoFrame]);

  return {
    videoRef,
    canvasRef,
    isReady,
    isProcessing,
    activeGesture,
    fps,
    detectedCount,
    handSide,
    startCamera,
    stopCamera,
  };
}
