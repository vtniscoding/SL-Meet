import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom Hook: Manages local webcam & microphone hardware stream,
 * device enumeration (camera, mic, speaker), device switching,
 * audio muting, video toggling, real-time speaking detection (VAD), and track cleanup.
 */
export function useLocalMedia() {
  const videoRef = useRef(null);
  const localStreamRef = useRef(null);
  const isBusyRef = useRef(false);

  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState(null);

  // Hardware device lists
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [speakerDevices, setSpeakerDevices] = useState([]);

  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState('');
  const [selectedSpeakerDeviceId, setSelectedSpeakerDeviceId] = useState('');

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

      const constraints = {
        video: videoId
          ? { deviceId: { exact: videoId }, width: 1280, height: 720 }
          : { width: 1280, height: 720 },
        audio: audioId ? { deviceId: { exact: audioId } } : true,
      };

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        setIsCameraOff(false);
      } catch (err) {
        console.warn('Primary media constraints failed (device in use or unavailable), attempting fallback:', err);
        // Fallback: Acquire audio stream if camera is locked by another window/process
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioId ? { deviceId: { exact: audioId } } : true,
          });
          setIsCameraOff(true);
        } catch (audioErr) {
          console.error('Audio fallback also failed:', audioErr);
        }
      }

      if (stream) {
        localStreamRef.current = stream;
        setLocalStream(stream);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Update selected device IDs from active stream tracks
        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];
        if (audioTrack && audioTrack.getSettings().deviceId) {
          setSelectedAudioDeviceId(audioTrack.getSettings().deviceId);
        }
        if (videoTrack && videoTrack.getSettings().deviceId) {
          setSelectedVideoDeviceId(videoTrack.getSettings().deviceId);
        }
      }

      await refreshDevices();
    } catch (err) {
      console.error('Failed to get local media stream:', err);
      setError(err.message);
    } finally {
      isBusyRef.current = false;
    }
  }, [refreshDevices]);

  useEffect(() => {
    startMedia();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  // Device Switch Handlers
  const changeAudioDevice = useCallback(async (deviceId) => {
    if (!deviceId) return;
    setSelectedAudioDeviceId(deviceId);
    await startMedia(deviceId, selectedVideoDeviceId);
  }, [startMedia, selectedVideoDeviceId]);

  const changeVideoDevice = useCallback(async (deviceId) => {
    if (!deviceId) return;
    setSelectedVideoDeviceId(deviceId);
    await startMedia(selectedAudioDeviceId, deviceId);
  }, [startMedia, selectedAudioDeviceId]);

  const changeSpeakerDevice = useCallback((deviceId) => {
    setSelectedSpeakerDeviceId(deviceId);
    if (videoRef.current && typeof videoRef.current.setSinkId === 'function') {
      videoRef.current.setSinkId(deviceId).catch((err) => {
        console.warn('Failed to setSinkId on video element:', err);
      });
    }
  }, []);

  // Real-Time Audio Speaking Activity Detection (Web Audio API Analyser)
  useEffect(() => {
    if (!localStream || isMuted) {
      setIsSpeaking(false);
      return;
    }

    let audioContext = null;
    let animId = null;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(localStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkSpeaking = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // Threshold for speaking volume
        setIsSpeaking(average > 12);
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

  // Attach stream to video element whenever videoRef or stream changes
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Toggle Microphone (Audio track mute/unmute)
  const toggleMic = useCallback(() => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  }, [localStream]);

  // Toggle Camera (Video track on/off)
  const toggleCamera = useCallback(() => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsCameraOff((prev) => !prev);
    }
  }, [localStream]);

  // Explicitly stop all hardware media tracks
  const stopMedia = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [localStream]);

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
    toggleCamera,
    stopMedia,
  };
}
