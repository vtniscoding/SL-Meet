import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getOrCreateMediaPipeHands,
  subscribeMediaPipeResults,
  classifyGesture,
  HandMotionCameraTracker,
} from '@sl-meet/shared';

const isVirtualCamera = (label = '') => {
  const l = (label || '').toLowerCase();
  return l.includes('obs') || l.includes('virtual') || l.includes('manycam') || l.includes('vmix');
};

export function useTrainingCamera({
  activeTab,
  gesturesCount = 0,
  loadAllData,
  setStatusMsg,
  pushGesture,
  notifyHandReset,
  onCaptureFrame,
}) {
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(
    () => localStorage.getItem('sl_meet_selected_camera_id') || ''
  );
  // Default camera state: explicitly OFF on window startup
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [autoFollowZoom, setAutoFollowZoom] = useState(true);
  const [stageTelemetry, setStageTelemetry] = useState({ handCount: 0, zoomFactor: 1.0 });

  const [liveDetection, setLiveDetection] = useState({
    gesture: '',
    confidence: 0,
    topCandidates: [],
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stageContainerRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const motionTrackerRef = useRef(new HandMotionCameraTracker());

  const latestTrackingPayloadRef = useRef(null);
  const mpRafIdRef = useRef(null);
  const renderRafIdRef = useRef(null);
  const isProcessingFrameRef = useRef(false);
  const cameraActiveRef = useRef(false);
  const unsubscribeMpRef = useRef(null);

  // Enumerate video devices and smartly prioritize physical webcams over OBS
  const refreshVideoDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setVideoDevices(videoInputs);

      setSelectedCameraId((currentSelected) => {
        const physicalWithLabel = videoInputs.filter(
          (d) => d.label && !isVirtualCamera(d.label)
        );
        const currentDevice = videoInputs.find((d) => d.deviceId === currentSelected);

        if (currentDevice && isVirtualCamera(currentDevice.label) && physicalWithLabel.length > 0) {
          const chosenPhysical = physicalWithLabel[0].deviceId;
          try {
            localStorage.setItem('sl_meet_selected_camera_id', chosenPhysical);
          } catch (e) {}
          return chosenPhysical;
        }

        if (currentDevice && !isVirtualCamera(currentDevice.label)) {
          return currentSelected;
        }

        const chosen = physicalWithLabel[0] || videoInputs.find((d) => !isVirtualCamera(d.label)) || videoInputs[0];
        const chosenId = chosen ? chosen.deviceId : '';
        if (chosenId && chosen?.label && !isVirtualCamera(chosen.label)) {
          try {
            localStorage.setItem('sl_meet_selected_camera_id', chosenId);
          } catch (e) {}
        }
        return chosenId;
      });

      return videoInputs;
    } catch (err) {
      console.warn('Failed to enumerate video devices:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    refreshVideoDevices();
    const handleDeviceChange = () => {
      refreshVideoDevices();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshVideoDevices]);

  useEffect(() => {
    motionTrackerRef.current.setAutoFollow(autoFollowZoom);
  }, [autoFollowZoom]);

  // Safe Camera & Singleton MediaPipe Teardown
  const stopCamera = useCallback((releaseHardware = true) => {
    cameraActiveRef.current = false;

    if (mpRafIdRef.current) {
      cancelAnimationFrame(mpRafIdRef.current);
      mpRafIdRef.current = null;
    }
    if (renderRafIdRef.current) {
      cancelAnimationFrame(renderRafIdRef.current);
      renderRafIdRef.current = null;
    }

    if (unsubscribeMpRef.current) {
      unsubscribeMpRef.current();
      unsubscribeMpRef.current = null;
    }
    isProcessingFrameRef.current = false;
    latestTrackingPayloadRef.current = null;
    motionTrackerRef.current.reset();

    if (releaseHardware) {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
      setCameraStream(null);
    }

    setCameraActive(false);
    setLiveDetection({ gesture: '', confidence: 0, topCandidates: [] });
    setStageTelemetry({ handCount: 0, zoomFactor: 1.0 });
  }, []);

  // Dynamic DPR Canvas ResizeObserver for crisp 60 FPS Studio Stage rendering
  useEffect(() => {
    if (!cameraActive || (activeTab !== 'training' && activeTab !== 'gestures')) return;
    const container = stageContainerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const syncCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextW = Math.max(320, Math.round(rect.width * dpr));
      const nextH = Math.max(240, Math.round(rect.height * dpr));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
    };

    syncCanvasSize();
    const observer = new ResizeObserver(syncCanvasSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [cameraActive, activeTab]);

  // Start Camera with explicit/selected video device ID
  const startCamera = async (targetDeviceId = null) => {
    const deviceIdToUse = targetDeviceId || selectedCameraId;
    if (cameraActiveRef.current && cameraStreamRef.current && !targetDeviceId) return;
    if (gesturesCount === 0 && loadAllData) {
      await loadAllData();
    }

    try {
      if (targetDeviceId && cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      let stream = cameraStreamRef.current;
      if (!stream || !stream.active || stream.getVideoTracks().every((t) => t.readyState === 'ended')) {
        const videoConstraints = {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        };
        if (deviceIdToUse) {
          videoConstraints.deviceId = { exact: deviceIdToUse };
        }

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch (deviceErr) {
          console.warn('Failed with exact deviceId, falling back to default constraint:', deviceErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false,
          });
        }
      }

      cameraStreamRef.current = stream;
      setCameraStream(stream);

      const availableDevices = await refreshVideoDevices();
      const activeTrack = stream.getVideoTracks()[0];
      const activeLabel = (activeTrack?.label || '').toLowerCase();

      if (isVirtualCamera(activeLabel)) {
        const physical = availableDevices.find((d) => d.label && !isVirtualCamera(d.label));
        if (physical && physical.deviceId && physical.deviceId !== targetDeviceId) {
          console.log('Deprioritizing virtual camera ("' + activeTrack?.label + '"), auto-switching to physical webcam ("' + physical.label + '")');
          stream.getTracks().forEach((t) => t.stop());
          cameraStreamRef.current = null;
          return startCamera(physical.deviceId);
        }
      }

      if (!videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      videoRef.current.srcObject = stream;

      await new Promise((resolve) => {
        const v = videoRef.current;
        if (!v) return resolve();
        if (v.readyState >= 2 && v.videoWidth > 0) {
          resolve();
        } else {
          const onLoaded = () => {
            v.removeEventListener('loadeddata', onLoaded);
            resolve();
          };
          v.addEventListener('loadeddata', onLoaded);
          setTimeout(resolve, 800);
        }
      });

      await videoRef.current.play().catch((err) => console.warn('Studio video play warning:', err));

      cameraActiveRef.current = true;
      setIsCameraOff(false);
      motionTrackerRef.current.reset();
      motionTrackerRef.current.setAutoFollow(autoFollowZoom);
      setCameraActive(true);
      setStatusMsg?.('Camera active. Press [Space] or click Record to capture a sample.');

      const hands = getOrCreateMediaPipeHands();
      if (unsubscribeMpRef.current) {
        unsubscribeMpRef.current();
      }
      unsubscribeMpRef.current = subscribeMediaPipeResults((results) => {
        latestTrackingPayloadRef.current = {
          results,
          updatedAt: Date.now(),
        };

        const hasHands = Boolean(
          results.multiHandLandmarks && results.multiHandLandmarks.length > 0
        );
        const classification = classifyGesture(
          hasHands ? results.multiHandLandmarks[0] : null,
          hasHands && results.multiHandedness ? results.multiHandedness[0] : null,
          results.multiHandLandmarks || [],
          results.multiHandedness || []
        );

        if (hasHands || classification.gesture) {
          setLiveDetection(classification);

          if (classification.gesture && classification.gesture !== 'Signing...') {
            pushGesture?.('Admin Studio', classification.gesture, classification.confidence, {
              mode: classification.mode,
            });
          }

          onCaptureFrame?.({
            hasHands,
            classification,
            multiHandLandmarks: results.multiHandLandmarks,
          });
        } else {
          setLiveDetection({ gesture: '', confidence: 0, topCandidates: [] });
          notifyHandReset?.();
        }
      });

      // 1. 60 FPS Visual Render Loop
      let frameTick = 0;
      const renderStageLoop = () => {
        if (!cameraActiveRef.current) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (canvas && video) {
          const ctx = canvas.getContext('2d');
          const telemetry = motionTrackerRef.current.renderFrame(
            ctx,
            video,
            latestTrackingPayloadRef.current
          );
          frameTick += 1;
          if (frameTick % 10 === 0) {
            setStageTelemetry({
              handCount: telemetry.handCount,
              zoomFactor: telemetry.zoomFactor,
            });
          }
        }
        renderRafIdRef.current = requestAnimationFrame(renderStageLoop);
      };
      renderRafIdRef.current = requestAnimationFrame(renderStageLoop);

      // 2. Non-overlapping MediaPipe Inference Frame Pump
      const processMediaPipeLoop = async () => {
        if (!cameraActiveRef.current) return;
        const video = videoRef.current;
        if (
          video &&
          video.readyState >= 2 &&
          hands &&
          !isProcessingFrameRef.current
        ) {
          isProcessingFrameRef.current = true;
          try {
            await hands.send({ image: video });
          } catch (err) {
            // Ignore transient frame errors during camera warm-up
          } finally {
            isProcessingFrameRef.current = false;
          }
        }
        if (cameraActiveRef.current) {
          mpRafIdRef.current = requestAnimationFrame(processMediaPipeLoop);
        }
      };
      mpRafIdRef.current = requestAnimationFrame(processMediaPipeLoop);
    } catch (err) {
      console.error('Camera access denied:', err);
      setStatusMsg?.('Camera access denied. Please check device permissions.');
    }
  };

  const handleChangeCamera = useCallback(async (newDeviceId) => {
    setSelectedCameraId(newDeviceId);
    try {
      localStorage.setItem('sl_meet_selected_camera_id', newDeviceId);
    } catch (e) {}

    if (cameraActiveRef.current) {
      stopCamera(true);
      await startCamera(newDeviceId);
    }
  }, [stopCamera]);

  const handleToggleCamera = useCallback(() => {
    if (cameraActive) {
      setIsCameraOff(true);
      stopCamera(true);
      setStatusMsg?.('Camera turned off.');
    } else {
      setIsCameraOff(false);
      startCamera(selectedCameraId);
    }
  }, [cameraActive, stopCamera, selectedCameraId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCamera(true);
    };
  }, [stopCamera]);

  return {
    videoDevices,
    selectedCameraId,
    isCameraOff,
    cameraActive,
    setCameraActive,
    cameraStream,
    setCameraStream,
    cameraStreamRef,
    autoFollowZoom,
    setAutoFollowZoom,
    stageTelemetry,
    liveDetection,
    videoRef,
    canvasRef,
    stageContainerRef,
    cameraActiveRef,
    refreshVideoDevices,
    startCamera,
    stopCamera,
    handleChangeCamera,
    handleToggleCamera,
  };
}
