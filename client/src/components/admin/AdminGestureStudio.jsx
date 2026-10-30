import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  HardwareCameraIcon,
  VerifiedShieldIcon,
  DownloadTranscriptIcon,
  UploadBackupIcon,
  DeleteActionIcon,
  SuccessCheckIcon,
  RefreshIcon,
  KeySecretIcon,
  BackNavIcon,
  ForwardNavIcon,
  NetworkRadioIcon,
  EditActionIcon,
  SignGestureIcon,
  CaptionsIcon,
  AiTranslateIcon,
  ChatDrawerIcon,
  PlusActionIcon,
  SearchIcon,
  AlertWarningIcon,
  FocusTargetIcon,
  CloseIcon,
  KeyboardShortcutIcon,
  SystemHealthIcon,
} from '../../icons';
import {
  getOrCreateMediaPipeHands,
  setMediaPipeResultsCallback,
  classifyGesture,
  loadCustomDataset,
} from '../../services/mediapipe';
import {
  normalizeMultiHandLandmarks,
  initRealtimeDatasetSync,
  summarizeStaticCapture,
  checkDatasetConflict,
} from '../../services/gestureClassifier';
import {
  isDynamicSample,
  extractDynamicFrame,
  buildDynamicSequence,
  DTW_KEYFRAMES,
  MIN_DYNAMIC_MOTION_AMPLITUDE,
} from '../../services/dtwClassifier';
import { HandMotionCameraTracker } from '../../services/handMotionTracker';
import { useAslAggregator } from '../../hooks/useAslAggregator';
import {
  fetchPhrasesFromSupabase,
  initRealtimePhrasesSync,
  addPhraseRule,
  deletePhraseRule,
} from '../../services/aslTranslator';
import { supabase } from '../../utils/supabase';

const DEFAULT_SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
const PREROLL_SECONDS = 3;
const CAPTURE_SECONDS = 3;

/**
 * Helper to inspect sample modality & hand count consistently across legacy and DTW rows
 */
function getSampleDescriptor(sample) {
  if (isDynamicSample(sample)) {
    const featDim = sample.vector[0]?.length || 70;
    const seqLen = sample.vector.length;
    const isTwoHand = featDim >= 130 || sample.type === 'dynamic_two_hands';
    return {
      isDynamic: true,
      isTwoHand,
      badgeText: isTwoHand
        ? `Dynamic 2H • ${seqLen}×${featDim}D`
        : `Dynamic 1H • ${seqLen}×${featDim}D`,
      badgeClass: isTwoHand
        ? 'bg-sky-950/80 text-[#5CA0F2] border-[#5CA0F2]/40'
        : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/35',
    };
  }

  const dim = Array.isArray(sample?.vector) ? sample.vector.length : 0;
  const isTwoHand = dim >= 126 || sample?.type === 'two_hands';
  return {
    isDynamic: false,
    isTwoHand,
    badgeText: isTwoHand ? 'Unified 2-Hand 126D' : 'Single-Hand 63D',
    badgeClass: isTwoHand
      ? 'bg-purple-950/80 text-purple-300 border-purple-500/30'
      : 'bg-slate-800 text-slate-300 border-slate-700',
  };
}

/**
 * Isolated Standalone Admin Component: ASL Gesture Studio & Multi-Sign Phrase Builder
 * Directly synchronized with Supabase DB (`asl_gestures` and `asl_phrases`) via Realtime.
 *
 * Upgraded Capabilities:
 * 1. 60 FPS 2-Hand Motion Tracking Stage (`HandMotionCameraTracker`) with Auto-Follow Zoom & L/R Trails.
 * 2. Smart Recording Pipeline: 3-2-1 Pre-Roll, Hands-Free `Space` Hotkey, 15% Outlier Rejection & Conflict Check.
 * 3. Dual-Mode Classifier Training: Static Pose (k-NN 63D/126D) + Dynamic Motion Trajectory (Sakoe-Chiba DTW 24×70D/140D).
 * 4. Live Top-3 Distance Radar, Instant Roster Search/Filter, and JSON Backup Import/Export.
 */
export default function AdminGestureStudio({ onBackToApp }) {
  const [adminKey, setAdminKey] = useState(localStorage.getItem('sl_meet_admin_key') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  // Active Tab: 'gestures' | 'phrases'
  const [activeTab, setActiveTab] = useState('gestures');

  // Gestures & Recording State
  const [gesturesList, setGesturesList] = useState([]);
  const [gestureName, setGestureName] = useState('');
  const [recordingMode, setRecordingMode] = useState('static'); // 'static' | 'dynamic'
  const [recordingPhase, setRecordingPhase] = useState('idle'); // 'idle' | 'preroll' | 'capturing'
  const [countdown, setCountdown] = useState(PREROLL_SECONDS);
  const [capturedPayload, setCapturedPayload] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [autoFollowZoom, setAutoFollowZoom] = useState(true);
  const [stageTelemetry, setStageTelemetry] = useState({ handCount: 0, zoomFactor: 1.0 });

  // Roster Search & Filter State
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState('all'); // 'all' | 'static' | 'dynamic' | '1h' | '2h'

  // Multi-Sign Phrase Builder State (supports 2 or 3 signs)
  const [phrasesList, setPhrasesList] = useState([]);
  const [phraseSignCount, setPhraseSignCount] = useState(2);
  const [firstSignChoice, setFirstSignChoice] = useState('');
  const [secondSignChoice, setSecondSignChoice] = useState('');
  const [thirdSignChoice, setThirdSignChoice] = useState('');
  const [phraseTranslation, setPhraseTranslation] = useState('');
  const [phraseDesc, setPhraseDesc] = useState('');

  // Real-Time ASL Live Classification, Top-3 Radar & Subtitle State
  const [liveDetection, setLiveDetection] = useState({
    gesture: '',
    confidence: 0,
    topCandidates: [],
  });
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [showRadar, setShowRadar] = useState(true);
  const { currentSentence, pushGesture, clearTranscript, notifyHandReset } = useAslAggregator(
    2800,
    6,
    650,
    2200,
    1800
  );

  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Refs for Camera, 60 FPS Motion Tracker, MediaPipe Singleton & Recording Buffers
  const videoRef = useRef(null);
  const stageContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const importInputRef = useRef(null);

  const motionTrackerRef = useRef(new HandMotionCameraTracker());
  const latestTrackingPayloadRef = useRef(null);
  const mpRafIdRef = useRef(null);
  const renderRafIdRef = useRef(null);
  const isProcessingFrameRef = useRef(false);
  const cameraActiveRef = useRef(false);

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

  useEffect(() => {
    motionTrackerRef.current.setAutoFollow(autoFollowZoom);
  }, [autoFollowZoom]);

  // Group gestures by Label Name
  const groupedGestures = useMemo(() => {
    const map = {};
    gesturesList.forEach((g) => {
      const label = (g.name || 'Unlabeled').trim();
      if (!map[label]) map[label] = [];
      map[label].push(g);
    });
    return map;
  }, [gesturesList]);

  const existingLabels = useMemo(() => Object.keys(groupedGestures), [groupedGestures]);

  // Dataset modality counts for header & filter badges
  const datasetStats = useMemo(() => {
    let staticCount = 0;
    let dynamicCount = 0;
    let oneHandCount = 0;
    let twoHandCount = 0;

    for (const s of gesturesList) {
      const desc = getSampleDescriptor(s);
      if (desc.isDynamic) dynamicCount += 1;
      else staticCount += 1;

      if (desc.isTwoHand) twoHandCount += 1;
      else oneHandCount += 1;
    }

    return { staticCount, dynamicCount, oneHandCount, twoHandCount };
  }, [gesturesList]);

  // Filtered Roster Labels & Samples
  const filteredRosterEntries = useMemo(() => {
    const query = rosterSearch.trim().toLowerCase();
    const entries = [];

    for (const label of existingLabels) {
      if (query && !label.toLowerCase().includes(query)) continue;

      const allSamples = groupedGestures[label] || [];
      const matchingSamples = allSamples.filter((s) => {
        if (rosterFilter === 'all') return true;
        const desc = getSampleDescriptor(s);
        if (rosterFilter === 'static') return !desc.isDynamic;
        if (rosterFilter === 'dynamic') return desc.isDynamic;
        if (rosterFilter === '1h') return !desc.isTwoHand;
        if (rosterFilter === '2h') return desc.isTwoHand;
        return true;
      });

      if (matchingSamples.length > 0) {
        entries.push({ label, samples: matchingSamples, totalCount: allSamples.length });
      }
    }

    return entries;
  }, [existingLabels, groupedGestures, rosterSearch, rosterFilter]);

  // Reactive Pre-Save Dataset Conflict Check
  const conflictInfo = useMemo(() => {
    if (!capturedPayload?.vector) return null;
    return checkDatasetConflict(capturedPayload.vector, gestureName, capturedPayload.mode);
  }, [capturedPayload, gestureName, gesturesList]);

  // Authenticate Admin Secret Key
  const handleVerifyKey = async (keyToVerify = adminKey) => {
    setAuthError('');
    setLoading(true);
    try {
      const isDefaultKey = keyToVerify === 'sl_meet_admin_secret_2026';
      let serverOk = false;

      try {
        const res = await fetch(`${DEFAULT_SERVER_URL}/api/admin/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': keyToVerify,
          },
        });
        if (res.ok) serverOk = true;
      } catch (e) {
        // Fallback to local key validation if server is offline
      }

      if (serverOk || isDefaultKey) {
        setIsAuthenticated(true);
        localStorage.setItem('sl_meet_admin_key', keyToVerify);
        loadAllData();
      } else {
        setIsAuthenticated(false);
        setAuthError('Invalid Admin Secret Key.');
      }
    } catch (err) {
      setAuthError('Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminKey) {
      handleVerifyKey(adminKey);
    }
  }, []);

  // Load Gestures & Phrases from Supabase DB
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: gesturesData } = await supabase
        .from('asl_gestures')
        .select('*')
        .order('created_at', { ascending: false });

      if (Array.isArray(gesturesData)) {
        setGesturesList(gesturesData);
        loadCustomDataset(gesturesData);
      }

      const phrasesData = await fetchPhrasesFromSupabase();
      if (Array.isArray(phrasesData)) {
        setPhrasesList(phrasesData);
      }
    } catch (err) {
      console.error('Failed to load data from Supabase:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime Subscriptions for both tables
  useEffect(() => {
    if (!isAuthenticated) return;

    const gChannel = initRealtimeDatasetSync((updatedGestures) => {
      setGesturesList(updatedGestures);
    });

    const pChannel = initRealtimePhrasesSync((updatedPhrases) => {
      setPhrasesList(updatedPhrases);
    });

    return () => {
      if (gChannel?.unsubscribe) gChannel.unsubscribe();
      if (pChannel?.unsubscribe) pChannel.unsubscribe();
    };
  }, [isAuthenticated]);

  // Cancel any active pre-roll or capture timer
  const cancelRecordingSession = useCallback((customMsg = 'Recording cancelled.') => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    staticFramesRef.current = [];
    dynamicFramesRef.current = [];
    setRecordingPhase('idle');
    if (customMsg) setStatusMsg(customMsg);
  }, []);

  // Safe Camera & Singleton MediaPipe Teardown (NEVER calls .close() on global singleton)
  const stopCamera = useCallback(() => {
    cameraActiveRef.current = false;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingPhase('idle');

    if (mpRafIdRef.current) {
      cancelAnimationFrame(mpRafIdRef.current);
      mpRafIdRef.current = null;
    }
    if (renderRafIdRef.current) {
      cancelAnimationFrame(renderRafIdRef.current);
      renderRafIdRef.current = null;
    }

    setMediaPipeResultsCallback(null);
    isProcessingFrameRef.current = false;
    latestTrackingPayloadRef.current = null;
    motionTrackerRef.current.reset();

    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setLiveDetection({ gesture: '', confidence: 0, topCandidates: [] });
    setStageTelemetry({ handCount: 0, zoomFactor: 1.0 });
  }, []);

  // Ensure camera & listeners clean up on unmount or when switching tabs away if needed
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Dynamic DPR Canvas ResizeObserver for crisp 60 FPS Studio Stage rendering
  useEffect(() => {
    if (!cameraActive || activeTab !== 'gestures') return;
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

  // Start Camera, 60 FPS HandMotionCameraTracker Stage & Shared MediaPipe Singleton
  const startCamera = async () => {
    if (cameraActiveRef.current) return;
    if (gesturesList.length === 0) {
      await loadAllData();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });

      if (!videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});

      cameraActiveRef.current = true;
      motionTrackerRef.current.reset();
      motionTrackerRef.current.setAutoFollow(autoFollowZoom);
      setCameraActive(true);
      setStatusMsg('Studio Camera active. Press [Space] or click Record to capture a sample.');

      const hands = getOrCreateMediaPipeHands((results) => {
        latestTrackingPayloadRef.current = {
          results,
          updatedAt: Date.now(),
        };

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const classification = classifyGesture(
            results.multiHandLandmarks[0],
            results.multiHandedness ? results.multiHandedness[0] : null,
            results.multiHandLandmarks,
            results.multiHandedness
          );

          setLiveDetection(classification);

          if (classification.gesture && classification.gesture !== 'Signing...') {
            pushGesture('Admin Studio', classification.gesture, classification.confidence);
          }

          // Accumulate clean smoothed landmarks during active 'capturing' phase
          if (recordingPhaseRef.current === 'capturing') {
            const smoothedHands =
              classification.smoothedLandmarks || results.multiHandLandmarks;

            if (recordingModeRef.current === 'dynamic') {
              const dynFrame = extractDynamicFrame(smoothedHands, normalizeMultiHandLandmarks);
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
        } else {
          setLiveDetection({ gesture: '', confidence: 0, topCandidates: [] });
          notifyHandReset();
        }
      });

      // 1. 60 FPS Visual Render Loop (HandMotionCameraTracker Auto-Follow + Trails)
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
      setStatusMsg('Camera access denied. Please check device permissions.');
    }
  };

  // Finalize Capture Buffer -> Outlier Rejection (Static) or 24-Keyframe DTW Sequence (Dynamic)
  const finalizeCaptureSession = useCallback(() => {
    const mode = recordingModeRef.current;

    if (mode === 'dynamic') {
      const rawDyn = dynamicFramesRef.current;
      const built = buildDynamicSequence(rawDyn, DTW_KEYFRAMES);

      if (!built) {
        setStatusMsg(
          'Too few hand frames captured for Dynamic DTW sign. Keep hand(s) clearly visible during the 3s movement!'
        );
        return;
      }

      if (built.motionAmplitude < MIN_DYNAMIC_MOTION_AMPLITUDE) {
        setStatusMsg(
          `Motion amplitude too low (${built.motionAmplitude} < ${MIN_DYNAMIC_MOTION_AMPLITUDE}). Move your hand/wrist through the trajectory, or switch to Static Pose mode!`
        );
        return;
      }

      setCapturedPayload({
        mode: 'dynamic',
        vector: built.sequence,
        dimension: built.featureDim,
        sequenceLength: built.sequence.length,
        keptFrames: built.keptFrames,
        qualityScore: built.qualityScore,
        motionAmplitude: built.motionAmplitude,
        handCount: built.handCount,
      });

      setStatusMsg(
        `Captured Dynamic DTW sequence! (${built.sequence.length}×${built.featureDim}D keyframes from ${built.keptFrames} active frames • Quality ${built.qualityScore}%)`
      );
      return;
    }

    // Static Pose Mode (with 15% outlier rejection)
    const summary = summarizeStaticCapture(staticFramesRef.current);
    if (!summary) {
      setStatusMsg('No steady hand landmarks detected during recording. Please try again.');
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
    setStatusMsg(
      `Captured ${modeDesc} pose! (Kept ${summary.keptFrames}/${summary.totalFrames} clean frames • Stability ${summary.stabilityScore}%)`
    );
  }, []);

  // Smart Pre-Roll (3-2-1) -> Active Capture (3s) Pipeline
  const handleStartSmartRecording = useCallback(() => {
    if (!cameraActiveRef.current) {
      setStatusMsg('Please start the camera first!');
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
    setStatusMsg(
      `Get ready (${sec}s)... Raise your hand(s) into starting position!`
    );

    recordingTimerRef.current = setInterval(() => {
      sec -= 1;

      if (phase === 'preroll') {
        if (sec > 0) {
          setCountdown(sec);
          setStatusMsg(
            `Get ready (${sec}s)... Raise your hand(s) into starting position!`
          );
        } else {
          // Transition seamlessly into active frame capture
          phase = 'capturing';
          sec = CAPTURE_SECONDS;
          staticFramesRef.current = [];
          dynamicFramesRef.current = [];
          setRecordingPhase('capturing');
          setCountdown(sec);
          setStatusMsg(
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
  }, [cancelRecordingSession, finalizeCaptureSession]);

  // Hands-Free Spacebar Shortcut (Active only on Gestures tab when not typing in an input)
  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'gestures' || !cameraActive) return;

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

  // Save Gesture Sample (Static 1D or Dynamic 2D DTW) to Supabase DB `asl_gestures`
  const handleSaveSample = async () => {
    if (!gestureName.trim()) {
      setStatusMsg('Please enter or select a Gesture Label Name before saving!');
      return;
    }
    if (!capturedPayload?.vector) {
      setStatusMsg('Please record a gesture sample first!');
      return;
    }

    const isDynamic = capturedPayload.mode === 'dynamic';
    const isTwoHands = capturedPayload.handCount === 2;
    const labelTrimmed = gestureName.trim();
    const existingCount = (groupedGestures[labelTrimmed] || []).length;

    const rowType = isDynamic
      ? isTwoHands
        ? 'dynamic_two_hands'
        : 'dynamic_single_hand'
      : isTwoHands
      ? 'two_hands'
      : 'single_hand';

    const rowCategory = isDynamic
      ? 'dynamic_motion_sign'
      : isTwoHands
      ? 'two_hand_sign'
      : 'single_hand_sign';

    const descText = isDynamic
      ? `Dynamic DTW #${existingCount + 1} (${isTwoHands ? '2H' : '1H'} • ${capturedPayload.sequenceLength}×${capturedPayload.dimension}D • Q:${capturedPayload.qualityScore}%)`
      : `Variation #${existingCount + 1} (${isTwoHands ? '2 hands' : '1 hand'} • Q:${capturedPayload.qualityScore}%)`;

    setLoading(true);
    try {
      const { error } = await supabase.from('asl_gestures').insert({
        name: labelTrimmed,
        type: rowType,
        category: rowCategory,
        vector: capturedPayload.vector,
        description: descText,
        metadata: {
          is_dynamic: isDynamic,
          sequence_length: isDynamic ? capturedPayload.sequenceLength : 1,
          dimension: capturedPayload.dimension,
          unified_two_hands: isTwoHands,
          quality_score: capturedPayload.qualityScore,
          motion_amplitude: capturedPayload.motionAmplitude ?? null,
          recorded_at: new Date().toISOString(),
        },
      });

      if (!error) {
        setStatusMsg(
          `Saved ${isDynamic ? 'Dynamic DTW' : 'Static Pose'} sample #${existingCount + 1} for "${labelTrimmed}" & synced live!`
        );
        setCapturedPayload(null);
        await loadAllData();
      } else {
        setStatusMsg(`Failed to save to Supabase: ${error.message}`);
      }
    } catch (err) {
      setStatusMsg('Database connection error.');
    } finally {
      setLoading(false);
    }
  };

  // Delete single sample from Supabase DB
  const handleDeleteSample = async (id, labelName) => {
    if (!window.confirm(`Delete this sample variation for "${labelName}"?`)) return;

    try {
      const { error } = await supabase.from('asl_gestures').delete().eq('id', id);
      if (!error) {
        setStatusMsg(`Deleted sample variation for "${labelName}".`);
        loadAllData();
      } else {
        setStatusMsg(`Failed to delete: ${error.message}`);
      }
    } catch (err) {
      setStatusMsg('Database deletion error.');
    }
  };

  // Delete all samples for a label
  const handleDeleteLabelGroup = async (labelName) => {
    if (!window.confirm(`Delete ALL sample variations for gesture "${labelName}"?`)) return;

    try {
      const { error } = await supabase.from('asl_gestures').delete().eq('name', labelName);
      if (!error) {
        setStatusMsg(`Deleted gesture label "${labelName}" and all its samples.`);
        if (gestureName === labelName) setGestureName('');
        loadAllData();
      } else {
        setStatusMsg(`Failed to delete label: ${error.message}`);
      }
    } catch (err) {
      setStatusMsg('Database deletion error.');
    }
  };

  // Rename label in Supabase DB
  const handleRenameLabel = async (oldLabel) => {
    const newName = prompt(`Enter new label name for "${oldLabel}":`, oldLabel);
    if (!newName || !newName.trim() || newName.trim() === oldLabel) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('asl_gestures')
        .update({ name: newName.trim() })
        .eq('name', oldLabel);

      if (!error) {
        setStatusMsg(`Renamed gesture "${oldLabel}" to "${newName.trim()}" in Supabase!`);
        if (gestureName === oldLabel) setGestureName(newName.trim());
        loadAllData();
      } else {
        setStatusMsg(`Failed to rename: ${error.message}`);
      }
    } catch (err) {
      setStatusMsg('Database update error.');
    } finally {
      setLoading(false);
    }
  };

  // Save Phrase Rule (2 or 3 signs) to Supabase DB `asl_phrases`
  const handleSavePhraseRule = async () => {
    const signs =
      phraseSignCount === 3
        ? [firstSignChoice.trim(), secondSignChoice.trim(), thirdSignChoice.trim()]
        : [firstSignChoice.trim(), secondSignChoice.trim()];

    if (signs.some((s) => !s) || !phraseTranslation.trim()) {
      setStatusMsg(
        phraseSignCount === 3
          ? 'Vui lòng chọn đủ Ký hiệu 1, Ký hiệu 2, Ký hiệu 3 và nhập Bản dịch!'
          : 'Vui lòng chọn Ký hiệu 1, Ký hiệu 2 và nhập Bản dịch!'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await addPhraseRule(signs, phraseTranslation.trim(), phraseDesc.trim());

      if (res.success) {
        setStatusMsg(
          `Đã lưu quy tắc cụm từ "${phraseTranslation.trim()}" & đồng bộ thời gian thực!`
        );
        setFirstSignChoice('');
        setSecondSignChoice('');
        setThirdSignChoice('');
        setPhraseTranslation('');
        setPhraseDesc('');
        const updated = await fetchPhrasesFromSupabase();
        setPhrasesList(updated);
      } else {
        setStatusMsg(`Lỗi lưu quy tắc: ${res.message || res.error}`);
      }
    } catch (err) {
      setStatusMsg('Lỗi cập nhật cơ sở dữ liệu.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Phrase Rule from Supabase DB
  const handleDeletePhraseRule = async (id, translation) => {
    if (!window.confirm(`Delete compound phrase rule "${translation}"?`)) return;

    try {
      const res = await deletePhraseRule(id);
      if (res.success) {
        setStatusMsg('Deleted phrase rule.');
        const updated = await fetchPhrasesFromSupabase();
        setPhrasesList(updated);
      } else {
        setStatusMsg('Failed to delete phrase rule.');
      }
    } catch (err) {
      setStatusMsg('Error deleting phrase rule.');
    }
  };

  // Export Dataset & Phrases JSON Backup
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(
      {
        name: 'SL-Meet Exported Dataset (Static k-NN + Dynamic DTW)',
        version: '3.0',
        exportedAt: new Date().toISOString(),
        gestures: gesturesList,
        compoundPhrases: phrasesList,
      },
      null,
      2
    );
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sl-meet-dataset-db-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import Dataset & Phrases JSON Backup into Supabase (Non-Destructive Merge)
  const handleImportJson = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);

      const rawGestures = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.gestures)
        ? parsed.gestures
        : [];
      const rawPhrases = Array.isArray(parsed?.compoundPhrases)
        ? parsed.compoundPhrases
        : [];

      const validGestures = rawGestures.filter(
        (g) => g && typeof g.name === 'string' && g.name.trim() && Array.isArray(g.vector)
      );
      const validPhrases = rawPhrases.filter(
        (p) =>
          p &&
          Array.isArray(p.pattern) &&
          p.pattern.length >= 2 &&
          typeof p.translation === 'string' &&
          p.translation.trim()
      );

      if (validGestures.length === 0 && validPhrases.length === 0) {
        setStatusMsg('Invalid backup JSON: No valid gestures or phrase rules found.');
        return;
      }

      // Deduplicate against existing DB IDs & identical phrase patterns
      const existingIds = new Set(gesturesList.map((g) => g.id).filter(Boolean));
      const gesturesToInsert = validGestures
        .filter((g) => !g.id || !existingIds.has(g.id))
        .map((g) => ({
          name: g.name.trim(),
          type: g.type || (isDynamicSample(g) ? 'dynamic_single_hand' : 'single_hand'),
          category: g.category || (isDynamicSample(g) ? 'dynamic_motion_sign' : 'single_hand_sign'),
          vector: g.vector,
          description: g.description || `Imported from ${file.name}`,
          metadata: g.metadata || { imported_at: new Date().toISOString() },
        }));

      const existingPatternKeys = new Set(
        phrasesList.map((p) => (Array.isArray(p.pattern) ? p.pattern.join('||').toLowerCase() : ''))
      );
      const phrasesToInsert = validPhrases
        .filter((p) => !existingPatternKeys.has(p.pattern.join('||').toLowerCase()))
        .map((p) => ({
          pattern: p.pattern,
          translation: p.translation.trim(),
          description: p.description || '',
        }));

      if (gesturesToInsert.length === 0 && phrasesToInsert.length === 0) {
        setStatusMsg('All samples and phrases in this backup file already exist in Supabase!');
        return;
      }

      const confirmed = window.confirm(
        `Import ${gesturesToInsert.length} new gesture sample(s) and ${phrasesToInsert.length} new phrase rule(s) into Supabase?`
      );
      if (!confirmed) return;

      setLoading(true);
      let insertedG = 0;
      let insertedP = 0;

      // Insert gestures in batches of 50
      for (let i = 0; i < gesturesToInsert.length; i += 50) {
        const chunk = gesturesToInsert.slice(i, i + 50);
        const { error } = await supabase.from('asl_gestures').insert(chunk);
        if (error) throw error;
        insertedG += chunk.length;
      }

      if (phrasesToInsert.length > 0) {
        const { error } = await supabase.from('asl_phrases').insert(phrasesToInsert);
        if (error) throw error;
        insertedP = phrasesToInsert.length;
      }

      await loadAllData();
      setStatusMsg(
        `Successfully imported ${insertedG} gesture sample(s) and ${insertedP} phrase rule(s)!`
      );
    } catch (err) {
      console.error('Failed to import backup JSON:', err);
      setStatusMsg(`Import failed: ${err.message || 'Invalid JSON format'}`);
    } finally {
      setLoading(false);
    }
  };

  // Login Screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="w-screen h-screen bg-[#0F1015] text-white flex items-center justify-center p-4 font-sans select-none">
        <div className="w-full max-w-md bg-[#181920] border border-slate-800 rounded-xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-lg bg-[#5CA0F2]/15 text-[#5CA0F2] flex items-center justify-center mx-auto border border-[#5CA0F2]/30">
              <VerifiedShieldIcon className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Admin ASL Studio</h1>
            <p className="text-xs text-slate-400">
              Static k-NN + Dynamic DTW Motion Gesture & Phrase Portal
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyKey();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Admin Secret Key
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="Enter secret key..."
                  className="w-full bg-[#20222A] border border-slate-700/80 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#5CA0F2] transition-colors pl-10"
                />
                <KeySecretIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {authError && <div className="text-xs text-rose-400 text-center">{authError}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-sm font-semibold transition-colors shadow-lg disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Access Admin Studio'}
            </button>
          </form>

          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="w-full text-xs text-slate-400 hover:text-white flex items-center justify-center space-x-1 transition-colors pt-2"
            >
              <BackNavIcon className="w-3.5 h-3.5" />
              <span>Back to Meeting App</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const isBusyRecording = recordingPhase !== 'idle';

  return (
    <div className="w-screen h-screen max-h-screen bg-[#0F1015] text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Hidden File Input for Backup JSON Import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportJson}
      />

      {/* Top Header */}
      <header className="w-full bg-[#181920] border-b border-slate-800 px-6 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3.5">
          <div className="w-9 h-9 rounded-xl bg-[#5CA0F2]/15 text-[#5CA0F2] flex items-center justify-center border border-[#5CA0F2]/30">
            <VerifiedShieldIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center space-x-2">
              <span>Admin ASL & Motion Studio</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Supabase Realtime</span>
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              {existingLabels.length} labels ({datasetStats.staticCount} static •{' '}
              {datasetStats.dynamicCount} dynamic DTW) • {phrasesList.length} phrase rules
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-[#20222A] p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('gestures')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all ${
              activeTab === 'gestures'
                ? 'bg-[#5CA0F2] text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <SignGestureIcon className="w-3.5 h-3.5" />
            <span>Gesture & Motion Lab ({gesturesList.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('phrases')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all ${
              activeTab === 'phrases'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ChatDrawerIcon className="w-3.5 h-3.5" />
            <span>Ghép Cụm từ ({phrasesList.length})</span>
          </button>
        </div>

        {/* Quick Actions: Import Backup, Export Backup, Back to Meeting App */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors border border-slate-700 disabled:opacity-50"
            title="Import gestures and phrases from JSON backup"
          >
            <UploadBackupIcon className="w-3.5 h-3.5 text-[#5CA0F2]" />
            <span>Import JSON</span>
          </button>

          <button
            onClick={handleExportJson}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors border border-slate-700"
            title="Export dataset and phrase rules to JSON backup"
          >
            <DownloadTranscriptIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Backup</span>
          </button>

          {onBackToApp && (
            <button
              onClick={() => {
                stopCamera();
                onBackToApp();
              }}
              className="px-3.5 py-2 rounded-xl bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm"
            >
              <BackNavIcon className="w-3.5 h-3.5" />
              <span>Meeting App</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Studio Body: Tab 1 - Gestures & Motion Training */}
      {activeTab === 'gestures' && (
        <div className="flex-1 w-full grid grid-cols-12 gap-5 p-5 overflow-hidden min-h-0">
          {/* Left Stage: 2-Hand Motion Tracking Stage & Smart Recorder */}
          <div className="col-span-7 flex flex-col gap-3.5 h-full min-h-0">
            <div
              ref={stageContainerRef}
              className={`relative flex-1 bg-[#202124] rounded-xl overflow-hidden border transition-all flex items-center justify-center min-h-0 ${
                recordingPhase === 'capturing'
                  ? 'border-[#EA4335] shadow-[0_0_25px_rgba(234,67,53,0.4)]'
                  : recordingPhase === 'preroll'
                  ? 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                  : 'border-slate-800'
              }`}
            >
              {/* Offscreen raw video source consumed by HandMotionCameraTracker */}
              <video ref={videoRef} autoPlay playsInline muted className="hidden" />

              {/* 60 FPS Auto-Follow & Trajectory Canvas */}
              <canvas
                ref={canvasRef}
                className={`w-full h-full block ${cameraActive ? 'block' : 'hidden'}`}
              />

              {/* Top Stage HUD: Live Detection Pill + Stage Controls */}
              {cameraActive && (
                <div className="absolute top-3.5 left-3.5 right-3.5 z-20 flex items-center justify-between gap-2 pointer-events-none">
                  {liveDetection.gesture && liveDetection.gesture !== 'Signing...' ? (
                    <div className="bg-slate-900/90 backdrop-blur-md text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-500/40 shadow-lg flex items-center space-x-2 pointer-events-auto">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>{liveDetection.gesture.toUpperCase()}</span>
                      <span className="text-[10px] text-emerald-200 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        {Math.round(liveDetection.confidence * 100)}%
                      </span>
                      {liveDetection.mode === 'dynamic' && (
                        <span className="text-[9px] uppercase tracking-wider bg-[#5CA0F2]/20 text-[#5CA0F2] px-1.5 py-0.5 rounded border border-[#5CA0F2]/40">
                          DTW Motion
                        </span>
                      )}
                    </div>
                  ) : liveDetection.closestGesture ? (
                    <div className="bg-slate-900/85 backdrop-blur-md text-amber-300 text-xs font-medium px-3 py-1.5 rounded-xl border border-amber-500/30 shadow-lg flex items-center space-x-2 pointer-events-auto">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>NEAREST: {liveDetection.closestGesture}</span>
                      <span className="text-[10px] text-amber-200/80 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/20">
                        dist: {liveDetection.distance}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-900/75 backdrop-blur-md text-slate-300 text-xs px-3 py-1.5 rounded-xl border border-slate-700/60">
                      Hybrid k-NN + DTW Engine ({gesturesList.length} samples)
                    </div>
                  )}

                  {/* Stage Control Buttons */}
                  <div className="flex items-center space-x-1.5 pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => setAutoFollowZoom((v) => !v)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border backdrop-blur-md flex items-center space-x-1.5 transition-colors shadow ${
                        autoFollowZoom
                          ? 'bg-[#5CA0F2]/20 text-[#5CA0F2] border-[#5CA0F2]/40 hover:bg-[#5CA0F2]/30'
                          : 'bg-slate-900/85 text-slate-400 border-slate-700/80 hover:text-white'
                      }`}
                      title="Toggle 2-Hand Auto-Follow Camera Zoom"
                    >
                      <FocusTargetIcon className="w-3.5 h-3.5" />
                      <span>
                        {autoFollowZoom ? `Follow ${stageTelemetry.zoomFactor}x` : '1.0x Fixed'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowRadar((v) => !v)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border backdrop-blur-md flex items-center space-x-1 transition-colors shadow ${
                        showRadar
                          ? 'bg-slate-900/85 text-emerald-300 border-emerald-500/30'
                          : 'bg-slate-900/85 text-slate-400 border-slate-700/80 hover:text-white'
                      }`}
                      title="Toggle Live Top-3 Similarity Radar"
                    >
                      <SystemHealthIcon className="w-3.5 h-3.5" />
                      <span>Radar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSubtitles((prev) => !prev)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border backdrop-blur-md flex items-center space-x-1 transition-colors shadow ${
                        showSubtitles
                          ? 'bg-slate-900/85 text-[#5CA0F2] border-[#5CA0F2]/35'
                          : 'bg-slate-900/85 text-slate-400 border-slate-700/80 hover:text-white'
                      }`}
                      title="Toggle Live Subtitle Preview"
                    >
                      <CaptionsIcon className="w-3.5 h-3.5" />
                      <span>CC</span>
                    </button>

                    <button
                      type="button"
                      onClick={stopCamera}
                      className="p-1.5 rounded-xl bg-slate-900/85 hover:bg-[#EA4335]/80 text-slate-300 hover:text-white border border-slate-700/80 transition-colors shadow"
                      title="Stop Camera"
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Live Top-3 Distance Radar Card */}
              {cameraActive && showRadar && liveDetection.topCandidates?.length > 0 && !isBusyRecording && (
                <div className="absolute top-14 right-3.5 z-20 w-56 bg-slate-950/85 backdrop-blur-md border border-slate-800/90 rounded-xl p-2.5 space-y-1.5 pointer-events-none shadow-xl">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Top-3 Similarity Radar</span>
                    <span>Dist</span>
                  </div>
                  {liveDetection.topCandidates.map((cand, idx) => {
                    const pct = Math.round((cand.confidence || 0) * 100);
                    const isTopMatch =
                      idx === 0 &&
                      liveDetection.gesture &&
                      liveDetection.gesture === cand.name;
                    return (
                      <div key={`${cand.name}-${idx}`} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center space-x-1.5 truncate">
                            <span
                              className={`font-bold truncate max-w-[115px] ${
                                isTopMatch ? 'text-emerald-400' : 'text-slate-200'
                              }`}
                            >
                              {idx + 1}. {cand.name}
                            </span>
                            {cand.mode === 'dynamic' && (
                              <span className="text-[8px] px-1 rounded bg-[#5CA0F2]/20 text-[#5CA0F2] border border-[#5CA0F2]/30">
                                DTW
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-slate-400">
                            {cand.distance} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-150 ${
                              isTopMatch
                                ? 'bg-emerald-400'
                                : idx === 0
                                ? 'bg-[#5CA0F2]'
                                : 'bg-slate-500'
                            }`}
                            style={{ width: `${Math.max(8, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom-Left Hand Color Legend + Spacebar Hint */}
              {cameraActive && (
                <div className="absolute bottom-3.5 left-3.5 z-20 flex items-center space-x-2 pointer-events-none">
                  <div className="bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-800 flex items-center space-x-2 text-[10px] font-semibold text-slate-200">
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                      <span>L</span>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-[#5CA0F2]" />
                      <span>R</span>
                    </span>
                    {stageTelemetry.handCount > 0 && (
                      <span className="text-slate-400 font-mono">
                        ({stageTelemetry.handCount}H)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Live Subtitle Preview Overlay */}
              {cameraActive && showSubtitles && !isBusyRecording && (
                <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-20 w-[72%] max-w-md pointer-events-auto transition-all">
                  <div className="bg-slate-950/90 backdrop-blur-xl border border-[#5CA0F2]/35 shadow-[0_8px_32px_rgba(0,0,0,0.6)] rounded-xl px-3.5 py-2.5 text-center space-y-1">
                    <div className="flex items-center justify-center space-x-2 text-[10px] font-semibold uppercase tracking-wider text-[#5CA0F2]">
                      <AiTranslateIcon className="w-3 h-3 text-[#5CA0F2] animate-pulse" />
                      <span>Live AI Vision Subtitle</span>
                      {currentSentence && (
                        <button
                          onClick={clearTranscript}
                          className="text-[10px] text-slate-400 hover:text-white transition-colors bg-slate-800/80 px-1.5 py-0.5 rounded ml-1"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="text-sm font-extrabold text-white tracking-wide leading-snug drop-shadow-md min-h-[20px]">
                      {currentSentence ||
                        (liveDetection.gesture !== 'Signing...' ? liveDetection.gesture : '') ||
                        'Perform static or dynamic sign to test...'}
                    </div>
                  </div>
                </div>
              )}

              {/* Pre-Roll (3-2-1) & Active Capture Overlay */}
              {isBusyRecording && (
                <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-5 select-none bg-black/20">
                  <div className="flex items-center justify-between">
                    <div
                      className={`backdrop-blur-md text-white text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider flex items-center space-x-2 shadow-2xl border ${
                        recordingPhase === 'preroll'
                          ? 'bg-amber-500/90 border-amber-300/50'
                          : 'bg-[#EA4335]/90 border-rose-300/50'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                      <span>
                        {recordingPhase === 'preroll'
                          ? 'Get Ready — Position Hands...'
                          : recordingMode === 'dynamic'
                          ? 'Capturing Dynamic Motion (DTW)...'
                          : 'Capturing Steady Pose (k-NN)...'}
                      </span>
                    </div>

                    <div
                      className={`w-12 h-12 rounded-xl text-white font-extrabold text-2xl flex items-center justify-center shadow-2xl border animate-pulse ${
                        recordingPhase === 'preroll'
                          ? 'bg-amber-500/90 border-amber-200/50'
                          : 'bg-[#EA4335]/90 border-rose-200/50'
                      }`}
                    >
                      {countdown}s
                    </div>
                  </div>

                  <div className="flex items-center justify-center space-x-2 pointer-events-auto">
                    <span className="bg-black/80 backdrop-blur-md text-slate-100 text-xs px-4 py-1.5 rounded-full border border-slate-700/80 shadow-lg font-medium">
                      {recordingPhase === 'preroll'
                        ? 'Raise 1 or 2 hands into starting position before capture begins'
                        : recordingMode === 'dynamic'
                        ? 'Execute the full gesture movement smoothly now'
                        : 'Hold gesture steadily — outlier frames are auto-filtered'}
                    </span>
                    <button
                      type="button"
                      onClick={() => cancelRecordingSession('Recording cancelled.')}
                      className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-full border border-slate-700 font-semibold"
                    >
                      Cancel [Space]
                    </button>
                  </div>
                </div>
              )}

              {/* Camera Offline Empty State */}
              {!cameraActive && (
                <div className="flex flex-col items-center justify-center text-slate-400 space-y-3 p-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-[#5CA0F2]">
                    <HardwareCameraIcon className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-200">
                      2-Hand Motion Tracking Stage
                    </p>
                    <p className="text-xs text-slate-400 max-w-xs">
                      Auto-Follow Zoom (1.0x–2.6x) with stabilized Left/Right skeleton & motion
                      trajectory trails
                    </p>
                  </div>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 rounded-xl bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold transition-colors shadow-md"
                  >
                    Start Studio Camera
                  </button>
                </div>
              )}
            </div>

            {/* Smart Recorder Control Deck */}
            <div className="bg-[#181920] border border-slate-800 p-4 rounded-xl space-y-3 shrink-0">
              {/* Row 1: Recording Modality Toggle + Spacebar Hint */}
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex bg-[#20222A] p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    disabled={isBusyRecording}
                    onClick={() => {
                      setRecordingMode('static');
                      setCapturedPayload(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      recordingMode === 'static'
                        ? 'bg-[#5CA0F2] text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Static Pose (k-NN • 63D/126D)
                  </button>
                  <button
                    type="button"
                    disabled={isBusyRecording}
                    onClick={() => {
                      setRecordingMode('dynamic');
                      setCapturedPayload(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      recordingMode === 'dynamic'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Dynamic Motion (DTW • 24 Keyframes)
                  </button>
                </div>

                <div className="hidden xl:flex items-center space-x-1.5 text-[11px] text-slate-400">
                  <KeyboardShortcutIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200 font-mono text-[10px]">Space</kbd> for hands-free 3-2-1 record
                  </span>
                </div>
              </div>

              {/* Row 2: Label Input + Record + Save */}
              <div className="flex items-center space-x-2.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    list="existing-gesture-labels"
                    value={gestureName}
                    onChange={(e) => setGestureName(e.target.value)}
                    placeholder={
                      recordingMode === 'dynamic'
                        ? 'Motion Sign Label (e.g. Hello, Thank You, Please)'
                        : 'Static Sign Label (e.g. A, B, Good, Nice, Meet)'
                    }
                    className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#5CA0F2]"
                  />
                  <datalist id="existing-gesture-labels">
                    {existingLabels.map((lbl) => (
                      <option key={lbl} value={lbl} />
                    ))}
                  </datalist>
                  {gestureName && groupedGestures[gestureName.trim()] && (
                    <span className="absolute right-2.5 top-2 text-[10px] bg-[#5CA0F2]/15 text-[#5CA0F2] px-2 py-0.5 rounded-full border border-[#5CA0F2]/30">
                      {groupedGestures[gestureName.trim()].length} saved
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleStartSmartRecording}
                  disabled={!cameraActive}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-colors border outline-none disabled:opacity-50 shrink-0 ${
                    isBusyRecording
                      ? 'bg-[#EA4335] text-white border-transparent'
                      : 'bg-[#EA4335]/15 hover:bg-[#EA4335]/25 text-rose-300 border-[#EA4335]/40'
                  }`}
                >
                  <NetworkRadioIcon className="w-4 h-4 text-rose-400 animate-pulse" />
                  <span>
                    {recordingPhase === 'preroll'
                      ? `Ready (${countdown}s)...`
                      : recordingPhase === 'capturing'
                      ? `Capturing (${countdown}s)...`
                      : recordingMode === 'dynamic'
                      ? 'Record Motion (3s)'
                      : 'Record Pose (3s)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveSample}
                  disabled={!capturedPayload || isBusyRecording || loading}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-md disabled:opacity-50 shrink-0"
                >
                  <SuccessCheckIcon className="w-4 h-4" />
                  <span>Save Sign</span>
                </button>
              </div>

              {/* Pre-Save Quality & Conflict Inspector */}
              {capturedPayload && (
                <div className="bg-[#20222A] border border-slate-700/80 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center flex-wrap gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          capturedPayload.mode === 'dynamic'
                            ? 'bg-sky-950/80 text-[#5CA0F2] border-[#5CA0F2]/40'
                            : 'bg-purple-950/80 text-purple-300 border-purple-500/30'
                        }`}
                      >
                        {capturedPayload.mode === 'dynamic'
                          ? `Dynamic ${capturedPayload.handCount}H • ${capturedPayload.sequenceLength}×${capturedPayload.dimension}D DTW`
                          : capturedPayload.handCount === 2
                          ? 'Unified 2-Hand 126D'
                          : 'Single-Hand 63D'}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          capturedPayload.qualityScore >= 80
                            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30'
                            : capturedPayload.qualityScore >= 60
                            ? 'bg-amber-950/70 text-amber-300 border-amber-500/30'
                            : 'bg-rose-950/70 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        Quality: {capturedPayload.qualityScore}%
                      </span>

                      <span className="text-[11px] text-slate-400">
                        {capturedPayload.keptFrames} clean frames
                        {capturedPayload.motionAmplitude
                          ? ` • travel ${capturedPayload.motionAmplitude}x palm`
                          : ''}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCapturedPayload(null)}
                      className="text-slate-400 hover:text-rose-400 p-1 rounded transition-colors"
                      title="Discard captured sample"
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {conflictInfo?.hasConflict && (
                    <div className="flex items-start space-x-2 bg-amber-950/50 border border-amber-500/40 text-amber-200 px-3 py-2 rounded-lg text-[11px]">
                      <AlertWarningIcon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong>Dataset Overlap Warning:</strong> Closest existing class is{' '}
                        <strong className="text-white">"{conflictInfo.conflictingLabel}"</strong>{' '}
                        (dist: {conflictInfo.distance}, ~{conflictInfo.similarityPct}% similar).
                        Verify handshape/motion before saving under a different label.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {statusMsg && (
                <div className="text-xs text-[#8AB4F8] font-medium flex items-center justify-between bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg">
                  <span className="truncate">{statusMsg}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Stage: Searchable & Filterable Supabase Gestures Roster */}
          <div className="col-span-5 bg-[#181920] border border-slate-800 rounded-xl p-4 flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between pb-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                  <span>Trained Gesture Roster</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                    {filteredRosterEntries.length}/{existingLabels.length} labels
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400">
                  Click any label header to quick-fill recorder for new variations
                </p>
              </div>
              <button
                onClick={loadAllData}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Refresh from Supabase"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Search & Modality Filter Bar */}
            <div className="space-y-2 border-b border-slate-800 pb-3 mb-3">
              <div className="relative">
                <SearchIcon className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Search sign labels (e.g. Hello, Good, A)..."
                  className="w-full bg-[#20222A] border border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white focus:outline-none focus:border-[#5CA0F2]"
                />
                {rosterSearch && (
                  <button
                    type="button"
                    onClick={() => setRosterSearch('')}
                    className="absolute right-2.5 top-2 text-slate-500 hover:text-white"
                  >
                    <CloseIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center flex-wrap gap-1.5">
                {[
                  { id: 'all', label: `All (${gesturesList.length})` },
                  { id: 'static', label: `Static (${datasetStats.staticCount})` },
                  { id: 'dynamic', label: `Dynamic DTW (${datasetStats.dynamicCount})` },
                  { id: '1h', label: `1-Hand (${datasetStats.oneHandCount})` },
                  { id: '2h', label: `2-Hand (${datasetStats.twoHandCount})` },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setRosterFilter(pill.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                      rosterFilter === pill.id
                        ? 'bg-[#5CA0F2]/20 text-[#5CA0F2] border-[#5CA0F2]/40'
                        : 'bg-[#20222A] text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Label Groups */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {filteredRosterEntries.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-8">
                  {gesturesList.length === 0
                    ? 'No gestures recorded on Supabase yet.'
                    : 'No gesture labels match your current search/filter.'}
                </div>
              ) : (
                filteredRosterEntries.map(({ label, samples }) => (
                  <div
                    key={label}
                    className="bg-[#20222A] border border-slate-800/80 rounded-xl p-3.5 space-y-2.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                      <button
                        type="button"
                        onClick={() => setGestureName(label)}
                        className="flex items-center space-x-2 text-left group"
                        title={`Select "${label}" in recorder`}
                      >
                        <h3 className="text-xs font-bold text-white group-hover:text-[#5CA0F2] transition-colors">
                          {label}
                        </h3>
                        <span className="text-[10px] bg-[#5CA0F2]/10 text-[#5CA0F2] px-2 py-0.5 rounded-full border border-[#5CA0F2]/20 font-medium">
                          {samples.length} {samples.length === 1 ? 'sample' : 'samples'}
                        </span>
                      </button>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleRenameLabel(label)}
                          className="p-1.5 text-slate-400 hover:text-[#5CA0F2] hover:bg-[#5CA0F2]/10 rounded-lg transition-colors"
                          title="Rename label"
                        >
                          <EditActionIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLabelGroup(label)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Delete all samples for label"
                        >
                          <DeleteActionIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {samples.map((s, idx) => {
                        const desc = getSampleDescriptor(s);
                        return (
                          <div
                            key={s.id || idx}
                            className="flex items-center justify-between bg-[#181920]/70 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-300 border border-slate-800/40"
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <span className="text-slate-500 font-mono text-[10px]">
                                #{idx + 1}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${desc.badgeClass}`}
                              >
                                {desc.badgeText}
                              </span>
                              <span className="text-slate-400 truncate max-w-[135px]">
                                {s.description || 'Sample'}
                              </span>
                            </div>

                            <button
                              onClick={() => handleDeleteSample(s.id, label)}
                              className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors shrink-0"
                              title="Delete this sample"
                            >
                              <DeleteActionIcon className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Studio Body: Tab 2 - Multi-Sign Phrase Builder (2 or 3 signs) */}
      {activeTab === 'phrases' && (
        <div className="flex-1 w-full grid grid-cols-12 gap-6 p-6 overflow-hidden min-h-0">
          {/* Left Form: Visual Rule Builder */}
          <div className="col-span-5 bg-[#181920] border border-slate-800 rounded-xl p-6 flex flex-col gap-5 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                  <ChatDrawerIcon className="w-4 h-4 text-purple-400" />
                  <span>Huấn luyện Giải mã Cụm từ (Phrase Builder)</span>
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                Ghép {phraseSignCount} ký hiệu (tĩnh hoặc động DTW) liên tiếp thành 1 câu/cụm từ
                hoàn chỉnh (VD:{' '}
                {phraseSignCount === 3
                  ? 'Nice + Meet + You → "Nice to meet you!"'
                  : 'Good + Morning → "Good morning!"'}
                )
              </p>
            </div>

            {/* Sequence Length Toggle: 2 Ký hiệu vs 3 Ký hiệu */}
            <div className="flex items-center justify-between bg-[#20222A] p-1.5 rounded-xl border border-slate-700/60">
              <span className="text-xs font-semibold text-slate-300 ml-2">Độ dài chuỗi:</span>
              <div className="inline-flex space-x-1">
                <button
                  type="button"
                  onClick={() => setPhraseSignCount(2)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    phraseSignCount === 2
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Nối 2 Ký hiệu
                </button>
                <button
                  type="button"
                  onClick={() => setPhraseSignCount(3)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    phraseSignCount === 3
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Nối 3 Ký hiệu
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Sign 1 Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  1. Ký hiệu Thứ nhất (Sign 1)
                </label>
                <select
                  value={firstSignChoice}
                  onChange={(e) => setFirstSignChoice(e.target.value)}
                  className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">-- Chọn Cử chỉ 1 (VD: Nice, Good, Hello) --</option>
                  {existingLabels.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sign 2 Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  2. Ký hiệu Thứ hai (Sign 2)
                </label>
                <select
                  value={secondSignChoice}
                  onChange={(e) => setSecondSignChoice(e.target.value)}
                  className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="">-- Chọn Cử chỉ 2 (VD: Meet, Morning) --</option>
                  {existingLabels.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sign 3 Selector */}
              {phraseSignCount === 3 && (
                <div className="animate-in fade-in duration-200">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>3. Ký hiệu Thứ ba (Sign 3)</span>
                    <span className="text-[10px] text-purple-400 font-normal">
                      Tùy chọn chuỗi 3 ký hiệu
                    </span>
                  </label>
                  <select
                    value={thirdSignChoice}
                    onChange={(e) => setThirdSignChoice(e.target.value)}
                    className="w-full bg-[#20222A] border border-purple-500/50 focus:border-purple-400 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none"
                  >
                    <option value="">-- Chọn Cử chỉ 3 (VD: You, Friend) --</option>
                    {existingLabels.map((lbl) => (
                      <option key={lbl} value={lbl}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Visual Sequence Preview */}
              {firstSignChoice && secondSignChoice && (phraseSignCount === 2 || thirdSignChoice) && (
                <div className="bg-[#20222A] border border-purple-500/30 rounded-xl p-3 flex items-center justify-center flex-wrap gap-2 text-xs">
                  <span className="font-bold bg-[#5CA0F2]/20 text-[#5CA0F2] px-2.5 py-1 rounded-lg border border-[#5CA0F2]/30">
                    {firstSignChoice}
                  </span>
                  <ForwardNavIcon className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="font-bold bg-indigo-600/30 text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/30">
                    {secondSignChoice}
                  </span>
                  {phraseSignCount === 3 && thirdSignChoice && (
                    <>
                      <ForwardNavIcon className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="font-bold bg-violet-600/30 text-violet-300 px-2.5 py-1 rounded-lg border border-violet-500/30">
                        {thirdSignChoice}
                      </span>
                    </>
                  )}
                  <span className="text-slate-400 font-bold">&rArr;</span>
                  <span className="font-bold text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                    {phraseTranslation || '...'}
                  </span>
                </div>
              )}

              {/* Translation Text */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  {phraseSignCount === 3 ? '4.' : '3.'} Bản dịch Cụm từ Hoàn chỉnh (Decoded
                  Translation)
                </label>
                <input
                  type="text"
                  value={phraseTranslation}
                  onChange={(e) => setPhraseTranslation(e.target.value)}
                  placeholder='VD: "Nice to meet you!" hoặc "Good morning!"'
                  className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Mô tả / Ngữ cảnh (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={phraseDesc}
                  onChange={(e) => setPhraseDesc(e.target.value)}
                  placeholder="VD: Lời chào thân mật khi lần đầu gặp mặt"
                  className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <button
                type="button"
                onClick={handleSavePhraseRule}
                disabled={
                  loading ||
                  !firstSignChoice ||
                  !secondSignChoice ||
                  (phraseSignCount === 3 && !thirdSignChoice) ||
                  !phraseTranslation
                }
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <PlusActionIcon className="w-4 h-4" />
                <span>Lưu Quy Tắc Cụm Từ ({phraseSignCount} Ký hiệu)</span>
              </button>
            </div>

            {statusMsg && (
              <div className="text-xs text-purple-300 bg-purple-950/40 border border-purple-800/40 p-2.5 rounded-xl">
                {statusMsg}
              </div>
            )}
          </div>

          {/* Right Stage: Active Phrase Rules */}
          <div className="col-span-7 bg-[#181920] border border-slate-800 rounded-xl p-6 flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                  <span>Quy tắc Cụm từ Đang Hoạt động ({phrasesList.length})</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Được đồng bộ thời gian thực qua bảng `asl_phrases` tới tất cả các phòng họp
                </p>
              </div>
              <button
                onClick={loadAllData}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Làm mới từ Supabase"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {phrasesList.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-12">
                  Chưa có quy tắc cụm từ nào. Hãy chọn các Ký hiệu bên trái để tạo quy tắc mới!
                </div>
              ) : (
                phrasesList.map((phrase) => {
                  const pattern = Array.isArray(phrase.pattern) ? phrase.pattern : [];

                  return (
                    <div
                      key={phrase.id}
                      className="bg-[#20222A] border border-slate-800/80 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center flex-wrap gap-1.5">
                          {pattern.map((token, idx) => (
                            <React.Fragment key={idx}>
                              {idx > 0 && (
                                <ForwardNavIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                              )}
                              <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                                  idx === 0
                                    ? 'bg-[#5CA0F2]/20 text-[#5CA0F2] border-[#5CA0F2]/30'
                                    : idx === 1
                                    ? 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'
                                    : 'bg-violet-900/40 text-violet-300 border-violet-500/30'
                                }`}
                              >
                                {token}
                              </span>
                            </React.Fragment>
                          ))}
                          <span className="text-[10px] text-slate-400 ml-1.5 font-mono bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60">
                            {pattern.length} ký hiệu
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-extrabold text-white">
                            "{phrase.translation}"
                          </span>
                          {phrase.description && (
                            <span className="text-[11px] text-slate-400 italic">
                              • {phrase.description}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeletePhraseRule(phrase.id, phrase.translation)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Xóa quy tắc này"
                      >
                        <DeleteActionIcon className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
