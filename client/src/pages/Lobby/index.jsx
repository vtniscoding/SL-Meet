import React, { useEffect, useState, useRef } from 'react';
import {
  MicOnIcon as Mic,
  MicOffIcon as MicOff,
  CameraOnIcon as Video,
  CameraOffIcon as VideoOff,
  Volume2Icon as Volume2,
  BackNavIcon as ArrowLeft,
  ChevronDownIcon,
  CheckmarkIcon,
} from '@sl-meet/shared/icons';
import {
  CommunicationModePicker,
  NotificationBellMenu,
  ProfileAvatarMenu,
} from '../../features';
import { TitleBar } from '@sl-meet/shared';

/**
 * Semantic Component: Google Meet Style Waiting Lobby
 * Pre-meeting screen for camera preview, mic/camera toggle, inline participation mode choice,
 * and audio/video device configuration with live input level and speaker test.
 */
export default function WaitingLobby({
  roomId,
  mediaState,
  onJoinMeeting,
  onBackHome,
  initialDisplayName = '',
  isAuthenticated = false,
  user = null,
  profile = null,
  onSignOut = null,
}) {
  const [displayName, setDisplayName] = useState(
    () => initialDisplayName || localStorage.getItem('sl_meet_user_name') || ''
  );
  const [nameError, setNameError] = useState('');
  const [selectedRole, setSelectedRole] = useState(() => {
    return localStorage.getItem('sl_meet_user_role') || null;
  });
  const [roleError, setRoleError] = useState(false);
  const [isPlayingChime, setIsPlayingChime] = useState(false);
  const [speakerOutputLevel, setSpeakerOutputLevel] = useState(0);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null); // 'mic' | 'speaker' | 'camera' | null
  const dropdownContainerRef = useRef(null);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const {
    videoRef,
    localStream,
    isMuted,
    isCameraOff,
    isSpeaking,
    audioLevel = 0,
    audioDevices,
    videoDevices,
    speakerDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    selectedSpeakerDeviceId,
    changeAudioDevice,
    changeVideoDevice,
    changeSpeakerDevice,
    toggleMic,
    toggleCamera,
  } = mediaState;

  const currentAudioLabel =
    audioDevices?.find((d) => d.deviceId === selectedAudioDeviceId)?.label ||
    (audioDevices?.length > 0 ? audioDevices[0].label : 'Microphone');

  const currentSpeakerLabel =
    speakerDevices?.find((d) => d.deviceId === selectedSpeakerDeviceId)?.label ||
    (speakerDevices?.length > 0 ? speakerDevices[0].label : 'Speakers');

  const currentVideoLabel =
    videoDevices?.find((d) => d.deviceId === selectedVideoDeviceId)?.label ||
    (videoDevices?.length > 0 ? videoDevices[0].label : 'Camera');

  // Sync initialDisplayName if it becomes available asynchronously (e.g. from profile)
  useEffect(() => {
    if (initialDisplayName && !displayName) {
      setDisplayName(initialDisplayName);
    }
  }, [initialDisplayName]);

  // Reset video ready state when camera turns off or stream is absent
  useEffect(() => {
    if (isCameraOff || !localStream) {
      setIsVideoReady(false);
    }
  }, [isCameraOff, localStream]);

  // Bind localStream to video DOM element whenever Lobby mounts or stream updates
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && localStream && !isCameraOff) {
      if (videoEl.srcObject !== localStream) {
        videoEl.srcObject = localStream;
      }
      videoEl.play().catch((err) => {
        console.warn('Lobby video stream autoplay:', err);
      });
      if (videoEl.readyState >= 2) {
        setIsVideoReady(true);
      }
    }
  }, [localStream, videoRef, isCameraOff]);

  const handleTestSpeaker = async () => {
    if (isPlayingChime) return;
    setIsPlayingChime(true);
    setSpeakerOutputLevel(60);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        setIsPlayingChime(false);
        setSpeakerOutputLevel(0);
        return;
      }
      const audioCtx = new AudioCtx();

      if (selectedSpeakerDeviceId && audioCtx.setSinkId) {
        try {
          await audioCtx.setSinkId(selectedSpeakerDeviceId);
        } catch (e) {
          console.warn('AudioContext setSinkId failed:', e);
        }
      }

      // Pleasant 4-tone melodic acoustic chime: A4 (440Hz) -> C#5 (554Hz) -> E5 (659Hz) -> A5 (880Hz)
      const now = audioCtx.currentTime;
      const notes = [
        { freq: 440.0, time: 0.0, dur: 0.35 },
        { freq: 554.37, time: 0.32, dur: 0.35 },
        { freq: 659.25, time: 0.65, dur: 0.38 },
        { freq: 880.0, time: 1.0, dur: 0.6 },
      ];

      notes.forEach(({ freq, time, dur }) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0.001, now + time);
        gain.gain.exponentialRampToValueAtTime(0.14, now + time + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur + 0.05);
      });

      // Synchronize visual output meter across the ~1.65s test duration
      const t1 = setTimeout(() => setSpeakerOutputLevel(75), 100);
      const t2 = setTimeout(() => setSpeakerOutputLevel(85), 380);
      const t3 = setTimeout(() => setSpeakerOutputLevel(95), 700);
      const t4 = setTimeout(() => setSpeakerOutputLevel(100), 1050);
      const t5 = setTimeout(() => setSpeakerOutputLevel(40), 1380);

      setTimeout(() => {
        setIsPlayingChime(false);
        setSpeakerOutputLevel(0);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(t5);
        audioCtx.close().catch(() => {});
      }, 1650);
    } catch (err) {
      console.warn('Speaker test error:', err);
      setIsPlayingChime(false);
      setSpeakerOutputLevel(0);
    }
  };

  const handleJoinClick = () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameError('Please enter your name to join the meeting.');
      return;
    }
    if (!selectedRole) {
      setRoleError(true);
      return;
    }
    setNameError('');
    setRoleError(false);
    try {
      localStorage.setItem('sl_meet_user_role', selectedRole);
      localStorage.setItem('sl_meet_user_name', trimmed);
    } catch (_) {}
    onJoinMeeting(trimmed, selectedRole);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#EAECEE] text-slate-900 flex flex-col font-sans select-none">
      {/* 1. Custom Frameless Window TitleBar */}
      <header
        onDoubleClick={() => window.electronAPI?.toggleMaximize?.()}
        style={{ WebkitAppRegion: 'drag' }}
        data-tauri-drag-region="true"
        className="w-full h-11 pl-4 md:pl-5 pr-3 flex items-center justify-between z-30 shrink-0 select-none bg-transparent"
      >
        {/* Top-Left: Navigation */}
        <div style={{ WebkitAppRegion: 'no-drag' }} className="flex items-center">
          {onBackHome && (
            <button
              onClick={onBackHome}
              className="flex items-center space-x-1.5 text-slate-700 hover:text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/80 hover:bg-white border border-slate-200/80 transition-all shadow-2xs outline-none cursor-pointer"
              title="Return to home"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </button>
          )}
        </div>

        {/* Top-Right: [Notifications] [Avatar Menu] [Window Controls] */}
        <div style={{ WebkitAppRegion: 'no-drag' }} className="flex items-center h-full space-x-2.5">
          <NotificationBellMenu />
          {user && (
            <ProfileAvatarMenu
              user={user}
              profile={profile}
              onSignOut={onSignOut}
            />
          )}
          <TitleBar />
        </div>
      </header>

      {/* 2. Main Window Container Card */}
      <div className="flex-1 flex overflow-hidden px-3 pb-3 pt-0 min-h-0">
        <div className="flex-1 bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col items-center p-3 sm:p-6 lg:p-8 relative overflow-y-auto min-h-0">
          {/* Main Content Grid: Preview Left + Device & Mode Config Right */}
          <main className="w-full max-w-5xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-4 sm:gap-6 lg:gap-10 my-auto py-2">
            {/* Left Side: Camera Video Preview + Status Telemetry */}
            <div className="w-full lg:w-[54%] flex flex-col items-center">
              <div
                className={`relative w-full aspect-video rounded-xl overflow-hidden flex items-center justify-center bg-[#202124] isolate border-2 transition-colors duration-150 ${
                  isSpeaking && !isMuted ? 'border-[#22C55E]' : 'border-slate-200/90'
                }`}
              >
                {/* Live Local Video Feed */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedData={() => setIsVideoReady(true)}
                  onPlaying={() => setIsVideoReady(true)}
                  className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 ${
                    isCameraOff || !isVideoReady ? 'hidden' : 'block'
                  }`}
                />

                {/* Camera is off fallback */}
                {isCameraOff && (
                  <div className="text-sm font-medium text-slate-300 select-none">
                    Camera is off
                  </div>
                )}

                {/* Camera is starting fallback */}
                {!isCameraOff && !isVideoReady && (
                  <div className="text-sm font-medium text-slate-300 select-none">
                    Camera is starting
                  </div>
                )}

                {/* Mic & Camera Action Overlay Controls (Original Clean UI) */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/20 z-20 shadow-lg">
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all outline-none focus:outline-none cursor-pointer ${
                      isMuted
                        ? 'bg-[#EA4335] hover:bg-[#D93025] text-white shadow-md'
                        : 'bg-[#3C4043] hover:bg-[#474B4F] text-white'
                    }`}
                    title={isMuted ? 'Turn on microphone' : 'Turn off microphone'}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleCamera}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all outline-none focus:outline-none cursor-pointer ${
                      isCameraOff
                        ? 'bg-[#EA4335] hover:bg-[#D93025] text-white shadow-md'
                        : 'bg-[#3C4043] hover:bg-[#474B4F] text-white'
                    }`}
                    title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                  >
                    {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* 3 Outline Rounded Device Selectors Under Preview */}
              <div
                ref={dropdownContainerRef}
                className="w-full mt-3 grid grid-cols-3 gap-2 relative"
              >
                {/* 1. Microphone Dropdown */}
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((prev) => (prev === 'mic' ? null : 'mic'))}
                    title={currentAudioLabel}
                    className={`w-full flex items-center justify-between gap-1.5 px-3 py-2 rounded-full border text-xs font-medium transition-all cursor-pointer shadow-2xs ${
                      openDropdown === 'mic'
                        ? 'border-[#1A73E8] bg-blue-50/60 text-[#1A73E8]'
                        : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Mic
                        className={`w-4 h-4 shrink-0 ${
                          openDropdown === 'mic' ? 'text-[#1A73E8]' : 'text-slate-500'
                        }`}
                      />
                      <span className="truncate text-left text-[11px] sm:text-xs">
                        {currentAudioLabel}
                      </span>
                    </div>
                    <ChevronDownIcon
                      className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
                        openDropdown === 'mic' ? 'rotate-180 text-[#1A73E8]' : ''
                      }`}
                    />
                  </button>

                  {openDropdown === 'mic' && (
                    <div className="absolute bottom-full mb-2 left-0 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200/90 shadow-xl py-1.5 z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <div className="px-3.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Microphone
                      </div>
                      <div className="max-h-48 overflow-y-auto py-0.5">
                        {audioDevices && audioDevices.length > 0 ? (
                          audioDevices.map((device, index) => {
                            const isSelected =
                              device.deviceId === selectedAudioDeviceId ||
                              (!selectedAudioDeviceId && index === 0);
                            return (
                              <button
                                key={device.deviceId || index}
                                type="button"
                                onClick={() => {
                                  changeAudioDevice(device.deviceId);
                                  setOpenDropdown(null);
                                }}
                                className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left transition-colors cursor-pointer hover:bg-slate-50 ${
                                  isSelected
                                    ? 'text-[#1A73E8] font-semibold bg-blue-50/60'
                                    : 'text-slate-700'
                                }`}
                              >
                                <span className="truncate pr-2">
                                  {device.label || `Microphone ${index + 1}`}
                                </span>
                                {isSelected && (
                                  <CheckmarkIcon className="w-3.5 h-3.5 shrink-0 text-[#1A73E8]" />
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3.5 py-2 text-xs text-slate-400 italic">
                            No microphones found
                          </div>
                        )}
                      </div>

                      {/* Microphone Test Section */}
                      <div className="border-t border-slate-100 mt-1 pt-1.5 px-3.5 pb-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-slate-500">Test mic</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsTestingMic((prev) => !prev);
                            }}
                            className="text-[11px] font-semibold text-[#1A73E8] hover:text-[#1765CC] cursor-pointer"
                          >
                            {isTestingMic ? 'Stop' : 'Test'}
                          </button>
                        </div>
                        {isTestingMic && (
                          <div className="flex items-center space-x-2 mt-1.5">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                              <div
                                className="bg-emerald-500 h-full rounded-full transition-all duration-75"
                                style={{ width: `${isMuted ? 0 : Math.max(0, audioLevel)}%` }}
                              />
                            </div>
                            {isMuted && (
                              <span className="text-[10px] text-amber-600 font-medium">Muted</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Speaker Dropdown */}
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((prev) => (prev === 'speaker' ? null : 'speaker'))}
                    title={currentSpeakerLabel}
                    className={`w-full flex items-center justify-between gap-1.5 px-3 py-2 rounded-full border text-xs font-medium transition-all cursor-pointer shadow-2xs ${
                      openDropdown === 'speaker'
                        ? 'border-[#1A73E8] bg-blue-50/60 text-[#1A73E8]'
                        : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Volume2
                        className={`w-4 h-4 shrink-0 ${
                          openDropdown === 'speaker' ? 'text-[#1A73E8]' : 'text-slate-500'
                        }`}
                      />
                      <span className="truncate text-left text-[11px] sm:text-xs">
                        {currentSpeakerLabel}
                      </span>
                    </div>
                    <ChevronDownIcon
                      className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
                        openDropdown === 'speaker' ? 'rotate-180 text-[#1A73E8]' : ''
                      }`}
                    />
                  </button>

                  {openDropdown === 'speaker' && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200/90 shadow-xl py-1.5 z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <div className="px-3.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Speakers
                      </div>
                      <div className="max-h-48 overflow-y-auto py-0.5">
                        {speakerDevices && speakerDevices.length > 0 ? (
                          speakerDevices.map((device, index) => {
                            const isSelected =
                              device.deviceId === selectedSpeakerDeviceId ||
                              (!selectedSpeakerDeviceId && index === 0);
                            return (
                              <button
                                key={device.deviceId || index}
                                type="button"
                                onClick={() => {
                                  changeSpeakerDevice(device.deviceId);
                                  setOpenDropdown(null);
                                }}
                                className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left transition-colors cursor-pointer hover:bg-slate-50 ${
                                  isSelected
                                    ? 'text-[#1A73E8] font-semibold bg-blue-50/60'
                                    : 'text-slate-700'
                                }`}
                              >
                                <span className="truncate pr-2">
                                  {device.label || `Speaker ${index + 1}`}
                                </span>
                                {isSelected && (
                                  <CheckmarkIcon className="w-3.5 h-3.5 shrink-0 text-[#1A73E8]" />
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3.5 py-2 text-xs text-slate-500">Default Speaker</div>
                        )}
                      </div>

                      {/* Speaker Test Section */}
                      <div className="border-t border-slate-100 mt-1 pt-1.5 px-3.5 pb-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-slate-500">Test speaker</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestSpeaker();
                            }}
                            disabled={isPlayingChime}
                            className="text-[11px] font-semibold text-[#1A73E8] hover:text-[#1765CC] cursor-pointer disabled:opacity-50"
                          >
                            {isPlayingChime ? 'Playing...' : 'Test sound'}
                          </button>
                        </div>
                        {isPlayingChime && (
                          <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                            <div
                              className="bg-[#1A73E8] h-full rounded-full transition-all duration-75"
                              style={{ width: `${speakerOutputLevel}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Camera Dropdown */}
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((prev) => (prev === 'camera' ? null : 'camera'))}
                    title={currentVideoLabel}
                    className={`w-full flex items-center justify-between gap-1.5 px-3 py-2 rounded-full border text-xs font-medium transition-all cursor-pointer shadow-2xs ${
                      openDropdown === 'camera'
                        ? 'border-[#1A73E8] bg-blue-50/60 text-[#1A73E8]'
                        : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Video
                        className={`w-4 h-4 shrink-0 ${
                          openDropdown === 'camera' ? 'text-[#1A73E8]' : 'text-slate-500'
                        }`}
                      />
                      <span className="truncate text-left text-[11px] sm:text-xs">
                        {currentVideoLabel}
                      </span>
                    </div>
                    <ChevronDownIcon
                      className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
                        openDropdown === 'camera' ? 'rotate-180 text-[#1A73E8]' : ''
                      }`}
                    />
                  </button>

                  {openDropdown === 'camera' && (
                    <div className="absolute bottom-full mb-2 right-0 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200/90 shadow-xl py-1.5 z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <div className="px-3.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Camera
                      </div>
                      <div className="max-h-48 overflow-y-auto py-0.5">
                        {videoDevices && videoDevices.length > 0 ? (
                          videoDevices.map((device, index) => {
                            const isSelected =
                              device.deviceId === selectedVideoDeviceId ||
                              (!selectedVideoDeviceId && index === 0);
                            return (
                              <button
                                key={device.deviceId || index}
                                type="button"
                                onClick={() => {
                                  changeVideoDevice(device.deviceId);
                                  setOpenDropdown(null);
                                }}
                                className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left transition-colors cursor-pointer hover:bg-slate-50 ${
                                  isSelected
                                    ? 'text-[#1A73E8] font-semibold bg-blue-50/60'
                                    : 'text-slate-700'
                                }`}
                              >
                                <span className="truncate pr-2">
                                  {device.label || `Camera ${index + 1}`}
                                </span>
                                {isSelected && (
                                  <CheckmarkIcon className="w-3.5 h-3.5 shrink-0 text-[#1A73E8]" />
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3.5 py-2 text-xs text-slate-400 italic">
                            No cameras found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Side: Identity, Inline Mode Selection, & Join Action */}
            <div className="w-full lg:w-[46%] flex flex-col justify-center space-y-3.5">
              {/* Header */}
              <div className="space-y-1">
                <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                  Ready to join?
                </h1>
                <p className="text-xs text-slate-500">
                  Configure your display name and communication mode before entering.
                </p>
              </div>

              {/* User Display Name Input Field */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Your Name
                </label>
                <input
                  type="text"
                  placeholder="Enter your name..."
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoinClick();
                  }}
                  className={`w-full bg-white text-slate-800 text-xs rounded-xl px-3.5 py-2.5 border transition-colors outline-none focus:outline-none focus:ring-0 ${
                    nameError
                      ? 'border-red-400 focus:border-red-500'
                      : 'border-slate-300 focus:border-[#1A73E8]'
                  }`}
                />
                {nameError && (
                  <p className="text-[11px] text-red-500 font-medium pl-1">{nameError}</p>
                )}
              </div>

              {/* Inline Mode Picker ("How would you like to take part?") */}
              <CommunicationModePicker
                selectedRole={selectedRole}
                onSelectRole={(role) => {
                  setSelectedRole(role);
                  setRoleError(false);
                  try {
                    localStorage.setItem('sl_meet_user_role', role);
                  } catch (_) {}
                }}
                hasError={roleError}
              />

              {/* Join Meeting Action Button */}
              <button
                type="button"
                onClick={handleJoinClick}
                disabled={!selectedRole}
                className={`w-full font-bold text-xs sm:text-sm py-3 rounded-xl transition-all ${
                  selectedRole
                    ? 'bg-[#1A73E8] hover:bg-[#1765CC] text-white shadow-xs cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                Join now
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
