import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Camera, ShieldCheck, Upload, Download, Trash2, CheckCircle, RefreshCw, Key, ArrowLeft, Radio, Plus, Edit2, Layers, Hand, Subtitles, Sparkles } from 'lucide-react';
import { createMediaPipeHandsInstance, drawHandResults, classifyGesture, loadCustomDataset } from '../../services/mediapipe';
import { normalizeMultiHandLandmarks } from '../../services/gestureClassifier';
import { useAslAggregator } from '../../hooks/useAslAggregator';

const DEFAULT_SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

/**
 * Isolated Standalone Admin Component: ASL Gesture Studio Trainer
 * Protected by Admin Secret Key. Allows admins to record crisp 5-second camera landmark samples (1 or 2 hands),
 * manage multi-sample variations per gesture label, edit label names, and import/export Kaggle/Colab JSON datasets directly to Server.
 */
export default function AdminGestureStudio({ onBackToApp }) {
  const [adminKey, setAdminKey] = useState(localStorage.getItem('sl_meet_admin_key') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  
  const [gesturesList, setGesturesList] = useState([]);
  const [gestureName, setGestureName] = useState('');
  const [capturedVector, setCapturedVector] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  
  // Real-Time ASL Live Classification & Subtitle State
  const [liveDetection, setLiveDetection] = useState({ gesture: '', confidence: 0 });
  const [showSubtitles, setShowSubtitles] = useState(true);
  const { currentSentence, pushGesture, clearTranscript } = useAslAggregator(1500, 3, 400);

  // 5-Second Recording Timer State
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(5);
  
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsInstanceRef = useRef(null);
  const latestLandmarksRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recordedFramesRef = useRef([]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

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

  // Unique list of existing label names for dropdown selection
  const existingLabels = useMemo(() => Object.keys(groupedGestures), [groupedGestures]);

  // Authenticate Admin Secret Key against backend server
  const handleVerifyKey = async (keyToVerify = adminKey) => {
    setAuthError('');
    setLoading(true);
    try {
      const res = await fetch(`${DEFAULT_SERVER_URL}/api/admin/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': keyToVerify,
        },
      });

      if (res.ok) {
        setIsAuthenticated(true);
        localStorage.setItem('sl_meet_admin_key', keyToVerify);
        fetchServerDataset(keyToVerify);
      } else {
        setIsAuthenticated(false);
        setAuthError('Invalid Admin Secret Key.');
      }
    } catch (err) {
      setAuthError('Failed to connect to backend server API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminKey) {
      handleVerifyKey(adminKey);
    }
  }, []);

  // Keep classifier memory dataset synchronized whenever gesturesList state updates
  useEffect(() => {
    if (gesturesList && Array.isArray(gesturesList)) {
      loadCustomDataset(gesturesList);
    }
  }, [gesturesList]);

  // Fetch active dataset from backend server
  const fetchServerDataset = async (key = adminKey) => {
    try {
      const res = await fetch(`${DEFAULT_SERVER_URL}/api/gestures/dataset?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const gestures = data?.dataset?.gestures || data?.gestures || [];
        if (Array.isArray(gestures)) {
          setGesturesList(gestures);
          loadCustomDataset(gestures);
        }
      }
    } catch (err) {
      console.error('Failed to fetch server dataset:', err);
    }
  };

  // Start Camera & MediaPipe tracking for recording
  const startCamera = async () => {
    if (gesturesList.length === 0) {
      await fetchServerDataset();
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraActive(true);
        };
      }

      const hands = createMediaPipeHandsInstance((results) => {
        if (canvasRef.current && videoRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth || 1280;
          canvasRef.current.height = videoRef.current.videoHeight || 720;
          const ctx = canvasRef.current.getContext('2d');
          drawHandResults(ctx, results);
        }

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          latestLandmarksRef.current = results.multiHandLandmarks;

          // Real-time ASL classification for live subtitle verification in Admin Studio
          const classification = classifyGesture(
            results.multiHandLandmarks[0],
            results.multiHandedness ? results.multiHandedness[0] : null,
            results.multiHandLandmarks,
            results.multiHandedness
          );

          if (classification && classification.gesture && classification.gesture !== 'Signing...') {
            setLiveDetection(classification);
            pushGesture('Admin', classification.gesture, classification.confidence);
          } else {
            setLiveDetection({
              gesture: '',
              confidence: 0,
              closestGesture: classification?.closestGesture || '',
              distance: classification?.distance || null,
            });
          }

          // If currently recording 5s sample, push normalized keypoints to frame buffer
          if (isRecordingRef.current) {
            const normalized = normalizeMultiHandLandmarks(results.multiHandLandmarks, results.multiHandedness);
            if (normalized) {
              recordedFramesRef.current.push(normalized);
            }
          }
        } else {
          latestLandmarksRef.current = null;
          setLiveDetection({ gesture: '', confidence: 0 });
        }
      });

      handsInstanceRef.current = hands;

      const processFrame = async () => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          try {
            await hands.send({ image: videoRef.current });
          } catch (err) {}
        }
        if (handsInstanceRef.current) {
          requestAnimationFrame(processFrame);
        }
      };

      requestAnimationFrame(processFrame);
    } catch (err) {
      setStatusMsg('Failed to access camera.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (handsInstanceRef.current) {
      handsInstanceRef.current.close();
      handsInstanceRef.current = null;
    }
    setCameraActive(false);
  };

  // Start 5-Second Recording Session for 1 or 2 Hand Gestures
  const handleStart5sRecording = () => {
    if (!cameraActive) {
      setStatusMsg('Please start camera first!');
      return;
    }

    recordedFramesRef.current = [];
    setIsRecording(true);
    setCountdown(5);
    setStatusMsg('Recording 5-second sample... Hold gesture (1 or 2 hands) steadily in front of camera!');

    let currentSec = 5;
    const interval = setInterval(() => {
      currentSec -= 1;
      setCountdown(currentSec);

      if (currentSec <= 0) {
        clearInterval(interval);
        setIsRecording(false);

        // Process collected frames from 5-second recording window
        const frames = recordedFramesRef.current;
        if (frames.length > 0) {
          const lenCounts = {};
          frames.forEach((f) => {
            lenCounts[f.length] = (lenCounts[f.length] || 0) + 1;
          });
          const dominantLen = Number(
            Object.keys(lenCounts).reduce((a, b) => (lenCounts[a] > lenCounts[b] ? a : b))
          );

          const validFrames = frames.filter((f) => f.length === dominantLen);
          const avgVector = new Array(dominantLen).fill(0);
          for (const f of validFrames) {
            for (let i = 0; i < dominantLen; i++) {
              avgVector[i] += f[i];
            }
          }
          for (let i = 0; i < dominantLen; i++) {
            avgVector[i] = parseFloat((avgVector[i] / validFrames.length).toFixed(4));
          }

          setCapturedVector(avgVector);
          const handModeStr = dominantLen === 126 ? '2 Hands (126 features)' : '1 Hand (63 features)';
          setStatusMsg(`Recorded 5s sample successfully! (${validFrames.length} frames averaged, Mode: ${handModeStr})`);
        } else {
          setStatusMsg('No hand landmarks detected during 5-second recording.');
        }
      }
    }, 1000);
  };

  // Save new sample to backend Server API
  const handleSaveSample = async () => {
    if (!gestureName.trim()) {
      setStatusMsg('Please enter or select a Gesture Label Name!');
      return;
    }
    if (!capturedVector) {
      setStatusMsg('Please record a 5-second sample first!');
      return;
    }

    const isTwoHands = capturedVector.length === 126;
    setLoading(true);
    try {
      const labelTrimmed = gestureName.trim();
      const existingCount = (groupedGestures[labelTrimmed] || []).length;
      const res = await fetch(`${DEFAULT_SERVER_URL}/api/gestures/sample`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          name: labelTrimmed,
          type: isTwoHands ? 'two_hands' : 'single_hand',
          vector: capturedVector,
          description: `Variation #${existingCount + 1} (${isTwoHands ? '2 hands' : '1 hand'}) recorded via Admin Studio on ${new Date().toLocaleDateString()}`,
        }),
      });

      if (res.ok) {
        setStatusMsg(`Saved sample variation #${existingCount + 1} for "${labelTrimmed}" (${isTwoHands ? '2 Hands' : '1 Hand'}) successfully!`);
        setCapturedVector(null);
        fetchServerDataset();
      } else {
        setStatusMsg('Failed to save gesture sample to Server.');
      }
    } catch (err) {
      setStatusMsg('Server API connection error.');
    } finally {
      setLoading(false);
    }
  };

  // Delete single sample variation by ID
  const handleDeleteSample = async (id, labelName) => {
    if (!window.confirm(`Delete this sample variation for "${labelName}"?`)) return;

    try {
      const res = await fetch(`${DEFAULT_SERVER_URL}/api/gestures/sample/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-key': adminKey,
        },
      });

      if (res.ok) {
        setStatusMsg(`Deleted sample variation.`);
        fetchServerDataset();
      }
    } catch (err) {
      setStatusMsg('Failed to delete sample variation.');
    }
  };

  // Delete all sample variations for a label
  const handleDeleteLabelGroup = async (labelName) => {
    if (!window.confirm(`Delete ALL sample variations for gesture "${labelName}"?`)) return;

    try {
      const res = await fetch(`${DEFAULT_SERVER_URL}/api/gestures/label/${encodeURIComponent(labelName)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-key': adminKey,
        },
      });

      if (res.ok) {
        setStatusMsg(`Deleted gesture label "${labelName}" and all its samples.`);
        if (gestureName === labelName) setGestureName('');
        fetchServerDataset();
      }
    } catch (err) {
      setStatusMsg('Failed to delete gesture label.');
    }
  };

  // Edit / Rename label name for all samples
  const handleRenameLabel = async (oldLabel) => {
    const newName = prompt(`Enter new label name for "${oldLabel}":`, oldLabel);
    if (!newName || !newName.trim() || newName.trim() === oldLabel) return;

    const samplesToRename = groupedGestures[oldLabel] || [];
    setLoading(true);
    try {
      for (const sample of samplesToRename) {
        await fetch(`${DEFAULT_SERVER_URL}/api/gestures/sample/${sample.id || encodeURIComponent(oldLabel)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminKey,
          },
          body: JSON.stringify({ name: newName.trim() }),
        });
      }
      setStatusMsg(`Renamed gesture "${oldLabel}" to "${newName.trim()}"!`);
      if (gestureName === oldLabel) setGestureName(newName.trim());
      fetchServerDataset();
    } catch (err) {
      setStatusMsg('Failed to rename gesture label.');
    } finally {
      setLoading(false);
    }
  };

  // Import Kaggle / Colab JSON dataset file
  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        const res = await fetch(`${DEFAULT_SERVER_URL}/api/gestures/dataset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminKey,
          },
          body: JSON.stringify({ dataset: json }),
        });

        if (res.ok) {
          const data = await res.json();
          setStatusMsg(`Imported Kaggle/Colab dataset with ${data.count} samples successfully!`);
          fetchServerDataset();
        } else {
          setStatusMsg('Invalid dataset format.');
        }
      } catch (err) {
        setStatusMsg('Error parsing JSON file.');
      }
    };
    reader.readAsText(file);
  };

  // Export Dataset JSON
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(
      {
        name: 'SL-Meet Exported Dataset',
        exportedAt: new Date().toISOString(),
        gestures: gesturesList,
      },
      null,
      2
    );
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sl-meet-dataset-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Force Deploy to connected clients
  const handleDeployDataset = async () => {
    setLoading(true);
    setStatusMsg('Deploying dataset to all active clients...');
    try {
      const res = await fetch(`${DEFAULT_SERVER_URL}/api/admin/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setStatusMsg(`Deploy successful! Active dataset (${data.count} gestures) synced to clients.`);
      } else {
        setStatusMsg('Failed to deploy dataset to clients.');
      }
    } catch (err) {
      setStatusMsg('Deploy API connection error.');
    } finally {
      setLoading(false);
    }
  };

  // Login Screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="w-screen h-screen bg-[#0F1015] text-white flex items-center justify-center p-4 font-sans select-none">
        <div className="w-full max-w-md bg-[#181920] border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/30">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Admin Gesture Studio</h1>
            <p className="text-xs text-slate-400">
              Isolated training portal. Enter Admin Secret Key to manage dataset.
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
                  className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors pl-10"
                />
                <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {authError && <div className="text-xs text-rose-400 text-center">{authError}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Access Admin Studio'}
            </button>
          </form>

          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="w-full text-xs text-slate-400 hover:text-white flex items-center justify-center space-x-1 transition-colors pt-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Meeting App</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen max-h-screen bg-[#0F1015] text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Top Header */}
      <header className="w-full bg-[#181920] border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center space-x-2">
              <span>Admin Gesture Studio</span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                Isolated Portal
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Server Dataset Manager & 5s Camera Trainer</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-2 transition-colors border border-slate-700">
            <Upload className="w-4 h-4 text-blue-400" />
            <span>Import Kaggle/Colab JSON</span>
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>

          <button
            onClick={handleDeployDataset}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center space-x-2 transition-colors border border-purple-500 disabled:opacity-50"
          >
            <Layers className="w-4 h-4" />
            <span>Save & Deploy</span>
          </button>

          <button
            onClick={handleExportJson}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-2 transition-colors border border-slate-700"
          >
            <Download className="w-4 h-4 text-green-400" />
            <span>Export JSON</span>
          </button>

          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Meeting App</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Studio Body */}
      <div className="flex-1 w-full grid grid-cols-12 gap-6 p-6 overflow-hidden min-h-0">
        {/* Left Stage: Live Camera Feed & Landmark Recorder */}
        <div className="col-span-7 flex flex-col gap-4 h-full min-h-0">
          <div className={`relative flex-1 bg-slate-950 rounded-2xl overflow-hidden border transition-all flex items-center justify-center ${
            isRecording ? 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.4)]' : 'border-slate-800'
          }`}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 ${
                cameraActive ? 'block' : 'hidden'
              }`}
            />
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none ${
                cameraActive ? 'block' : 'hidden'
              }`}
            />

            {/* Top Bar Indicators: Live Classifier Tag & Subtitles Toggle */}
            {cameraActive && (
              <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
                {liveDetection.gesture ? (
                  <div className="bg-slate-900/85 backdrop-blur-md text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-500/40 shadow-lg flex items-center space-x-2 pointer-events-auto">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>LIVE DETECT: {liveDetection.gesture.toUpperCase()}</span>
                    <span className="text-[10px] text-emerald-300/80 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {Math.round(liveDetection.confidence * 100)}%
                    </span>
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
                  <div className="bg-slate-900/70 backdrop-blur-md text-slate-400 text-xs px-3 py-1.5 rounded-xl border border-slate-700/50">
                    AI Vision Ready ({gesturesList.length} samples)
                  </div>
                )}

                <button
                  onClick={() => setShowSubtitles((prev) => !prev)}
                  className="pointer-events-auto bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md text-slate-300 text-xs px-3 py-1.5 rounded-xl border border-slate-700/80 transition-colors flex items-center space-x-1.5 shadow-md"
                >
                  <Subtitles className={`w-3.5 h-3.5 ${showSubtitles ? 'text-blue-400' : 'text-slate-500'}`} />
                  <span>{showSubtitles ? 'Subtitles On' : 'Subtitles Off'}</span>
                </button>
              </div>
            )}

            {/* Bottom Live Subtitle UI Overlay */}
            {cameraActive && showSubtitles && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-lg pointer-events-auto transition-all">
                <div className="bg-slate-950/90 backdrop-blur-xl border border-blue-500/40 shadow-[0_8px_32px_rgba(0,0,0,0.6)] rounded-2xl p-3.5 text-center space-y-1.5">
                  <div className="flex items-center justify-center space-x-2 text-[11px] font-semibold uppercase tracking-wider text-blue-400">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                    <span>Live AI Vision Subtitle</span>
                    {currentSentence && (
                      <button
                        onClick={clearTranscript}
                        className="text-[10px] text-slate-400 hover:text-white transition-colors bg-slate-800/80 px-1.5 py-0.5 rounded ml-2"
                        title="Clear current subtitle"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="text-base font-extrabold text-white tracking-wide leading-snug drop-shadow-md min-h-[24px]">
                    {currentSentence || liveDetection.gesture || (
                      liveDetection.closestGesture
                        ? `Closest gesture: "${liveDetection.closestGesture}" (dist: ${liveDetection.distance})`
                        : 'Wave or perform hand gesture to test...'
                    )}
                  </div>

                  <div className="text-[10px] text-slate-400">
                    Verified real-time against active dataset ({gesturesList.length} total samples)
                  </div>
                </div>
              </div>
            )}

            {/* 5-Second Recording Overlay (Unblurred camera stream for clear visibility) */}
            {isRecording && (
              <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-5 select-none">
                <div className="flex items-center justify-between">
                  <div className="bg-rose-600/90 backdrop-blur-md text-white text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider flex items-center space-x-2 shadow-2xl border border-rose-400/40">
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                    <span>Recording 5s Sample...</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-rose-600/90 text-white font-extrabold text-2xl flex items-center justify-center shadow-2xl border border-rose-300/40 animate-pulse">
                    {countdown}s
                  </div>
                </div>

                <div className="text-center">
                  <span className="bg-black/75 backdrop-blur-md text-slate-100 text-xs px-4 py-1.5 rounded-full border border-slate-700/80 shadow-lg font-medium">
                    Hold 1 or 2 hands steadily in camera view
                  </span>
                </div>
              </div>
            )}

            {!cameraActive && (
              <div className="flex flex-col items-center justify-center text-slate-500 space-y-3">
                <Camera className="w-12 h-12 stroke-[1.5]" />
                <span className="text-xs">Camera is offline</span>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-md"
                >
                  Start Camera
                </button>
              </div>
            )}
          </div>

          {/* Action Bar & Label Management */}
          <div className="bg-[#181920] border border-slate-800 p-4 rounded-2xl space-y-3 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  list="existing-gesture-labels"
                  value={gestureName}
                  onChange={(e) => setGestureName(e.target.value)}
                  placeholder="Gesture Label Name (e.g. Thank You)"
                  className="w-full bg-[#20222A] border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <datalist id="existing-gesture-labels">
                  {existingLabels.map((lbl) => (
                    <option key={lbl} value={lbl} />
                  ))}
                </datalist>
                {gestureName && groupedGestures[gestureName.trim()] && (
                  <span className="absolute right-3 top-2.5 text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                    {groupedGestures[gestureName.trim()].length} variations existing
                  </span>
                )}
              </div>

              <button
                onClick={handleStart5sRecording}
                disabled={!cameraActive || isRecording}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-colors border outline-none disabled:opacity-50 ${
                  isRecording
                    ? 'bg-rose-600 text-white border-transparent'
                    : 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/40'
                }`}
              >
                <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
                <span>{isRecording ? `Recording (${countdown}s)...` : 'Record 5s Sample'}</span>
              </button>

              <button
                onClick={handleSaveSample}
                disabled={!capturedVector || isRecording}
                className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-semibold flex items-center space-x-2 transition-colors shadow-md disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Add Sample Variation</span>
              </button>
            </div>

            {statusMsg && (
              <div className="text-xs text-blue-300 font-medium flex items-center space-x-2 bg-blue-950/40 border border-blue-800/40 px-3 py-1.5 rounded-lg">
                <span>{statusMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Stage: Active Server Gestures Roster (Grouped by Gesture Label) */}
        <div className="col-span-5 bg-[#181920] border border-slate-800 rounded-2xl p-4 flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                <span>Server Dataset Gestures</span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                  {existingLabels.length} labels / {gesturesList.length} samples
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">Multiple samples per label enhance classification accuracy</p>
            </div>
            <button
              onClick={() => fetchServerDataset()}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Refresh dataset from server"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {existingLabels.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-8">
                No gestures recorded on server yet.
              </div>
            ) : (
              existingLabels.map((label) => {
                const samples = groupedGestures[label] || [];
                return (
                  <div
                    key={label}
                    className="bg-[#20222A] border border-slate-800/80 rounded-xl p-3.5 space-y-2.5 hover:border-slate-700 transition-colors"
                  >
                    {/* Label Group Header */}
                    <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-xs font-bold text-white">{label}</h3>
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 font-medium">
                          {samples.length} {samples.length === 1 ? 'sample' : 'samples'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => {
                            setGestureName(label);
                            setStatusMsg(`Selected "${label}". Ready to record additional sample variation!`);
                          }}
                          className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[11px] font-medium flex items-center space-x-1 transition-colors"
                          title="Record another sample variation for this gesture"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Variation</span>
                        </button>
                        <button
                          onClick={() => handleRenameLabel(label)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Rename gesture label"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLabelGroup(label)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                          title="Delete all samples for this gesture label"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Sample Variations List */}
                    <div className="space-y-1.5">
                      {samples.map((sample, sIdx) => {
                        const isTwo = sample.vector?.length === 126 || sample.type === 'two_hands';
                        return (
                          <div
                            key={sample.id || sIdx}
                            className="bg-[#181920] border border-slate-800/60 rounded-lg px-3 py-2 flex items-center justify-between text-[11px]"
                          >
                            <div className="flex items-center space-x-2">
                              <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-400 text-[9px] font-bold flex items-center justify-center">
                                #{sIdx + 1}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                                isTwo
                                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              }`}>
                                {isTwo ? '2 Hands (126 pts)' : '1 Hand (63 pts)'}
                              </span>
                              <span className="text-slate-400 truncate max-w-[150px]">
                                {sample.description || 'Recorded sample variation'}
                              </span>
                            </div>

                            <button
                              onClick={() => handleDeleteSample(sample.id, label)}
                              className="p-1 rounded bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Delete this sample variation"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
