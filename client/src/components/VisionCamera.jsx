import React from 'react';
import { Camera, Eye, Zap, ShieldCheck, Activity } from 'lucide-react';

export default function VisionCamera({
  videoRef,
  canvasRef,
  isProcessing,
  activeGesture,
  fps,
  detectedCount,
  handSide,
  onStart,
}) {
  return (
    <div className="relative flex-1 flex flex-col justify-between p-4 rounded-2xl glass-card border border-slate-800/90 overflow-hidden shadow-2xl">
      {/* Top Overlay Bar */}
      <div className="absolute top-6 left-6 right-6 z-20 flex items-center justify-between pointer-events-none">
        {/* Active Gesture Badge */}
        <div className="pointer-events-auto flex items-center space-x-3 px-4 py-2 rounded-xl glass-panel border border-slate-700/80 shadow-lg">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Current Gesture</div>
            <div className="text-sm font-extrabold text-white flex items-center space-x-2">
              <span>{activeGesture.gesture}</span>
              {activeGesture.confidence > 0 && (
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded">
                  {Math.round(activeGesture.confidence * 100)}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Vision Stats Badge */}
        <div className="pointer-events-auto flex items-center space-x-3 px-4 py-2 rounded-xl glass-panel border border-slate-700/80 text-xs text-slate-300 font-medium">
          <div className="flex items-center space-x-1.5">
            <Eye className="w-4 h-4 text-cyan-400" />
            <span>Hands: <strong className="text-white font-mono">{detectedCount}</strong></span>
          </div>
          <span className="text-slate-600">|</span>
          <div>
            <span>Side: <strong className="text-indigo-300">{handSide}</strong></span>
          </div>
        </div>
      </div>

      {/* Main Video & Canvas Container */}
      <div className="relative w-full h-[480px] bg-slate-950/90 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none z-10"
        />

        {/* Empty / Stopped State */}
        {!isProcessing && (
          <div className="z-30 flex flex-col items-center justify-center p-8 text-center bg-slate-950/80 backdrop-blur-md w-full h-full">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mb-4 shadow-xl">
              <Camera className="w-8 h-8 animate-pulse" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">MediaPipe AI Camera Ready</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
              Launch real-time computer vision tracking to detect hand landmarks and sign language gestures directly in Electron.
            </p>
            <button
              onClick={onStart}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-semibold text-xs transition-all duration-200 shadow-lg shadow-indigo-600/30 flex items-center space-x-2"
            >
              <Zap className="w-4 h-4" />
              <span>Enable AI Vision Pipeline</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Telemetry Bar */}
      <div className="mt-4 flex items-center justify-between px-2 text-xs text-slate-400">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Local Device In-Memory Processing (MediaPipe WebAssembly)</span>
        </div>
        <div className="flex items-center space-x-2 font-mono text-[11px] text-slate-500">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Resolution: 1280x720</span>
        </div>
      </div>
    </div>
  );
}
