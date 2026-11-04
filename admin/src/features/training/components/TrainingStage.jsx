import React from 'react';
import {
  CameraOnIcon,
  CameraOffIcon,
  FocusTargetIcon,
  SystemHealthIcon,
  CaptionsIcon,
  AiTranslateIcon,
} from '@sl-meet/shared/icons';

/**
 * Stage Canvas for 60 FPS Two-Hand Motion Tracking & Gesture Inspection
 * Formatted with Google Meet room dark tokens (#000000 / #202124 / #3C4043 / #EA4335).
 */
export default function TrainingStage({
  stageContainerRef,
  videoRef,
  canvasRef,
  cameraActive,
  liveDetection = { gesture: '', confidence: 0, topCandidates: [] },
  recordingPhase = 'idle',
  recordingMode = 'static',
  countdown = 3,
  isBusyRecording = false,
  videoDevices = [],
  selectedCameraId = '',
  handleChangeCamera,
  handleToggleCamera,
  gesturesCount = 0,
  autoFollowZoom = true,
  setAutoFollowZoom,
  stageTelemetry = { handCount: 0, zoomFactor: 1.0 },
  showRadar = true,
  setShowRadar,
  showSubtitles = true,
  setShowSubtitles,
  currentSentence = '',
  clearTranscript,
  cancelRecordingSession,
}) {
  return (
    <div
      ref={stageContainerRef}
      className={`relative flex-1 bg-[#202124] rounded-2xl overflow-hidden border transition-all flex items-center justify-center min-h-0 ${
        recordingPhase === 'capturing'
          ? 'border-[#EA4335] shadow-[0_0_25px_rgba(234,67,53,0.4)]'
          : recordingPhase === 'preroll'
          ? 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
          : 'border-white/5'
      }`}
    >
      {/* Offscreen raw video source consumed by HandMotionCameraTracker */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
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

      {/* 60 FPS Auto-Follow & Trajectory Canvas */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full block ${cameraActive ? 'block' : 'hidden'}`}
      />

      {/* Top Stage HUD: Live Detection / Status + Stage Controls */}
      <div className="absolute top-3.5 left-3.5 right-3.5 z-20 flex items-center justify-between gap-2 pointer-events-none">
        {/* Left Side: Status Pill or Detection */}
        {cameraActive ? (
          liveDetection.gesture && liveDetection.gesture !== 'Signing...' ? (
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
            <div className="bg-slate-900/75 backdrop-blur-md text-slate-300 text-xs px-3 py-1.5 rounded-xl border border-slate-700/60 pointer-events-auto">
              Hybrid k-NN + DTW Engine ({gesturesCount} samples)
            </div>
          )
        ) : (
          <div className="bg-slate-900/85 backdrop-blur-md text-slate-400 text-xs px-3 py-1.5 rounded-xl border border-slate-700/60 flex items-center space-x-2 pointer-events-auto">
            <span className="w-2 h-2 rounded-full bg-[#EA4335]" />
            <span>Camera Standby (OFF)</span>
          </div>
        )}

        {/* Right Side: Stage Controls & Video Tile Camera Button */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          {/* Camera Source Selector (Clean rounded pill, border-none, no outline) */}
          <select
            value={selectedCameraId}
            onChange={(e) => handleChangeCamera?.(e.target.value)}
            disabled={videoDevices.length === 0}
            className="bg-[#202124] hover:bg-[#3C4043] text-xs text-slate-300 rounded-full px-3 py-1.5 border-none outline-none focus:outline-none cursor-pointer truncate max-w-[160px] transition-colors"
            title="Camera Source"
          >
            {videoDevices.length === 0 ? (
              <option value="" className="bg-[#202124] text-slate-400">
                Scanning cameras...
              </option>
            ) : (
              videoDevices.map((device, idx) => {
                const label = device.label || `Camera ${idx + 1}`;
                const isObs = label.toLowerCase().includes('obs');
                return (
                  <option
                    key={device.deviceId || idx}
                    value={device.deviceId}
                    className="bg-[#202124] text-white"
                  >
                    {label} {isObs ? '(Virtual)' : ''}
                  </option>
                );
              })
            )}
          </select>

          {cameraActive && (
            <>
              <button
                type="button"
                onClick={() => setAutoFollowZoom?.((v) => !v)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border-none outline-none focus:outline-none transition-colors cursor-pointer ${
                  autoFollowZoom
                    ? 'bg-[#5CA0F2]/20 text-[#5CA0F2]'
                    : 'bg-[#202124] hover:bg-[#3C4043] text-slate-300 hover:text-white'
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
                onClick={() => setShowRadar?.((v) => !v)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border-none outline-none focus:outline-none transition-colors cursor-pointer ${
                  showRadar
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-[#202124] hover:bg-[#3C4043] text-slate-300 hover:text-white'
                }`}
                title="Toggle Live Top-3 Similarity Radar"
              >
                <SystemHealthIcon className="w-3.5 h-3.5" />
                <span>Radar</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSubtitles?.((prev) => !prev)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border-none outline-none focus:outline-none transition-colors cursor-pointer ${
                  showSubtitles
                    ? 'bg-[#5CA0F2]/20 text-[#5CA0F2]'
                    : 'bg-[#202124] hover:bg-[#3C4043] text-slate-300 hover:text-white'
                }`}
                title="Toggle Live Subtitle Preview"
              >
                <CaptionsIcon className="w-3.5 h-3.5" />
                <span>CC</span>
              </button>
            </>
          )}

          {/* Standard Video Tile Camera On/Off Toggle Button */}
          <button
            type="button"
            onClick={handleToggleCamera}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer border-none outline-none focus:outline-none ${
              cameraActive
                ? 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
                : 'bg-[#EA4335] hover:bg-[#D93025] text-white shadow-rose-900/40'
            }`}
            title={cameraActive ? 'Turn camera OFF' : 'Turn camera ON'}
          >
            {cameraActive ? (
              <CameraOnIcon className="w-4 h-4 text-white" />
            ) : (
              <CameraOffIcon className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
      </div>

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

      {/* Bottom-Left Hand Color Legend */}
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
                  className="text-[10px] text-slate-400 hover:text-white transition-colors bg-slate-800/80 px-1.5 py-0.5 rounded ml-1 cursor-pointer"
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
              onClick={() => cancelRecordingSession?.('Recording cancelled.')}
              className="bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-full border border-slate-700 font-semibold cursor-pointer"
            >
              Cancel [Space]
            </button>
          </div>
        </div>
      )}

      {/* Camera Offline State - Google Meet Video Tile Ecosystem */}
      {!cameraActive && (
        <div className="flex flex-col items-center justify-center text-slate-400 space-y-4 p-8 text-center select-none z-10">
          <div className="w-20 h-20 rounded-full bg-[#3C4043] flex items-center justify-center text-slate-300 shadow-xl border border-slate-600/50">
            <CameraOffIcon className="w-9 h-9 text-slate-300" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-200 tracking-wide">
              Camera is turned off
            </p>
            <p className="text-xs text-slate-400 max-w-xs">
              Click the video tile toggle below or in the toolbar to enable tracking
            </p>
          </div>

          {/* Google Meet Video Tile Circular Camera Toggle Button */}
          <div className="flex flex-col items-center space-y-1.5 pt-1">
            <button
              type="button"
              onClick={handleToggleCamera}
              className="w-14 h-14 rounded-full bg-[#EA4335] hover:bg-[#D93025] text-white flex items-center justify-center shadow-2xl transition-all active:scale-95 cursor-pointer border-2 border-white/20 hover:shadow-[0_0_25px_rgba(234,67,53,0.5)]"
              title="Click to turn on camera"
            >
              <CameraOffIcon className="w-6 h-6 text-white" />
            </button>
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              Click to Turn Camera ON
            </span>
          </div>
        </div>
      )}

      {/* Bottom Stage Video Tile Camera Quick Toggle (when camera is active) */}
      {cameraActive && !isBusyRecording && (
        <div className="absolute bottom-3.5 right-3.5 z-20 pointer-events-auto">
          <button
            type="button"
            onClick={handleToggleCamera}
            className="w-10 h-10 rounded-full bg-[#3C4043]/90 hover:bg-[#EA4335] text-slate-200 hover:text-white flex items-center justify-center transition-all shadow-lg border border-slate-600/70 cursor-pointer"
            title="Turn camera OFF"
          >
            <CameraOnIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

