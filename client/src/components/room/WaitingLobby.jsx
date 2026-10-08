import React from 'react';
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

  return (
    <div className="w-screen h-screen bg-[#121212] text-white flex flex-col justify-between p-6 md:p-10 font-sans select-none overflow-hidden">
      {/* Top Bar Navigation */}
      <header className="w-full flex items-center justify-between z-10">
        <button
          onClick={onBackHome}
          className="flex items-center space-x-2 text-slate-400 hover:text-white text-xs font-semibold px-3 py-2 rounded-xl bg-[#202124] hover:bg-[#3C4043] transition-colors outline-none focus:outline-none"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        <div className="flex items-center space-x-3">
          <img src="/assets/brand-logo.png" alt="SL-Meet" className="h-6 w-auto object-contain" />
          <span className="text-xs font-mono text-slate-400">Room: <strong className="text-white">{roomId}</strong></span>
        </div>
      </header>

      {/* Main Content Grid: Preview Left + Device Config Right */}
      <main className="w-full flex-1 max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 my-auto py-4">
        {/* Left Side: Large Camera Video Preview */}
        <div className="w-full lg:w-[60%] flex flex-col items-center">
          <div
            className={`relative w-full aspect-video rounded-3xl overflow-hidden bg-slate-900 shadow-2xl flex items-center justify-center box-border transition-all ${
              isSpeaking ? 'border-2 border-[#5CA0F2]' : 'border border-slate-800'
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
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                  Camera Off
                </span>
              </div>
            )}

            {/* Mic & Camera Action Overlay Controls */}
            <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 z-20">
              <button
                onClick={toggleMic}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none ${
                  isMuted
                    ? 'bg-[#EA4335] hover:bg-[#D93025] text-white'
                    : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
                }`}
                title={isMuted ? 'Turn on microphone' : 'Turn off microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={toggleCamera}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none ${
                  isCameraOff
                    ? 'bg-[#EA4335] hover:bg-[#D93025] text-white'
                    : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
                }`}
                title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Device Selectors & Join Room Action */}
        <div className="w-full lg:w-[40%] flex flex-col justify-center space-y-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Ready to join?</h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1">
              Check your camera and audio settings before entering room <span className="font-mono text-white font-semibold">{roomId}</span>.
            </p>
          </div>

          {/* Hardware Device Configuration Options */}
          <div className="bg-[#202124] p-5 rounded-2xl border border-slate-800 space-y-4">
            {/* Camera Input Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center space-x-2">
                <Camera className="w-4 h-4 text-[#8AB4F8]" />
                <span>Camera</span>
              </label>
              <select
                value={selectedVideoDeviceId}
                onChange={(e) => changeVideoDevice(e.target.value)}
                className="w-full bg-[#28292C] text-slate-200 text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-[#8AB4F8]"
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
              <label className="text-xs font-semibold text-slate-300 flex items-center space-x-2">
                <Mic className="w-4 h-4 text-[#8AB4F8]" />
                <span>Microphone</span>
              </label>
              <select
                value={selectedAudioDeviceId}
                onChange={(e) => changeAudioDevice(e.target.value)}
                className="w-full bg-[#28292C] text-slate-200 text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-[#8AB4F8]"
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
                <label className="text-xs font-semibold text-slate-300 flex items-center space-x-2">
                  <Volume2 className="w-4 h-4 text-[#8AB4F8]" />
                  <span>Speakers</span>
                </label>
                <select
                  value={selectedSpeakerDeviceId}
                  onChange={(e) => changeSpeakerDevice(e.target.value)}
                  className="w-full bg-[#28292C] text-slate-200 text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-[#8AB4F8]"
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
            className="w-full bg-[#8AB4F8] hover:bg-[#78A4EE] text-[#202124] font-bold text-sm py-3.5 rounded-2xl shadow-lg transition-colors outline-none focus:outline-none"
          >
            Join now
          </button>
        </div>
      </main>

      <footer className="w-full text-center text-xs text-slate-500 font-mono">
        SL-Meet AI Video Platform • Google Meet Design Engine
      </footer>
    </div>
  );
}
