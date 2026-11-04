import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  HardwareCameraIcon,
  DownloadTranscriptIcon,
  CopyActionIcon,
  BackNavIcon,
  SignGestureIcon,
  ProcessingCpuIcon,
  PlayActionIcon,
  PauseActionIcon,
  AiInspectorIcon,
  SparklesIcon,
} from '@sl-meet/shared/icons';
import {
  getOrCreateMediaPipeHands,
  subscribeMediaPipeResults,
  classifyGesture,
  normalizeMultiHandLandmarks,
  TitleBar,
} from '@sl-meet/shared';

import {
  LANDMARK_NAMES,
  FINGER_COLORS,
  HAND_CONNECTIONS,
  getLandmarkColor,
  dist3D,
  calculateJointAngle,
} from '../../features';

/**
 * Evaluates finger extension state from landmark geometry
 */
function analyzeFingerStates(landmarks) {
  if (!landmarks || landmarks.length < 21) return null;
  const wrist = landmarks[0];

  const isExtended = (tipIdx, pipIdx, mcpIdx) => {
    const dTip = dist3D(landmarks[tipIdx], wrist);
    const dPip = dist3D(landmarks[pipIdx], wrist);
    const angle = calculateJointAngle(landmarks[mcpIdx], landmarks[pipIdx], landmarks[tipIdx]);
    return {
      isOpen: dTip > dPip && angle > 135,
      angle,
      distRatio: parseFloat((dTip / Math.max(0.01, dPip)).toFixed(2)),
    };
  };

  const thumbTip = landmarks[4];
  const thumbMcp = landmarks[2];
  const indexMcp = landmarks[5];
  const thumbDistToIndex = dist3D(thumbTip, indexMcp);
  const thumbAngle = calculateJointAngle(landmarks[1], landmarks[2], landmarks[4]);
  const isThumbOpen = thumbDistToIndex > dist3D(thumbMcp, indexMcp) * 1.25 && thumbAngle > 130;

  return {
    thumb: { name: 'Thumb', isOpen: isThumbOpen, angle: thumbAngle },
    index: { name: 'Index', ...isExtended(8, 6, 5) },
    middle: { name: 'Middle', ...isExtended(12, 10, 9) },
    ring: { name: 'Ring', ...isExtended(16, 14, 13) },
    pinky: { name: 'Pinky', ...isExtended(20, 18, 17) },
  };
}

export default function AiVisionDebugger({ isEmbedded = false, sharedStream = null, onStreamAcquired }) {
  // Video & Stream State
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const isFrozenRef = useRef(false);
  const [isMirror, setIsMirror] = useState(true);

  // Visualization Overlays Config
  const [showConnectors, setShowConnectors] = useState(true);
  const [showLandmarkDots, setShowLandmarkDots] = useState(true);
  const [showLandmarkLabels, setShowLandmarkLabels] = useState(false);
  const [showBoundingBox, setShowBoundingBox] = useState(true);
  const [wireframeOnly, setWireframeOnly] = useState(false);

  // Telemetry & Selected Points
  const [selectedLandmarkIdx, setSelectedLandmarkIdx] = useState(8); // Default Index Tip
  const [activeTab, setActiveTab] = useState('landmarks'); // 'landmarks' | 'tensor' | 'model'
  const [fps, setFps] = useState(0);
  const [mpLatency, setMpLatency] = useState(0);
  const [modelLatency, setModelLatency] = useState(0);

  // Live Tracking Snapshot
  const [rawLandmarks, setRawLandmarks] = useState([]);
  const [handedness, setHandedness] = useState(null);
  const [normalizedVector, setNormalizedVector] = useState([]);
  const [modelPredictions, setModelPredictions] = useState({
    gesture: '',
    confidence: 0,
    distance: 0,
    topCandidates: [],
  });
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.80);
  const [copyStatus, setCopyStatus] = useState('');

  // Performance timers & Animation Frames
  const fpsCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const rafIdRef = useRef(null);
  const isProcessingRef = useRef(false);
  const mpStartTimeRef = useRef(0);
  const lastFrameDataRef = useRef(null);
  const unsubscribeMpRef = useRef(null);

  // Synchronize render options ref to eliminate stale closures in 60 FPS canvas loop
  const renderOptsRef = useRef({
    wireframeOnly,
    isMirror,
    showBoundingBox,
    showConnectors,
    showLandmarkDots,
    showLandmarkLabels,
    selectedLandmarkIdx,
  });

  useEffect(() => {
    renderOptsRef.current = {
      wireframeOnly,
      isMirror,
      showBoundingBox,
      showConnectors,
      showLandmarkDots,
      showLandmarkLabels,
      selectedLandmarkIdx,
    };
  }, [
    wireframeOnly,
    isMirror,
    showBoundingBox,
    showConnectors,
    showLandmarkDots,
    showLandmarkLabels,
    selectedLandmarkIdx,
  ]);

  // Update frozen ref
  useEffect(() => {
    isFrozenRef.current = isFrozen;
  }, [isFrozen]);

  // Start Camera Stream
  const startCamera = async () => {
    try {
      let stream = sharedStream;
      if (!stream || !stream.active || stream.getVideoTracks().every((t) => t.readyState === 'ended')) {
        if (isEmbedded) {
          // In embedded mode, camera lifecycle is driven by parent AdminDashboard
          return;
        }
        // Prioritize physical camera over OBS/virtual in standalone mode
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        const physical = videoInputs.find(
          (d) =>
            d.label &&
            !d.label.toLowerCase().includes('obs') &&
            !d.label.toLowerCase().includes('virtual')
        );

        const videoConstraints = {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60 },
        };
        if (physical?.deviceId) {
          videoConstraints.deviceId = { exact: physical.deviceId };
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
        if (typeof onStreamAcquired === 'function') {
          onStreamAcquired(stream);
        }
      }

      if (!videoRef.current) return;
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

      await videoRef.current.play().catch((err) => console.warn('Debugger video play warning:', err));

      setCameraActive(true);
      initMediaPipe();
    } catch (err) {
      console.error('Failed to start debugger camera:', err);
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (unsubscribeMpRef.current) {
      unsubscribeMpRef.current();
      unsubscribeMpRef.current = null;
    }

    if (videoRef.current) {
      if (!sharedStream && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setRawLandmarks([]);
    setNormalizedVector([]);
    setModelPredictions({ gesture: '', confidence: 0, distance: 0, topCandidates: [] });
  };

  useEffect(() => {
    if (isEmbedded) {
      if (sharedStream && sharedStream.active) {
        startCamera();
      } else {
        stopCamera();
      }
      return;
    }
    // Standalone mode: only start if explicit
    return () => {
      stopCamera();
    };
  }, [sharedStream, isEmbedded]);

  // Initialize MediaPipe with real-time performance telemetry
  const initMediaPipe = () => {
    getOrCreateMediaPipeHands();
    if (unsubscribeMpRef.current) {
      unsubscribeMpRef.current();
    }
    unsubscribeMpRef.current = subscribeMediaPipeResults((results) => {
      if (isFrozenRef.current) return;

      // Accurate MediaPipe WASM processing latency calculation
      if (mpStartTimeRef.current) {
        const currentMpLatency = Math.max(1, Math.round(performance.now() - mpStartTimeRef.current));
        setMpLatency(currentMpLatency);
      }

      // Model Classification Benchmark
      const modelStartTime = performance.now();
      const hasHands = Boolean(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);

      let classification = { gesture: '', confidence: 0, distance: 0, topCandidates: [] };
      let normVec = [];

      if (hasHands) {
        const primaryHand = results.multiHandLandmarks[0];
        const primaryHandedness = results.multiHandedness ? results.multiHandedness[0] : null;

        classification = classifyGesture(
          primaryHand,
          primaryHandedness,
          results.multiHandLandmarks,
          results.multiHandedness
        );

        normVec = normalizeMultiHandLandmarks(results.multiHandLandmarks) || [];

        setRawLandmarks(primaryHand);
        setHandedness(primaryHandedness);
        setNormalizedVector(normVec);
      } else {
        setRawLandmarks([]);
        setHandedness(null);
        setNormalizedVector([]);
      }

      const modelEndTime = performance.now();
      setModelLatency(Math.max(1, Math.round(modelEndTime - modelStartTime)));
      setModelPredictions(classification);

      // Cache snapshot for Canvas rendering & Freeze-frame
      lastFrameDataRef.current = {
        results,
        normVec,
        classification,
      };

      // FPS Calculation
      fpsCountRef.current++;
      const now = Date.now();
      if (now - lastFpsTimeRef.current >= 1000) {
        setFps(fpsCountRef.current);
        fpsCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
    });

    // Main 60 FPS Visual Render Loop
    const renderLoop = () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        const {
          wireframeOnly: curWireframeOnly,
          isMirror: curIsMirror,
          showBoundingBox: curShowBoundingBox,
          showConnectors: curShowConnectors,
          showLandmarkDots: curShowLandmarkDots,
          showLandmarkLabels: curShowLandmarkLabels,
          selectedLandmarkIdx: curSelectedLandmarkIdx,
        } = renderOptsRef.current;

        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
          }

          const width = canvas.width;
          const height = canvas.height;

          ctx.save();
          ctx.clearRect(0, 0, width, height);

          // 1. Video Layer or Pure Wireframe Background
          if (curWireframeOnly) {
            ctx.fillStyle = '#111214';
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = '#202124';
            ctx.lineWidth = 1;
            const gridSize = 40;
            for (let x = 0; x < width; x += gridSize) {
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, height);
              ctx.stroke();
            }
            for (let y = 0; y < height; y += gridSize) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(width, y);
              ctx.stroke();
            }
          } else {
            if (curIsMirror) {
              ctx.translate(width, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, width, height);
            if (curIsMirror) {
              ctx.setTransform(1, 0, 0, 1, 0, 0);
            }
          }

          // 2. Landmark & Skeleton Visualizer
          const frame = lastFrameDataRef.current;
          if (frame?.results?.multiHandLandmarks) {
            frame.results.multiHandLandmarks.forEach((landmarks) => {
              if (!landmarks || landmarks.length < 21) return;

              const getScreenPoint = (p) => {
                const px = curIsMirror ? (1 - p.x) * width : p.x * width;
                const py = p.y * height;
                return { x: px, y: py, z: p.z || 0 };
              };

              // Bounding Box & Palm Center
              if (curShowBoundingBox) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                landmarks.forEach((p) => {
                  const sp = getScreenPoint(p);
                  if (sp.x < minX) minX = sp.x;
                  if (sp.x > maxX) maxX = sp.x;
                  if (sp.y < minY) minY = sp.y;
                  if (sp.y > maxY) maxY = sp.y;
                });
                const pad = 24;
                ctx.strokeStyle = '#5CA0F2';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 6]);
                ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
                ctx.setLineDash([]);

                const wrist = getScreenPoint(landmarks[0]);
                const middleMcp = getScreenPoint(landmarks[9]);
                const palmCenter = { x: (wrist.x + middleMcp.x) / 2, y: (wrist.y + middleMcp.y) / 2 };
                ctx.fillStyle = '#5CA0F2';
                ctx.beginPath();
                ctx.arc(palmCenter.x, palmCenter.y, 4, 0, 2 * Math.PI);
                ctx.fill();
              }

              // Skeleton Connections
              if (curShowConnectors) {
                ctx.lineWidth = 3.5;
                ctx.lineCap = 'round';
                HAND_CONNECTIONS.forEach(([i, j]) => {
                  const p1 = getScreenPoint(landmarks[i]);
                  const p2 = getScreenPoint(landmarks[j]);
                  ctx.strokeStyle = getLandmarkColor(j);
                  ctx.beginPath();
                  ctx.moveTo(p1.x, p1.y);
                  ctx.lineTo(p2.x, p2.y);
                  ctx.stroke();
                });
              }

              // Landmark Dots & Selected Highlight
              if (curShowLandmarkDots) {
                landmarks.forEach((p, idx) => {
                  const sp = getScreenPoint(p);
                  const isSelected = curSelectedLandmarkIdx === idx;
                  const dotRadius = isSelected ? 8 : 4.5;

                  ctx.fillStyle = getLandmarkColor(idx);
                  ctx.beginPath();
                  ctx.arc(sp.x, sp.y, dotRadius, 0, 2 * Math.PI);
                  ctx.fill();

                  ctx.strokeStyle = '#FFFFFF';
                  ctx.lineWidth = isSelected ? 2.5 : 1.2;
                  ctx.stroke();

                  if (isSelected) {
                    ctx.strokeStyle = '#5CA0F2';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(sp.x, sp.y, 14, 0, 2 * Math.PI);
                    ctx.stroke();
                  }

                  if (curShowLandmarkLabels) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = 'bold 11px Inter, sans-serif';
                    ctx.fillText(idx.toString(), sp.x + 8, sp.y - 6);
                  }
                });
              }
            });
          }

          ctx.restore();
        }

        // Send frame to MediaPipe if not frozen and not busy
        if (!isFrozenRef.current && !isProcessingRef.current) {
          const hands = getOrCreateMediaPipeHands();
          if (hands) {
            isProcessingRef.current = true;
            mpStartTimeRef.current = performance.now();
            hands
              .send({ image: video })
              .catch((err) => console.warn('MediaPipe send error:', err))
              .finally(() => {
                isProcessingRef.current = false;
              });
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(renderLoop);
    };

    rafIdRef.current = requestAnimationFrame(renderLoop);
  };

  // Finger State Analysis
  const fingerStates = useMemo(() => {
    return analyzeFingerStates(rawLandmarks);
  }, [rawLandmarks]);

  // Normalized Vector Stats
  const vectorStats = useMemo(() => {
    if (!normalizedVector || normalizedVector.length === 0) return null;
    let min = Infinity, max = -Infinity, sum = 0;
    normalizedVector.forEach((v) => {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += Math.abs(v);
    });
    return {
      dim: normalizedVector.length,
      min: parseFloat(min.toFixed(3)),
      max: parseFloat(max.toFixed(3)),
      avgMag: parseFloat((sum / normalizedVector.length).toFixed(3)),
    };
  }, [normalizedVector]);

  // Selected Landmark Details
  const selectedPointDetails = useMemo(() => {
    if (!rawLandmarks || rawLandmarks.length <= selectedLandmarkIdx) return null;
    const p = rawLandmarks[selectedLandmarkIdx];
    const wrist = rawLandmarks[0];
    const distToWrist = wrist ? parseFloat(dist3D(p, wrist).toFixed(4)) : 0;
    return {
      idx: selectedLandmarkIdx,
      name: LANDMARK_NAMES[selectedLandmarkIdx] || `Landmark ${selectedLandmarkIdx}`,
      x: parseFloat(p.x.toFixed(4)),
      y: parseFloat(p.y.toFixed(4)),
      z: parseFloat((p.z || 0).toFixed(4)),
      distToWrist,
      color: getLandmarkColor(selectedLandmarkIdx),
    };
  }, [rawLandmarks, selectedLandmarkIdx]);

  // Copy helpers
  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopyStatus(`Copied ${label}!`);
    setTimeout(() => setCopyStatus(''), 2500);
  };

  const handleCopyLandmarksJSON = () => {
    if (!rawLandmarks || rawLandmarks.length === 0) return;
    handleCopy(JSON.stringify(rawLandmarks, null, 2), '21 Landmarks JSON');
  };

  const handleCopyTensorJSON = () => {
    if (!normalizedVector || normalizedVector.length === 0) return;
    handleCopy(JSON.stringify(normalizedVector), 'Tensor Vector JSON');
  };

  const handleExportSnapshot = () => {
    const payload = {
      timestamp: new Date().toISOString(),
      handedness: handedness?.label || 'Unknown',
      handednessScore: handedness?.score || 0,
      landmarks: rawLandmarks,
      normalizedTensor: normalizedVector,
      fingerStates,
      prediction: modelPredictions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slmeet-vision-snapshot-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Canvas Click to select landmark
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !rawLandmarks || rawLandmarks.length < 21) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    let closestIdx = -1;
    let minDist = 30; // 30px click threshold
    rawLandmarks.forEach((p, idx) => {
      const px = isMirror ? (1 - p.x) * canvas.width : p.x * canvas.width;
      const py = p.y * canvas.height;
      const d = Math.hypot(px - clickX, py - clickY);
      if (d < minDist) {
        minDist = d;
        closestIdx = idx;
      }
    });

    if (closestIdx !== -1) {
      setSelectedLandmarkIdx(closestIdx);
    }
  };

  return (
    <div className={`flex flex-col bg-[#131314] text-slate-100 select-none overflow-hidden font-sans ${isEmbedded ? 'flex-1 w-full h-full min-h-0' : 'w-screen h-screen'}`}>
      {/* Top Header Bar (Shown when standalone, or compact strip when embedded) */}
      {!isEmbedded ? (
        <header
          className="h-14 border-b border-[#3C4043] bg-[#202124] px-4 sm:px-6 flex items-center justify-between shrink-0 z-30"
          style={{ WebkitAppRegion: 'drag' }}
        >
          <div className="flex items-center space-x-3" style={{ WebkitAppRegion: 'no-drag' }}>
            {/* Bidirectional Navigation to Training Monitor */}
            <button
              type="button"
              onClick={() => {
                stopCamera();
                window.location.hash = '#admin';
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-[#3C4043] hover:bg-[#5CA0F2] text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer"
              title="Switch to Model Training Monitor"
            >
              <SignGestureIcon className="w-3.5 h-3.5 text-[#5CA0F2]" />
              <span>Training Monitor</span>
            </button>

            <div className="h-4 w-px bg-[#3C4043]" />
            <div className="flex items-center space-x-2">
              <AiInspectorIcon className="w-5 h-5 text-[#5CA0F2]" />
              <h1 className="text-sm sm:text-base font-bold text-white tracking-wide">
                MediaPipe & Vision Inspector
              </h1>
            </div>
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#5CA0F2]/15 text-[#5CA0F2] border border-[#5CA0F2]/30">
              Real-time Telemetry
            </span>
          </div>

          {/* Live Performance Status Badges */}
          <div className="flex items-center space-x-2 sm:space-x-3" style={{ WebkitAppRegion: 'no-drag' }}>
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#28292C] border border-[#3C4043] rounded-lg text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-[#34A853] animate-pulse" />
              <span className="text-slate-400">FPS:</span>
              <span className="text-white font-bold">{fps}</span>
            </div>

            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 bg-[#28292C] border border-[#3C4043] rounded-lg text-xs font-mono">
              <ProcessingCpuIcon className="w-3.5 h-3.5 text-[#8AB4F8]" />
              <span className="text-slate-400">MP:</span>
              <span className="text-emerald-400 font-bold">{mpLatency}ms</span>
            </div>

            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 bg-[#28292C] border border-[#3C4043] rounded-lg text-xs font-mono">
              <SparklesIcon className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span className="text-slate-400">Model:</span>
              <span className="text-amber-400 font-bold">{modelLatency}ms</span>
            </div>

            <TitleBar />
          </div>
        </header>
      ) : (
        <div className="h-10 border-b border-[#3C4043] bg-[#202124] px-4 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center space-x-2 text-slate-300 font-semibold">
            <AiInspectorIcon className="w-4 h-4 text-[#5CA0F2]" />
            <span>MediaPipe 21 Landmarks & Tensor Inspector</span>
          </div>
          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <div className="flex items-center space-x-1 px-2 py-0.5 bg-[#28292C] border border-[#3C4043] rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34A853] animate-pulse" />
              <span className="text-slate-400">FPS:</span>
              <span className="text-white font-bold">{fps}</span>
            </div>
            <div className="flex items-center space-x-1 px-2 py-0.5 bg-[#28292C] border border-[#3C4043] rounded">
              <span className="text-slate-400">WASM:</span>
              <span className="text-emerald-400 font-bold">{mpLatency}ms</span>
            </div>
            <div className="flex items-center space-x-1 px-2 py-0.5 bg-[#28292C] border border-[#3C4043] rounded">
              <span className="text-slate-400">Model:</span>
              <span className="text-amber-400 font-bold">{modelLatency}ms</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left / Center: Interactive Visual Stage & Canvas */}
        <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-[#3C4043] overflow-hidden bg-[#18191B]">
          {/* Stage Controls Strip */}
          <div className="h-11 px-4 border-b border-[#3C4043] bg-[#202124] flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 sm:space-x-3 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setIsFrozen((p) => !p)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                  isFrozen
                    ? 'bg-[#EA4335] text-white shadow-md shadow-red-500/20'
                    : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
                }`}
                title="Freeze current frame to inspect coordinates"
              >
                {isFrozen ? <PlayActionIcon className="w-3 h-3" /> : <PauseActionIcon className="w-3 h-3" />}
                <span>{isFrozen ? 'Resume' : 'Freeze Frame'}</span>
              </button>

              <button
                type="button"
                onClick={() => setWireframeOnly((p) => !p)}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  wireframeOnly
                    ? 'bg-[#5CA0F2] text-white shadow-md shadow-blue-500/20'
                    : 'bg-[#3C4043]/60 hover:bg-[#3C4043] text-slate-300'
                }`}
              >
                Pure 3D Wireframe
              </button>

              <button
                type="button"
                onClick={() => setIsMirror((p) => !p)}
                className={`px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  isMirror ? 'bg-[#3C4043] text-slate-200' : 'bg-transparent text-slate-400 hover:text-white'
                }`}
              >
                Mirror: {isMirror ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={() => setShowLandmarkLabels((p) => !p)}
                className={`px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  showLandmarkLabels ? 'bg-[#5CA0F2]/20 text-[#5CA0F2] border border-[#5CA0F2]/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                Landmark IDs (0-20)
              </button>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {copyStatus && (
                <span className="text-[11px] font-semibold text-emerald-400 animate-in fade-in">
                  {copyStatus}
                </span>
              )}
              <button
                type="button"
                onClick={handleCopyLandmarksJSON}
                disabled={rawLandmarks.length === 0}
                className="px-2.5 py-1 bg-[#3C4043] hover:bg-[#474B4F] disabled:opacity-40 text-slate-200 rounded-lg font-medium transition-all cursor-pointer flex items-center space-x-1"
                title="Copy raw 21 landmarks JSON"
              >
                <CopyActionIcon className="w-3 h-3" />
                <span className="hidden sm:inline">Copy 21-Points</span>
              </button>

              <button
                type="button"
                onClick={handleExportSnapshot}
                disabled={rawLandmarks.length === 0}
                className="px-2.5 py-1 bg-[#3C4043] hover:bg-[#474B4F] disabled:opacity-40 text-slate-200 rounded-lg font-medium transition-all cursor-pointer flex items-center space-x-1"
                title="Export complete frame snapshot JSON"
              >
                <DownloadTranscriptIcon className="w-3 h-3" />
                <span className="hidden sm:inline">Snapshot</span>
              </button>
            </div>
          </div>

          {/* Interactive Canvas Viewport */}
          <div className="flex-1 relative flex items-center justify-center p-3 sm:p-4 overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '1px',
                height: '1px',
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -1,
              }}
            />
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-[#3C4043]/50 cursor-crosshair bg-black"
            />

            {/* Hand Status Overlay Pill */}
            <div className="absolute top-6 left-6 flex items-center space-x-2 px-3 py-1.5 bg-black/75 backdrop-blur-md rounded-full border border-white/10 text-xs font-medium">
              <span
                className={`w-2 h-2 rounded-full ${
                  rawLandmarks.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>
                {rawLandmarks.length > 0
                  ? `${handedness?.label || 'Hand'} Detected (${Math.round((handedness?.score || 0.95) * 100)}%)`
                  : 'No Hands Detected'}
              </span>
            </div>

            {/* Selected Landmark Floating Pill */}
            {selectedPointDetails && (
              <div className="absolute bottom-6 left-6 px-3.5 py-2 bg-[#202124]/90 backdrop-blur-md rounded-xl border border-[#3C4043] shadow-lg text-xs flex items-center space-x-3">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: selectedPointDetails.color }}
                />
                <div>
                  <div className="font-bold text-white">
                    #{selectedPointDetails.idx}: {selectedPointDetails.name}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    X: {selectedPointDetails.x} | Y: {selectedPointDetails.y} | Z: {selectedPointDetails.z}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Telemetry: Finger State Analyzer */}
          <div className="h-28 border-t border-[#3C4043] bg-[#202124] p-3 px-4 flex flex-col justify-between shrink-0">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span className="flex items-center space-x-1.5 text-white">
                <SignGestureIcon className="w-3.5 h-3.5 text-[#5CA0F2]" />
                <span>MediaPipe Finger Pose & Joint Angles</span>
              </span>
              <span>Click any finger or canvas landmark to inspect</span>
            </div>

            <div className="grid grid-cols-5 gap-2 mt-1">
              {['thumb', 'index', 'middle', 'ring', 'pinky'].map((key) => {
                const f = fingerStates ? fingerStates[key] : null;
                const isSelected =
                  key === 'thumb'
                    ? selectedLandmarkIdx <= 4
                    : key === 'index'
                    ? selectedLandmarkIdx >= 5 && selectedLandmarkIdx <= 8
                    : key === 'middle'
                    ? selectedLandmarkIdx >= 9 && selectedLandmarkIdx <= 12
                    : key === 'ring'
                    ? selectedLandmarkIdx >= 13 && selectedLandmarkIdx <= 16
                    : selectedLandmarkIdx >= 17;

                return (
                  <div
                    key={key}
                    onClick={() => {
                      const baseMap = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
                      setSelectedLandmarkIdx(baseMap[key]);
                    }}
                    className={`p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#5CA0F2]/15 border-[#5CA0F2]'
                        : 'bg-[#28292C] border-[#3C4043] hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-white capitalize">{key}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          f?.isOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {f?.isOpen ? 'OPEN' : 'BENT'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>Angle:</span>
                      <span className="text-white font-bold">{f ? `${f.angle}°` : '--'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Panel: MediaPipe 21 Points Table & Classifier Model Inspector */}
        <div className="w-full lg:w-[440px] xl:w-[480px] bg-[#202124] flex flex-col overflow-hidden shrink-0">
          {/* Tab Selector */}
          <div className="h-11 border-b border-[#3C4043] flex items-center px-4 bg-[#28292C]">
            <div className="flex items-center space-x-1 w-full bg-[#202124] p-1 rounded-lg border border-[#3C4043]">
              <button
                type="button"
                onClick={() => setActiveTab('landmarks')}
                className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  activeTab === 'landmarks'
                    ? 'bg-[#3C4043] text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                21 Landmarks Table
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tensor')}
                className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  activeTab === 'tensor'
                    ? 'bg-[#3C4043] text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Input Tensor
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('model')}
                className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  activeTab === 'model'
                    ? 'bg-[#3C4043] text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Model Output
              </button>
            </div>
          </div>

          {/* TAB 1: 21 Landmarks Table */}
          {activeTab === 'landmarks' && (
            <div className="flex-1 flex flex-col overflow-hidden p-4">
              <div className="flex items-center justify-between pb-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    MediaPipe 3D Coordinates
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Normalized screen coordinates $[0.0 \dots 1.0]$ with relative depth $Z$.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLandmarksJSON}
                  className="text-xs text-[#5CA0F2] hover:underline font-semibold"
                >
                  Copy JSON
                </button>
              </div>

              <div className="flex-1 overflow-y-auto border border-[#3C4043] rounded-xl bg-[#18191B]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#28292C] sticky top-0 text-[11px] font-bold text-slate-300 border-b border-[#3C4043]">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-2">Landmark</th>
                      <th className="py-2 px-2 text-right">X</th>
                      <th className="py-2 px-2 text-right">Y</th>
                      <th className="py-2 px-3 text-right">Z</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#28292C]">
                    {LANDMARK_NAMES.map((name, idx) => {
                      const p = rawLandmarks[idx];
                      const isSelected = selectedLandmarkIdx === idx;
                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedLandmarkIdx(idx)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#5CA0F2]/20 font-bold'
                              : 'hover:bg-[#28292C]/60 text-slate-300'
                          }`}
                        >
                          <td className="py-2 px-3 text-slate-500">{idx}</td>
                          <td className="py-2 px-2 flex items-center space-x-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: getLandmarkColor(idx) }}
                            />
                            <span className="truncate max-w-[110px] text-white">{name}</span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            {p ? p.x.toFixed(3) : '--'}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">
                            {p ? p.y.toFixed(3) : '--'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-400">
                            {p ? (p.z || 0).toFixed(3) : '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Input Tensor (Preprocessed Feature Vector) */}
          {activeTab === 'tensor' && (
            <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Feature Normalizer Tensor
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Wrist-origin $(0,0,0)$ & palm-scale invariant vector fed into classifier.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyTensorJSON}
                  disabled={normalizedVector.length === 0}
                  className="text-xs text-[#5CA0F2] hover:underline font-semibold"
                >
                  Copy Vector
                </button>
              </div>

              {/* Tensor Metadata Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#28292C] border border-[#3C4043] rounded-lg p-2.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Dimensions</div>
                  <div className="text-base font-bold text-white font-mono mt-0.5">
                    {vectorStats ? `${vectorStats.dim}D` : '0D'}
                  </div>
                </div>
                <div className="bg-[#28292C] border border-[#3C4043] rounded-lg p-2.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Range [Min, Max]</div>
                  <div className="text-xs font-bold text-[#5CA0F2] font-mono mt-1">
                    {vectorStats ? `[${vectorStats.min}, ${vectorStats.max}]` : '--'}
                  </div>
                </div>
                <div className="bg-[#28292C] border border-[#3C4043] rounded-lg p-2.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Avg Magnitude</div>
                  <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                    {vectorStats ? vectorStats.avgMag : '--'}
                  </div>
                </div>
              </div>

              {/* Tensor Heatmap Sparkline */}
              <div className="border border-[#3C4043] rounded-xl p-3 bg-[#18191B]">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-semibold text-white">Tensor Value Heatmap</span>
                  <span className="text-[11px]">63 / 126 coordinate elements</span>
                </div>
                <div className="grid grid-cols-9 gap-1 max-h-36 overflow-y-auto p-1 bg-black/40 rounded-lg">
                  {normalizedVector.map((val, i) => {
                    return (
                      <div
                        key={i}
                        title={`[${i}]: ${val}`}
                        className="h-6 rounded text-[9px] font-mono flex items-center justify-center font-bold transition-all text-white/90"
                        style={{
                          backgroundColor:
                            val > 0.1
                              ? `rgba(92, 160, 242, ${Math.min(1, Math.abs(val) + 0.3)})`
                              : val < -0.1
                              ? `rgba(236, 72, 153, ${Math.min(1, Math.abs(val) + 0.3)})`
                              : '#3C4043',
                        }}
                      >
                        {val.toFixed(1)}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Raw Vector Display */}
              <div className="flex-1 flex flex-col border border-[#3C4043] rounded-xl bg-[#18191B] overflow-hidden">
                <div className="px-3 py-1.5 bg-[#28292C] border-b border-[#3C4043] text-xs font-semibold text-slate-300">
                  Raw Normalized Float Array
                </div>
                <textarea
                  readOnly
                  value={normalizedVector.length > 0 ? JSON.stringify(normalizedVector) : 'No hands detected'}
                  className="flex-1 w-full p-3 bg-transparent text-slate-300 font-mono text-xs outline-none resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 3: Model Predictions & Classifier Output */}
          {activeTab === 'model' && (
            <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  k-NN / DTW Classifier Output
                </h3>
                <p className="text-[11px] text-slate-500">
                  Live inference distribution across trained American Sign Language signs.
                </p>
              </div>

              {/* Primary Active Match Banner */}
              <div className="p-4 rounded-xl border border-[#3C4043] bg-[#18191B] flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Top Recognized Sign
                  </div>
                  <div className="text-2xl font-black text-white mt-1 flex items-center space-x-2">
                    <span>{modelPredictions.gesture || 'Waiting for sign...'}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                      modelPredictions.confidence >= confidenceThreshold && modelPredictions.gesture
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    }`}
                  >
                    {modelPredictions.confidence >= confidenceThreshold && modelPredictions.gesture
                      ? 'TRIGGERED'
                      : 'BELOW THRESHOLD'}
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1">
                    Score: {Math.round(modelPredictions.confidence * 100)}%
                  </div>
                </div>
              </div>

              {/* Confidence Threshold Slider */}
              <div className="p-3 bg-[#28292C] border border-[#3C4043] rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">Detection Threshold</span>
                  <span className="font-mono font-bold text-[#5CA0F2]">
                    {Math.round(confidenceThreshold * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="w-full accent-[#5CA0F2] cursor-pointer"
                />
              </div>

              {/* Top-5 Predictions Softmax Bar Chart */}
              <div className="flex-1 border border-[#3C4043] rounded-xl p-3 bg-[#18191B] overflow-y-auto space-y-2.5">
                <div className="text-xs font-semibold text-slate-300 pb-1 border-b border-[#28292C] flex items-center justify-between">
                  <span>Top-5 Gesture Candidates</span>
                  <span className="text-[11px] text-slate-500">Distribution</span>
                </div>

                {modelPredictions.topCandidates && modelPredictions.topCandidates.length > 0 ? (
                  modelPredictions.topCandidates.slice(0, 5).map((cand, idx) => {
                    const pct = Math.round((cand.confidence || cand.score || 0) * 100);
                    const isTop = idx === 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${isTop ? 'text-white' : 'text-slate-400'}`}>
                            #{idx + 1} {cand.name || cand.gesture}
                          </span>
                          <span className="font-mono font-bold text-slate-200">{pct}%</span>
                        </div>
                        <div className="w-full h-2 bg-[#28292C] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-150 ${
                              isTop ? 'bg-[#5CA0F2]' : 'bg-[#3C4043]'
                            }`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No active prediction candidates in current frame
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
