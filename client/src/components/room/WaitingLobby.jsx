import React, { useEffect, useState } from 'react';
import {
  MicOnIcon as Mic,
  MicOffIcon as MicOff,
  CameraOnIcon as Video,
  CameraOffIcon as VideoOff,
  UserAvatarIcon as User,
  HardwareCameraIcon as Camera,
  Volume2Icon as Volume2,
  BackNavIcon as ArrowLeft,
  SettingsIcon,
  ChevronDownIcon,
} from '../../icons';
import CommunicationModePicker from './CommunicationModePicker';
import LobbyToolsCheck from './LobbyToolsCheck';
import WindowControls from '../common/WindowControls';
import ProfileAvatarMenu from '../common/ProfileAvatarMenu';

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

  // Sync initialDisplayName if it becomes available asynchronously (e.g. from profile)
  useEffect(() => {
    if (initialDisplayName && !displayName) {
      setDisplayName(initialDisplayName);
    }
  }, [initialDisplayName]);

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

        {/* Top-Right: [Avatar Menu] [Window Controls] */}
        <div style={{ WebkitAppRegion: 'no-drag' }} className="flex items-center h-full space-x-2.5">
          {user && (
            <ProfileAvatarMenu
              user={user}
              profile={profile}
              onSignOut={onSignOut}
            />
          )}
          <WindowControls />
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
                className={`relative w-full aspect-video rounded-xl overflow-hidden flex items-center justify-center ${
                  isCameraOff ? 'bg-slate-900' : 'bg-transparent'
                }`}
              >
                {/* Live Local Video Feed */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover rounded-xl transform -scale-x-100 ${
                    isCameraOff ? 'hidden' : 'block'
                  }`}
                />

                {/* Camera Off Avatar Fallback */}
                {isCameraOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 space-y-2 p-4">
                    <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shadow-inner">
                      <User className="w-8 h-8 text-slate-400" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                      Camera Off
                    </span>
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

                {/* Solid Active Speaker Border Overlay (Always on top) */}
                <div
                  className={`absolute inset-0 rounded-xl pointer-events-none z-20 transition-colors duration-150 border-[3px] ${
                    isSpeaking && !isMuted ? 'border-[#22C55E]' : 'border-slate-200'
                  }`}
                />
              </div>

              {/* Tools Status Telemetry Under Preview */}
              <LobbyToolsCheck
                isCameraOff={isCameraOff}
                isMuted={isMuted}
                audioLevel={audioLevel}
              />
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
                  className={`w-full bg-white text-slate-800 text-xs rounded-xl px-3.5 py-2.5 border transition-colors focus-ring ${
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

              {/* Collapsible Audio & Video Hardware Settings */}
              <details className="group/settings border border-slate-200/90 rounded-xl bg-slate-50/70 overflow-hidden">
                <summary className="flex items-center justify-between px-3.5 py-2 cursor-pointer text-xs font-semibold text-slate-700 hover:text-slate-900 select-none list-none">
                  <div className="flex items-center space-x-2">
                    <SettingsIcon className="w-3.5 h-3.5 text-[#1A73E8]" />
                    <span>Audio & video settings</span>
                  </div>
                  <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400 group-open/settings:rotate-180 transition-transform" />
                </summary>

                <div className="p-3.5 pt-1.5 space-y-3 border-t border-slate-200/60 bg-white">
                  {/* Camera Selector */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1.5">
                      <Camera className="w-3.5 h-3.5 text-slate-500" />
                      <span>Camera</span>
                    </label>
                    <select
                      value={selectedVideoDeviceId}
                      onChange={(e) => changeVideoDevice(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 border border-slate-200 focus:outline-none focus:border-[#1A73E8] cursor-pointer"
                    >
                      {videoDevices.map((device, index) => (
                        <option key={device.deviceId || index} value={device.deviceId}>
                          {device.label || `Camera ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Microphone Selector & Live Input Level Meter */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1.5">
                        <Mic className="w-3.5 h-3.5 text-slate-500" />
                        <span>Microphone</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsTestingMic((prev) => !prev)}
                        className="text-[10px] font-semibold text-[#1A73E8] hover:text-[#1765CC] hover:underline cursor-pointer"
                      >
                        {isTestingMic ? 'Stop test' : 'Test microphone'}
                      </button>
                    </div>
                    <select
                      value={selectedAudioDeviceId}
                      onChange={(e) => changeAudioDevice(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 border border-slate-200 focus:outline-none focus:border-[#1A73E8] cursor-pointer"
                    >
                      {audioDevices.map((device, index) => (
                        <option key={device.deviceId || index} value={device.deviceId}>
                          {device.label || `Microphone ${index + 1}`}
                        </option>
                      ))}
                    </select>

                    {/* Live Input Level Meter (Revealed on Test) */}
                    {isTestingMic && (
                      <div className="flex items-center space-x-2 pt-1 animate-in fade-in duration-150">
                        <span className="text-[10px] text-slate-500 font-medium shrink-0">Input level</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-75"
                            style={{ width: `${isMuted ? 0 : Math.max(0, audioLevel)}%` }}
                          />
                        </div>
                        {isMuted && (
                          <span className="text-[10px] text-amber-600 font-medium shrink-0">Muted</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Speaker Selector & Test with Output Level Meter */}
                  {speakerDevices.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Speakers</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleTestSpeaker}
                          disabled={isPlayingChime}
                          className="text-[10px] font-semibold text-[#1A73E8] hover:text-[#1765CC] hover:underline cursor-pointer disabled:opacity-60"
                        >
                          {isPlayingChime ? 'Playing chime...' : 'Test speaker'}
                        </button>
                      </div>
                      <select
                        value={selectedSpeakerDeviceId}
                        onChange={(e) => changeSpeakerDevice(e.target.value)}
                        className="w-full bg-slate-50 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 border border-slate-200 focus:outline-none focus:border-[#1A73E8] cursor-pointer"
                      >
                        {speakerDevices.map((device, index) => (
                          <option key={device.deviceId || index} value={device.deviceId}>
                            {device.label || `Speaker ${index + 1}`}
                          </option>
                        ))}
                      </select>

                      {/* Output Level Meter (Revealed during chime test) */}
                      {isPlayingChime && (
                        <div className="flex items-center space-x-2 pt-1 animate-in fade-in duration-150">
                          <span className="text-[10px] text-slate-500 font-medium shrink-0">Output level</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                            <div
                              className="bg-[#1A73E8] h-full rounded-full transition-all duration-75"
                              style={{ width: `${speakerOutputLevel}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </details>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
