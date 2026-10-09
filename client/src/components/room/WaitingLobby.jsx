import React, { useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, User, Camera, Volume2, ArrowLeft } from 'lucide-react';

/**
 * Semantic Component: Google Meet Style Waiting Lobby
 * Pre-meeting screen for camera preview, mic/camera toggle, and device input/output configuration.
 */
export default function WaitingLobby({
  roomId,
  mediaState,
  onJoinMeeting,
  onBackHome,
}) {
  const {
    videoRef,
    localStream,
    isMuted,
    isCameraOff,
    isSpeaking,
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

  // Bind localStream to video DOM element whenever Lobby mounts or stream updates
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && localStream) {
      videoEl.srcObject = localStream;
      videoEl.play().catch((err) => {
        console.warn('Lobby video stream autoplay:', err);
      });
    }
  }, [localStream, videoRef, isCameraOff]);

  return (
    <div className="w-screen h-screen bg-white text-slate-900 flex flex-col justify-between p-6 md:p-10 font-sans select-none overflow-hidden">
      {/* Top Bar Navigation */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between z-10">
        <button
          onClick={onBackHome}
          className="flex items-center space-x-2 text-slate-700 hover:text-slate-900 text-xs font-semibold px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all shadow-xs outline-none focus:outline-none cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <div className="flex items-center">
          <img
            src="/assets/brand-logo.png"
            alt="SL-Meet Logo"
            className="h-10 md:h-12 lg:h-14 w-auto object-contain filter drop-shadow-xs"
          />
        </div>
      </header>

      {/* Main Content Grid: Preview Left + Device Config Right */}
      <main className="w-full flex-1 max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-14 my-auto py-4">
        {/* Left Side: Large Camera Video Preview */}
        <div className="w-full lg:w-[58%] flex flex-col items-center">
          <div
            className={`relative w-full aspect-video rounded-3xl overflow-hidden bg-slate-900 shadow-2xl flex items-center justify-center box-border transition-all ${
              isSpeaking ? 'ring-4 ring-[#5CA0F2]/80 border-transparent' : 'border border-slate-200'
            }`}
          >
            {/* Live Local Video Feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${
                isCameraOff ? 'hidden' : 'block'
              }`}
            />

            {/* Camera Off Avatar Fallback */}
            {isCameraOff && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 space-y-3 p-4">
                <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shadow-inner">
                  <User className="w-10 h-10 text-slate-400" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                  Camera Off
                </span>
              </div>
            )}

            {/* Mic & Camera Action Overlay Controls */}
            <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/20 z-20 shadow-lg">
              <button
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
        </div>

        {/* Right Side: Device Selectors & Join Room Action */}
        <div className="w-full lg:w-[42%] flex flex-col justify-center space-y-6">
          <div className="text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Ready to join?</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1.5 text-center">
              Check your camera and audio settings before entering room
            </p>
          </div>

          {/* Hardware Device Configuration Options */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            {/* Camera Input Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-2">
                <Camera className="w-4 h-4 text-[#5CA0F2]" />
                <span>Camera</span>
              </label>
              <select
                value={selectedVideoDeviceId}
                onChange={(e) => changeVideoDevice(e.target.value)}
                className="w-full bg-white text-slate-800 text-xs rounded-xl px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-[#5CA0F2] shadow-xs cursor-pointer"
              >
                {videoDevices.map((device, index) => (
                  <option key={device.deviceId || index} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Microphone Input Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-2">
                <Mic className="w-4 h-4 text-[#5CA0F2]" />
                <span>Microphone</span>
              </label>
              <select
                value={selectedAudioDeviceId}
                onChange={(e) => changeAudioDevice(e.target.value)}
                className="w-full bg-white text-slate-800 text-xs rounded-xl px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-[#5CA0F2] shadow-xs cursor-pointer"
              >
                {audioDevices.map((device, index) => (
                  <option key={device.deviceId || index} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Speaker Output Selector */}
            {speakerDevices.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-2">
                  <Volume2 className="w-4 h-4 text-[#5CA0F2]" />
                  <span>Speakers</span>
                </label>
                <select
                  value={selectedSpeakerDeviceId}
                  onChange={(e) => changeSpeakerDevice(e.target.value)}
                  className="w-full bg-white text-slate-800 text-xs rounded-xl px-3.5 py-2.5 border border-slate-300 focus:outline-none focus:border-[#5CA0F2] shadow-xs cursor-pointer"
                >
                  {speakerDevices.map((device, index) => (
                    <option key={device.deviceId || index} value={device.deviceId}>
                      {device.label || `Speaker ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Join Meeting Action Button */}
          <button
            onClick={onJoinMeeting}
            className="w-full bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white font-bold text-sm py-3.5 rounded-2xl shadow-md transition-all outline-none focus:outline-none cursor-pointer"
          >
            Join now
          </button>
        </div>
      </main>
    </div>
  );
}

