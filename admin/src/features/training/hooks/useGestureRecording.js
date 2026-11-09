import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  normalizeMultiHandLandmarks,
  summarizeStaticCapture,
  checkDatasetConflict,
  extractDynamicFrame,
  buildDynamicSequence,
  DTW_KEYFRAMES,
  MIN_DYNAMIC_MOTION_AMPLITUDE,
  FEATURE_FLAGS,
} from '@sl-meet/shared';

const PREROLL_SECONDS = 3;
const CAPTURE_SECONDS = 3;

export function useGestureRecording({
  cameraActive,
  cameraActiveRef,
  isAuthenticated,
  activeTab,
  gesturesList,
  setStatusMsg,
}) {
  const [gestureName, setGestureName] = useState('');
  const [recordingMode, setRecordingMode] = useState('static'); // 'static' | 'dynamic'
  const [recordingPhase, setRecordingPhase] = useState('idle'); // 'idle' | 'preroll' | 'capturing'
  const [countdown, setCountdown] = useState(PREROLL_SECONDS);
  const [capturedPayload, setCapturedPayload] = useState(null);

  const recordingPhaseRef = useRef('idle');
  const recordingModeRef = useRef('static');
  const staticFramesRef = useRef([]);
  const dynamicFramesRef = useRef([]);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    recordingPhaseRef.current = recordingPhase;
  }, [recordingPhase]);

  useEffect(() => {
    recordingModeRef.current = recordingMode;
  }, [recordingMode]);

  // Reactive Pre-Save Dataset Conflict Check
  const conflictInfo = useMemo(() => {
    if (!capturedPayload?.vector) return null;
    return checkDatasetConflict(capturedPayload.vector, gestureName, capturedPayload.mode);
  }, [capturedPayload, gestureName, gesturesList]);

  // Cancel any active pre-roll or capture timer
  const cancelRecordingSession = useCallback((customMsg = 'Recording cancelled.') => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    staticFramesRef.current = [];
    dynamicFramesRef.current = [];
    setRecordingPhase('idle');
    if (customMsg) setStatusMsg?.(customMsg);
  }, [setStatusMsg]);

  // Finalize Capture Buffer -> Outlier Rejection (Static) or 24-Keyframe DTW Sequence (Dynamic)
  const finalizeCaptureSession = useCallback(() => {
    const mode = recordingModeRef.current;

    if (mode === 'dynamic') {
      const rawDyn = dynamicFramesRef.current;
      const built = buildDynamicSequence(rawDyn, DTW_KEYFRAMES);

      if (!built) {
        setStatusMsg?.(
          'Too few hand frames captured for Dynamic DTW sign. Keep hand(s) clearly visible during the 3s movement!'
        );
        return;
      }

      if (built.motionAmplitude < MIN_DYNAMIC_MOTION_AMPLITUDE) {
        setStatusMsg?.(
          `Motion amplitude too low (${built.motionAmplitude} < ${MIN_DYNAMIC_MOTION_AMPLITUDE}). Move your hand/wrist through the trajectory, or switch to Static Pose mode!`
        );
        return;
      }

      setCapturedPayload({
        mode: 'dynamic',
        vector: built.sequence,
        dimension: built.featureDim,
        featureVersion: built.featureVersion || 1,
        faceCoveragePct: built.faceCoveragePct ?? 0,
        dominantZone: built.dominantZone || null,
        meanIndexUV: built.meanIndexUV || null,
        sequenceLength: built.sequence.length,
        keptFrames: built.keptFrames,
        qualityScore: built.qualityScore,
        motionAmplitude: built.motionAmplitude,
        handCount: built.handCount,
      });

      const faceWarn =
        FEATURE_FLAGS.FEATURE_FACE && (built.faceCoveragePct ?? 0) < 60
          ? ` • Warning: Low face coverage (${built.faceCoveragePct}%)`
          : '';
      const zoneSuffix = built.dominantZone
        ? ` • Zone: ${built.dominantZone.toUpperCase()}`
        : '';

      setStatusMsg?.(
        `Captured Dynamic DTW sequence! (${built.sequence.length}×${built.featureDim}D keyframes ${built.hasFace ? '(v2 Face)' : '(v1)'}${zoneSuffix} from ${built.keptFrames} active frames • Quality ${built.qualityScore}%${faceWarn})`
      );
      return;
    }

    // Static Pose Mode (with 15% outlier rejection)
    const summary = summarizeStaticCapture(staticFramesRef.current);
    if (!summary) {
      setStatusMsg?.('No steady hand landmarks detected during recording. Please try again.');
      return;
    }

    const handCount = summary.dimension === 126 ? 2 : 1;
    setCapturedPayload({
      mode: 'static',
      vector: summary.vector,
      dimension: summary.dimension,
      sequenceLength: 1,
      keptFrames: summary.keptFrames,
      totalFrames: summary.totalFrames,
      qualityScore: summary.stabilityScore,
      handCount,
    });

    const modeDesc =
      handCount === 2 ? 'Unified 2-Hand 126D' : 'Single-Hand 63D';
    setStatusMsg?.(
      `Captured ${modeDesc} pose! (Kept ${summary.keptFrames}/${summary.totalFrames} clean frames • Stability ${summary.stabilityScore}%)`
    );
  }, [setStatusMsg]);

  // Frame Accumulation Handler during active capturing
  const handleCaptureFrame = useCallback(({ hasHands, classification, multiHandLandmarks }) => {
    if (hasHands && recordingPhaseRef.current === 'capturing') {
      const smoothedHands =
        classification.smoothedLandmarks || multiHandLandmarks;

      if (recordingModeRef.current === 'dynamic') {
        const dynFrame = extractDynamicFrame(
          smoothedHands,
          normalizeMultiHandLandmarks,
          classification?.activeFaceFrame
        );
        if (dynFrame) {
          dynamicFramesRef.current.push(dynFrame);
        }
      } else if (!classification.isFastTransition) {
        const normVec = normalizeMultiHandLandmarks(smoothedHands);
        if (normVec) {
          staticFramesRef.current.push(normVec);
        }
      }
    }
  }, []);

  // Smart Pre-Roll (3-2-1) -> Active Capture (3s) Pipeline
  const handleStartSmartRecording = useCallback(() => {
    if (!cameraActiveRef?.current && !cameraActive) {
      setStatusMsg?.('Please start the camera first!');
      return;
    }

    if (recordingPhaseRef.current !== 'idle') {
      cancelRecordingSession('Recording aborted.');
      return;
    }

    setCapturedPayload(null);
    staticFramesRef.current = [];
    dynamicFramesRef.current = [];

    let phase = 'preroll';
    let sec = PREROLL_SECONDS;
    setRecordingPhase('preroll');
    setCountdown(sec);
    setStatusMsg?.(
      `Get ready (${sec}s)... Raise your hand(s) into starting position!`
    );

    recordingTimerRef.current = setInterval(() => {
      sec -= 1;

      if (phase === 'preroll') {
        if (sec > 0) {
          setCountdown(sec);
          setStatusMsg?.(
            `Get ready (${sec}s)... Raise your hand(s) into starting position!`
          );
        } else {
          phase = 'capturing';
          sec = CAPTURE_SECONDS;
          staticFramesRef.current = [];
          dynamicFramesRef.current = [];
          setRecordingPhase('capturing');
          setCountdown(sec);
          setStatusMsg?.(
            recordingModeRef.current === 'dynamic'
              ? 'Perform continuous motion gesture smoothly now!'
              : 'Hold static hand pose steadily in front of camera!'
          );
        }
      } else if (phase === 'capturing') {
        if (sec > 0) {
          setCountdown(sec);
        } else {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
          setRecordingPhase('idle');
          finalizeCaptureSession();
        }
      }
    }, 1000);
  }, [cameraActive, cameraActiveRef, cancelRecordingSession, finalizeCaptureSession, setStatusMsg]);

  // Hands-Free Spacebar Shortcut
  useEffect(() => {
    if (
      !isAuthenticated ||
      (activeTab !== 'gestures' && activeTab !== 'training') ||
      !cameraActive
    ) {
      return;
    }

    const onKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      const activeTag = document.activeElement?.tagName;
      if (
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        activeTag === 'SELECT' ||
        document.activeElement?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      handleStartSmartRecording();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAuthenticated, activeTab, cameraActive, handleStartSmartRecording]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  return {
    gestureName,
    setGestureName,
    recordingMode,
    setRecordingMode,
    recordingPhase,
    countdown,
    capturedPayload,
    setCapturedPayload,
    conflictInfo,
    isBusyRecording: recordingPhase !== 'idle',
    handleStartSmartRecording,
    cancelRecordingSession,
    handleCaptureFrame,
  };
}

