import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom Hook: Manages local webcam & microphone hardware stream,
 * device enumeration (camera, mic, speaker), device switching,
 * audio muting, video toggling, real-time speaking detection (VAD), and track cleanup.
 *
 * @param {Object} options
 * @param {boolean} options.isActive - If false, hardware devices are completely stopped and released.
 */
export function useLocalMedia({ isActive = false } = {}) {
  const videoRef = useRef(null);
  const localStreamRef = useRef(null);
  const isBusyRef = useRef(false);
  const isCameraOffRef = useRef(false);
  const isActiveRef = useRef(isActive);
  const selectedAudioDeviceIdRef = useRef('');
  const selectedVideoDeviceIdRef = useRef('');

  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState(null);

  // Keep refs synchronized for callbacks without stale closures
  useEffect(() => {
    isCameraOffRef.current = isCameraOff;
  }, [isCameraOff]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Hardware device lists
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [speakerDevices, setSpeakerDevices] = useState([]);

  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState('');
  const [selectedSpeakerDeviceId, setSelectedSpeakerDeviceId] = useState('');

  useEffect(() => {
    selectedAudioDeviceIdRef.current = selectedAudioDeviceId;
  }, [selectedAudioDeviceId]);

  useEffect(() => {
    selectedVideoDeviceIdRef.current = selectedVideoDeviceId;
  }, [selectedVideoDeviceId]);

  // Fetch available media input & output devices
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');

      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
      setSpeakerDevices(audioOutputs);
    } catch (err) {
      console.warn('Failed to enumerate media devices:', err);
    }
  }, []);

  // Explicitly stop all hardware media tracks & release devices
  const stopMedia = useCallback(() => {
    isBusyRef.current = false;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsSpeaking(false);
    setIsCameraOff(false);
    setIsMuted(false);
    isCameraOffRef.current = false;
  }, []);

  // Initialize camera and mic stream with selected or default devices
  const startMedia = useCallback(async (audioId = '', videoId = '') => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;

    try {
      // Stop existing stream tracks first
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }

      const activeAudioId = audioId || selectedAudioDeviceIdRef.current;
      const activeVideoId = videoId || selectedVideoDeviceIdRef.current;

      const audioConstraints = {
        ...(activeAudioId ? { deviceId: { ideal: activeAudioId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      };

      const shouldIncludeVideo = !isCameraOffRef.current;
      const videoConstraints = shouldIncludeVideo
        ? {
            ...(activeVideoId ? { deviceId: { ideal: activeVideoId } } : {}),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false;

      let stream = null;

      // Tier 1: Try preferred constraints with ideal deviceId & ideal 720p resolution
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });
      } catch (tier1Err) {
        console.warn('[useLocalMedia] Preferred constraints failed, attempting generic fallback:', tier1Err);

        // Tier 2: Try generic constraints (any video + audio without specific deviceId or resolution)
        if (shouldIncludeVideo) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
          } catch (tier2Err) {
            console.warn('[useLocalMedia] Generic video+audio failed, trying audio-only fallback:', tier2Err);
          }
        }

        // Tier 3: Audio-only fallback if camera is physically locked or denied
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: audioConstraints,
            });
            setIsCameraOff(true);
            isCameraOffRef.current = true;
          } catch (audioErr) {
            console.error('[useLocalMedia] Audio-only fallback failed as well:', audioErr);
          }
        }
      }

      // Check if media was deactivated while getUserMedia was resolving
      if (!isActiveRef.current) {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
        return;
      }

      if (stream) {
        const hasVideo = stream.getVideoTracks().length > 0;
        setIsCameraOff(!hasVideo);
        isCameraOffRef.current = !hasVideo;

        localStreamRef.current = stream;
        setLocalStream(stream);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play?.().catch(() => {});
        }

        // Update selected device IDs from active stream tracks
        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];
        if (audioTrack) {
          const settings = audioTrack.getSettings();
          if (settings.deviceId) {
            setSelectedAudioDeviceId(settings.deviceId);
            selectedAudioDeviceIdRef.current = settings.deviceId;
          }
          if (import.meta.env.DEV) {
            console.log('[useLocalMedia] Audio track settings:', {
              echoCancellation: settings.echoCancellation,
              noiseSuppression: settings.noiseSuppression,
              autoGainControl: settings.autoGainControl,
              channelCount: settings.channelCount,
              sampleRate: settings.sampleRate,
            });
          }
        }
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          if (settings.deviceId) {
            setSelectedVideoDeviceId(settings.deviceId);
            selectedVideoDeviceIdRef.current = settings.deviceId;
          }
        }
      }

      await refreshDevices();
    } catch (err) {
      console.error('[useLocalMedia] Failed to get local media stream:', err);
      setError(err.message);
    } finally {
      isBusyRef.current = false;
    }
  }, [refreshDevices]);

  // Manage media stream lifecycle based on active view (Waiting Lobby / Room only)
  useEffect(() => {
    if (isActive) {
      startMedia();
    } else {
      stopMedia();
    }

    return () => {
      stopMedia();
    };
  }, [isActive, startMedia, stopMedia]);

  // Device Switch Handlers
  const changeAudioDevice = useCallback(async (deviceId) => {
    if (!deviceId) return;
    setSelectedAudioDeviceId(deviceId);
    selectedAudioDeviceIdRef.current = deviceId;
    await startMedia(deviceId, selectedVideoDeviceIdRef.current);
  }, [startMedia]);

  const changeVideoDevice = useCallback(async (deviceId) => {
    if (!deviceId) return;
    setSelectedVideoDeviceId(deviceId);
    selectedVideoDeviceIdRef.current = deviceId;
    if (!isCameraOffRef.current) {
      await startMedia(selectedAudioDeviceIdRef.current, deviceId);
    }
  }, [startMedia]);

  const changeSpeakerDevice = useCallback((deviceId) => {
    setSelectedSpeakerDeviceId(deviceId);
    if (videoRef.current && typeof videoRef.current.setSinkId === 'function') {
      videoRef.current.setSinkId(deviceId).catch((err) => {
        console.warn('Failed to setSinkId on video element:', err);
      });
    }
  }, []);

  // Real-Time Audio Speaking Activity Detection (Web Audio API Analyser with Hangover Smoothing)
  useEffect(() => {
    if (!localStream || isMuted) {
      setIsSpeaking(false);
      return;
    }

    let audioContext = null;
    let animId = null;
    let isCurrentlySpeaking = false;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(localStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const SILENCE_HOLD_MS = 350; // Hold active state across brief pauses between words
      const VOLUME_THRESHOLD = 10;
      let lastSpokenTime = 0;

      const checkSpeaking = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        const len = dataArray.length;
        for (let i = 0; i < len; i++) {
          sum += dataArray[i];
        }
        const average = sum / len;
        const now = Date.now();

        if (average > VOLUME_THRESHOLD) {
          lastSpokenTime = now;
          if (!isCurrentlySpeaking) {
            isCurrentlySpeaking = true;
            setIsSpeaking(true);
          }
        } else if (isCurrentlySpeaking && now - lastSpokenTime > SILENCE_HOLD_MS) {
          isCurrentlySpeaking = false;
          setIsSpeaking(false);
        }

        animId = requestAnimationFrame(checkSpeaking);
      };

      checkSpeaking();
    } catch (err) {
      console.warn('Audio speaking detection initialized without WebAudio context:', err);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [localStream, isMuted]);

  // Attach stream to video element whenever videoRef, stream or isCameraOff changes
  useEffect(() => {
    if (videoRef.current) {
      if (localStream && !isCameraOff) {
        if (videoRef.current.srcObject !== localStream) {
          videoRef.current.srcObject = localStream;
          videoRef.current.play?.().catch(() => {});
        }
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [localStream, isCameraOff]);

  // Toggle Microphone (Audio track mute/unmute)
  const toggleMic = useCallback(() => {
    setIsMuted((prevMuted) => {
      const nextMuted = !prevMuted;
      const stream = localStreamRef.current || localStream;
      if (stream) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !nextMuted;
        });
      }
      return nextMuted;
    });
  }, [localStream]);

  // Explicitly Mute Microphone (Force mute audio tracks)
  const muteMic = useCallback(() => {
    const stream = localStreamRef.current || localStream;
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
    setIsMuted(true);
  }, [localStream]);

  // Toggle Camera (Hardware video track on/off)
  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current || localStream;
    if (isCameraOff) {
      // Turn Camera ON: Re-acquire video hardware track
      try {
        const videoConstraints = selectedVideoDeviceIdRef.current
          ? { deviceId: { ideal: selectedVideoDeviceIdRef.current }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } };

        let tempStream = null;
        try {
          tempStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
        } catch (prefErr) {
          console.warn('[useLocalMedia] Preferred video constraint failed in toggleCamera, trying generic video:', prefErr);
          tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        const newVideoTrack = tempStream?.getVideoTracks()[0];
        if (newVideoTrack) {
          const currentAudioTracks = stream ? stream.getAudioTracks() : [];
          const updatedStream = new MediaStream([...currentAudioTracks, newVideoTrack]);
          localStreamRef.current = updatedStream;
          setLocalStream(updatedStream);
          if (videoRef.current) {
            videoRef.current.srcObject = updatedStream;
            videoRef.current.play?.().catch(() => {});
          }
          setIsCameraOff(false);
          isCameraOffRef.current = false;
          await refreshDevices();
        }
      } catch (err) {
        console.warn('Failed to turn on camera:', err);
      }
    } else {
      // Turn Camera OFF: Stop video tracks completely to shut off camera hardware & LED
      if (stream) {
        stream.getVideoTracks().forEach((track) => {
          track.stop();
        });
        const remainingAudioTracks = stream.getAudioTracks();
        const updatedStream = new MediaStream(remainingAudioTracks);
        localStreamRef.current = updatedStream;
        setLocalStream(updatedStream);
        if (videoRef.current) {
          videoRef.current.srcObject = updatedStream;
        }
      }
      setIsCameraOff(true);
      isCameraOffRef.current = true;
    }
  }, [isCameraOff, localStream, refreshDevices]);

  return {
    videoRef,
    localStream,
    isMuted,
    isCameraOff,
    isSpeaking,
    error,
    audioDevices,
    videoDevices,
    speakerDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    selectedSpeakerDeviceId,
    changeAudioDevice,
    changeVideoDevice,
    changeSpeakerDevice,
    refreshDevices,
    toggleMic,
    muteMic,
    toggleCamera,
    stopMedia,
  };
}
